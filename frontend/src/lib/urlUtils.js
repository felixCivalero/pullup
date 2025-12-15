// frontend/src/lib/urlUtils.js
// Utility functions for URL handling (localhost vs production)

export function getBaseUrl() {
  // In dev, use the current origin (vite)
  if (import.meta.env.DEV) return window.location.origin;
  // In prod, hardcode your canonical domain
  return "https://pullup.se";
}

function getShareOrigin() {
  // In dev, your backend serves /share/:slug directly
  if (import.meta.env.DEV) return "http://localhost:3001";
  // In prod, nginx proxies /share/:slug to backend on the same domain
  return "https://pullup.se";
}

export function getEventUrl(slug) {
  return `${getBaseUrl()}/e/${slug}`;
}

/**
 * Share URL for link previews (ALWAYS use this in share text)
 * - Dev: http://localhost:3001/share/:slug
 * - Prod: https://pullup.se/share/:slug
 */
export function getEventShareUrl(slug) {
  if (!slug) {
    console.error("[getEventShareUrl] No slug provided!");
    return "";
  }

  // Warn if UUID passed by mistake
  if (
    slug.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  ) {
    console.error(
      `[getEventShareUrl] WARNING: Received UUID instead of slug: ${slug}`
    );
  }

  const url = `${getShareOrigin()}/share/${slug}`;
  console.log(`[getEventShareUrl] ${url}`);
  return url;
}

export function getSuccessUrl(slug) {
  return `${getBaseUrl()}/e/${slug}/success`;
}

export function getOgImageUrl() {
  return `${getBaseUrl()}/og-image.jpg`;
}

/**
 * Generate a Google Maps URL for a location
 * @param {string} location - The location text (e.g., "123 Main St, New York, NY")
 * @param {number|null} lat - Optional latitude coordinate
 * @param {number|null} lng - Optional longitude coordinate
 * @returns {string} Google Maps URL
 */
export function getGoogleMapsUrl(location, lat = null, lng = null) {
  if (lat !== null && lng !== null) {
    // Use coordinates if available (most precise)
    return `https://www.google.com/maps?q=${lat},${lng}`;
  } else if (location) {
    // Use location text as fallback
    const encodedLocation = encodeURIComponent(location);
    return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
  }
  return null;
}

/**
 * Format location text to show "street name / city" format
 * @param {string} location - Full location string
 * @returns {string} Formatted location (e.g., "123 Main St / New York")
 */
export function formatLocationShort(location) {
  if (!location) return "";

  // Try to parse common location formats
  // Format: "Street Address, City, State" or "Street Address, City"
  const parts = location.split(",").map((p) => p.trim());

  if (parts.length >= 2) {
    // Return "Street / City"
    return `${parts[0]} / ${parts[1]}`;
  }

  // If no comma, return as-is
  return location;
}
