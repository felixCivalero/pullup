// backend/src/utils/urlUtils.js
// Utility functions for URL generation

/**
 * Get the base URL for the frontend
 * Matches the logic from frontend/src/lib/urlUtils.js
 */
export function getBaseUrl() {
  // Check for explicit FRONTEND_URL environment variable first
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  // In development, use localhost (Vite default port)
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:5173";
  }

  // In production, use the canonical domain
  return "https://pullup.se";
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

