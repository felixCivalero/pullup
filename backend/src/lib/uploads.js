// Upload validation helpers shared by media/profile/planner routes.
// ---------------------------
// PROTECTED: Upload event media (image/video/gif) for carousel
// ---------------------------
// ---------------------------
// Helper: pick a file extension from an uploaded MIME type.
// ---------------------------
function extensionFromMime(mimeType) {
  if (!mimeType) return "jpg";
  const ext = mimeType.split("/")[1];
  if (ext === "quicktime") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mp4") return "mp4";
  if (ext === "gif") return "gif";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "jpeg") return "jpg";
  return ext || "jpg";
}

// ---------------------------
// PROTECTED: Upload profile picture
// ---------------------------
// Magic-byte sniff for user-uploaded images. The previous pattern of trusting
// the data-URL's claimed MIME ("data:image/svg+xml;base64,...") let an
// attacker upload an SVG containing <script>, which Supabase storage would
// then serve back with Content-Type image/svg+xml — stored XSS for anyone
// loading the asset directly. Only allow raster formats we have a documented
// reason to accept on these surfaces.
//
// Returns { buffer, extension, mime }. Throws an HTTP-shaped error (.statusCode +
// .body) on rejection so callers can `return res.status(e.statusCode).json(e.body)`.
function sniffUploadedImage(imageData, { maxBytes, label = "Image" } = {}) {
  if (!imageData || typeof imageData !== "string") {
    const err = new Error(`${label} data is required`);
    err.statusCode = 400;
    err.body = { error: `${label} data is required` };
    throw err;
  }
  const base64Data = imageData.replace(/^data:[\w+/.-]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  if (maxBytes && buffer.byteLength > maxBytes) {
    const err = new Error(`${label} too large`);
    err.statusCode = 413;
    err.body = {
      error: `${label} must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`,
    };
    throw err;
  }
  let extension, mime;
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  ) {
    extension = "jpg"; mime = "image/jpeg";
  } else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    extension = "png"; mime = "image/png";
  } else if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    extension = "webp"; mime = "image/webp";
  } else if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    extension = "gif"; mime = "image/gif";
  } else {
    const err = new Error(`${label} must be JPEG, PNG, WebP, or GIF.`);
    err.statusCode = 415;
    err.body = { error: `${label} must be JPEG, PNG, WebP, or GIF.` };
    throw err;
  }
  return { buffer, extension, mime };
}
export { extensionFromMime, sniffUploadedImage };
