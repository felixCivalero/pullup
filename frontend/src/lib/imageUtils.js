// frontend/src/lib/imageUtils.js
// Centralized image upload and compression utilities

import { authenticatedFetch, API_BASE } from "./api.js";
import { supabase } from "./supabase.js";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// How long to wait with zero upload progress before treating the request as
// hung. A stalled connection — or a CORS preflight that never resolves — is the
// "stuck at 0%" symptom; this turns an infinite silent hang into a clear,
// retryable failure. We watch for *stalls* (no progress within the window)
// rather than capping total time, so a slow-but-progressing large upload
// (e.g. a 50MB video on mobile data) isn't killed mid-flight.
const UPLOAD_STALL_TIMEOUT_MS = 30000;
const MAX_UPLOAD_ATTEMPTS = 2; // initial attempt + one retry

// ─────────────────────────────────────────────────────────────────────────
// Modern Blob-based image pipeline.
// Replaces the legacy base64 path: produces an actual Blob for direct upload
// to Supabase (no 33% encoding bloat), prefers WebP output to preserve alpha,
// and converts HEIC/HEIF (iPhone default) to JPEG so it actually renders.
// ─────────────────────────────────────────────────────────────────────────

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

function isHeicFile(file) {
  if (HEIC_MIME_TYPES.has((file.type || "").toLowerCase())) return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

let _webpSupportPromise = null;
function browserSupportsWebpEncode() {
  if (_webpSupportPromise) return _webpSupportPromise;
  _webpSupportPromise = new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      c.toBlob(
        (blob) => resolve(!!blob && blob.type === "image/webp"),
        "image/webp",
        0.8,
      );
    } catch {
      resolve(false);
    }
  });
  return _webpSupportPromise;
}

async function heicToJpegBlob(file) {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  // heic2any returns a Blob or an array of Blobs (for multi-image HEIC)
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Prepare an image file for upload. Returns a Blob, the chosen MIME, and the
 * final dimensions. Leaves GIFs and animated images untouched so animation
 * isn't destroyed.
 */
export async function processImageForUpload(file, options = {}) {
  const { maxDimension = 2400, quality = 0.82 } = options;

  // Animated/transparent formats we don't want to touch.
  if (file.type === "image/gif") {
    return { blob: file, mimeType: "image/gif", width: null, height: null };
  }

  // Decode source — convert HEIC first if needed.
  const sourceBlob = isHeicFile(file) ? await heicToJpegBlob(file) : file;
  const sourceMime = isHeicFile(file) ? "image/jpeg" : (file.type || "image/jpeg");

  const imgUrl = URL.createObjectURL(sourceBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = imgUrl;
    });

    // Compute target size, preserving aspect.
    const longSide = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longSide > maxDimension ? maxDimension / longSide : 1;
    const targetW = Math.round(img.naturalWidth * scale);
    const targetH = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Output: WebP if supported and source isn't a JPEG-only origin, else JPEG.
    // (For JPEG sources, WebP usually still wins on size; for PNG with alpha,
    // WebP preserves transparency.)
    const wantWebp = await browserSupportsWebpEncode();
    const outMime = wantWebp ? "image/webp" : "image/jpeg";

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
        outMime,
        quality,
      );
    });

    // Safety: if the "compressed" blob is somehow larger than the source,
    // fall back to the source (after HEIC conversion). Rare but possible
    // for already-optimised small images.
    if (blob.size > sourceBlob.size && sourceMime !== "image/heic") {
      return { blob: sourceBlob, mimeType: sourceMime, width: img.naturalWidth, height: img.naturalHeight };
    }

    return { blob, mimeType: outMime, width: targetW, height: targetH };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

/**
 * Upload a Blob to a Supabase signed upload URL. Reports progress 0–100 via
 * the optional onProgress callback. Mirrors how the Supabase JS SDK's
 * `uploadToSignedUrl` does it (multipart/form-data with cacheControl), so
 * the storage endpoint accepts it the same way; we just swap fetch for XHR
 * to get upload progress events.
 *
 * `signal` is an AbortSignal for cancellation.
 */
export async function uploadBlobToSignedUrl({ url, blob, mimeType, onProgress, signal, cacheControl = "3600" }) {
  // Mirror the authenticated request the Supabase SDK makes on the planner's
  // upload path (which works reliably): some storage gateways / CORS configs
  // expect the apikey + bearer token even on token-signed uploads. The hand-
  // rolled XHR previously sent only x-upsert, which is the one concrete way it
  // differed from the SDK call.
  const authHeaders = {};
  if (SUPABASE_ANON_KEY) authHeaders.apikey = SUPABASE_ANON_KEY;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) authHeaders.Authorization = `Bearer ${session.access_token}`;
  } catch {
    // Best-effort — the signed token in the URL is what actually authorizes.
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      return await attemptSignedUpload({ url, blob, mimeType, onProgress, signal, cacheControl, authHeaders });
    } catch (err) {
      lastErr = err;
      // Don't retry a deliberate cancellation or a deterministic client error
      // (a 4xx other than 408/429 won't succeed on a second try).
      if (err?.name === "AbortError") throw err;
      const status = err?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) throw err;
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        console.warn(`[uploadBlobToSignedUrl] attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS} failed: ${err?.message}. Retrying…`);
        if (onProgress) onProgress(0); // restart the bar so it doesn't look frozen
      }
    }
  }
  console.error("[uploadBlobToSignedUrl] upload failed after retries:", lastErr?.message);
  throw lastErr;
}

// One PUT attempt. Aborts and rejects if the upload makes no progress for
// UPLOAD_STALL_TIMEOUT_MS so a hung request surfaces as an error instead of an
// infinite "stuck at 0%".
function attemptSignedUpload({ url, blob, mimeType, onProgress, signal, cacheControl, authHeaders = {} }) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", cacheControl);
    // Supabase SDK uses an empty field name for the file payload.
    // Pass an explicit filename so the server stores a sensible content-type.
    const filename = "upload" + extensionFromMime(mimeType || blob.type);
    form.append("", blob, filename);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    // Don't set Content-Type: the browser fills in multipart boundary.
    xhr.setRequestHeader("x-upsert", "true");
    for (const [k, v] of Object.entries(authHeaders)) xhr.setRequestHeader(k, v);

    // Stall watchdog: (re)armed before send and on every progress event. If it
    // fires, the connection is hung (or a preflight never resolved) — abort so
    // the caller gets a clear, retryable error rather than waiting forever.
    let stalled = false;
    let stallTimer;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, UPLOAD_STALL_TIMEOUT_MS);
    };
    const clearStall = () => clearTimeout(stallTimer);

    xhr.upload.onloadstart = armStall;
    xhr.upload.onprogress = (e) => {
      armStall();
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      clearStall();
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        const err = new Error(`Upload failed: HTTP ${xhr.status} ${xhr.responseText || ""}`.trim());
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => {
      clearStall();
      reject(new Error("Network error during upload"));
    };
    xhr.onabort = () => {
      clearStall();
      if (stalled) {
        reject(new Error(`Upload stalled — no progress for ${Math.round(UPLOAD_STALL_TIMEOUT_MS / 1000)}s`));
      } else {
        reject(new DOMException("Upload aborted", "AbortError"));
      }
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    armStall(); // arm before send so a connection that never opens still times out
    xhr.send(form);
  });
}

function extensionFromMime(mime) {
  if (!mime) return "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/quicktime") return ".mov";
  const slash = mime.indexOf("/");
  return slash > 0 ? "." + mime.slice(slash + 1) : "";
}

/**
 * Measure a media file's intrinsic pixel dimensions (width/height) so we can
 * persist them at upload — the marketing page then reserves the exact hero shape
 * before the image loads (see mediaFormat.js). Aspect ratio is what matters, and
 * it survives resizing, so measuring the pre-upload file is fine. Never throws;
 * returns { width: null, height: null } if it can't decode.
 */
export async function measureMediaDimensions(fileOrBlob, mediaType = "image") {
  if (typeof document === "undefined" || !fileOrBlob) {
    return { width: null, height: null };
  }
  const url = URL.createObjectURL(fileOrBlob);
  const done = (res) => {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return res;
  };
  try {
    if (mediaType === "video") {
      return await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () =>
          resolve(done({ width: v.videoWidth || null, height: v.videoHeight || null }));
        v.onerror = () => resolve(done({ width: null, height: null }));
        v.src = url;
      });
    }
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve(done({ width: img.naturalWidth || null, height: img.naturalHeight || null }));
      img.onerror = () => resolve(done({ width: null, height: null }));
      img.src = url;
    });
  } catch (_) {
    return done({ width: null, height: null });
  }
}

/**
 * End-to-end direct upload for one event-media item.
 * 1. Asks the backend for a signed upload URL.
 * 2. PUTs the (optionally processed) Blob straight to Supabase.
 * 3. Records the resulting storage path in event_media.
 */
export async function uploadEventMediaDirect({
  eventId,
  file,
  mediaType,            // "image" | "video" | "gif"
  position = 0,
  thumbnailBlob = null, // optional: for videos, the still-frame as JPEG Blob
  onProgress,
  signal,
}) {
  // 1) Mint signed upload URL for the main file.
  const tokenRes = await authenticatedFetch(`/host/events/${eventId}/storage-token`, {
    method: "POST",
    body: JSON.stringify({
      mimeType: file.type,
      position,
      kind: "main",
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error || "Could not get upload URL");
  }
  const { path: mainPath, token: mainToken, uploadUrl: mainUploadUrl } = await tokenRes.json();

  // 2) Upload main file with progress.
  await uploadBlobToSignedUrl({
    url: mainUploadUrl,
    token: mainToken,
    blob: file,
    mimeType: file.type,
    onProgress: onProgress ? (p) => onProgress(thumbnailBlob ? p * 0.9 : p) : undefined,
    signal,
  });

  // 3) Optionally upload thumbnail (videos, gifs).
  let thumbnailPath = null;
  if (thumbnailBlob) {
    const thumbTokenRes = await authenticatedFetch(`/host/events/${eventId}/storage-token`, {
      method: "POST",
      body: JSON.stringify({
        mimeType: thumbnailBlob.type || "image/jpeg",
        position,
        kind: "thumb",
      }),
    });
    if (thumbTokenRes.ok) {
      const thumbInfo = await thumbTokenRes.json();
      try {
        await uploadBlobToSignedUrl({
          url: thumbInfo.uploadUrl,
          token: thumbInfo.token,
          blob: thumbnailBlob,
          mimeType: thumbnailBlob.type || "image/jpeg",
          onProgress: onProgress ? (p) => onProgress(90 + p * 0.1) : undefined,
          signal,
        });
        thumbnailPath = thumbInfo.path;
      } catch (e) {
        // Thumbnail is best-effort — log and continue without it.
        console.warn("[uploadEventMediaDirect] thumbnail upload failed", e);
      }
    }
  }

  // 4) Record the media row (with the file's intrinsic dimensions).
  const { width, height } = await measureMediaDimensions(file, mediaType);
  const recordRes = await authenticatedFetch(`/host/events/${eventId}/media`, {
    method: "POST",
    body: JSON.stringify({
      storagePath: mainPath,
      thumbnailStoragePath: thumbnailPath,
      mediaType,
      mimeType: file.type,
      position,
      width,
      height,
    }),
  });
  if (!recordRes.ok) {
    const err = await recordRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to record media");
  }
  if (onProgress) onProgress(100);
  return await recordRes.json();
}

/**
 * Token-gated sibling of uploadEventMediaDirect, used by the MCP "media link"
 * uploader (frontend/src/pages/MediaUploadPage.jsx). Same three-step pipeline —
 * mint a signed URL, PUT the file to Storage, record the row — but it talks to
 * the public /media-link/:token endpoints with no session: the token in the URL
 * is the only credential, and the event is pinned server-side by the token.
 */
export async function uploadEventMediaViaLink({
  token,
  file,
  mediaType,            // "image" | "video" | "gif"
  position = 0,
  thumbnailBlob = null, // optional: for videos, the still-frame as JPEG Blob
  onProgress,
  signal,
}) {
  const post = async (path, body) => {
    const res = await fetch(
      `${API_BASE}/media-link/${encodeURIComponent(token)}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || "Upload failed");
      e.status = res.status;
      throw e;
    }
    return res.json();
  };

  // 1) Mint + upload the main file.
  const main = await post("/storage-token", {
    mimeType: file.type,
    position,
    kind: "main",
  });
  await uploadBlobToSignedUrl({
    url: main.uploadUrl,
    blob: file,
    mimeType: file.type,
    onProgress: onProgress ? (p) => onProgress(thumbnailBlob ? p * 0.9 : p) : undefined,
    signal,
  });

  // 2) Optionally mint + upload a thumbnail (videos/gifs). Best-effort.
  let thumbnailPath = null;
  if (thumbnailBlob) {
    try {
      const thumb = await post("/storage-token", {
        mimeType: thumbnailBlob.type || "image/jpeg",
        position,
        kind: "thumb",
      });
      await uploadBlobToSignedUrl({
        url: thumb.uploadUrl,
        blob: thumbnailBlob,
        mimeType: thumbnailBlob.type || "image/jpeg",
        onProgress: onProgress ? (p) => onProgress(90 + p * 0.1) : undefined,
        signal,
      });
      thumbnailPath = thumb.path;
    } catch (e) {
      console.warn("[uploadEventMediaViaLink] thumbnail upload failed", e);
    }
  }

  // 3) Record the media row (with the file's intrinsic dimensions).
  const { width, height } = await measureMediaDimensions(file, mediaType);
  const row = await post("/attach", {
    storagePath: main.path,
    thumbnailStoragePath: thumbnailPath,
    mediaType,
    mimeType: file.type,
    position,
    width,
    height,
  });
  if (onProgress) onProgress(100);
  return row;
}

/**
 * Convert a Supabase public storage URL to its image-transform variant so it
 * can be requested at a specific width/quality. Returns the URL unchanged when
 * it isn't a Supabase public URL we recognise (e.g. a blob: preview).
 *
 * @param {string} url       — the source public URL
 * @param {object} opts
 * @param {number} opts.width — target display width in CSS pixels
 * @param {number} [opts.dpr] — pixel density multiplier (default 2 for retina)
 * @param {number} [opts.quality] — JPEG quality 1–100 (default 82)
 * @param {"cover"|"contain"|"fill"} [opts.resize] — Supabase transform mode
 */
export function transformedImageUrl(url, opts = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("/storage/v1/object/public/event-images/")) return url;
  // Already a transform URL? Don't double-rewrite.
  if (url.includes("/storage/v1/render/image/public/")) return url;
  // Blob preview / data URL → leave alone.
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  // Skip formats Supabase image transform can't preserve safely. GIF would
  // be reduced to its first frame (animation lost), SVG transforms aren't
  // supported. Leave these as their original public URL.
  const pathOnly = url.split("?")[0].toLowerCase();
  if (pathOnly.endsWith(".gif") || pathOnly.endsWith(".svg")) return url;

  // IMPORTANT: default resize to "contain". Supabase's transform default is
  // "cover", which for a width-only request keeps the ORIGINAL height — so
  // ?width=800 on a 2048×1957 image returns 800×1957 (a grotesquely tall,
  // wrong-aspect image). "contain" scales height proportionally (800×764), which
  // is what every caller actually wants; CSS object-fit handles any cropping.
  const { width, dpr = 2, quality = 82, resize = "contain" } = opts;
  const targetWidth = width ? Math.max(1, Math.round(width * dpr)) : null;
  const rewritten = url.replace(
    "/storage/v1/object/public/event-images/",
    "/storage/v1/render/image/public/event-images/",
  );
  const params = new URLSearchParams();
  if (targetWidth) params.set("width", String(targetWidth));
  if (quality) params.set("quality", String(quality));
  if (resize) params.set("resize", resize);
  const qs = params.toString();
  return qs ? `${rewritten}?${qs}` : rewritten;
}

/**
 * Direct upload for the legacy single event image (the cover/thumbnail).
 * Processes the file through the new pipeline then uploads + records.
 */
export async function uploadEventImageDirect({ eventId, file, onProgress, signal }) {
  const { blob, mimeType } = await processImageForUpload(file);

  // Token (server picks path)
  const tokenRes = await authenticatedFetch(`/host/events/${eventId}/storage-token`, {
    method: "POST",
    body: JSON.stringify({ mimeType, kind: "main", position: 0 }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error || "Could not get upload URL");
  }
  const { path, token, uploadUrl } = await tokenRes.json();

  await uploadBlobToSignedUrl({
    url: uploadUrl,
    token,
    blob,
    mimeType,
    onProgress,
    signal,
  });

  const res = await authenticatedFetch(`/host/events/${eventId}/image`, {
    method: "POST",
    body: JSON.stringify({ storagePath: path }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to record image");
  }
  return await res.json();
}

/**
 * Community cover upload — same signed direct-to-Supabase pipeline as the event
 * cover, pointed at the host's single community. Returns the host community
 * payload (incl. coverImageUrl).
 */
export async function uploadCommunityCoverDirect({ file, onProgress, signal }) {
  const { blob, mimeType } = await processImageForUpload(file);

  const tokenRes = await authenticatedFetch(`/host/community/cover-token`, {
    method: "POST",
    body: JSON.stringify({ mimeType }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(err.error || "Could not get upload URL");
  }
  const { path, uploadUrl } = await tokenRes.json();

  await uploadBlobToSignedUrl({ url: uploadUrl, blob, mimeType, onProgress, signal });

  const res = await authenticatedFetch(`/host/community/cover`, {
    method: "POST",
    body: JSON.stringify({ storagePath: path }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save cover");
  }
  if (onProgress) onProgress(100);
  return await res.json();
}

/**
 * Compress and resize an image file
 * @param {File} file - Image file to compress
 * @param {number} maxWidth - Maximum width (default: 1200)
 * @param {number} maxHeight - Maximum height (default: 1200)
 * @param {number} quality - JPEG quality 0-1 (default: 0.8)
 * @returns {Promise<string>} Base64 data URL of compressed image
 */
export function compressImage(
  file,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8,
  mimeType = "image/jpeg"
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // Create canvas and compress
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // PNG ignores `quality`; JPEG honours it. PNG preserves alpha (needed for logos).
        const compressedDataUrl = canvas.toDataURL(mimeType, quality);
        resolve(compressedDataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file
 * @param {File} file - File to validate
 * @param {number} maxSizeMB - Maximum file size in MB (default: 5)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImageFile(file, maxSizeMB = 5) {
  if (!file) {
    return { valid: false, error: "No file selected" };
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "Please select an image file" };
  }

  // Validate file size (before compression)
  if (file.size > maxSizeMB * 1024 * 1024) {
    return {
      valid: false,
      error: `Image size must be less than ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Upload event image
 * @param {string} eventId - Event ID
 * @param {File} imageFile - Image file to upload
 * @param {object} options - Options for compression
 * @returns {Promise<object>} Updated event object
 */
export async function uploadEventImage(eventId, imageFile, options = {}) {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  // Validate file
  const validation = validateImageFile(imageFile);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Compress image
  const compressedImage = await compressImage(
    imageFile,
    maxWidth,
    maxHeight,
    quality
  );

  // Upload to API
  const imageRes = await authenticatedFetch(`/host/events/${eventId}/image`, {
    method: "POST",
    body: JSON.stringify({ imageData: compressedImage }),
  });

  if (!imageRes.ok) {
    const errorData = await imageRes.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload image");
  }

  // Fetch updated event with image URL
  const updatedEventRes = await authenticatedFetch(`/host/events/${eventId}`);
  if (!updatedEventRes.ok) {
    throw new Error("Failed to fetch updated event");
  }

  return await updatedEventRes.json();
}

/**
 * Upload profile image
 * @param {File} imageFile - Image file to upload
 * @param {object} options - Options for compression
 * @returns {Promise<object>} Updated user profile object
 */
export async function uploadProfileImage(imageFile, options = {}) {
  const { maxWidth = 400, maxHeight = 400, quality = 0.8 } = options;

  // Validate file
  const validation = validateImageFile(imageFile);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Compress image
  const compressedImage = await compressImage(
    imageFile,
    maxWidth,
    maxHeight,
    quality
  );

  // Upload to API
  const res = await authenticatedFetch("/host/profile/picture", {
    method: "POST",
    body: JSON.stringify({ imageData: compressedImage }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload image");
  }

  return await res.json();
}

/**
 * Upload brand logo
 * Logo is compressed to max 200x200 and kept small for email use.
 * @param {File} imageFile - Image file to upload
 * @returns {Promise<object>} Updated user profile object
 */
export async function uploadBrandLogo(imageFile) {
  const validation = validateImageFile(imageFile, 2); // max 2MB before compression
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Compress to small dimensions for email/logo use
  const compressedImage = await compressImage(imageFile, 200, 200, 0.85);

  const res = await authenticatedFetch("/host/profile/logo", {
    method: "POST",
    body: JSON.stringify({ imageData: compressedImage }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to upload logo");
  }

  return await res.json();
}

/**
 * Remove brand logo
 * @returns {Promise<object>} Updated profile
 */
export async function removeBrandLogo() {
  const res = await authenticatedFetch("/host/profile/logo", {
    method: "DELETE",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to remove logo");
  }

  return await res.json();
}

/**
 * Remove event image
 * @param {string} eventId - Event ID
 * @returns {Promise<void>}
 */
export async function removeEventImage(eventId) {
  const res = await authenticatedFetch(`/host/events/${eventId}/image`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to remove image");
  }
}

/**
 * Remove profile image
 * @param {Function} onSave - Save function that updates profile
 * @param {object} user - Current user object
 * @returns {Promise<void>}
 */
export async function removeProfileImage(onSave, user) {
  if (!onSave) {
    throw new Error("onSave function is required");
  }

  await onSave({ ...user, profilePicture: null });
}

// ---------------------------
// Media (carousel) utilities
// ---------------------------

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_IMAGE_SIZE_MB = 5;
const MAX_VIDEO_SIZE_MB = 50;

export function validateMediaFile(file) {
  if (!file) return { valid: false, error: "No file selected" };

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return { valid: false, error: "Unsupported file type. Use JPG, PNG, GIF, WebP, MP4, MOV, or WebM." };
  }

  const maxMB = isVideo ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (file.size > maxMB * 1024 * 1024) {
    return { valid: false, error: `File must be less than ${maxMB}MB` };
  }

  return { valid: true, mediaType: isVideo ? "video" : (file.type === "image/gif" ? "gif" : "image") };
}

export function generateVideoThumbnail(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration || 0.5);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src);
            if (blob) resolve(blob);
            else reject(new Error("Failed to generate thumbnail"));
          },
          "image/jpeg",
          0.8,
        );
      } catch (e) {
        URL.revokeObjectURL(video.src);
        reject(e);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video"));
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return fileToBase64(blob);
}

export async function uploadEventMedia(eventId, file, position, options = {}) {
  const validation = validateMediaFile(file);
  if (!validation.valid) throw new Error(validation.error);

  let mediaData;
  let thumbnailData = null;

  if (validation.mediaType === "image") {
    // Compress images
    mediaData = await compressImage(file, options.maxWidth || 1200, options.maxHeight || 1200, options.quality || 0.8);
  } else if (validation.mediaType === "gif") {
    // Don't compress GIFs (would lose animation)
    mediaData = await fileToBase64(file);
  } else {
    // Video — read as base64
    mediaData = await fileToBase64(file);
    // Generate thumbnail client-side
    try {
      const thumbBlob = await generateVideoThumbnail(file);
      thumbnailData = await blobToBase64(thumbBlob);
    } catch (e) {
      console.warn("Could not generate video thumbnail:", e);
    }
  }

  const { width, height } = await measureMediaDimensions(file, validation.mediaType);
  const res = await authenticatedFetch(`/host/events/${eventId}/media`, {
    method: "POST",
    body: JSON.stringify({
      mediaData,
      mediaType: validation.mediaType,
      mimeType: file.type,
      position,
      thumbnailData,
      width,
      height,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload media");
  }

  return await res.json();
}

export async function deleteEventMedia(eventId, mediaId) {
  const res = await authenticatedFetch(`/host/events/${eventId}/media/${mediaId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete media");
  }
}

export async function reorderEventMedia(eventId, ordering) {
  const res = await authenticatedFetch(`/host/events/${eventId}/media/reorder`, {
    method: "PUT",
    body: JSON.stringify({ ordering }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to reorder media");
  }
}

export async function setCoverMedia(eventId, mediaId) {
  const res = await authenticatedFetch(`/host/events/${eventId}/media/${mediaId}/cover`, {
    method: "PUT",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to set cover");
  }
}
