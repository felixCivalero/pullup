// frontend/src/lib/urlUtils.js
// Utility functions for URL handling (localhost vs production)

/**
 * Get the base URL for the current environment (frontend)
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
 * Get the backend API base URL for share endpoint
 * In production, uses root domain because Nginx has /share/ location block
 * @returns {string} Backend API base URL
 */
function getBackendUrl() {
  // In development, backend is on different port
  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }
  // In production, use root domain (Nginx proxies /share/ to backend)
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
 * Build a share URL for an event (guaranteed to return HTML with OG tags)
 * Use this for sharing to get proper link previews
 * Note: In production, uses /api/share/ to work with existing Nginx proxy
 *       For cleaner URLs, add /share/ location block in Nginx (see NGINX_SHARE_ENDPOINT_FIX.md)
 * @param {string} slug - Event slug (NOT event ID)
 * @returns {string} Share URL (e.g., "http://localhost:3001/share/my-event" or "https://pullup.se/share/my-event")
 */
export function getEventShareUrl(slug) {
  if (!slug) {
    console.error("[getEventShareUrl] No slug provided!");
    return "";
  }
  // Validate slug is not a UUID (IDs are UUIDs, slugs are strings like "my-event")
  if (
    slug.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  ) {
    console.error(
      `[getEventShareUrl] WARNING: Received UUID instead of slug: ${slug}`
    );
  }
  const url = `${getBackendUrl()}/share/${slug}`;
  console.log(
    `[getEventShareUrl] Generated share URL: ${url} for slug: ${slug}`
  );
  return url;
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
