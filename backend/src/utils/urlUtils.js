// backend/src/utils/urlUtils.js
// Utility functions for URL generation

/**
 * Get the base URL for the frontend
 * Matches the logic from frontend/src/lib/urlUtils.js
 */
const isDevelopment = process.env.NODE_ENV === "development";

export function getBaseUrl() {
  if (isDevelopment) {
    return (
      process.env.TEST_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    );
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error(
      "FRONTEND_URL environment variable is required in production for URL generation.",
    );
  }

  return process.env.FRONTEND_URL;
}

/**
 * Get the event URL for a given slug
 * This generates the full URL that recipients will click in emails
 * Always returns an absolute URL (with protocol)
 */
export function getEventUrl(slug) {
  if (!slug) {
    console.error("[getEventUrl] No slug provided!");
    return "";
  }
  const baseUrl = getBaseUrl();
  const eventUrl = `${baseUrl}/e/${slug}`;
  
  // Ensure URL is absolute (has protocol)
  if (!eventUrl.startsWith("http://") && !eventUrl.startsWith("https://")) {
    console.warn(`[getEventUrl] Generated URL missing protocol: ${eventUrl}`);
    return `https://${eventUrl}`;
  }
  
  return eventUrl;
}

