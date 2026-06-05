import { useNavigate, useLocation, useSearchParams, Navigate } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowRight, Lock, Cloud, UserCheck, PenLine, Heart, Download } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { hasStoredSession } from "../lib/session.js";
import { publicFetch } from "../lib/api.js";
import { trackEvent, getVisitorId } from "../lib/analytics.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { InstallPrompt } from "../components/pwa/InstallPrompt.jsx";
import { WebGLHero } from "../components/WebGLHero.jsx";
import { transformedImageUrl } from "../lib/imageUtils.js";


const LOGOS = [
  // All logos render as solid black silhouettes via `filter: brightness(0)`
  // so the marquee sits on the white page without needing a dark backdrop.
  { type: "image", src: "/landing/logos/soho-house.png", alt: "Soho House", width: 280, height: 179 },
  { type: "image", src: "/landing/logos/doberman.png", alt: "EY Doberman", width: 705, height: 139 },
  { type: "image", src: "/landing/logos/cliff-barnes.svg", alt: "Cliff Barnes Bränneri", width: 408, height: 176 },
  { type: "image", src: "/landing/logos/aperol.png", alt: "Aperol", width: 1280, height: 618 },
  { type: "image", src: "/zoda_logotype_white.webp", alt: "Zoda", width: 1600, height: 541 },
  { type: "image", src: "/landing/logos/showlighters.png", alt: "Showlighters", width: 3830, height: 2267 },
  { type: "image", src: "/landing/logos/hendricks-gin.png", alt: "Hendrick's Gin", width: 160, height: 160, boost: 1.7 },
  { type: "image", src: "/landing/logos/jagermeister.png", alt: "Jägermeister", width: 160, height: 160, boost: 1.7 },
];

const PINK = "#EC178F";
const INK = "#0a0a0a";
const SURFACE = "#ffffff";

// Public Supabase storage base for event cover images.
const STORAGE_BASE =
  (import.meta.env.VITE_SUPABASE_URL || "") +
  "/storage/v1/object/public/event-images/";

// The showcase wall — a curated, hand-picked drift of real rooms already live
// on PullUp, with a couple of AI-dreamed designs that actually *move* sprinkled
// in. Real cards link straight to their live /e/:slug page (tap-through proof
// that the thing you're about to make looks like this). The `ai` cards render a
// live WebGL hero instead of a photo and wear a "designed by AI" tag — the
// playful "you could conjure a whole world in a sentence" flex. Order here is
// the on-screen order; AI tiles are interleaved on purpose.
const SHOWCASE = [
  { slug: "divine-earth-live-4hy5", title: "Divine Earth — Spiritual Jazz", meta: "Soho House · Sthlm", cover: "052e22f6-d7fe-4772-8f95-55b826434000/media_0_1779391795495.webp" },
  { slug: "techo-cocktails", title: "Jägermeister × ADAMO", meta: "Göteborg", cover: "035d3cad-dd9e-4f66-a3e1-3baf9422b40d/media_0_1778075065925.png" },
  { ai: true, title: "Hypershape Release", sub: "a world, written in a sentence", params: { colors: ["#d0d8e8", "#f0f4ff", "#a0b0c8", "#e8e8f0", "#7090b0"], intensity: 0.95 } },
  { slug: "aperidisco-bbtr", title: "Aperidisco", meta: "Brunkebergstorg · Sthlm", cover: "07324036-a348-4940-98d9-43f2f8821eda/media_0_1778621428603.png" },
  { slug: "twin-freaks-listening-release", title: "TWIN FREAKS — listening release", meta: "Slakthusområdet · Sthlm", cover: "83e543b6-4a95-4277-8e42-bb4e579f9127/thumb_0_1780266730534.jpg" },
  { slug: "cocktails-and-caviar-asrf", title: "Cocktails and Caviar", meta: "Sjövikskajen · Sthlm", cover: "b8cf87c8-6483-4da3-93e3-63b4689e1ff7/media_0_1777968238709.jpeg" },
  { ai: true, title: "Pullup 2026", sub: "dreamed up in one line", params: { colors: ["#0a0617", "#ec178f", "#16e0c0"], intensity: 0.85 } },
  { slug: "nigab-dagen-x74s", title: "nigab. DAGEN", meta: "Visby", cover: "26a96f49-5b68-4dbe-838b-01e71657c234/media_0_1779893707128.webp" },
  { slug: "henning-ulln-house-jazz-294-soho-house", title: "Henning Ullén pianotrio", meta: "Soho House · Sthlm", cover: "e4d1dbae-bf83-4fa2-82bc-641251a2b083/media_0_1776700815357.jpeg" },
  { slug: "peep-take-over-8e7y", title: "P.E.E.P Take over", meta: "Birger Jarlsgatan · Sthlm", cover: "955c371e-bba6-44c9-87f1-bb96edbc1792/media_0_1778243555025.jpeg" },
  { slug: "utbildning-bstad-g6hy", title: "Jägermeister Båstad", meta: "Skansenbadet · Båstad", cover: "bccc176a-e8dd-4d13-8f70-97c097e809a0/media_0_1779793614037.webp" },
];

// The quiet promises under the final CTA — security, control and the moral
// line, the things that make the whole system feel safe to hand your people to.
const TRUST = [
  { icon: Lock, title: "Never sold" },
  { icon: Cloud, title: "Your own cloud" },
  { icon: UserCheck, title: "Only you reach them" },
  { icon: PenLine, title: "You approve every send" },
  { icon: Heart, title: "Care, never faked" },
  { icon: Download, title: "Export anytime" },
];

/* ─── scroll reveal hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── generic reveal wrapper ─── */
function Reveal({ children, delay = 0, y = 24, className, style }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        transition: `transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, opacity 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}


/* ─── Marketing primitives ─── */

// A numbered chapter label — "01 · The split" — that anchors each beat.
function Chapter({ n, label }) {
  return (
    <div className="mk-chapter">
      <span className="mk-chapter-n">{n}</span>
      <span className="mk-chapter-label">{label}</span>
    </div>
  );
}

// Scene frame — wraps an animated mock and only kicks its CSS animations off
// once it scrolls into view (adds `.mk-in`). Mirrors the WhatsNewModal scene
// language: real platform surfaces, built as animated CSS rather than video.
function SceneFrame({ children, className = "" }) {
  const [ref, visible] = useReveal(0.28);
  return (
    <div ref={ref} className={`mk-scene ${className}${visible ? " mk-in" : ""}`}>
      {children}
    </div>
  );
}

// Channel glyph — the real Room's cross-channel identity chips.
const CH = {
  whatsapp: { glyph: "WA", color: "#25D366", soft: "#e7f9ee" },
  instagram: { glyph: "IG", color: "#d6249f", soft: "#fdeef7" },
  email: { glyph: "@", color: "#6b6b6b", soft: "#f0f0ee" },
};
function ChannelChip({ ch }) {
  const c = CH[ch] || CH.email;
  return (
    <span className="mk-chchip" style={{ background: c.soft, color: c.color }}>
      {c.glyph}
    </span>
  );
}

// The recurring trust marquee, reused in the proof section + page foot.
function LogoMarquee() {
  return (
    <div className="logo-marquee" aria-hidden="true">
      <div className="logo-marquee-track">
        {[0, 1].map((copy) => (
          <div className="logo-marquee-group" key={copy}>
            {LOGOS.map((logo, i) => {
              const renderH = 22 * (logo.boost || 1);
              return (
                <div className="logo-marquee-item" key={i}>
                  <img
                    src={logo.src}
                    alt={copy === 0 ? logo.alt : ""}
                    width={logo.width}
                    height={logo.height}
                    style={{ height: renderH }}
                    decoding="async"
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// One tile on the showcase wall. Real events are an <a> straight to their live
// /e/:slug page; AI tiles render a moving WebGL hero and don't link anywhere —
// they're the "look what you could conjure" flex. `live` gates the WebGL so it
// only spins up once the wall has scrolled into view (no shaders running on
// page load). `dim` marks the duplicated copy that only exists to make the
// marquee loop seamless — it's hidden from screen readers and keyboard order.
function ShowcaseCard({ item, live, dim }) {
  if (item.ai) {
    const [c0, c1] = item.params.colors;
    return (
      <div className="mk-show-card mk-show-card-ai" aria-hidden={dim || undefined}>
        {live ? (
          <WebGLHero params={item.params} />
        ) : (
          <div
            className="mk-show-ai-fallback"
            style={{ background: `linear-gradient(135deg, ${c0}, ${c1 || c0})` }}
          />
        )}
        <span className="mk-show-aitag">✦ designed by AI</span>
        <div className="mk-show-meta">
          <p className="mk-show-title">{item.title}</p>
          {item.sub && <p className="mk-show-sub">{item.sub}</p>}
        </div>
      </div>
    );
  }
  const src = transformedImageUrl(STORAGE_BASE + item.cover, { width: 320 });
  return (
    <a
      className="mk-show-card"
      href={`/e/${item.slug}`}
      aria-hidden={dim || undefined}
      tabIndex={dim ? -1 : undefined}
    >
      <img
        className="mk-show-img"
        src={src}
        alt={dim ? "" : item.title}
        loading="lazy"
        decoding="async"
      />
      <div className="mk-show-meta">
        <p className="mk-show-title">{item.title}</p>
        {item.meta && <p className="mk-show-sub">{item.meta}</p>}
      </div>
    </a>
  );
}

// The showcase wall — a drifting, hover-to-pause marquee of real rooms (and a
// couple of live AI designs). Mounts its WebGL tiles only once it scrolls into
// view. Two identical card groups translate -50% for a seamless infinite loop.
function EventShowcase() {
  const [ref, visible] = useReveal(0.2);
  return (
    <section className="mk-show" ref={ref}>
      <div className="mk-show-head">
        <Reveal><Chapter n="06" label="The rooms themselves" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Real rooms, already live. <span className="pink">A few dreamed up by AI.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Every card is a real page someone built on PullUp — tap in. The ones
            that move? Designed by AI in a single sentence. This is what your next
            night looks like before anyone's even arrived.
          </p>
        </Reveal>
      </div>
      <div className="mk-show-wall" aria-label="Events made on PullUp">
        <div className="mk-show-track">
          {[0, 1].map((copy) => (
            <div className="mk-show-group" key={copy}>
              {SHOWCASE.map((item, i) => (
                <ShowcaseCard
                  key={`${copy}-${i}`}
                  item={item}
                  live={visible && copy === 0}
                  dim={copy === 1}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Scenes — animated mocks of the REAL platform ─── */

// The people who feed the room's member stack (avatars + names).
const ROOM_PEOPLE = [
  { initials: "SL", color: "#ec4899", name: "Sara Lindqvist" },
  { initials: "AB", color: "#8b5cf6", name: "Adam Berg" },
  { initials: "PR", color: "#d97706", name: "Priya Raman" },
  { initials: "TH", color: "#16a34a", name: "Tobias Hane" },
  { initials: "JW", color: "#0d9488", name: "Jonas Wikström" },
];

// 2 · EVERY PERSON, IN FULL — the deep single-person view. Everything PullUp
// has stitched about one human: where you met, their arc, what they've done,
// and the notes only you'd remember.
function ProfileScene() {
  return (
    <SceneFrame className="mk-profile">
      <div className="mk-pf-top" style={{ "--i": 0 }}>
        <span className="mk-pf-av" style={{ background: "#ec4899" }}>SL</span>
        <div className="mk-pf-id">
          <span className="mk-pf-name">
            Sara Lindqvist <span className="mk-pf-badge">Regular</span>
          </span>
          <span className="mk-pf-handle">@saralind · Stockholm</span>
        </div>
        <span className="mk-pf-chips">
          <ChannelChip ch="whatsapp" />
          <ChannelChip ch="instagram" />
          <ChannelChip ch="email" />
        </span>
      </div>
      <div className="mk-pf-facts" style={{ "--i": 1 }}>
        <div className="mk-pf-fact"><span>In your world</span><strong>Since Vol. 1 · last spring</strong></div>
        <div className="mk-pf-fact"><span>Nights</span><strong>3 of 4</strong></div>
        <div className="mk-pf-fact"><span>Brought</span><strong>2 friends</strong></div>
        <div className="mk-pf-fact"><span>Found you via</span><strong>Instagram</strong></div>
      </div>
      <div className="mk-pf-tags" style={{ "--i": 2 }}>
        <span>Confirmed +1 for Vol. 4</span>
        <span>Opened your last 4 invites</span>
        <span>Always replies</span>
      </div>
      <div className="mk-pf-note" style={{ "--i": 3 }}>
        <span className="mk-pf-note-tag">Your note</span>
        Always brings her flatmate. Loves the rooftop sets — studies
        architecture, ask about her thesis.
      </div>
    </SceneFrame>
  );
}

// 2 · INSIDE THE ROOM — the exclusive stuff only your pullupers get.
// Mirrors the federated-room model: memories (photos from the night) +
// artifacts (a track, a drop) shared with the people who actually showed up.
function RoomDropScene() {
  return (
    <SceneFrame className="mk-drop">
      <div className="mk-drop-head">
        <span className="mk-drop-title">Inside the room</span>
        <span className="mk-drop-lock">only for people who pulled up</span>
      </div>
      <div className="mk-drop-members">
        <span className="mk-mem-avs">
          {ROOM_PEOPLE.map((p, i) => (
            <span key={p.name} className="mk-mem-av" style={{ background: p.color, "--i": i }}>
              {p.initials}
            </span>
          ))}
          <span className="mk-mem-av mk-mem-more" style={{ "--i": ROOM_PEOPLE.length }}>+243</span>
        </span>
        <span className="mk-mem-text">
          <strong>248 people</strong> are in here — Sara, Adam, Priya &amp; 245 more
        </span>
      </div>
      <div className="mk-drop-grid">
        {/* music */}
        <div className="mk-tile" style={{ "--i": 0 }}>
          <div className="mk-tile-music">
            <span className="mk-tile-play" />
            <span className="mk-wave" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} style={{ "--b": i }} />
              ))}
            </span>
          </div>
          <span className="mk-tile-label">Sunset set · unreleased</span>
        </div>
        {/* photos */}
        <div className="mk-tile" style={{ "--i": 1 }}>
          <div className="mk-tile-photos">
            <span style={{ background: "linear-gradient(135deg,#ff8a4c,#ec178f)" }} />
            <span style={{ background: "linear-gradient(135deg,#7b2ff7,#0d9488)" }} />
            <span style={{ background: "linear-gradient(135deg,#fbbf24,#dc2743)" }} />
          </div>
          <span className="mk-tile-label">Vol. 3 night · 48 photos</span>
        </div>
        {/* product drop */}
        <div className="mk-tile" style={{ "--i": 2 }}>
          <div className="mk-tile-drop">
            <span className="mk-tile-swatch" />
            <span className="mk-tile-pill">20% for the room</span>
          </div>
          <span className="mk-tile-label">Studio print · early drop</span>
        </div>
        {/* next invite */}
        <div className="mk-tile" style={{ "--i": 3 }}>
          <div className="mk-tile-invite">
            <span className="mk-tile-invite-eyes">Vol. 5</span>
            <span className="mk-tile-invite-note">you're first</span>
          </div>
          <span className="mk-tile-label">Next night · before it's public</span>
        </div>
      </div>
    </SceneFrame>
  );
}

// 3 · ONE CHAT — every channel lands in one thread; you pick the way back out.
const THREAD = [
  { from: "them", ch: "instagram", text: "saw your story — is Vol 4 happening?? 🙌" },
  { from: "you", ch: "instagram", text: "Sara!! yes — this Saturday. sending the link" },
  { from: "sys", ch: "email", text: "RSVP'd to Vol. 4 · confirmed, bringing 1" },
  { from: "them", ch: "whatsapp", text: "is there parking nearby or should I take the metro?" },
];
function ChatScene() {
  return (
    <SceneFrame className="mk-chat">
      <div className="mk-chat-sources">
        <ChannelChip ch="instagram" />
        <ChannelChip ch="whatsapp" />
        <ChannelChip ch="email" />
        <span className="mk-chat-sources-label">all land in one chat</span>
      </div>
      <div className="mk-thread">
        <div className="mk-thread-head">
          <span className="mk-thread-av" style={{ background: "#ec4899" }}>SL</span>
          <div className="mk-thread-who">
            <span className="mk-thread-name">Sara Lindqvist</span>
            <span className="mk-thread-sub">A regular · Vol. 1 → 3 → 4</span>
          </div>
          <span className="mk-window">WhatsApp · open · 21h left</span>
        </div>
        <div className="mk-thread-body">
          {THREAD.map((m, i) => (
            <div className={`mk-msg mk-msg-${m.from}`} key={i} style={{ "--i": i }}>
              {m.from !== "you" && <ChannelChip ch={m.ch} />}
              <span className="mk-msg-bub">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="mk-composer">
          <div className="mk-composer-draft">
            "Metro's easiest — Ringen, 4 min walk. Free parking on Skånegatan
            after 6 if you'd rather drive 🙂 so glad you're in again."
          </div>
          <div className="mk-ways">
            <span className="mk-ways-label">Reply via</span>
            <span className="mk-way mk-way-on"><ChannelChip ch="whatsapp" /> WhatsApp</span>
            <span className="mk-way"><ChannelChip ch="instagram" /> Instagram</span>
            <span className="mk-way"><ChannelChip ch="email" /> Email</span>
            <span className="mk-way-send">Send</span>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

// 5 · fill the room — comment → auto-DM → WhatsApp confirm (Tobias' real arc).
function InboundScene() {
  return (
    <SceneFrame className="mk-inbound">
      <div className="mk-in-comment">
        <ChannelChip ch="instagram" />
        <span>🔥 how do I get in??</span>
      </div>
      <div className="mk-in-arrow">↓ auto-DM with your link</div>
      <div className="mk-in-dm">
        Tap to grab your spot
        <span className="mk-in-pill">RSVP →</span>
      </div>
      <div className="mk-in-arrow mk-in-arrow-2">↓ confirm where they actually reply</div>
      <div className="mk-in-wa">
        <ChannelChip ch="whatsapp" />
        You're in — see you Saturday, 6pm ✓
      </div>
    </SceneFrame>
  );
}

// 6 · run it from your AI (MCP) — typed prompt → event created.
function McpScene() {
  return (
    <SceneFrame className="mk-mcp">
      <div className="mk-mcp-prompt">
        <span className="mk-mcp-pdot" />
        <span className="mk-mcp-typed">make a rooftop dinner, Sat 6pm, 50 guests</span>
        <span className="mk-mcp-caret" />
      </div>
      <div className="mk-mcp-card">
        <span className="mk-mcp-cover" />
        <div className="mk-mcp-meta">
          <span className="mk-mcp-l1" />
          <span className="mk-mcp-l2" />
        </div>
        <span className="mk-mcp-check">✓ Created</span>
      </div>
      <div className="mk-mcp-foot">Claude · ChatGPT · Cursor · your AI</div>
    </SceneFrame>
  );
}

/* ─── The marketing scroll ───
   Takes a creator who already throws events from "what is this" to
   "get started", mirroring the real platform: signals that come find you,
   one identity across channels, the WhatsApp window, drafts in your voice.
   Brand-soul kept: light canvas, pink accent, the eyes, pixel cursor,
   trust marquee. */
function MarketingScroll({ onGetStarted, onLogin, user }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const cta = (location, label = "Get started") => (
    <button
      type="button"
      className="mk-cta"
      onClick={() => {
        trackEvent("cta_click", { location, user_logged_in: !!user });
        onGetStarted();
      }}
    >
      {user ? "Open your room" : label}
      <ArrowRight size={17} />
    </button>
  );

  return (
    <div className="mk">
      {/* ─── Top bar — wordmark + log in / get started, fades in on scroll ─── */}
      <header className={`mk-nav${scrolled ? " is-scrolled" : ""}`}>
        <button
          type="button"
          className="mk-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="PullUp — back to top"
        >
          <img src="/pullup-textlogo.svg" alt="PullUp" />
        </button>
        <div className="mk-nav-actions">
          {!user && (
            <button
              type="button"
              className="mk-nav-login"
              onClick={() => {
                trackEvent("cta_click", { location: "nav_login", user_logged_in: false });
                onLogin();
              }}
            >
              Log in
            </button>
          )}
          <button
            type="button"
            className="mk-nav-cta"
            onClick={() => {
              trackEvent("cta_click", { location: "nav", user_logged_in: !!user });
              onGetStarted();
            }}
          >
            {user ? "Open your room" : "Get started"}
          </button>
        </div>
      </header>

      {/* ─── 1 · HERO ─── */}
      <section className="mk-hero">
        <Reveal y={16}>
          <PullupEyes variant="big" className="mk-hero-eyes" />
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mk-eyebrow">The event platform for creators</p>
        </Reveal>
        <Reveal delay={0.12}>
          <h1 className="mk-hero-h">
            Where your followers<br />
            <span className="pink">become your people.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mk-hero-sub">
            PullUp is the bridge between your online world and your real one.
            Your events bring people together — and PullUp keeps every one of
            them, across Instagram, WhatsApp and real life, long after the
            night's over.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mk-hero-cta" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center" }}>
            {cta("hero")}
            {/* Secondary, never primary: only appears on devices that can
                actually install (Android/Chromium or iOS Safari). */}
            <InstallPrompt placement="inline" cta="Get the app" />
          </div>
        </Reveal>
        <Reveal delay={0.4}>
          <div className="mk-scrollcue" aria-hidden="true">
            <span>see how it works</span>
            <span className="mk-scrollcue-line" />
          </div>
        </Reveal>
      </section>

      {/* ─── 1 · THE ROOM (exclusive drops + who's in it) ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="01" label="The Room" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Some things are only for the people <span className="pink">who showed up.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            The Room is everyone who's ever pulled up — kept long after the
            night's over — and the place you share what no one else gets. Drop
            the unreleased track, the photos from the night, the early product,
            the next invite before it's public. The stuff that never touches
            your grid lives here, just for them.
          </p>
        </Reveal>
        <RoomDropScene />
        <Reveal delay={0.1}>
          <p className="mk-creed">
            Showing up is the password. <span className="pink">What's inside is the reward.</span>
          </p>
        </Reveal>
      </section>

      {/* ─── 2 · EVERY PERSON, IN FULL (deep profile) ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="02" label="Every person, in full" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Everything you know about someone — <span className="pink">in one glance.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Tap anyone in the room and the whole picture opens: where you met,
            every night they came, who they brought, how warm things are — and
            the little notes only you'd remember. The context you used to keep in
            your head, finally on the screen.
          </p>
        </Reveal>
        <ProfileScene />
      </section>

      {/* ─── 3 · ONE CHAT, EVERY CHANNEL ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="03" label="One chat, every channel" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Every message, one chat. <span className="pink">Reply any way you like.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Their Instagram DMs, their emails, their WhatsApps — PullUp pulls
            them into one conversation, in order, no matter where they landed.
            When you reply, you pick the way out: back into their DMs, a WhatsApp,
            or an email — and PullUp drafts it in your voice first.
          </p>
        </Reveal>
        <ChatScene />
        <Reveal delay={0.1}>
          <p className="mk-creed">
            It drafts. <span className="pink">You send.</span>
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mk-aside">
            PullUp amplifies care that already exists. It never manufactures
            care that doesn't. The warmth is yours — it just makes sure you never
            drop it. And it only sends when you say so.
          </p>
        </Reveal>
      </section>

      {/* ─── 4 · FILL THE ROOM (INBOUND) ─── */}
      <section className="mk-section mk-section-tint">
        <Reveal><Chapter n="04" label="Fill the room" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            A comment on your reel becomes a guest at your door.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            Someone comments asking to get in — PullUp slides into their DMs
            with your sign-up link, then lands the confirmation on WhatsApp,
            where people actually open and reply. The whole funnel, from hype to
            RSVP, without you lifting a finger.
          </p>
        </Reveal>
        <InboundScene />
      </section>

      {/* ─── 5 · RUN IT FROM YOUR AI ─── */}
      <section className="mk-section">
        <Reveal><Chapter n="05" label="No new app to learn" /></Reveal>
        <Reveal delay={0.05}>
          <h2 className="mk-h2">
            Or just tell your AI to do it.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mk-lede">
            PullUp plugs into Claude, ChatGPT, Cursor — any AI that speaks MCP.
            Spin up an event, pull a person's whole history, draft the
            follow-ups, all in a sentence. The platform, run from wherever you
            already think out loud.
          </p>
        </Reveal>
        <McpScene />
      </section>

      {/* ─── PROOF ─── */}
      <section className="mk-section mk-section-proof">
        <Reveal>
          <p className="mk-proof-label">The rooms already run on PullUp</p>
        </Reveal>
      </section>
      <LogoMarquee />

      {/* ─── 9 · FINAL CTA ─── */}
      <section className="mk-final mk-final--pre">
        <Reveal y={16}>
          <PullupEyes variant="big" className="mk-final-eyes" />
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mk-final-h">
            Everyone else is automating.<br />
            <span className="pink">You'll own something real.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mk-final-sub">
            As the world goes synthetic, a room of people who actually showed up
            is the one asset that compounds.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mk-final-cta">{cta("final")}</div>
        </Reveal>
      </section>

      {/* ─── THE ROOMS THEMSELVES (showcase wall) — sits between the CTA and
          Felix's note, so right after "get started" you see what people make ─── */}
      <EventShowcase />

      {/* ─── A NOTE FROM FELIX (the quote) ─── */}
      <section className="mk-final mk-coda">
        {/* first-person, in Felix's own voice — the founder talking straight to
            another creator, not a brand manifesto. */}
        <Reveal delay={0.08}>
          <div className="mk-manifesto">
            <p className="mk-manifesto-eyebrow">Why we're building this</p>
            <p className="mk-manifesto-body">
              Everyone's automating, scaling, going synthetic. We're building the
              opposite — a place where the people who actually show up for you are
              yours: owned by you, kept by you, never sold. As the rest of the
              internet gets faker, that only gets more valuable. That's the future
              we're betting on. If it's yours too —{" "}
              <span className="pink">pull up.</span>
            </p>
            <p className="mk-manifesto-sign">
              —{" "}
              <a
                href="https://instagram.com/itsfelixagain"
                target="_blank"
                rel="noopener noreferrer"
              >
                Felix Civalero
              </a>
              , Founder
            </p>
          </div>
        </Reveal>

        {/* the quiet promises — a slim reassurance band, not a wall of text */}
        <div className="mk-trust-row">
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={0.12 + i * 0.04} y={10} className="mk-trust-chip">
              <t.icon className="mk-trust-ic" size={15} strokeWidth={2} />
              <span>{t.title}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="mk-footer">
        <span>Pullup &copy; {new Date().getFullYear()}</span>
        <span className="mk-footer-dot">·</span>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/cookies">Cookies</a>
        <span className="mk-footer-dot">·</span>
        <a href="mailto:hello@pullup.se">hello@pullup.se</a>
      </footer>
    </div>
  );
}

/* ─── component ─── */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const redirectedRef = useRef(false);

  // URL → which surface we show. /login + /start are the auth shell;
  // anything else is the marketing scroll.
  const view = useMemo(() => {
    if (location.pathname === "/login") return "login";
    if (location.pathname === "/start") return "onboarding";
    return "hero";
  }, [location.pathname]);

  // Pre-paint session gate. If a returning user lands on /, /login (or any
  // non-onboarding entry) with a stored Supabase session, redirect to /room
  // on the FIRST frame — before the marketing/login shell paints — so they
  // never see it flash in and jump away. /start (onboarding) is exempt: that
  // flow flushes the name+brand draft to the profile before forwarding.
  const sessionGate = useMemo(() => {
    if (location.pathname === "/start") return false;
    return hasStoredSession();
  }, [location.pathname]);

  useEffect(() => {
    const visitorId = getVisitorId();
    if (!visitorId) return;
    publicFetch("/t/pageview", {
      method: "POST",
      body: JSON.stringify({
        page: "landing",
        visitorId,
        referrer: document.referrer || null,
        deviceType: window.innerWidth < 768 ? "mobile" : "desktop",
      }),
    }).catch(() => {});
  }, []);

  // Auto-redirect signed-in users to their room, with a sessionStorage
  // circuit-breaker so a background 401 bouncing us back to "/" doesn't
  // ping-pong with /room.
  //
  // Skip when view === "onboarding" — AuthGate's onboarding flow owns that
  // path so the draft (name + brand) gets flushed to /host/profile before
  // the user lands on /room.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (view === "onboarding") return;
    if (redirectedRef.current) return;

    const LAST_KEY = "pullup_landing_redirected_at";
    const lastAt = Number(sessionStorage.getItem(LAST_KEY)) || 0;
    if (Date.now() - lastAt < 4000) return;

    redirectedRef.current = true;
    sessionStorage.setItem(LAST_KEY, String(Date.now()));

    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const pendingFlag = sessionStorage.getItem("pullup_signin_pending") === "1";
    const justCompletedOAuth =
      pendingFlag ||
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=");
    if (justCompletedOAuth) {
      sessionStorage.removeItem("pullup_signin_pending");
      trackEvent("signed_in", { via: pendingFlag ? "google" : "auto" });
    }
    // AuthGate pushes its own ?next= redirect once signed in; we only kick
    // in here for the bare hero/login states.
    navigate("/room", { replace: true });
  }, [user, loading, view, navigate]);

  // Marketing scroll needs the document to scroll normally; auth shell is a
  // single locked screen. Toggle a body class so the lock only applies to
  // auth and the marketing page scrolls freely.
  useEffect(() => {
    const cls = "pullup-auth-locked";
    if (view === "hero") document.body.classList.remove(cls);
    else document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [view]);

  // Returning user with a stored session — skip the shell entirely.
  if (sessionGate) {
    return <Navigate to="/room" replace />;
  }

  return (
    <div className="landing-root">
      <style>{STYLES}</style>

      {/* Marketing always renders; auth floats over it as a popup so the
          landing stays behind. */}
      <MarketingScroll
        user={user}
        onGetStarted={() => navigate(user ? "/room" : "/start")}
        onLogin={() => navigate("/login")}
      />
      {(view === "login" || view === "onboarding") && (
        <AuthGate
          initialMode={view === "onboarding" ? "onboarding" : "login"}
          redirectTo={resolveNext(searchParams)}
          onDismiss={() => navigate("/")}
        />
      )}
    </div>
  );
}

/* ─── styles ─── */
const STYLES = `
  /* Pixel-art pink hand cursor across the entire landing page. Forced on
     every descendant so images don't fall back to the default arrow. Form
     inputs are excluded so the text caret still works in the auth fields. */
  html, body, body *:not(input):not(textarea):not(select) {
    cursor: url('/cursor-finger.png') 11 2, pointer !important;
  }
  html, body { overflow-x: hidden; overscroll-behavior-x: none; }
  body { touch-action: pan-y; }

  /* Auth surfaces lock the screen to a single non-scrolling view; the
     marketing scroll leaves the document free to scroll. */
  body.pullup-auth-locked { overflow: hidden; }

  .landing-root {
    min-height: 100dvh;
    background: ${SURFACE};
    color: ${INK};
    position: relative;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .pink { color: ${PINK}; }

  /* ════════ MARKETING SCROLL ════════ */
  .mk {
    width: 100%;
    max-width: 100%;
  }

  /* ─── top nav ─── */
  .mk-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 50;
    height: 60px;
    padding-top: env(safe-area-inset-top, 0px);
    box-sizing: content-box;
    padding-left: clamp(16px, 4vw, 40px);
    padding-right: clamp(16px, 4vw, 40px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255,255,255,0);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-bottom: 1px solid transparent;
    transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
  }
  .mk-nav.is-scrolled {
    background: rgba(255,255,255,0.86);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(10,10,10,0.06);
  }
  .mk-nav-brand {
    background: none; border: 0; padding: 0; display: flex; align-items: center;
  }
  .mk-nav-brand img { height: 26px; width: auto; display: block; }
  .mk-nav-actions { display: flex; align-items: center; gap: clamp(8px, 2vw, 20px); }
  .mk-nav-login {
    background: none; border: 0; padding: 8px 6px;
    font: inherit; font-size: 14px; font-weight: 500;
    color: rgba(10,10,10,0.6);
    transition: color 0.18s;
  }
  .mk-nav-login:hover { color: ${INK}; }
  @media (max-width: 380px) { .mk-nav-login { display: none; } }
  .mk-nav-cta {
    padding: 9px 20px; border-radius: 999px; border: 0;
    background: ${INK}; color: #fff;
    font: inherit; font-size: 14px; font-weight: 600;
    transition: transform 0.18s, background 0.18s;
  }
  .mk-nav-cta:hover { transform: translateY(-1px); background: ${PINK}; }

  /* ─── shared section frame ─── */
  .mk-section {
    max-width: 880px;
    margin: 0 auto;
    padding: clamp(72px, 13vh, 150px) clamp(22px, 6vw, 48px);
  }
  .mk-section-tint { background: linear-gradient(180deg, #fafafa, #fff); max-width: none; }
  .mk-section-tint > * { max-width: 880px; margin-left: auto; margin-right: auto; }
  .mk-eyebrow {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.42);
    font-weight: 600;
  }
  .mk-chapter { display: flex; align-items: baseline; gap: 12px; margin-bottom: 22px; }
  .mk-chapter-n {
    font-size: 13px; font-weight: 700; color: ${PINK};
    font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
  }
  .mk-chapter-label {
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }
  .mk-h2 {
    margin: 0 0 28px;
    font-size: clamp(30px, 5.4vw, 52px);
    font-weight: 800; letter-spacing: -0.03em; line-height: 1.06;
  }
  .mk-lede {
    margin: 0;
    font-size: clamp(17px, 2.3vw, 22px);
    line-height: 1.55;
    color: rgba(10,10,10,0.72);
    max-width: 40ch;
  }
  .mk-lede strong { color: ${INK}; font-weight: 700; }
  .mk-aside {
    margin: 28px 0 0;
    font-size: 15px; line-height: 1.6;
    color: rgba(10,10,10,0.5);
    max-width: 46ch;
    border-left: 2px solid rgba(236,23,143,0.35);
    padding-left: 16px;
  }

  /* ─── 1 · hero ─── */
  .mk-hero {
    min-height: 100dvh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center;
    padding: 100px clamp(22px, 6vw, 48px) 60px;
    gap: 22px;
  }
  .mk-hero-eyes {
    height: clamp(90px, 16vmin, 150px);
    width: auto; display: block; margin-bottom: 4px;
  }
  .mk-hero-eyes svg { width: 100%; height: 100%; display: block; }
  .mk-hero-h {
    margin: 0;
    font-size: clamp(38px, 7.4vw, 78px);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1.02;
    max-width: 16ch;
  }
  .mk-hero-sub {
    margin: 0;
    font-size: clamp(17px, 2.4vw, 21px);
    line-height: 1.55;
    color: rgba(10,10,10,0.66);
    max-width: 52ch;
  }
  .mk-hero-cta { margin-top: 8px; }

  .mk-cta {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 15px 30px; border-radius: 999px; border: 0;
    background: ${PINK}; color: #fff;
    font: inherit; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    box-shadow: 0 10px 30px -8px rgba(236,23,143,0.5);
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s;
  }
  .mk-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 40px -10px rgba(236,23,143,0.6); }
  .mk-cta:active { transform: translateY(0); }
  .mk-cta svg { transition: transform 0.2s; }
  .mk-cta:hover svg { transform: translateX(3px); }

  .mk-scrollcue {
    margin-top: 36px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(10,10,10,0.34);
  }
  .mk-scrollcue-line {
    width: 1px; height: 40px;
    background: linear-gradient(180deg, rgba(10,10,10,0.3), transparent);
    animation: cue 2s ease-in-out infinite;
  }
  @keyframes cue {
    0%, 100% { opacity: 0.3; transform: scaleY(0.6); transform-origin: top; }
    50% { opacity: 1; transform: scaleY(1); transform-origin: top; }
  }

  /* ════════ SCENES (animated platform mocks) ════════ */
  /* NOTE: do NOT put content-visibility here. The scenes' reveal animations are
     one-shot with forwards fill; content-visibility pauses them mid-play near
     the viewport edge, freezing un-finished elements at opacity:0. They're
     already gated to run only on scroll-in (.mk-in via IntersectionObserver),
     so there's no off-screen cost to recover. */
  .mk-scene {
    margin: 40px 0 4px;
    position: relative;
  }
  .mk-creed {
    margin: 36px 0 0;
    font-size: clamp(24px, 4vw, 38px);
    font-weight: 800; letter-spacing: -0.03em;
  }

  /* cross-channel identity chip */
  .mk-chchip {
    flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 7px;
    font-size: 10.5px; font-weight: 800; letter-spacing: -0.01em;
  }

  /* ─── 2 · deep person profile ─── */
  .mk-profile {
    max-width: 560px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(10,10,10,0.45);
  }
  .mk-profile > div { opacity: 0; transform: translateY(10px); }
  /* .mk-in is on the SAME element as .mk-profile — must be a compound selector
     (.mk-in.mk-profile), not a descendant (.mk-in .mk-profile). */
  .mk-profile.mk-in > div { animation: mk-msgin 0.5s ease forwards; animation-delay: calc(var(--i) * 0.12s + 0.12s); }
  .mk-pf-top {
    display: flex; align-items: center; gap: 14px;
    padding: 18px 20px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-pf-av {
    flex: 0 0 auto; width: 52px; height: 52px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 17px; font-weight: 800;
  }
  .mk-pf-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .mk-pf-name { display: flex; align-items: center; gap: 9px; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-pf-badge {
    font-size: 10px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.1); padding: 3px 9px; border-radius: 999px;
  }
  .mk-pf-handle { font-size: 13px; color: rgba(10,10,10,0.5); }
  .mk-pf-chips { display: inline-flex; gap: 5px; flex: 0 0 auto; }
  .mk-pf-facts {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: rgba(10,10,10,0.07);
    border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-pf-fact {
    background: #fff; padding: 13px 18px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .mk-pf-fact span { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(10,10,10,0.4); font-weight: 600; }
  .mk-pf-fact strong { font-size: 14px; font-weight: 700; color: ${INK}; }
  .mk-pf-tags { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 18px 4px; }
  .mk-pf-tags span {
    font-size: 12.5px; font-weight: 600; color: rgba(10,10,10,0.7);
    background: rgba(10,10,10,0.05); padding: 6px 12px; border-radius: 999px;
  }
  .mk-pf-note {
    margin: 14px 18px 18px; padding: 14px 16px;
    border-radius: 14px; background: rgba(13,148,136,0.06); border: 1px solid rgba(13,148,136,0.2);
    font-size: 14px; line-height: 1.5; color: rgba(10,10,10,0.78);
  }
  .mk-pf-note-tag {
    display: block; margin-bottom: 6px;
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    color: #0d9488; font-weight: 800;
  }
  @media (max-width: 480px) { .mk-pf-facts { grid-template-columns: 1fr; } }

  /* ─── 3 · one chat (channels in → thread → ways out) ─── */
  .mk-chat { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .mk-chat-sources {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12.5px; font-weight: 600; color: rgba(10,10,10,0.5);
    opacity: 0;
  }
  .mk-in .mk-chat-sources { animation: mk-fade 0.5s ease 0.1s forwards; }
  .mk-chat-sources-label { margin-left: 4px; }
  .mk-chat .mk-thread { width: 100%; }

  /* ─── 2 · inside the room (exclusive drops) ─── */
  .mk-drop {
    max-width: 620px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(236,23,143,0.4);
  }
  .mk-drop-head {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 16px 18px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-drop-title { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-drop-lock {
    font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.1);
    padding: 5px 11px; border-radius: 999px;
  }
  .mk-drop-members {
    display: flex; align-items: center; gap: 13px;
    padding: 13px 18px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-mem-avs { display: inline-flex; flex: 0 0 auto; }
  .mk-mem-av {
    width: 32px; height: 32px; border-radius: 999px; border: 2px solid #fff;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 11px; font-weight: 800; margin-left: -10px;
    opacity: 0; transform: scale(0.5);
  }
  .mk-mem-av:first-child { margin-left: 0; }
  .mk-in .mk-mem-av { animation: mk-avpop 0.42s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(var(--i) * 0.07s + 0.1s); }
  @keyframes mk-avpop { to { opacity: 1; transform: scale(1); } }
  .mk-mem-more { background: rgba(10,10,10,0.55) !important; font-size: 10px; letter-spacing: -0.02em; }
  .mk-mem-text { font-size: 13px; line-height: 1.35; color: rgba(10,10,10,0.6); }
  .mk-mem-text strong { color: ${INK}; font-weight: 800; }
  .mk-drop-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    padding: 16px;
  }
  @media (max-width: 480px) { .mk-drop-grid { grid-template-columns: 1fr; } }
  .mk-tile {
    display: flex; flex-direction: column; gap: 9px;
    opacity: 0; transform: translateY(10px) scale(0.97);
  }
  .mk-in .mk-tile { animation: mk-tilein 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(var(--i) * 0.12s + 0.15s); }
  @keyframes mk-tilein { to { opacity: 1; transform: none; } }
  .mk-tile-label { font-size: 12.5px; font-weight: 600; color: rgba(10,10,10,0.6); }
  .mk-tile-music, .mk-tile-photos, .mk-tile-drop, .mk-tile-invite {
    height: 96px; border-radius: 14px; overflow: hidden;
    display: flex; align-items: center; justify-content: center; position: relative;
  }
  /* music */
  .mk-tile-music { background: #0d0d0f; gap: 12px; }
  .mk-tile-play {
    width: 0; height: 0; flex: 0 0 auto;
    border-left: 14px solid #fff; border-top: 9px solid transparent; border-bottom: 9px solid transparent;
    margin-left: 4px;
  }
  /* equalizer: scaleY (compositor-only) instead of animating height */
  .mk-wave { display: inline-flex; align-items: flex-end; gap: 3px; height: 40px; }
  .mk-wave span {
    width: 3px; border-radius: 2px; height: 100%;
    background: linear-gradient(180deg, #ff8a4c, ${PINK});
    transform: scaleY(0.3); transform-origin: bottom;
  }
  .mk-in .mk-wave span { animation: mk-eq 1.1s ease-in-out infinite; animation-delay: calc(var(--b) * -0.09s); }
  @keyframes mk-eq { 0%,100% { transform: scaleY(0.22); } 50% { transform: scaleY(0.92); } }
  /* photos */
  .mk-tile-photos { background: rgba(10,10,10,0.04); }
  .mk-tile-photos span {
    position: absolute; width: 46px; height: 58px; border-radius: 8px;
    box-shadow: 0 6px 16px -6px rgba(10,10,10,0.45); border: 2px solid #fff;
  }
  .mk-tile-photos span:nth-child(1) { transform: rotate(-9deg) translateX(-26px); }
  .mk-tile-photos span:nth-child(2) { transform: rotate(0deg) translateY(-3px); z-index: 2; }
  .mk-tile-photos span:nth-child(3) { transform: rotate(9deg) translateX(26px); }
  /* product drop */
  .mk-tile-drop { background: rgba(10,10,10,0.04); flex-direction: column; gap: 8px; }
  .mk-tile-swatch {
    width: 44px; height: 44px; border-radius: 10px;
    background: linear-gradient(150deg, #fbbf24, #f97316 60%, #b91c1c);
    box-shadow: 0 8px 18px -8px rgba(185,28,28,0.6);
  }
  .mk-tile-pill {
    font-size: 10.5px; font-weight: 800; color: #fff; background: ${PINK};
    padding: 4px 10px; border-radius: 999px;
  }
  /* invite */
  .mk-tile-invite { background: linear-gradient(150deg, rgba(236,23,143,0.14), rgba(123,47,247,0.12)); flex-direction: column; gap: 2px; }
  .mk-tile-invite-eyes { font-size: 22px; font-weight: 900; letter-spacing: -0.03em; color: ${INK}; }
  .mk-tile-invite-note { font-size: 12px; font-weight: 700; color: ${PINK}; }

  /* ─── 3 · thread + draft ─── */
  .mk-thread {
    max-width: 560px;
    border-radius: 22px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 36px 80px -44px rgba(10,10,10,0.5);
  }
  .mk-thread-head {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 18px; border-bottom: 1px solid rgba(10,10,10,0.07);
  }
  .mk-thread-av {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 14px; font-weight: 800;
  }
  .mk-thread-who { display: flex; flex-direction: column; min-width: 0; }
  .mk-thread-name { font-size: 15px; font-weight: 800; }
  .mk-thread-sub { font-size: 12px; color: rgba(10,10,10,0.5); }
  .mk-window {
    margin-left: auto; flex: 0 0 auto;
    font-size: 11px; font-weight: 700; color: #0a7d54;
    background: #e7f9ee; border: 1px solid rgba(37,211,102,0.3);
    padding: 5px 10px; border-radius: 999px;
  }
  @media (max-width: 480px) { .mk-window { font-size: 10px; padding: 4px 8px; } }
  .mk-thread-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .mk-msg { display: flex; align-items: flex-end; gap: 8px; max-width: 86%; opacity: 0; transform: translateY(8px); }
  .mk-in .mk-msg { animation: mk-msgin 0.45s ease forwards; animation-delay: calc(var(--i) * 0.5s + 0.2s); }
  @keyframes mk-msgin { to { opacity: 1; transform: translateY(0); } }
  .mk-msg-you { align-self: flex-end; flex-direction: row-reverse; }
  .mk-msg-bub {
    padding: 10px 14px; border-radius: 16px;
    font-size: 14px; line-height: 1.4;
    background: rgba(10,10,10,0.05); color: ${INK};
  }
  .mk-msg-you .mk-msg-bub { background: ${PINK}; color: #fff; border-bottom-right-radius: 5px; }
  .mk-msg-them .mk-msg-bub, .mk-msg-sys .mk-msg-bub { border-bottom-left-radius: 5px; }
  .mk-msg-sys .mk-msg-bub {
    background: transparent; border: 1px dashed rgba(10,10,10,0.2);
    color: rgba(10,10,10,0.55); font-size: 13px;
  }
  /* composer + ways out (reply via IG / WhatsApp / email) */
  .mk-composer {
    border-top: 1px solid rgba(10,10,10,0.07);
    padding: 16px 18px;
    opacity: 0; transform: translateY(10px);
  }
  .mk-in .mk-composer { animation: mk-msgin 0.5s ease 2.4s forwards; }
  .mk-composer-draft {
    padding: 13px 15px; margin-bottom: 13px;
    border-radius: 13px;
    background: linear-gradient(180deg, rgba(236,23,143,0.06), rgba(236,23,143,0.02));
    border: 1px solid rgba(236,23,143,0.22);
    font-size: 14px; line-height: 1.5; font-style: italic; color: rgba(10,10,10,0.8);
  }
  .mk-ways { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mk-ways-label { font-size: 12px; font-weight: 600; color: rgba(10,10,10,0.45); }
  .mk-way {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px 6px 7px; border-radius: 999px;
    border: 1px solid rgba(10,10,10,0.14);
    font-size: 12.5px; font-weight: 700; color: rgba(10,10,10,0.55);
  }
  .mk-way .mk-chchip { width: 18px; height: 18px; font-size: 9px; border-radius: 6px; }
  .mk-way-on { border-color: rgba(37,211,102,0.5); background: #e7f9ee; color: #0a7d54; }
  .mk-way-send {
    margin-left: auto; padding: 9px 20px; border-radius: 999px;
    background: ${PINK}; color: #fff; font-size: 13px; font-weight: 700;
  }
  @media (max-width: 460px) { .mk-way-send { margin-left: 0; } }

  /* ─── 5 · inbound (comment → DM → WhatsApp) ─── */
  .mk-inbound { display: flex; flex-direction: column; align-items: center; gap: 9px; max-width: 420px; margin-left: auto; margin-right: auto; }
  .mk-in-comment, .mk-in-dm, .mk-in-wa {
    display: flex; align-items: center; gap: 9px;
    padding: 11px 15px; border-radius: 15px; font-size: 14px;
    background: #fff; border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 8px 22px -14px rgba(10,10,10,0.3);
    opacity: 0;
  }
  .mk-in-comment { align-self: flex-start; transform: translateX(-12px); }
  .mk-in .mk-in-comment { animation: mk-slidein 0.45s ease 0.2s forwards; }
  .mk-in-dm { align-self: flex-end; transform: translateX(12px); border-color: rgba(214,36,159,0.3); }
  .mk-in .mk-in-dm { animation: mk-in-r 0.45s ease 1.1s forwards; }
  @keyframes mk-in-r { to { opacity: 1; transform: translateX(0); } }
  @keyframes mk-slidein { to { opacity: 1; transform: translateX(0); } }
  .mk-in-pill { background: #d6249f; color: #fff; font-size: 11px; font-weight: 800; padding: 5px 11px; border-radius: 999px; }
  .mk-in-wa { align-self: flex-start; transform: translateX(-12px); background: #e7f9ee; border-color: rgba(37,211,102,0.3); color: #0a5c3d; font-weight: 600; }
  .mk-in .mk-in-wa { animation: mk-slidein 0.45s ease 2s forwards; }
  .mk-in-arrow { font-size: 11.5px; font-weight: 700; color: rgba(10,10,10,0.4); opacity: 0; }
  .mk-in .mk-in-arrow { animation: mk-fade 0.4s ease 0.8s forwards; }
  .mk-in .mk-in-arrow-2 { animation-delay: 1.7s; }
  @keyframes mk-fade { to { opacity: 1; } }

  /* ─── 6 · mcp terminal ─── */
  .mk-mcp { display: flex; flex-direction: column; gap: 12px; max-width: 460px; width: 100%; }
  .mk-mcp-prompt {
    display: flex; align-items: center; gap: 9px; overflow: hidden;
    background: #fff; border: 1px solid rgba(10,10,10,0.12);
    border-radius: 13px; padding: 13px 15px;
    font-size: 14px; color: ${INK}; box-shadow: 0 4px 14px -8px rgba(10,10,10,0.25);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (max-width: 420px) { .mk-mcp-prompt { font-size: 12px; padding: 11px 13px; gap: 7px; } }
  .mk-mcp-pdot { width: 8px; height: 8px; border-radius: 999px; background: ${PINK}; flex: 0 0 auto; }
  .mk-mcp-typed { white-space: nowrap; overflow: hidden; display: inline-block; max-width: 0; }
  .mk-in .mk-mcp-typed { animation: mk-type 1.6s steps(40) 0.3s forwards; }
  @keyframes mk-type { to { max-width: 360px; } }
  .mk-mcp-caret { width: 2px; height: 16px; background: ${INK}; animation: mk-blink 1s step-end infinite; }
  .mk-mcp-card {
    display: flex; align-items: center; gap: 12px;
    background: #fff; border: 1px solid rgba(10,10,10,0.12);
    border-radius: 14px; padding: 13px; box-shadow: 0 12px 30px -18px rgba(10,10,10,0.4);
    opacity: 0; transform: translateY(10px); position: relative;
  }
  .mk-in .mk-mcp-card { animation: mk-msgin 0.5s ease 2.1s forwards; }
  .mk-mcp-cover { width: 50px; height: 50px; border-radius: 10px; flex: 0 0 auto; background: linear-gradient(150deg, #ff8a4c, #ec178f 62%, #7b2ff7); }
  .mk-mcp-meta { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .mk-mcp-l1 { height: 9px; width: 72%; border-radius: 4px; background: rgba(10,10,10,0.16); }
  .mk-mcp-l2 { height: 8px; width: 42%; border-radius: 4px; background: rgba(10,10,10,0.1); }
  .mk-mcp-check { font-size: 12px; font-weight: 800; color: #16a34a; flex: 0 0 auto; }
  .mk-mcp-foot { text-align: center; font-size: 12px; font-weight: 600; color: rgba(10,10,10,0.4); }
  @keyframes mk-blink { 50% { opacity: 0; } }

  @media (prefers-reduced-motion: reduce) {
    .mk-scene *,
    .mk-scene .mk-mcp-typed {
      opacity: 1 !important; transform: none !important;
      max-width: none !important; height: auto !important; animation: none !important;
    }
    .mk-mcp-l1 { height: 9px !important; }
    .mk-mcp-l2 { height: 8px !important; }
  }

  /* ─── 7 · proof ─── */
  .mk-section-proof { padding-bottom: 8px; text-align: center; }
  .mk-proof-label {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }

  /* ─── 8 · final ─── */
  .mk-final {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 22px;
    padding: clamp(80px, 16vh, 180px) clamp(22px, 6vw, 48px) clamp(60px, 10vh, 110px);
  }
  .mk-final-eyes { height: clamp(80px, 14vmin, 130px); width: auto; display: block; }
  .mk-final-eyes svg { width: 100%; height: 100%; display: block; }
  .mk-final-h {
    margin: 0;
    font-size: clamp(34px, 6.4vw, 66px);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1.04;
  }
  .mk-final-sub {
    margin: 0; font-size: clamp(16px, 2.3vw, 20px); line-height: 1.55;
    color: rgba(10,10,10,0.6); max-width: 46ch;
  }
  .mk-final-cta { margin-top: 8px; }

  /* ─── manifesto (the why, the shared future) ─── */
  .mk-manifesto {
    margin: clamp(40px, 8vh, 80px) auto 0; max-width: 60ch;
    padding-top: clamp(32px, 6vh, 56px);
    border-top: 1px solid rgba(10,10,10,0.08);
  }
  .mk-manifesto-eyebrow {
    margin: 0 0 16px;
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }
  .mk-manifesto-body {
    margin: 0;
    font-size: clamp(17px, 2.2vw, 22px); line-height: 1.6; letter-spacing: -0.01em;
    color: rgba(10,10,10,0.72);
  }
  .mk-manifesto-sign {
    margin: 18px 0 0;
    font-size: 14px; font-weight: 700; color: ${INK};
  }
  .mk-manifesto-sign a {
    color: ${PINK}; text-decoration: none;
    border-bottom: 1px solid rgba(236,23,143,0.3);
    transition: border-color 0.2s ease;
  }
  .mk-manifesto-sign a:hover { border-bottom-color: ${PINK}; }

  /* ─── trust chips (slim reassurance band under the CTA) ─── */
  .mk-trust-row {
    margin: clamp(32px, 6vh, 56px) auto 0; max-width: 720px;
    display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
  }
  .mk-trust-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 16px; border-radius: 999px;
    border: 1px solid rgba(10,10,10,0.12); background: #fff;
    font-size: 13px; font-weight: 700; letter-spacing: -0.01em; color: ${INK};
  }
  .mk-trust-ic { color: ${PINK}; flex: 0 0 auto; }

  /* ─── footer ─── */
  .mk-footer {
    padding: 30px 16px calc(30px + env(safe-area-inset-bottom));
    display: flex; align-items: center; justify-content: center;
    gap: clamp(10px, 3vw, 20px); flex-wrap: wrap;
    font-size: 11px; color: rgba(10,10,10,0.55);
    border-top: 1px solid rgba(10,10,10,0.06);
  }
  .mk-footer a { color: inherit; text-decoration: none; }
  .mk-footer a:hover { color: ${INK}; }
  .mk-footer-dot { opacity: 0.4; }

  /* ════════ TRUST MARQUEE ════════ */
  @keyframes logo-marquee {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  .logo-marquee {
    position: relative; width: 100%; overflow: hidden;
    background: transparent; line-height: 0;
    padding: 26px 0;
    /* pause the infinite scroll + skip paint while the strip is off-screen */
    content-visibility: auto;
    contain-intrinsic-size: auto 70px;
  }
  .logo-marquee-track {
    display: flex; flex-direction: row; align-items: center;
    width: max-content;
    animation: logo-marquee 40s linear infinite;
    will-change: transform; backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
  }
  .logo-marquee-group {
    display: flex; flex-direction: row; align-items: center; justify-content: space-around;
    flex: none; min-width: 100dvw; gap: 48px; padding: 0 24px;
  }
  @media (min-width: 768px) {
    .logo-marquee-group { gap: 64px; padding: 0 32px; }
  }
  .logo-marquee-item {
    flex: none; display: flex; align-items: center; justify-content: center;
    opacity: 0.5; transition: opacity 0.2s;
  }
  .logo-marquee-item:hover { opacity: 0.85; }
  .logo-marquee-item img { width: auto; display: block; filter: brightness(0); }


  /* ════════ SHOWCASE WALL ════════ */
  @keyframes mk-show-scroll {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  .mk-show {
    padding: clamp(36px, 7vh, 80px) 0 clamp(40px, 7vh, 84px);
  }
  /* the CTA above the wall gives up some of its tail so "get started" and the
     rooms you'd make read as one breath; the coda leans on the wall as its
     divider, so it drops the manifesto hairline + heavy top gap. */
  .mk-final--pre { padding-bottom: clamp(32px, 5vh, 56px); }
  .mk-coda { padding-top: clamp(8px, 3vh, 28px); }
  .mk-coda .mk-manifesto { margin-top: 0; padding-top: 0; border-top: none; }
  .mk-show-head {
    max-width: 880px; margin: 0 auto;
    padding: 0 clamp(22px, 6vw, 48px);
  }
  .mk-show-wall {
    position: relative; width: 100%; overflow: hidden;
    margin-top: clamp(28px, 5vw, 44px);
    padding: 14px 0 30px;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
    /* skip paint + pause the drift while the wall is off-screen */
    content-visibility: auto;
    contain-intrinsic-size: auto 340px;
  }
  .mk-show-track {
    display: flex; width: max-content;
    animation: mk-show-scroll 60s linear infinite;
    will-change: transform; backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
  }
  .mk-show-wall:hover .mk-show-track { animation-play-state: paused; }
  .mk-show-group { display: flex; flex: none; gap: 18px; padding: 0 9px; }
  .mk-show-card {
    position: relative; flex: none;
    width: clamp(176px, 44vw, 214px);
    height: clamp(244px, 60vw, 298px);
    border-radius: 20px; overflow: hidden;
    background: #0b0b10;
    box-shadow: 0 10px 30px rgba(10,10,10,0.16);
    text-decoration: none; color: #fff;
    transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease;
    cursor: url('/cursor-finger.png') 11 2, pointer;
  }
  .mk-show-group .mk-show-card:nth-child(even) { transform: translateY(16px); }
  .mk-show-card:hover {
    transform: translateY(-6px) scale(1.015);
    box-shadow: 0 20px 46px rgba(236,23,143,0.24);
  }
  .mk-show-group .mk-show-card:nth-child(even):hover {
    transform: translateY(8px) scale(1.015);
  }
  .mk-show-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .mk-show-ai-fallback { position: absolute; inset: 0; }
  .mk-show-card::after {
    content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.12) 44%, rgba(0,0,0,0) 66%);
  }
  .mk-show-meta { position: absolute; left: 14px; right: 14px; bottom: 13px; z-index: 2; text-align: left; }
  .mk-show-title { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.25; letter-spacing: -0.01em; }
  .mk-show-sub { margin: 3px 0 0; font-size: 11px; color: rgba(255,255,255,0.72); font-weight: 500; }
  .mk-show-card-ai .mk-show-meta { text-shadow: 0 1px 14px rgba(0,0,0,0.55); }
  .mk-show-aitag {
    position: absolute; top: 11px; left: 11px; z-index: 2;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 9px; border-radius: 999px;
    font-size: 10.5px; font-weight: 650; letter-spacing: 0.01em;
    color: #fff; background: rgba(236,23,143,0.92);
    box-shadow: 0 2px 12px rgba(236,23,143,0.42);
  }

  @media (prefers-reduced-motion: reduce) {
    .mk-scrollcue-line, .logo-marquee-track, .mk-show-track { animation: none; }
  }
`;
