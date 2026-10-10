// Pasted social URL → playable embed. Pure, no network: short links that hide
// the real post (vm.tiktok.com, fb.watch, share links) report `needsResolve`
// and the canvas expands them via GET /canvas/resolve first.
//
// Returns { platform, kind, src, w, h, url } or null for non-social links.

const enc = encodeURIComponent;

function parse(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

const host = (u) => u.hostname.replace(/^(www\.|m\.|mobile\.)/, "");

export function isUrl(text) {
  return Boolean(parse(text));
}

export function needsResolve(raw) {
  const u = parse(raw);
  if (!u) return false;
  const h = host(u);
  return (
    h === "vm.tiktok.com" ||
    h === "vt.tiktok.com" ||
    (h === "tiktok.com" && /^\/t\//.test(u.pathname)) ||
    h === "fb.watch" ||
    (h === "facebook.com" && /^\/share\//.test(u.pathname)) ||
    h === "instagr.am"
  );
}

export function socialEmbed(raw) {
  const u = parse(raw);
  if (!u) return null;
  const h = host(u);
  const url = u.toString();
  let m;

  // YouTube
  if (h === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (id) return youtube(id, false, url);
  }
  if (h === "youtube.com" || h === "music.youtube.com") {
    if ((m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/))) return youtube(m[2], m[1] === "shorts", url);
    const v = u.searchParams.get("v");
    if (v) return youtube(v, false, url);
  }

  // Instagram — posts (incl. carousels), reels, IGTV
  if (h === "instagram.com" && (m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/))) {
    const kind = m[1] === "p" ? "post" : "reel";
    const path = m[1] === "p" ? "p" : "reel";
    return {
      platform: "instagram",
      kind,
      src: `https://www.instagram.com/${path}/${m[2]}/embed/`,
      w: 360,
      h: kind === "reel" ? 640 : 560,
      url,
    };
  }

  // TikTok — videos and photo carousels
  if (h === "tiktok.com" && (m = u.pathname.match(/\/(video|photo)\/(\d+)/))) {
    return {
      platform: "tiktok",
      kind: m[1] === "photo" ? "carousel" : "video",
      src: `https://www.tiktok.com/embed/v2/${m[2]}`,
      w: 330,
      h: 740,
      url,
    };
  }

  // Facebook — videos/reels play inline, everything else as a post
  if (h === "facebook.com" || h === "fb.com") {
    const isVideo = /\/(videos|reel|watch)\b/.test(u.pathname) || u.pathname.startsWith("/watch");
    return isVideo
      ? { platform: "facebook", kind: "video", src: `https://www.facebook.com/plugins/video.php?href=${enc(url)}&show_text=false`, w: 360, h: 640, url }
      : { platform: "facebook", kind: "post", src: `https://www.facebook.com/plugins/post.php?href=${enc(url)}&show_text=true&width=360`, w: 360, h: 560, url };
  }

  return null;
}

function youtube(id, vertical, url) {
  return {
    platform: "youtube",
    kind: vertical ? "short" : "video",
    src: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
    w: vertical ? 320 : 480,
    h: vertical ? 570 : 270,
    url,
  };
}

export const PLATFORM_LABEL = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  link: "Link",
};
