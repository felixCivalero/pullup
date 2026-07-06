import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowRight, Lock, Download, Database, KeyRound, LogOut } from "lucide-react";
import { AuthGate, resolveNext } from "../components/auth/AuthGate.jsx";
import { supabase } from "../lib/supabase.js";
import { resolveStoredSession } from "../lib/validateStoredSession.mjs";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView, track } from "../lib/track.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
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

// The hero poster wall — a curated, hand-picked set of real rooms already
// live on PullUp. These cover the hero as slow-drifting poster columns:
// the first thing a visitor sees is what real nights on PullUp look like.
// `video` tiles play the event's actual clip (muted, looping) with the
// cover as poster — kept to the two lightest files so the hero stays fast.
const SHOWCASE = [
  // index 1 = first card of the CENTER column — the most visible slot at
  // load. TWIN FREAKS sits there so the real video is the hero's centerpiece.
  { slug: "divine-earth-live-4hy5", title: "Divine Earth — Spiritual Jazz", meta: "Soho House · Sthlm", cover: "052e22f6-d7fe-4772-8f95-55b826434000/media_0_1779391795495.webp" },
  { slug: "twin-freaks-listening-release", title: "TWIN FREAKS — listening release", meta: "Slakthusområdet · Sthlm", cover: "83e543b6-4a95-4277-8e42-bb4e579f9127/thumb_0_1780266730534.jpg", video: "83e543b6-4a95-4277-8e42-bb4e579f9127/media_0_1780266724727.mp4" },
  { slug: "aperidisco-bbtr", title: "Aperidisco", meta: "Brunkebergstorg · Sthlm", cover: "07324036-a348-4940-98d9-43f2f8821eda/media_0_1778621428603.png" },
  { slug: "techo-cocktails", title: "Jägermeister × ADAMO", meta: "Göteborg", cover: "035d3cad-dd9e-4f66-a3e1-3baf9422b40d/media_0_1778075065925.png" },
  { slug: "cocktails-and-caviar-asrf", title: "Cocktails and Caviar", meta: "Sjövikskajen · Sthlm", cover: "b8cf87c8-6483-4da3-93e3-63b4689e1ff7/media_0_1777968238709.jpeg" },
  { slug: "hallon-spritz-lanseringsfest", title: "Hallon Spritz", meta: "Lanseringsfest · Sthlm", cover: "aed620cc-c066-4fc7-bee3-da1e3a42b2ce/media_0_1774871301051.png" },
  { slug: "henning-ulln-house-jazz-294-soho-house", title: "Henning Ullén pianotrio", meta: "Soho House · Sthlm", cover: "e4d1dbae-bf83-4fa2-82bc-641251a2b083/media_0_1776700815357.jpeg" },
  { slug: "peep-take-over-8e7y", title: "P.E.E.P Take over", meta: "Birger Jarlsgatan · Sthlm", cover: "955c371e-bba6-44c9-87f1-bb96edbc1792/media_0_1778243555025.jpeg" },
  { slug: "utbildning-bstad-g6hy", title: "Jägermeister Båstad", meta: "Skansenbadet · Båstad", cover: "bccc176a-e8dd-4d13-8f70-97c097e809a0/media_0_1779793614037.webp" },
];

// The ownership promises — folded into the host movement as the anchor
// feature row. One line each; the row copy carries the narrative.
const OWNERSHIP = [
  { icon: Database, title: "You own the database", body: "Every name, number and message sits in your own cloud, in your name." },
  { icon: KeyRound, title: "You hold every permission", body: "PullUp gets one scoped key to do its job — you see exactly what it touches." },
  { icon: Download, title: "Export anytime", body: "Your whole room, out in one piece, whenever you want it." },
  { icon: LogOut, title: "Leave whenever", body: "Revoke the key and everything is still there — still yours." },
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

/* ════════ HERO POSTER FIELD ════════
   The hero is covered in real event pages — slow-drifting, slightly tilted
   poster columns built from the SHOWCASE covers. Pure decoration (links live
   in the story below): aria-hidden, pointer-events none, veiled in white so
   the copy floats on top. */
function HeroPosterField() {
  // 3 columns, round-robin; each column renders its stack twice and
  // translates -50% for a seamless vertical loop (same trick as the marquee).
  const cols = [0, 1, 2].map((c) => SHOWCASE.filter((_, i) => i % 3 === c));
  return (
    <div className="mk-hf" aria-hidden="true">
      <div className="mk-hf-tilt">
        {cols.map((items, c) => (
          <div className={`mk-hf-col mk-hf-col-${c}`} key={c}>
            {[0, 1].map((copy) => (
              <div className="mk-hf-stack" key={copy}>
                {items.map((item, i) => (
                  <div className="mk-hf-card" key={`${copy}-${i}`}>
                    {item.video ? (
                      // real clip from the event — only in the primary copy;
                      // the duplicate (loop filler) shows the poster frame so
                      // we don't decode every video twice
                      copy === 0 ? (
                        <video
                          src={STORAGE_BASE + item.video}
                          poster={item.cover ? transformedImageUrl(STORAGE_BASE + item.cover, { width: 360 }) : undefined}
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      ) : item.cover ? (
                        <img
                          src={transformedImageUrl(STORAGE_BASE + item.cover, { width: 360 })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <video
                          src={STORAGE_BASE + item.video}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )
                    ) : (
                      <img
                        src={transformedImageUrl(STORAGE_BASE + item.cover, { width: 360 })}
                        alt=""
                        loading={copy === 0 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    )}
                    <div className="mk-hf-meta">
                      <p>{item.title}</p>
                      <span>{item.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mk-hf-veil" />
    </div>
  );
}

/* ════════ THE JOURNEY — one phone, four beats, forever ════════
   Their feed → your immersive page → the door closing on RSVP → the private
   room. Sits right under the hero as its own section: the phone loops while
   a step rail alongside tells the same story in four short lines, lighting
   up in sync. Built in animated CSS — no video, no WebGL. Phases are stacked
   layers; the active one gets `.is-on`, which fades it in and (re)starts its
   inner keyframe choreography each cycle. */

const STORY_STEPS = [
  { t: "Share your event on Instagram", b: "Drop the link in your story — or let PullUp auto-DM it to anyone who comments." },
  { t: "Followers land on your event page", b: "A full page in your brand — video, story, tickets. Not a gray ticket form." },
  { t: "They RSVP — then they pull up", b: "The night happens in real life. Showing up is the key: it's what unlocks the room." },
  { t: "The room lives on after the night", b: "A closed room for the people who actually pulled up. Chat with them, share photos and unreleased content, sell products." },
];

const JOURNEY_MS = 4400;

function JourneySection() {
  const [phase, setPhase] = useState(0);
  const [running, setRunning] = useState(true);
  const rootRef = useRef(null);

  // Respect reduced motion: no cycling, first beat rendered static (the
  // global reduced-motion CSS forces every journey element visible).
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // The loop only spins while the section is actually on screen — no phase
  // churn (or React re-renders) while the visitor reads the rest of the page.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !running) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % STORY_STEPS.length), JOURNEY_MS);
    return () => clearInterval(t);
  }, [reduced, running]);

  const on = (i) => `mk-jr-ph ${phase === i ? "is-on" : ""}`;

  return (
    <section className="mk-story" data-mk-section="story" data-mk-order="3" ref={rootRef}>
      <div className="mk-story-head">
        <Reveal><p className="mk-part-tag">The journey</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="mk-h2" style={{ marginBottom: 0 }}>
            Online connections become{" "}
            <span className="pink">real-life relationships.</span>
          </h2>
        </Reveal>
      </div>
      <div className="mk-story-grid">
        <ol className="mk-story-steps">
          {STORY_STEPS.map((s, i) => (
            <li key={s.t} className={phase === i ? "on" : ""}>
              <button type="button" onClick={() => setPhase(i)}>
                <span className="mk-story-dot" />
                <span className="mk-story-txt">
                  <span className="mk-story-t">{s.t}</span>
                  <span className="mk-story-b">{s.b}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mk-jr" aria-label="How PullUp works, animated">
          <div className="mk-jr-phone">
        <div className="mk-jr-screen">

          {/* 0 · THEIR FEED — the IG post + the comment that starts it all */}
          <div className={`${on(0)} mk-jr-ph-feed`}>
            <div className="mk-jr-ig-head">
              <span className="mk-jr-ig-av" />
              <span className="mk-jr-ig-name">@yourbrand</span>
            </div>
            <div className="mk-jr-ig-media">
              <span>Rooftop Sessions · Vol. 4</span>
            </div>
            <div className="mk-jr-ig-actions">♥ 482&nbsp;&nbsp;💬 56&nbsp;&nbsp;↗</div>
            <div className="mk-jr-ig-comment">
              <ChannelChip ch="instagram" />
              how do I get in?? 🙏
            </div>
            <div className="mk-jr-ig-reply">here's your link →</div>
          </div>

          {/* 1 · YOUR WORLD — the content-heavy event page, scrolling itself */}
          <div className={`${on(1)} mk-jr-ph-page`}>
            <div className="mk-jr-ev-scroll">
              <div className="mk-jr-ev-cover">
                <span className="mk-jr-ev-title">Rooftop Sessions</span>
                <span className="mk-jr-ev-sub">Vol. 4 · Saturday 6 PM</span>
              </div>
              <span className="mk-jr-ev-bar" style={{ width: "88%" }} />
              <span className="mk-jr-ev-bar" style={{ width: "72%" }} />
              <div className="mk-jr-ev-video">
                <span className="mk-jr-ev-play" />
              </div>
              <span className="mk-jr-ev-bar" style={{ width: "80%" }} />
              <span className="mk-jr-ev-bar" style={{ width: "64%" }} />
              <div className="mk-jr-ev-gallery">
                <span style={{ background: "linear-gradient(135deg,#ff8a4c,#ec178f)" }} />
                <span style={{ background: "linear-gradient(135deg,#7b2ff7,#0d9488)" }} />
                <span style={{ background: "linear-gradient(135deg,#fbbf24,#dc2743)" }} />
              </div>
              <span className="mk-jr-ev-bar" style={{ width: "76%" }} />
              <span className="mk-jr-ev-bar" style={{ width: "58%" }} />
            </div>
            <div className="mk-jr-ev-fade" />
            <div className="mk-jr-ev-cta">Pull up →</div>
            <span className="mk-jr-tap" />
          </div>

          {/* 2 · THE DOOR — you're in, and it closes behind you */}
          <div className={`${on(2)} mk-jr-ph-door`}>
            <div className="mk-jr-confirm">
              <span className="mk-jr-confirm-check">✓</span>
              <span className="mk-jr-confirm-t">You're in</span>
              <span className="mk-jr-confirm-s">Rooftop Sessions · Vol. 4</span>
            </div>
            <span className="mk-jr-door-l" />
            <span className="mk-jr-door-r" />
            <div className="mk-jr-lock">
              <Lock size={22} strokeWidth={2.4} />
              <span className="mk-jr-lock-t">Private room</span>
              <span className="mk-jr-lock-s">for people who pulled up</span>
            </div>
          </div>

          {/* 3 · THE ROOM — the community behind the closed door */}
          <div className={`${on(3)} mk-jr-ph-room`}>
            <div className="mk-jr-rm-head" style={{ "--i": 0 }}>
              <span className="mk-jr-rm-t">The Room</span>
              <span className="mk-jr-rm-pill">inside</span>
            </div>
            <div className="mk-jr-rm-people" style={{ "--i": 1 }}>
              <span className="mk-jr-avs">
                {["#ec4899", "#8b5cf6", "#d97706", "#16a34a"].map((c, i) => (
                  <span key={c} className="mk-jr-av" style={{ background: c, "--i": i + 1 }} />
                ))}
                <span className="mk-jr-av mk-jr-av-more" style={{ "--i": 5 }}>+244</span>
              </span>
              <span className="mk-jr-rm-count">248 people in here</span>
            </div>
            <div className="mk-jr-rm-grid">
              <div className="mk-jr-rm-tile" style={{ "--i": 2 }}>
                <div className="mk-jr-rm-photos">
                  <span style={{ background: "linear-gradient(135deg,#ff8a4c,#ec178f)" }} />
                  <span style={{ background: "linear-gradient(135deg,#7b2ff7,#0d9488)" }} />
                </div>
                <span className="mk-jr-rm-label">last night · 48 photos</span>
              </div>
              <div className="mk-jr-rm-tile" style={{ "--i": 3 }}>
                <div className="mk-jr-rm-drop">
                  <span className="mk-jr-rm-swatch" />
                  <span className="mk-jr-rm-price">room only</span>
                </div>
                <span className="mk-jr-rm-label">early drop</span>
              </div>
            </div>
            <div className="mk-jr-rm-msg" style={{ "--i": 4 }}>
              Vol. 5 — you're first 🖤
            </div>
          </div>

          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

// FEATURE ROW · one inbox — a trimmed thread: three channels landing in one
// chat, the draft in your voice, the ways back out.
const MINI_THREAD = [
  { from: "them", ch: "instagram", text: "saw your story — is Vol 4 happening?? 🙌", i: 0 },
  { from: "sys", ch: "email", text: "RSVP'd to Vol. 4 · confirmed, bringing 1", i: 1 },
  { from: "them", ch: "whatsapp", text: "parking nearby or should I take the metro?", i: 2 },
];
function MiniChatScene() {
  return (
    <SceneFrame className="mk-chat mk-chat-mini">
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
          {MINI_THREAD.map((m) => (
            <div className={`mk-msg mk-msg-${m.from}`} key={m.i} style={{ "--i": m.i }}>
              {m.from !== "you" && <ChannelChip ch={m.ch} />}
              <span className="mk-msg-bub">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="mk-composer">
          <div className="mk-composer-draft">
            "Metro's easiest — Ringen, 4 min walk. So glad you're in again 🙂"
          </div>
          <div className="mk-ways">
            <span className="mk-ways-label">Reply via</span>
            <span className="mk-way mk-way-on"><ChannelChip ch="whatsapp" /> WhatsApp</span>
            <span className="mk-way"><ChannelChip ch="instagram" /> Instagram</span>
            <span className="mk-way-send">Send</span>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

// FEATURE ROW · CRM — the trimmed person card: who they are, their arc,
// the note only you'd remember.
function MiniProfileScene() {
  return (
    <SceneFrame className="mk-profile mk-profile-mini">
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
      <div className="mk-pf-note" style={{ "--i": 2 }}>
        <span className="mk-pf-note-tag">Your note</span>
        Always brings her flatmate. Loves the rooftop sets — ask about her thesis.
      </div>
    </SceneFrame>
  );
}

// FEATURE ROW · auto-DM — comment → auto-DM → WhatsApp confirm.
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

// FEATURE ROW · MCP — typed prompt → event created.
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

// FEATURE ROW · ownership — the four promises as a compact grid.
function OwnershipScene() {
  return (
    <SceneFrame className="mk-ownmini">
      <div className="own-grid own-grid--mini">
        {OWNERSHIP.map((o, i) => (
          <div key={o.title} className="own-card" style={{ "--i": i }}>
            <span className="own-card-ic"><o.icon size={17} strokeWidth={2} /></span>
            <span className="own-card-t">{o.title}</span>
            <span className="own-card-b">{o.body}</span>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
}

/* ─── Movement II — the host's machine, as tight feature rows ─── */

const HOST_ROWS = [
  {
    k: "autodm",
    kicker: "Auto-DM",
    title: "A comment becomes a guest at your door.",
    body: "A comment on your reel becomes a DM with your link, then a confirmation on WhatsApp. The funnel runs itself.",
    visual: <InboundScene />,
    span: 3,
    tone: "ig",
  },
  {
    k: "inbox",
    kicker: "One inbox",
    title: "Every channel, one conversation.",
    body: "DMs, WhatsApps and emails — one thread per person. PullUp drafts the reply in your voice; you send.",
    visual: <MiniChatScene />,
    span: 3,
    tone: "wa",
  },
  {
    k: "crm",
    kicker: "A CRM that remembers",
    title: "A memory for every person.",
    body: "Every night, every +1, every note you'd otherwise forget — the whole picture in one glance.",
    visual: <MiniProfileScene />,
    span: 2,
    tone: "teal",
  },
  {
    k: "db",
    kicker: "Your database",
    title: "It all lives in a database you own.",
    body: "PullUp is the software on top; the data underneath is yours. In your cloud, in your name — never ours to keep.",
    visual: <OwnershipScene />,
    creed: <>We run the room. <span className="pink">You hold the keys.</span></>,
    span: 2,
    tone: "ink",
  },
  {
    k: "mcp",
    kicker: "MCP · AI",
    title: "Or run it all from your AI.",
    body: "Claude, ChatGPT, Cursor — spin up an event or draft the follow-ups in a sentence.",
    visual: <McpScene />,
    span: 2,
    tone: "violet",
  },
];

// One bento card: cursor-tilt in 3D, a pink glow that follows the pointer,
// and the live demo inside REPLAYS every time the pointer enters (the key
// bump remounts the SceneFrame, its IntersectionObserver refires, and the
// choreography runs again).
function BentoCard({ row, order, index = 0 }) {
  const cardRef = useRef(null);
  const [replay, setReplay] = useState(0);

  const onMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 4).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 5).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
    el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
  };
  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <Reveal className={`mk-bento-cell mk-bento-span-${row.span}`} y={26} delay={index * 0.07}>
      <div
        ref={cardRef}
        className={`mk-bento-card mk-bento-tone-${row.tone}`}
        data-mk-section={`feature_${row.k}`}
        data-mk-order={order}
        onMouseMove={onMove}
        onMouseEnter={() => setReplay((r) => r + 1)}
        onMouseLeave={onLeave}
      >
        <span className="mk-bento-kicker">{row.kicker}</span>
        <h3 className="mk-bento-t">{row.title}</h3>
        <p className="mk-bento-b">{row.body}</p>
        {row.creed && <p className="mk-bento-creed">{row.creed}</p>}
        <div className="mk-bento-vis" key={replay}>
          {row.visual}
        </div>
        <span className="mk-bento-glow" aria-hidden="true" />
      </div>
    </Reveal>
  );
}

/* ─── The marketing scroll ───
   Two movements. Movement I is the guest's story, told top-down as they live
   it: their feed → your immersive page (with the showcase wall as proof) →
   the door closing → the private room. Movement II flips to the host: the
   machine, as tight feature rows. Brand-soul kept: light canvas, pink accent,
   the eyes, pixel cursor, trust marquee. */
// The landing is one page for everyone — logged in or out. It never reads auth
// state: it always offers "Log in" / "Get started". A returning user either
// taps in (the /login + /start action validates the session and drops them in
// their room) or goes straight to their room URL. Keeping the public page
// auth-agnostic is what makes it stable — no optimistic redirect off a token
// that might be dead.
function MarketingScroll({ onGetStarted, onStartHosting, onLogin }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-depth tracking: the page is a sequence of named beats, and each
  // one fires section_view the first time it enters the viewport. The admin
  // landing view reads these as "how far into the story do people get".
  // Once-per-mount dedup here; the spine counts distinct visitors anyway.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          const section = el.getAttribute("data-mk-section");
          if (!section || seen.has(section)) continue;
          seen.add(section);
          track("section_view", {
            section,
            order: Number(el.getAttribute("data-mk-order")) || 0,
          });
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    document
      .querySelectorAll("[data-mk-section]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const cta = (location, label = "Start hosting") => (
    <button
      type="button"
      className="mk-cta"
      onClick={() => {
        trackEvent("cta_click", { location });
        onGetStarted();
      }}
    >
      {label}
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
          <button
            type="button"
            className="mk-nav-login"
            onClick={() => {
              trackEvent("cta_click", { location: "nav_login" });
              onLogin();
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className="mk-nav-cta"
            onClick={() => {
              trackEvent("cta_click", { location: "nav" });
              onGetStarted();
            }}
          >
            Start hosting
          </button>
        </div>
      </header>

      {/* ─── HERO — covered in real event pages, copy floating on top ─── */}
      <section className="mk-hero" data-mk-section="hero" data-mk-order="1">
        <HeroPosterField />
        <div className="mk-hero-center">
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
              The bridge between your online world and your real one.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mk-hero-cta" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center" }}>
              {cta("hero")}
            </div>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="mk-hero-proof">
              <span className="mk-hero-proof-dot" />
              <strong>125 kr/month</strong>&nbsp;· cancel anytime
            </p>
          </Reveal>
        </div>
        {/* trust lands with the hero — brands visible without a scroll */}
        <div className="mk-hero-brands" data-mk-section="proof" data-mk-order="2">
          <Reveal delay={0.35} y={10}>
            <p className="mk-proof-label">They already chose PullUp</p>
          </Reveal>
          <Reveal delay={0.4} y={0}>
            <LogoMarquee />
          </Reveal>
        </div>
      </section>

      {/* ════════ THE JOURNEY — the guest story, told fast ════════ */}
      <JourneySection />

      {/* ════════ THE FLIP — story ends, machine begins ════════ */}
      <section className="mk-flip" data-mk-section="flip" data-mk-order="4">
        <Reveal><p className="mk-flip-a">That's the story your guests live.</p></Reveal>
        <Reveal delay={0.12}>
          <p className="mk-flip-b">
            Here's the machine <span className="pink">you run it with.</span>
          </p>
        </Reveal>
        <Reveal delay={0.2}><p className="mk-part-tag mk-part-tag-dark">For you, the host</p></Reveal>
        {/* the machine's parts, drifting by in outline — pure vibe */}
        <div className="mk-flip-ticker" aria-hidden="true">
          <div className="mk-flip-ticker-track">
            {[0, 1].map((copy) => (
              <span key={copy}>
                Auto-DM<i>·</i>One inbox<i>·</i>Living CRM<i>·</i>Your own database<i>·</i>MCP / AI<i>·</i>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ THE HOST'S MACHINE — the bento ════════ */}
      <section className="mk-bento-wrap">
        <div className="mk-bento">
          {HOST_ROWS.map((row, i) => (
            <BentoCard key={row.k} row={row} order={5 + i} index={i} />
          ))}
        </div>
      </section>

      {/* ─── JOIN (pricing — one honest number, then the door. The old
          waitlist is retired: the subscription IS the gate now.) ─── */}
      <section id="join" className="mk-final" data-mk-section="join" data-mk-order="12">
        <Reveal y={16}>
          <PullupEyes variant="big" className="mk-final-eyes" />
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mk-final-h">
            Make 'em <span className="pink">pull up.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mk-final-sub">
            Events live, a community page open, products selling — plus 3% on
            paid tickets. Cancel anytime; your people and your data stay yours
            either way.
          </p>
        </Reveal>
        <Reveal delay={0.17}>
          <p className="mk-final-sub" style={{ opacity: 0.65, fontSize: "0.92em" }}>
            Running a team or agency? The Agency plan is coming soon —{" "}
            <a href="mailto:hello@pullup.se" style={{ color: "inherit", fontWeight: 600 }}>say hi</a>{" "}
            and we'll onboard you personally meanwhile.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mk-join" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              className="mk-cta"
              onClick={() => {
                trackEvent("cta_click", { location: "join_pricing" });
                onStartHosting();
              }}
            >
              Start hosting — 125 kr/month
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="mk-nav-login"
              onClick={() => {
                trackEvent("cta_click", { location: "join_login" });
                onLogin();
              }}
            >
              Already hosting? Log in
            </button>
          </div>
        </Reveal>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="mk-footer" data-mk-section="footer" data-mk-order="14">
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

  // URL → which surface we show. /login is the only modal shell now. The
  // waitlist is INLINE in the page (#join), so /waitlist + /start (the old
  // self-serve onboarding) just land on the marketing scroll and auto-scroll
  // to the join form — with BYO-Supabase, new people join a list inline, no
  // modal, no minted account.
  const view = useMemo(() => {
    if (location.pathname === "/login") return "login";
    return "hero";
  }, [location.pathname]);

  // Auto-scroll to the pricing section when arriving via a join intent:
  // a legacy /waitlist or /start URL still lands somewhere sensible.
  useEffect(() => {
    const wantsJoin =
      location.pathname === "/waitlist" || // legacy links land on the pricing beat
      Boolean(location.state?.joinEmail);
    if (!wantsJoin) return;
    const t = setTimeout(() => {
      document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [location.pathname, location.state]);

  useEffect(() => {
    initTracking();
    trackPageView("landing");
  }, []);

  // The ONE auth check in the whole landing — and only on the login action.
  // The marketing page itself never reads auth (it always offers Log in / Get
  // started). When someone taps Log in and already has a stored session, we
  // validate it server-side (resolveStoredSession → getUser, the same check the
  // backend runs) and:
  //   • valid    → drop them straight into their room, no re-login.
  //   • dead     → clear it locally so the login form shows cleanly. This is the
  //                graceful catch for a session revoked elsewhere by a global
  //                "log out everywhere".
  //   • unknown  → a transient network error; leave the session untouched (a
  //                blip must not log a valid user out — same bug we fixed in
  //                authenticatedFetch). resolveStoredSession refreshes once
  //                before ever calling a session "dead".
  // Onboarding (/start) is intentionally excluded — AuthGate owns that flow
  // (it flushes the name+brand draft before forwarding).
  useEffect(() => {
    if (view !== "login") return;
    let cancelled = false;
    (async () => {
      const { status } = await resolveStoredSession({
        auth: {
          getSession: () => supabase.auth.getSession(),
          getUser: () => supabase.auth.getUser(),
          refreshSession: () => supabase.auth.refreshSession(),
        },
      });
      if (cancelled) return;
      if (status === "valid") {
        navigate(resolveNext(searchParams), { replace: true });
      } else if (status === "dead") {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, navigate, searchParams]);

  // Marketing scroll needs the document to scroll normally; auth shell is a
  // single locked screen. Toggle a body class so the lock only applies to
  // auth and the marketing page scrolls freely.
  useEffect(() => {
    const cls = "pullup-auth-locked";
    if (view === "hero") document.body.classList.remove(cls);
    else document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [view]);

  return (
    <div className="landing-root">
      <style>{STYLES}</style>

      {/* Marketing always renders; the pricing section (#join) stays as the
          story's closing beat, but EVERY "Start hosting" goes straight to the
          /start onboarding: account → subscribe → build. One line, no
          scroll-to-a-second-CTA. Only login floats over as a modal. */}
      <MarketingScroll
        onGetStarted={() => navigate("/start")}
        onStartHosting={() => navigate("/start")}
        onLogin={() => navigate("/login")}
      />
      {view === "login" && (
        <AuthGate
          initialMode="login"
          redirectTo={resolveNext(searchParams)}
          onDismiss={() => navigate("/")}
          // Self-serve is open (the subscription is the gate now, not a
          // waitlist): someone new who lands on Log in is sent to build their
          // first event — the account is created at publish time.
          onSignupIntent={() => navigate("/start")}
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
  /* clip, not hidden, on purpose: hidden makes html/body Y-axis scroll
     containers (overflow-x:hidden computes overflow-y to auto), and with the
     global overscroll-behavior:none the wheel dead-ends on body and can't chain
     to the document scroller — the page won't scroll. clip hides the horizontal
     overflow without creating a scroll container, so vertical scroll works. */
  html, body { overflow-x: clip; overscroll-behavior-x: none; }
  body { touch-action: pan-y; }

  /* Auth surfaces lock the screen to a single non-scrolling view; the
     marketing scroll leaves the document free to scroll. */
  body.pullup-auth-locked { overflow: hidden; }

  .landing-root {
    min-height: 100dvh;
    background: ${SURFACE};
    color: ${INK};
    position: relative;
    overflow-x: clip; /* clip, not hidden — see html/body note above (don't trap vertical scroll) */
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

  /* ─── hero (copy + journey side by side, brands pinned at the fold) ─── */
  .mk-hero {
    position: relative;
    /* exactly one viewport: copy + phone centered, brand marquee riding the
       fold. svh (not dvh) so mobile URL-bar collapse can't push it under.
       border-box is load-bearing: the app has NO global reset, and content-box
       would add the top padding ON TOP of 100svh — shoving the marquee one
       padding below the fold. */
    box-sizing: border-box;
    min-height: 100svh;
    display: flex; flex-direction: column;
    padding: clamp(64px, 9vh, 88px) clamp(22px, 6vw, 48px) 0;
  }
  .mk-hero-center {
    position: relative; z-index: 2;
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 16px; text-align: center;
    /* bottom bias: the brand band below is taller than the nav above, so a
       plain flex-center lands slightly low — this lifts the block to the
       optical center of the viewport */
    padding: 0 0 clamp(32px, 6vh, 72px);
  }
  .mk-hero-h {
    margin: 0;
    font-size: clamp(38px, 5.8vw, 76px);
    font-weight: 800; letter-spacing: -0.035em; line-height: 1.02;
    max-width: 16ch;
  }
  .mk-hero-sub {
    margin: 0;
    font-size: clamp(16px, 2.2vw, 20px);
    line-height: 1.5;
    color: rgba(10,10,10,0.72);
    max-width: 40ch;
  }
  .mk-hero-cta { margin-top: 6px; }
  /* the trust band rides inside the hero: full-bleed marquee at the fold,
     labelled quietly at the left margin (aligned with the nav wordmark) so
     the center stays clean */
  .mk-hero-brands {
    position: relative; z-index: 2;
    flex: 0 0 auto;
    margin: 0 calc(-1 * clamp(22px, 6vw, 48px));
    padding: 4px 0 2px;
    text-align: left;
  }
  .mk-hero-brands .mk-proof-label {
    margin-bottom: 0;
    padding-left: clamp(16px, 4vw, 40px);
    font-size: 10px; letter-spacing: 0.2em;
    color: rgba(10,10,10,0.32);
  }
  .mk-hero-brands .logo-marquee { padding: 10px 0 16px; }
  @media (max-width: 920px) {
    .mk-hero { padding-top: 92px; }
  }

  /* ════════ HERO POSTER FIELD (real event pages, drifting) ════════ */
  .mk-hf { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .mk-hf-tilt {
    position: absolute; inset: -18% -10%;
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: clamp(14px, 1.8vw, 24px);
    transform: rotate(-8deg);
  }
  .mk-hf-col {
    display: flex; flex-direction: column;
    gap: clamp(14px, 1.8vw, 24px);
    animation: mk-hf-drift 70s linear infinite;
    will-change: transform;
  }
  /* center column (1) runs FORWARD from 0 and starts pushed down, so its
     first card — the TWIN FREAKS video — is fully in view at load. reverse
     lives on col 0 instead: a reversed column starts at -50%, which renders
     the duplicate stack where video tiles are posters, not playing clips. */
  .mk-hf-col-0 { animation-duration: 85s; animation-direction: reverse; }
  .mk-hf-col-1 { animation-duration: 90s; margin-top: clamp(70px, 13vh, 150px); }
  .mk-hf-col-2 { animation-duration: 95s; margin-top: -60px; }
  @keyframes mk-hf-drift { to { transform: translateY(-50%); } }
  .mk-hf-stack {
    display: flex; flex-direction: column;
    gap: clamp(14px, 1.8vw, 24px);
    flex: none;
  }
  .mk-hf-card {
    position: relative;
    border-radius: 20px; overflow: hidden;
    aspect-ratio: 5 / 7;
    background: #0b0b10;
    box-shadow: 0 18px 44px -18px rgba(10,10,10,0.35);
  }
  .mk-hf-card img,
  .mk-hf-card video {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; display: block;
  }
  .mk-hf-card::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0.08) 42%, rgba(0,0,0,0) 62%);
  }
  .mk-hf-meta {
    position: absolute; left: 16px; right: 16px; bottom: 14px; z-index: 1;
    text-align: left; color: #fff;
  }
  .mk-hf-meta p { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.25; letter-spacing: -0.01em; }
  .mk-hf-meta span { display: block; margin-top: 3px; font-size: 11.5px; color: rgba(255,255,255,0.72); font-weight: 500; }
  /* white veil: posters stay visible everywhere, copy floats on a soft
     radial clearing, and the bottom fades to white for the brand band */
  .mk-hf-veil {
    position: absolute; inset: 0; z-index: 1;
    background:
      radial-gradient(58% 54% at 50% 44%, rgba(255,255,255,0.96) 30%, rgba(255,255,255,0.78) 62%, rgba(255,255,255,0.28) 100%),
      linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.35) 18%, rgba(255,255,255,0.3) 72%, rgba(255,255,255,0.97) 94%);
  }

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

  .mk-hero-proof {
    margin: 8px 0 0;
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13.5px; color: rgba(10,10,10,0.55);
  }
  .mk-hero-proof strong { color: ${INK}; font-weight: 800; }
  .mk-hero-proof-dot {
    width: 7px; height: 7px; border-radius: 999px; background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34,197,94,0.18);
    animation: proofpulse 2.4s ease-in-out infinite;
  }
  @keyframes proofpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

  /* ════════ THE JOURNEY SECTION (story told fast) ════════ */
  .mk-story {
    max-width: 1060px; margin: 0 auto;
    padding: clamp(72px, 12vh, 130px) clamp(22px, 6vw, 48px);
  }
  .mk-story-head { text-align: center; margin-bottom: clamp(40px, 7vh, 72px); }
  .mk-story-grid {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    align-items: center;
    gap: clamp(36px, 6vw, 88px);
  }
  .mk-story-steps {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column;
  }
  .mk-story-steps li { position: relative; }
  /* the connecting line — runs through the dots, segment by segment */
  .mk-story-steps li::before {
    content: ""; position: absolute;
    left: 10px; top: 30px; bottom: -6px; width: 2px;
    background: rgba(10,10,10,0.1);
  }
  .mk-story-steps li:last-child::before { display: none; }
  .mk-story-steps button {
    display: flex; align-items: flex-start; gap: 18px;
    width: 100%; text-align: left;
    background: none; border: 0; padding: 14px 0;
    font: inherit;
  }
  .mk-story-dot {
    flex: 0 0 auto;
    width: 22px; height: 22px; border-radius: 999px;
    margin-top: 2px;
    border: 2px solid rgba(10,10,10,0.18);
    background: #fff;
    transition: border-color 0.3s, background 0.3s, box-shadow 0.3s;
  }
  .mk-story-steps li.on .mk-story-dot {
    border-color: ${PINK};
    background: ${PINK};
    box-shadow: 0 0 0 5px rgba(236,23,143,0.14);
  }
  .mk-story-txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .mk-story-t {
    font-size: clamp(17px, 2.2vw, 21px); font-weight: 800; letter-spacing: -0.02em;
    color: rgba(10,10,10,0.42);
    transition: color 0.3s;
  }
  .mk-story-steps li.on .mk-story-t { color: ${INK}; }
  .mk-story-b {
    font-size: 14px; line-height: 1.5; color: rgba(10,10,10,0.45);
    opacity: 0.65; transition: opacity 0.3s;
    max-width: 40ch;
  }
  .mk-story-steps li.on .mk-story-b { opacity: 1; }
  @media (max-width: 860px) {
    .mk-story-grid { grid-template-columns: 1fr; gap: 40px; }
    .mk-jr { order: -1; }
  }

  /* ════════ THE JOURNEY PHONE (the looping pitch) ════════ */
  .mk-jr { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .mk-jr-phone {
    position: relative;
    width: clamp(240px, 24vw, 300px);
    aspect-ratio: 9 / 18.4;
    border-radius: 42px;
    background: #0b0b10;
    box-shadow:
      0 50px 110px -34px rgba(10,10,10,0.5),
      0 12px 36px -18px rgba(236,23,143,0.28),
      inset 0 0 0 1px rgba(255,255,255,0.06);
  }
  .mk-jr-screen {
    position: absolute; inset: 9px;
    border-radius: 34px; overflow: hidden;
    background: #fafafa;
    transform: translateZ(0);
  }
  .mk-jr-ph {
    position: absolute; inset: 0;
    opacity: 0; transition: opacity 0.55s ease;
    pointer-events: none;
  }
  .mk-jr-ph.is-on { opacity: 1; }

  /* 0 · their feed */
  .mk-jr-ph-feed { background: #fff; padding: 16px 13px; display: flex; flex-direction: column; gap: 10px; }
  .mk-jr-ig-head { display: flex; align-items: center; gap: 8px; }
  .mk-jr-ig-av {
    width: 26px; height: 26px; border-radius: 999px; flex: 0 0 auto;
    background: linear-gradient(135deg, #ff8a4c, ${PINK});
    box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px rgba(214,36,159,0.7);
  }
  .mk-jr-ig-name { font-size: 11.5px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-jr-ig-media {
    position: relative; border-radius: 13px; overflow: hidden;
    aspect-ratio: 4 / 4.6;
    background:
      radial-gradient(120% 90% at 80% 0%, rgba(236,23,143,0.55), transparent 55%),
      linear-gradient(155deg, #17171d, #351029 60%, #6d1150);
    display: flex; align-items: flex-end; padding: 11px;
  }
  .mk-jr-ig-media span { color: #fff; font-size: 12px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-jr-ig-actions { font-size: 11.5px; color: rgba(10,10,10,0.55); }
  .mk-jr-ig-comment {
    display: flex; align-items: center; gap: 7px;
    align-self: flex-start;
    padding: 8px 11px; border-radius: 13px; border-bottom-left-radius: 5px;
    background: rgba(10,10,10,0.05);
    font-size: 12px; font-weight: 600;
    opacity: 0; transform: translateY(8px);
  }
  .is-on .mk-jr-ig-comment { animation: mk-msgin 0.45s ease 1.1s forwards; }
  .mk-jr-ig-reply {
    align-self: flex-end;
    padding: 7px 12px; border-radius: 13px; border-bottom-right-radius: 5px;
    background: ${PINK}; color: #fff;
    font-size: 12px; font-weight: 700;
    opacity: 0; transform: translateY(8px);
  }
  .is-on .mk-jr-ig-reply { animation: mk-msgin 0.45s ease 2.4s forwards; }

  /* 1 · your world (the immersive page, scrolling itself) */
  .mk-jr-ph-page { background: #0b0b10; }
  .mk-jr-ev-scroll {
    position: absolute; left: 0; right: 0; top: 0;
    padding: 13px; display: flex; flex-direction: column; gap: 10px;
  }
  .is-on .mk-jr-ev-scroll { animation: mk-jr-scroll 4s cubic-bezier(0.45, 0, 0.3, 1) 0.4s forwards; }
  @keyframes mk-jr-scroll {
    0%, 14% { transform: translateY(0); }
    88%, 100% { transform: translateY(-52%); }
  }
  .mk-jr-ev-cover {
    border-radius: 13px; aspect-ratio: 4 / 4.4; flex: 0 0 auto;
    background:
      radial-gradient(130% 100% at 20% 0%, rgba(123,47,247,0.5), transparent 55%),
      linear-gradient(160deg, #241226, #4c1136 55%, #b3126b);
    display: flex; flex-direction: column; justify-content: flex-end; gap: 3px;
    padding: 12px;
  }
  .mk-jr-ev-title { color: #fff; font-size: 15px; font-weight: 900; letter-spacing: -0.02em; }
  .mk-jr-ev-sub { color: rgba(255,255,255,0.75); font-size: 10.5px; font-weight: 600; }
  .mk-jr-ev-bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,0.14); flex: 0 0 auto; }
  .mk-jr-ev-video {
    border-radius: 12px; aspect-ratio: 16 / 9.5; flex: 0 0 auto;
    background: linear-gradient(140deg, #101018, #2a1030);
    display: flex; align-items: center; justify-content: center;
  }
  .mk-jr-ev-play {
    width: 0; height: 0;
    border-left: 12px solid rgba(255,255,255,0.92);
    border-top: 8px solid transparent; border-bottom: 8px solid transparent;
    margin-left: 3px;
    filter: drop-shadow(0 0 12px rgba(236,23,143,0.8));
  }
  .mk-jr-ev-gallery { display: flex; gap: 7px; flex: 0 0 auto; }
  .mk-jr-ev-gallery span { flex: 1; aspect-ratio: 3 / 4; border-radius: 9px; }
  .mk-jr-ev-fade {
    position: absolute; left: 0; right: 0; bottom: 0; height: 74px; z-index: 1;
    background: linear-gradient(180deg, transparent, rgba(11,11,16,0.96) 70%);
    pointer-events: none;
  }
  .mk-jr-ev-cta {
    position: absolute; left: 14px; right: 14px; bottom: 13px; z-index: 2;
    padding: 10px 0; border-radius: 999px; text-align: center;
    background: ${PINK}; color: #fff;
    font-size: 13px; font-weight: 800; letter-spacing: -0.01em;
    box-shadow: 0 10px 26px -8px rgba(236,23,143,0.75);
  }
  .is-on .mk-jr-ev-cta { animation: mk-jr-pulse 1.3s ease 1.2s 2; }
  @keyframes mk-jr-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.045); }
  }
  .mk-jr-tap {
    position: absolute; left: 50%; bottom: 18px; z-index: 3;
    width: 34px; height: 34px; border-radius: 999px;
    border: 2.5px solid #fff;
    opacity: 0; transform: translateX(-50%) scale(0.4);
    pointer-events: none;
  }
  .is-on .mk-jr-tap { animation: mk-jr-tap 0.75s ease 3.6s forwards; }
  @keyframes mk-jr-tap {
    0% { opacity: 0.95; transform: translateX(-50%) scale(0.4); }
    100% { opacity: 0; transform: translateX(-50%) scale(1.7); }
  }

  /* 2 · the door closes */
  .mk-jr-ph-door { background: #fff; }
  .mk-jr-confirm {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
    opacity: 0; transform: scale(0.85);
  }
  .is-on .mk-jr-confirm { animation: mk-avpop 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s forwards; }
  .mk-jr-confirm-check {
    width: 46px; height: 46px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(34,197,94,0.12); color: #16a34a;
    font-size: 22px; font-weight: 900;
  }
  .mk-jr-confirm-t { font-size: 17px; font-weight: 900; letter-spacing: -0.02em; }
  .mk-jr-confirm-s { font-size: 11px; font-weight: 600; color: rgba(10,10,10,0.5); }
  .mk-jr-door-l, .mk-jr-door-r {
    position: absolute; top: 0; bottom: 0; width: 51%; z-index: 2;
    background: linear-gradient(160deg, #101014, #0b0b10);
  }
  .mk-jr-door-l { left: 0; transform: translateX(-102%); border-right: 1px solid rgba(255,255,255,0.08); }
  .mk-jr-door-r { right: 0; transform: translateX(102%); }
  .is-on .mk-jr-door-l { animation: mk-jr-doorl 0.7s cubic-bezier(0.7, 0, 0.3, 1) 1.9s forwards; }
  .is-on .mk-jr-door-r { animation: mk-jr-doorr 0.7s cubic-bezier(0.7, 0, 0.3, 1) 1.9s forwards; }
  @keyframes mk-jr-doorl { to { transform: translateX(0); } }
  @keyframes mk-jr-doorr { to { transform: translateX(0); } }
  .mk-jr-lock {
    position: absolute; inset: 0; z-index: 3;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
    color: #fff; opacity: 0; transform: translateY(8px);
  }
  .is-on .mk-jr-lock { animation: mk-msgin 0.5s ease 2.8s forwards; }
  .mk-jr-lock svg { color: ${PINK}; margin-bottom: 3px; }
  .mk-jr-lock-t { font-size: 14px; font-weight: 800; letter-spacing: -0.01em; }
  .mk-jr-lock-s { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.1em; }

  /* 3 · the room */
  .mk-jr-ph-room { background: #fff; padding: 16px 13px; display: flex; flex-direction: column; gap: 11px; }
  .mk-jr-ph-room > div { opacity: 0; transform: translateY(9px); }
  .is-on.mk-jr-ph-room > div { animation: mk-msgin 0.45s ease forwards; animation-delay: calc(var(--i) * 0.28s + 0.25s); }
  .mk-jr-rm-head { display: flex; align-items: center; justify-content: space-between; }
  .mk-jr-rm-t { font-size: 14px; font-weight: 900; letter-spacing: -0.02em; }
  .mk-jr-rm-pill {
    font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.1);
    padding: 4px 9px; border-radius: 999px;
  }
  .mk-jr-rm-people { display: flex; align-items: center; gap: 9px; }
  .mk-jr-avs { display: inline-flex; }
  .mk-jr-av {
    width: 22px; height: 22px; border-radius: 999px; border: 2px solid #fff;
    margin-left: -7px;
    opacity: 0; transform: scale(0.5);
  }
  .mk-jr-av:first-child { margin-left: 0; }
  .is-on .mk-jr-av { animation: mk-avpop 0.4s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: calc(var(--i) * 0.09s + 0.5s); }
  .mk-jr-av-more {
    background: rgba(10,10,10,0.6);
    color: #fff; font-size: 7.5px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center;
    width: auto; min-width: 22px; padding: 0 3px;
  }
  .mk-jr-rm-count { font-size: 11px; font-weight: 700; color: rgba(10,10,10,0.6); }
  .mk-jr-rm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .mk-jr-rm-tile { display: flex; flex-direction: column; gap: 5px; }
  .mk-jr-rm-photos {
    position: relative; height: 62px; border-radius: 11px;
    background: rgba(10,10,10,0.04);
    display: flex; align-items: center; justify-content: center;
  }
  .mk-jr-rm-photos span {
    position: absolute; width: 30px; height: 40px; border-radius: 6px;
    border: 1.5px solid #fff; box-shadow: 0 4px 10px -4px rgba(10,10,10,0.4);
  }
  .mk-jr-rm-photos span:nth-child(1) { transform: rotate(-8deg) translateX(-9px); }
  .mk-jr-rm-photos span:nth-child(2) { transform: rotate(7deg) translateX(9px); }
  .mk-jr-rm-drop {
    height: 62px; border-radius: 11px;
    background: rgba(10,10,10,0.04);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  }
  .mk-jr-rm-swatch {
    width: 26px; height: 26px; border-radius: 7px;
    background: linear-gradient(150deg, #fbbf24, #f97316 60%, #b91c1c);
  }
  .mk-jr-rm-price {
    font-size: 8.5px; font-weight: 800; color: #fff; background: ${PINK};
    padding: 2.5px 7px; border-radius: 999px;
  }
  .mk-jr-rm-label { font-size: 9.5px; font-weight: 600; color: rgba(10,10,10,0.55); }
  .mk-jr-rm-msg {
    align-self: flex-start;
    padding: 8px 12px; border-radius: 13px; border-bottom-left-radius: 5px;
    background: rgba(236,23,143,0.09); color: ${INK};
    font-size: 11.5px; font-weight: 700;
  }

  /* ─── part bands + the flip ─── */
  .mk-part {
    max-width: 880px; margin: 0 auto;
    padding: clamp(64px, 10vh, 120px) clamp(22px, 6vw, 48px) 0;
    text-align: center;
  }
  .mk-part-tag {
    margin: 0 0 18px;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: ${PINK}; font-weight: 800;
  }
  .mk-flip {
    background: ${INK};
    color: #fff;
    text-align: center;
    padding: clamp(90px, 16vh, 170px) clamp(22px, 6vw, 48px);
    margin-top: clamp(40px, 8vh, 90px);
  }
  .mk-flip-a {
    margin: 0 0 14px;
    font-size: clamp(15px, 2vw, 19px); font-weight: 600;
    color: rgba(255,255,255,0.55);
  }
  .mk-flip-b {
    margin: 0 0 26px;
    font-size: clamp(32px, 5.6vw, 58px);
    font-weight: 800; letter-spacing: -0.03em; line-height: 1.05;
  }
  .mk-part-tag-dark { color: ${PINK}; margin-bottom: 0; }

  /* ════════ THE HOST BENTO (Movement II) ════════
     Feature cards on a 6-col bento grid. Each card tilts toward the cursor
     (perspective + --rx/--ry set from JS) and replays its live demo on
     hover. The database card goes full ink — the anchor of the grid. */
  .mk-bento-wrap {
    max-width: 1160px; margin: 0 auto;
    padding: clamp(44px, 7vh, 88px) clamp(22px, 6vw, 48px) clamp(56px, 9vh, 110px);
  }
  .mk-bento {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: clamp(14px, 1.8vw, 22px);
  }
  .mk-bento-cell { min-width: 0; }
  .mk-bento-span-3 { grid-column: span 3; }
  .mk-bento-span-2 { grid-column: span 2; }
  @media (max-width: 980px) {
    .mk-bento-span-3, .mk-bento-span-2 { grid-column: span 6; }
    .mk-bento-span-2 { grid-column: span 3; }
  }
  @media (max-width: 680px) {
    .mk-bento-span-3, .mk-bento-span-2 { grid-column: span 6; }
  }
  .mk-bento-card {
    position: relative; height: 100%; overflow: hidden;
    display: flex; flex-direction: column; gap: 13px;
    padding: clamp(24px, 2.8vw, 34px);
    border-radius: 28px;
    background: #fff;
    border: 1px solid rgba(10,10,10,0.08);
    box-shadow:
      0 1px 2px rgba(10,10,10,0.04),
      0 24px 60px -46px rgba(10,10,10,0.35);
    transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform 0.25s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    will-change: transform;
  }
  .mk-bento-card:hover {
    box-shadow:
      0 1px 2px rgba(10,10,10,0.04),
      0 36px 90px -44px rgba(236,23,143,0.4);
    border-color: rgba(236,23,143,0.25);
  }
  /* pink glow that trails the cursor — the "alive" feel */
  .mk-bento-glow {
    position: absolute; inset: 0; z-index: 2;
    border-radius: inherit;
    background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(236,23,143,0.07), transparent 65%);
    opacity: 0; transition: opacity 0.35s ease;
    pointer-events: none;
  }
  .mk-bento-card:hover .mk-bento-glow { opacity: 1; }
  .mk-bento-tone-ink .mk-bento-glow {
    background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(236,23,143,0.14), transparent 65%);
  }
  /* tone washes — each feature gets its channel's color, whisper-quiet */
  .mk-bento-tone-ig { background: linear-gradient(165deg, #fff 52%, rgba(214,36,159,0.07)); }
  .mk-bento-tone-wa { background: linear-gradient(165deg, #fff 52%, rgba(37,211,102,0.09)); }
  .mk-bento-tone-teal { background: linear-gradient(165deg, #fff 52%, rgba(13,148,136,0.09)); }
  .mk-bento-tone-violet { background: linear-gradient(165deg, #fff 52%, rgba(123,47,247,0.08)); }
  .mk-bento-tone-ink {
    background: linear-gradient(170deg, #16161b, #0a0a0a);
    border-color: rgba(255,255,255,0.12);
    color: #fff;
  }
  .mk-bento-tone-ink:hover { border-color: rgba(236,23,143,0.5); }
  .mk-bento-kicker {
    align-self: flex-start;
    font-size: 10.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
    color: ${PINK}; background: rgba(236,23,143,0.09);
    padding: 5px 11px; border-radius: 999px;
  }
  .mk-bento-tone-ink .mk-bento-kicker { background: rgba(236,23,143,0.2); }
  .mk-bento-t {
    margin: 0;
    font-size: clamp(20px, 2.3vw, 26px);
    font-weight: 800; letter-spacing: -0.025em; line-height: 1.12;
  }
  .mk-bento-b {
    margin: 0;
    font-size: 15px; line-height: 1.55;
    color: rgba(10,10,10,0.62);
    max-width: 52ch;
  }
  .mk-bento-tone-ink .mk-bento-b { color: rgba(255,255,255,0.62); }
  .mk-bento-creed {
    margin: 2px 0 0;
    font-size: clamp(16px, 1.9vw, 19px);
    font-weight: 800; letter-spacing: -0.02em;
  }
  /* the demo fills the leftover height and CENTERS in it — no dead air when
     a neighboring card in the same row runs taller */
  .mk-bento-vis {
    margin-top: auto; padding-top: 16px; min-width: 0;
    flex: 1;
    display: flex; flex-direction: column; justify-content: center;
  }
  .mk-bento-vis .mk-scene { margin: 0; width: 100%; }
  .mk-bento-vis .mk-thread, .mk-bento-vis .mk-profile { max-width: none; }
  .mk-bento-vis .mk-inbound, .mk-bento-vis .mk-mcp { max-width: 440px; margin-left: auto; margin-right: auto; }
  /* tighter thread inside a card, so the inbox demo doesn't tower */
  .mk-bento-vis .mk-thread-body { padding: 13px 15px; gap: 10px; }
  .mk-bento-vis .mk-msg-bub { font-size: 13px; }
  .mk-bento-vis .mk-composer { padding: 13px 15px; }
  /* the ink card's ownership promises — four calm rows, not a cramped grid */
  .mk-bento-tone-ink .own-grid { grid-template-columns: 1fr; gap: 9px; }
  .mk-bento-tone-ink .own-card {
    flex-direction: row; align-items: center; gap: 13px;
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.12);
    box-shadow: none;
    padding: 12px 14px;
    border-radius: 15px;
  }
  .mk-bento-tone-ink .own-card-ic {
    background: rgba(236,23,143,0.18);
    width: 34px; height: 34px; border-radius: 11px;
    flex: 0 0 auto; margin: 0;
  }
  .mk-bento-tone-ink .own-card-t { color: #fff; font-size: 13.5px; }
  .mk-bento-tone-ink .own-card-b { display: none; }

  /* ─── the flip band's outline ticker ─── */
  .mk-flip-ticker {
    margin-top: clamp(44px, 8vh, 80px);
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  }
  .mk-flip-ticker-track {
    display: flex; width: max-content;
    animation: mk-flip-tick 36s linear infinite;
    will-change: transform;
  }
  .mk-flip-ticker-track span {
    display: inline-flex; align-items: center;
    white-space: nowrap;
    font-size: clamp(42px, 7vw, 88px);
    font-weight: 900; letter-spacing: -0.02em; line-height: 1.1;
    color: transparent;
    -webkit-text-stroke: 1.5px rgba(255,255,255,0.22);
    padding-right: 0.6em;
  }
  .mk-flip-ticker-track i {
    font-style: normal; color: ${PINK};
    -webkit-text-stroke: 0;
    margin: 0 0.35em;
  }
  @keyframes mk-flip-tick { to { transform: translate3d(-50%, 0, 0); } }

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

  /* ─── ownership mini-grid (the anchor feature row's visual) ─── */
  .own-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    text-align: left;
  }
  .own-card {
    display: flex; flex-direction: column; gap: 8px;
    padding: 20px 18px;
    border-radius: 18px;
    background: #fff;
    border: 1px solid rgba(10,10,10,0.1);
    box-shadow: 0 28px 60px -46px rgba(10,10,10,0.4);
  }
  .own-card-ic {
    display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 12px;
    background: rgba(236,23,143,0.09); color: ${PINK};
    margin-bottom: 2px;
  }
  .own-card-t { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: ${INK}; }
  .own-card-b { font-size: 13px; line-height: 1.5; color: rgba(10,10,10,0.62); }
  .own-grid--mini .own-card { opacity: 0; transform: translateY(10px); }
  .mk-in .own-grid--mini .own-card {
    animation: mk-tilein 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
    animation-delay: calc(var(--i) * 0.1s + 0.1s);
  }
  @media (max-width: 480px) {
    .own-grid { grid-template-columns: 1fr; gap: 10px; }
    .own-card { padding: 16px 15px; }
  }

  /* cross-channel identity chip */
  .mk-chchip {
    flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 7px;
    font-size: 10.5px; font-weight: 800; letter-spacing: -0.01em;
  }

  /* ─── deep person profile (CRM feature row) ─── */
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

  /* ─── one chat (channels in → thread → ways out) ─── */
  .mk-chat { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .mk-chat-sources {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12.5px; font-weight: 600; color: rgba(10,10,10,0.5);
    opacity: 0;
  }
  .mk-in .mk-chat-sources { animation: mk-fade 0.5s ease 0.1s forwards; }
  .mk-chat-sources-label { margin-left: 4px; }
  .mk-chat .mk-thread { width: 100%; }
  .mk-chat-mini .mk-composer { animation-delay: 1.9s; }

  /* shared pop/tile keyframes (journey avatars, ownership mini-grid) */
  @keyframes mk-avpop { to { opacity: 1; transform: scale(1); } }
  @keyframes mk-tilein { to { opacity: 1; transform: none; } }

  /* ─── thread + draft ─── */
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
  .mk-chat-mini.mk-in .mk-composer { animation-delay: 1.9s; }
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

  /* ─── inbound (comment → DM → WhatsApp) ─── */
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

  /* ─── mcp terminal ─── */
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
    .mk-scene .mk-mcp-typed,
    .mk-jr-ph * {
      opacity: 1 !important; transform: none !important;
      max-width: none !important; height: auto !important; animation: none !important;
    }
    .mk-jr-ph { transition: none; }
    .mk-mcp-l1 { height: 9px !important; }
    .mk-mcp-l2 { height: 8px !important; }
    .mk-jr-ev-scroll { animation: none !important; }
    .mk-jr-door-l, .mk-jr-door-r { display: none !important; }
    .mk-jr-lock { display: none !important; }
    .mk-jr-tap { display: none !important; }
    .mk-jr-av { width: 22px !important; height: 22px !important; }
    .mk-jr-ev-bar { height: 7px !important; }
  }

  /* ─── proof ─── */
  .mk-proof-label {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }

  /* ─── final ─── */
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
  .mk-join { width: 100%; margin-top: 34px; }

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


  @media (prefers-reduced-motion: reduce) {
    .logo-marquee-track, .mk-hf-col, .mk-flip-ticker-track { animation: none; }
    .mk-bento-card { transform: none; transition: box-shadow 0.3s ease; }
  }
`;
