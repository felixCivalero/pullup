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
