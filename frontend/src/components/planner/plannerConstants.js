// Shared constants + small helpers for the content planner canvas.
// Lives apart from PlannerCanvas so the card faces (front / edit / analytics)
// can pull the same channel palette, dimensions and date helpers.
import { Mail, Image as ImageIcon, Film, Smartphone, GalleryHorizontalEnd } from "lucide-react";
import { SiInstagram, SiTiktok, SiYoutube, SiFacebook, SiX, SiLinkedin, SiWhatsapp } from "react-icons/si";
import { startOfDay } from "./../../lib/plannerTime.js";

// ── World constants ─────────────────────────────────────────────────
export const PX_PER_DAY = 26;
export const TIMELINE_Y = 0; // vertical centre of the timeline band
export const BAND_H = 30; // slim band — its bold borders carry the structure, not its mass
export const BAND_TOP = TIMELINE_Y - BAND_H / 2;
export const BAND_BOTTOM = TIMELINE_Y + BAND_H / 2;
export const TODAY_COLOR = "#b45309"; // warm amber — "now", stands out on a light canvas
export const TIMELINE_COLOR = "#0d9488"; // teal — events on the band in platform mode
export const NEUTRAL_LINK = "rgba(10,10,10,0.28)"; // content with no channel / no event
// Distinct hues for "event" colour mode — assigned per event, chronologically. Gold is reserved for "today".
export const EVENT_PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#a78bfa", "#fb923c", "#22d3ee", "#f87171", "#a3e635"];
export const CARD_W = 188; // card (and media) width — resizable
export const MIN_CARD_W = 120;
export const MAX_CARD_W = 440;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2.5;
export const SNAP_Y = 56; // how close to the band counts as "on the timeline"

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// `types` = the content formats relevant to each channel. The Type dropdown
// only shows when a channel offers more than one (e.g. Email shows none).
export const CHANNELS = {
  instagram: { label: "Instagram", color: "#E1306C", Icon: SiInstagram, types: ["image", "carousel", "story", "reel"] },
  tiktok: { label: "TikTok", color: "#FE2C55", Icon: SiTiktok, types: ["reel", "story", "carousel"] },
  youtube: { label: "YouTube", color: "#FF0000", Icon: SiYoutube, types: ["reel"] },
  facebook: { label: "Facebook", color: "#1877F2", Icon: SiFacebook, types: ["image", "carousel", "story", "reel"] },
  x: { label: "X", color: "#7d8b99", Icon: SiX, types: ["image", "carousel"] },
  linkedin: { label: "LinkedIn", color: "#0A66C2", Icon: SiLinkedin, types: ["image", "carousel"] },
  whatsapp: { label: "WhatsApp", color: "#25D366", Icon: SiWhatsapp, types: ["story", "image"] },
  email: { label: "Email", color: "#3b82f6", Icon: Mail, types: [] },
};
export const TYPES = {
  image: { label: "Image", Icon: ImageIcon, ratio: 1 },
  carousel: { label: "Carousel", Icon: GalleryHorizontalEnd, ratio: 1 },
  story: { label: "Story", Icon: Smartphone, ratio: 1.5 },
  reel: { label: "Reel", Icon: Film, ratio: 1.5 },
};

// A content card's identity colour — its channel, or neutral slate if none.
export const channelColor = (channel) => CHANNELS[channel]?.color || NEUTRAL_LINK;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const pad2 = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Card width + approximate (front-face) height — used to anchor each card's
// connector to the edge nearest the timeline.
export const cardFrameW = (c) => c.w || CARD_W;
export const cardHeight = (c) => {
  const ty = TYPES[c.contentType] || TYPES.image;
  const mediaH = Math.round(((c.w || CARD_W) - 12) * ty.ratio);
  return 6 + mediaH + 6 + (c.links?.length || c.eventId ? 28 : 0);
};

// A short human date — "Tue 5 May".
export const fmtDate = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

// The Today seam decides a card's life: its earliest pinned date is what counts.
// No date yet → still a plan (future). Pinned in the past → it shipped (past).
export const earliestLinkDate = (card) => {
  const dates = (card.links || []).map((l) => l.date).filter(Boolean).sort();
  return dates[0] || null;
};
export const phaseOf = (card, today) => {
  const iso = earliestLinkDate(card);
  if (!iso) return "future";
  return startOfDay(new Date(`${iso}T00:00:00`)).getTime() < today.getTime() ? "past" : "future";
};
// An event's phase is simply where its start sits relative to today.
export const eventPhase = (ev, today) =>
  ev?.startsAt && startOfDay(new Date(ev.startsAt)).getTime() < today.getTime() ? "past" : "future";
