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
