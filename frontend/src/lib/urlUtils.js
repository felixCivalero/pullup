// frontend/src/lib/urlUtils.js
// Utility functions for URL handling (localhost vs production)

/**
 * Get the base URL for the current environment
 * @returns {string} Base URL (e.g., "http://localhost:5173" or "https://pullup.se")
 */
export function getBaseUrl() {
  // In development, use localhost
  if (import.meta.env.DEV) {
    return window.location.origin; // e.g., "http://localhost:5173"
  }
  // In production, use the actual domain
  return "https://pullup.se";
}

/**
 * Build a full URL for an event page
 * @param {string} slug - Event slug
 * @returns {string} Full URL (e.g., "http://localhost:5173/e/my-event" or "https://pullup.se/e/my-event")
 */
export function getEventUrl(slug) {
  return `${getBaseUrl()}/e/${slug}`;
}

/**
 * Build a full URL for an RSVP success page
 * @param {string} slug - Event slug
 * @returns {string} Full URL (e.g., "http://localhost:5173/e/my-event/success" or "https://pullup.se/e/my-event/success")
 */
export function getSuccessUrl(slug) {
  return `${getBaseUrl()}/e/${slug}/success`;
}

/**
 * Get the OG image URL
 * @returns {string} OG image URL (relative path works in both dev and prod)
 */
export function getOgImageUrl() {
  // Use relative path - works in both localhost and production
  return `${getBaseUrl()}/og-image.jpg`;
}
