import { FaInstagram, FaSpotify, FaTiktok, FaSoundcloud } from "react-icons/fa";
import { formatEventTime } from "../lib/dateUtils.js";
import { formatLocationShort } from "../lib/urlUtils";

// Each embed helper PARSES the URL and only emits an iframe src whose host
// is one we explicitly trust. The previous string.includes() / replace()
// versions matched `https://attacker.com/spotify.com/x` and dutifully built
// an iframe pointing at attacker.com. Return null on anything unrecognised so
// the caller can refuse to render.

function parseHttpsUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function hostMatches(host, suffixes) {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

function getSpotifyEmbedUrl(url) {
  const u = parseHttpsUrl(url);
  if (!u || !hostMatches(u.hostname, ["spotify.com"])) return null;
  // Spotify URL paths look like /track/<id>, /album/<id>, /playlist/<id>,
  // /episode/<id>, /show/<id>. The embed form just prefixes /embed/ before
  // the type segment. Reconstruct from the trusted host instead of replacing
  // text inside the user-supplied string.
  return `https://open.spotify.com/embed${u.pathname}`;
}

function getAppleMusicEmbedUrl(url) {
  const u = parseHttpsUrl(url);
  if (!u || !hostMatches(u.hostname, ["music.apple.com"])) return null;
  return `https://embed.music.apple.com${u.pathname}${u.search}`;
}

function getSoundCloudEmbedUrl(url) {
  const u = parseHttpsUrl(url);
  if (!u || !hostMatches(u.hostname, ["soundcloud.com"])) return null;
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`;
}

function getYouTubeEmbedUrl(url) {
  const u = parseHttpsUrl(url);
  if (!u) return null;
  let videoId = null;
  if (u.hostname === "youtu.be") {
    videoId = u.pathname.slice(1);
  } else if (hostMatches(u.hostname, ["youtube.com", "youtube-nocookie.com"])) {
    if (u.pathname.startsWith("/embed/")) {
      videoId = u.pathname.split("/embed/")[1];
    } else {
      videoId = u.searchParams.get("v");
    }
  }
  // Strict id check — letters, digits, dash, underscore only (YouTube's
  // alphabet). Prevents path traversal back into another provider's URL.
  if (!videoId || !/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

function formatDate(startsAt, timezone) {
  if (!startsAt) return "";
  const d = new Date(startsAt);
  const tzOpt = timezone ? { timeZone: timezone } : {};
  const day = d.toLocaleDateString("en-US", { weekday: "short", ...tzOpt });
  const dateNum = d.toLocaleDateString("en-US", { day: "numeric", ...tzOpt });
  const month = d.toLocaleDateString("en-US", { month: "short", ...tzOpt }).toLowerCase();
  const eventTime = formatEventTime(d, timezone);
  return `${day} ${dateNum} ${month}${eventTime ? `, ${eventTime}` : ""}`;
}

export function EventPageContent({
  title,
  description,
  location,
  startsAt,
  timezone,
  sections = [],
  hoveredSection = null,
  hideLocation = false,
  hideDate = false,
  revealHint = null,
  dateRevealHint = null,
}) {
  const formattedDate = hideDate ? null : formatDate(startsAt, timezone);
  const locationTba = revealHint || "Location revealed later";
  const dateTba = dateRevealHint || "Date TBA";

  // Fallback: no sections defined, show legacy layout
  if (!sections || sections.length === 0) {
    return (
      <>
        {title && <h1 style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, lineHeight: "1.2", color: "#fff", margin: "0 0 12px 0" }}>{title}</h1>}
        {location && !hideLocation && <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.6, marginBottom: "4px" }}>{formatLocationShort(location)}</div>}
        {hideLocation && <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.35, marginBottom: "4px", fontStyle: "italic" }}>{locationTba}</div>}
        {formattedDate && <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635", marginBottom: "20px" }}>{formattedDate}</div>}
        {hideDate && <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635", opacity: 0.5, marginBottom: "20px", fontStyle: "italic" }}>{dateTba}</div>}
        {description && <div style={{ marginBottom: "24px" }}><p style={{ fontSize: "15px", lineHeight: "1.6", color: "#fff", opacity: 0.85, margin: 0, whiteSpace: "pre-line", wordWrap: "break-word", overflowWrap: "break-word" }}>{description}</p></div>}
      </>
    );
  }

  return (
    <>
      {sections.map((section, i) => {
        const isHovered = hoveredSection === i;
        return (
        <div key={i} data-section-index={i} style={{
          marginBottom: i === sections.length - 1 ? 0 : section.type === "location" ? "4px" : "16px",
          borderRadius: "4px",
          outline: isHovered ? "1px solid rgba(163, 230, 53, 0.5)" : "1px solid transparent",
          outlineOffset: "4px",
          transition: "outline-color 0.15s ease",
        }}>
          {section.type === "title" ? (
            title ? <h1 style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, lineHeight: "1.2", color: "#fff", margin: 0 }}>{title}</h1> : null

          ) : section.type === "location" ? (
            hideLocation
              ? <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.35, fontStyle: "italic" }}>{locationTba}</div>
              : location ? <div style={{ fontSize: "14px", fontWeight: 500, color: "#fff", opacity: 0.6 }}>{formatLocationShort(location)}</div> : null

          ) : section.type === "datetime" ? (
            hideDate
              ? <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635", opacity: 0.5, fontStyle: "italic" }}>{dateTba}</div>
              : formattedDate ? <div style={{ fontSize: "14px", fontWeight: 600, color: "#a3e635" }}>{formattedDate}</div> : null

          ) : section.type === "spotify" && section.url ? (
            (() => {
              const embedUrl = getSpotifyEmbedUrl(section.url);
              return embedUrl ? (
                <iframe src={embedUrl} width="100%" height={embedUrl.includes("/track/") ? "80" : "152"} frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ borderRadius: "12px", border: "none" }} />
              ) : null;
            })()

          ) : section.type === "applemusic" && section.url ? (
            (() => {
              const embedUrl = getAppleMusicEmbedUrl(section.url);
              return embedUrl ? (
                <iframe src={embedUrl} width="100%" height={embedUrl.includes("/song/") || embedUrl.includes("?i=") ? "175" : "450"} frameBorder="0" allow="autoplay *; encrypted-media *; fullscreen *" loading="lazy" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" style={{ borderRadius: "12px", border: "none" }} />
              ) : null;
            })()

          ) : section.type === "soundcloud" && section.url ? (
            (() => {
              const embedUrl = getSoundCloudEmbedUrl(section.url);
              return embedUrl ? (
                <iframe src={embedUrl} width="100%" height={section.url.includes("/sets/") ? "300" : "166"} frameBorder="0" allow="autoplay" loading="lazy" style={{ borderRadius: "12px", border: "none" }} />
              ) : null;
            })()

          ) : section.type === "youtube" && section.url ? (
            (() => {
              const embedUrl = getYouTubeEmbedUrl(section.url);
              return embedUrl ? (
                <iframe src={embedUrl} width="100%" style={{ aspectRatio: "16/9", borderRadius: "12px", border: "none" }} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" />
              ) : null;
            })()

          ) : section.type === "socials" ? (
            <div style={{ display: "flex", gap: "14px" }}>
              {section.instagram && <a href={section.instagram} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaInstagram size={18} /></a>}
              {section.spotify && <a href={section.spotify} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaSpotify size={18} /></a>}
              {section.tiktok && <a href={section.tiktok} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaTiktok size={18} /></a>}
              {section.soundcloud && <a href={section.soundcloud} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.6, display: "inline-flex" }}><FaSoundcloud size={18} /></a>}
            </div>

          ) : section.type === "hostedby" && section.name ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "14px 16px", borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}>
              {section.logo && (
                <img src={section.logo} alt="" style={{
                  width: "40px", height: "40px", borderRadius: "6px",
                  objectFit: "contain", padding: "4px", background: "rgba(255,255,255,0.04)",
                  flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", marginBottom: "2px" }}>Hosted by</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>{section.name}</div>
                {(section.email || section.website) && (
                  <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                    {section.email && (
                      <a href={`mailto:${section.email}`} style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
                        {section.email}
                      </a>
                    )}
                    {section.website && (
                      <a href={section.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
                        {section.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

          ) : (
            <>
              {section.title && <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>{section.title}</h3>}
              {section.text && <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#fff", opacity: 0.8, margin: 0, whiteSpace: "pre-line", wordWrap: "break-word", overflowWrap: "break-word" }}>{section.text}</p>}
            </>
          )}
        </div>
        );
      })}
    </>
  );
}
