// Auto-populated event blocks carry SIGNED Supabase URLs that expire in
// ~1 hour. If the host composes now and sends in two hours, the signed
// token is dead and recipients see broken images. publicSupabaseUrl
// rewrites any signed URL to its public-URL equivalent (which never
// expires); sanitizeBlockUrls walks a block list and applies it to
// every image-block URL.

export function publicSupabaseUrl(url) {
  if (typeof url !== "string" || !url) return url;
  // Match: https://<host>/storage/v1/object/sign/<bucket>/<path>?token=...
  const m = url.match(/^(https?:\/\/[^/]+)\/storage\/v1\/object\/sign\/([^?]+)(\?.*)?$/i);
  if (!m) return url;
  return `${m[1]}/storage/v1/object/public/${m[2]}`;
}

export function sanitizeBlockUrls(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (b?.type === "image" && b.url) {
      return { ...b, url: publicSupabaseUrl(b.url) };
    }
    return b;
  });
}
