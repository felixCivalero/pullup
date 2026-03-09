// frontend/src/lib/imageUtils.js
// Centralized image upload and compression utilities

import { authenticatedFetch } from "./api.js";

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
  quality = 0.8
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

        // Convert to base64 with compression
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
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

  const res = await authenticatedFetch(`/host/events/${eventId}/media`, {
    method: "POST",
    body: JSON.stringify({
      mediaData,
      mediaType: validation.mediaType,
      mimeType: file.type,
      position,
      thumbnailData,
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
