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
  // Pure-black silhouette art. On the light body they render black
  // (`filter: brightness(0)`); on the dark hero they invert to white.
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
const NIGHT = "#08080e"; // cinematic dark canvas — the hero + the two dark acts

// Public Supabase storage base for event cover images.
const STORAGE_BASE =
  (import.meta.env.VITE_SUPABASE_URL || "") +
  "/storage/v1/object/public/event-images/";

// The hero poster wall — a curated, hand-picked set of real rooms already
// live on PullUp. They cover the hero as slow-drifting poster columns; a
// cursor-tracked spotlight lifts them out of the dark so the first thing a
// visitor sees is what real nights on PullUp actually look like.
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

// reduced-motion probe — one place, reused by the kinetic bits.
const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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


/* ─── scroll-scrub hook ───
   Returns 0→1 for how far a tall/pinned section has been scrolled through
   (0 when its top hits the viewport top, 1 when its bottom reaches the fold).
   Drives the desktop scrollytelling (pinned Journey) and the parallax beats.
   `active=false` parks it at 0 (mobile / reduced-motion) with no listeners. */
function useSectionProgress(ref, active = true) {
  const [p, setP] = useState(0);
  useEffect(() => {
    // Parked at 0 when inactive; callers gate on their motion flag before
    // reading p, so a stale value here is never used.
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let raf = null;
    const compute = () => {
      raf = null;
      const vh = window.innerHeight || 1;
      const total = el.offsetHeight - vh;
      const scrolled = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(total, 0));
      setP(total > 0 ? scrolled / total : 0);
    };
    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(compute);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [ref, active]);
  return p;
}

// Desktop, fine-pointer, motion-allowed — the gate for scroll-driven staging.
// Mobile and reduced-motion fall back to the simpler static/loop layouts.
function useDesktopMotion() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (prefersReduced()) return;
    const mq = window.matchMedia("(min-width: 861px) and (pointer: fine)");
    const upd = () => setOk(mq.matches);
    upd();
    if (mq.addEventListener) mq.addEventListener("change", upd);
    else mq.addListener(upd);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", upd);
      else mq.removeListener(upd);
    };
  }, []);
  return ok;
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

// The recurring trust marquee. `invert` flips the black silhouettes to white
// for the dark hero.
function LogoMarquee({ invert = false }) {
  return (
    <div className={`logo-marquee${invert ? " logo-marquee--invert" : ""}`} aria-hidden="true">
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

/* ════════ LIVE ROTATOR ════════
   A tiny honest social-proof line under the hero copy: it cycles through the
   real rooms already live on PullUp (the SHOWCASE set), one at a time, with a
   live pulse dot. No fabricated numbers — just the names of nights that ran. */
function LiveRotator() {
  const items = useMemo(
    () =>
      SHOWCASE.map((s) => ({
        t: s.title.split(" — ")[0].split(" × ")[0].trim(),
        m: s.meta,
      })),
    [],
  );
  const [i, setI] = useState(0);
  const reduced = useMemo(() => prefersReduced(), []);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [reduced, items.length]);
  const cur = items[i];
  return (
    <div className="mk-live" aria-hidden="true">
      <span className="mk-live-dot" />
      <span className="mk-live-label">Live on PullUp</span>
      <span className="mk-live-sep" />
      <span key={i} className="mk-live-ev">
        {cur.t} <em>{cur.m}</em>
      </span>
    </div>
  );
}

/* ════════ HERO POSTER FIELD ════════
   The hero is covered in real event pages — slow-drifting, slightly tilted
   poster columns built from the SHOWCASE covers. On the dark canvas they glow;
   the cursor spotlight (drawn separately in the hero) lifts the ones you point
   at. Pure decoration (links live in the story below): aria-hidden,
   pointer-events none. */
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
  const [sub, setSub] = useState(0);
  const rootRef = useRef(null);
  const reduced = useMemo(() => prefersReduced(), []);
  const desktop = useDesktopMotion();
  // Desktop → the stage pins and scroll drives the beats (MetaMask-style).
  // Mobile / reduced-motion → the stage auto-advances on a gentle timer.
  const isScroll = desktop && !reduced;

  // LOOP mode: only spin while the section is on screen.
  useEffect(() => {
    if (isScroll) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isScroll]);

  useEffect(() => {
    if (isScroll || reduced || !running) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % STORY_STEPS.length), JOURNEY_MS);
    return () => clearInterval(t);
  }, [isScroll, reduced, running]);

  // SCROLL mode: pin the stage; scroll position picks the active beat and a
  // sub-progress (0→1 within the beat) that fills the step spine.
  useEffect(() => {
    if (!isScroll) return;
    const el = rootRef.current;
    if (!el) return;
    let raf = null;
    const compute = () => {
      raf = null;
      const vh = window.innerHeight || 1;
      const total = el.offsetHeight - vh;
      const scrolled = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(total, 0));
      const p = total > 0 ? scrolled / total : 0;
      const n = STORY_STEPS.length;
      const idx = Math.min(n - 1, Math.floor(p * n));
      setPhase(idx);
      setSub(Math.min(1, Math.max(0, p * n - idx)));
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(compute); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [isScroll]);

  const on = (i) => `mk-jr-ph ${phase === i ? "is-on" : ""}`;
  const spineH = ((phase + (isScroll ? sub : 0.6)) / STORY_STEPS.length) * 100;

  return (
    <section
      className={`mk-story ${isScroll ? "mk-story-scroll" : "mk-story-loop"}`}
      data-mk-section="story"
      data-mk-order="5"
      ref={rootRef}
      style={isScroll ? { height: `${STORY_STEPS.length * 90}vh` } : undefined}
    >
      <div className="mk-story-sticky">
        <div className="mk-story-head">
          <p className="mk-part-tag">How it works</p>
          <h2 className="mk-h2" style={{ marginBottom: 0 }}>
            Watch one follower{" "}
            <span className="pink">become one of your people.</span>
          </h2>
        </div>
        <div className="mk-story-grid">
          <ol className="mk-story-steps">
            <span className="mk-story-spine" aria-hidden="true">
              <span style={{ height: `${spineH}%` }} />
            </span>
            {STORY_STEPS.map((s, i) => (
              <li key={s.t} className={phase === i ? "on" : phase > i ? "done" : ""}>
                <button type="button" onClick={() => { if (!isScroll) setPhase(i); }}>
                  <span className="mk-story-idx">{String(i + 1).padStart(2, "0")}</span>
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
          {isScroll && <span className="mk-jr-cue">keep scrolling ↓</span>}
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

/* ════════ ACT II · THE PROBLEM — name the villain ════════
   The reframe the whole pitch turns on: a follow is not a relationship. A stark
   Reach-vs-Relationships contrast — the crowd you rent on the left, the people
   you own on the right — with the pull-up as the arrow between them. */
const REL_AVS = ["#ec4899", "#8b5cf6", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#f97316", "#a855f7", "#06b6d4"];

function ProblemSection() {
  return (
    <section className="mk-problem" data-mk-section="problem" data-mk-order="3">
      <div className="mk-problem-head">
        <Reveal><p className="mk-part-tag">The problem</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="mk-h2" style={{ marginBottom: 0 }}>A follow is not a relationship.</h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mk-problem-lede">
            You've spent years growing an audience — and you still don't own it.
            The platforms rent you attention, month to month, algorithm to
            algorithm. The day it changes, the crowd is gone, and you never even
            knew their names.
          </p>
        </Reveal>
      </div>
      <div className="mk-vs">
        <Reveal className="mk-vs-card mk-vs-reach" y={20}>
          <span className="mk-vs-label">Reach — rented</span>
          <span className="mk-vs-num">40,000</span>
          <span className="mk-vs-sub">followers</span>
          <div className="mk-vs-dots" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, i) => <span key={i} />)}
          </div>
          <ul className="mk-vs-list">
            <li>Owned by the algorithm</li>
            <li>Gone the day it changes</li>
            <li>You can't name a single one</li>
          </ul>
        </Reveal>
        <div className="mk-vs-mid" aria-hidden="true">
          <span className="mk-vs-arrow"><ArrowRight size={20} /></span>
          <span className="mk-vs-mid-t">pull up</span>
        </div>
        <Reveal className="mk-vs-card mk-vs-rel" y={20} delay={0.1}>
          <span className="mk-vs-label">Relationships — yours</span>
          <span className="mk-vs-num">248</span>
          <span className="mk-vs-sub">people who showed up</span>
          <div className="mk-vs-avs" aria-hidden="true">
            {REL_AVS.map((c) => <span key={c} style={{ background: c }} />)}
          </div>
          <ul className="mk-vs-list">
            <li>Owned by you</li>
            <li>Yours forever</li>
            <li>You know every name</li>
          </ul>
        </Reveal>
      </div>
      <Reveal delay={0.1}>
        <p className="mk-problem-foot">
          Stop renting reach. <span className="pink">Start owning relationships.</span>
        </p>
      </Reveal>
    </section>
  );
}

/* ════════ ACT III · THE TURN — the one moment it all hinges on ════════
   The brand verb, made the pivot of the story. One giant glowing word. */
function PullUpSection() {
  const ref = useRef(null);
  const motion = useDesktopMotion();
  const p = useSectionProgress(ref, motion);
  // parallax: the word drifts up and the glow blooms as the section passes.
  const wordStyle = motion
    ? { transform: `translate3d(0, ${((0.5 - p) * 90).toFixed(1)}px, 0) scale(${(1 + (0.5 - Math.abs(p - 0.5)) * 0.12).toFixed(3)})` }
    : undefined;
  const glowStyle = motion ? { opacity: 0.45 + (0.5 - Math.abs(p - 0.5)) * 1.1 } : undefined;
  return (
    <section className="mk-turn" data-mk-section="pullup" data-mk-order="4" ref={ref}>
      <div className="mk-grain" aria-hidden="true" />
      <div className="mk-turn-glow" aria-hidden="true" style={glowStyle} />
      <div className="mk-turn-inner">
        <Reveal><p className="mk-part-tag mk-part-tag-dark">The turn</p></Reveal>
        <Reveal delay={0.06}><p className="mk-turn-a">It all comes down to one moment.</p></Reveal>
        <h2 className="mk-turn-word" style={wordStyle}>pull up<span className="mk-turn-dot">.</span></h2>
        <Reveal delay={0.2}>
          <p className="mk-turn-body">
            The night happens in real life. Someone who was just a handle in your
            comments walks through the door — and becomes a person you know. That's
            the instant a follower turns into one of your people. Everything PullUp
            does is built to create that moment, capture it, and keep it going long
            after the lights come up.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════ ACT V · THE MACHINE — sticky-rail scrollytelling ════════
   The feature section, authored like a story instead of a flat grid. On
   desktop a title/nav column pins on the left while the four tools scroll up
   and play beside it; an IntersectionObserver lights the active one and drives
   the 01→04 counter. Below the breakpoint it stacks into a simple column. */
function MachineSection() {
  const [active, setActive] = useState(0);
  const cardRefs = useRef([]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number(e.target.getAttribute("data-idx")) || 0);
        });
      },
      { threshold: 0.01, rootMargin: "-45% 0px -45% 0px" },
    );
    cardRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return (
    <section className="mk-machine" data-mk-section="machine" data-mk-order="7">
      <div className="mk-machine-grid">
        <aside className="mk-machine-aside">
          <div className="mk-machine-asidein">
            <p className="mk-part-tag">The machine</p>
            <h2 className="mk-h2" style={{ marginBottom: 0 }}>
              Everything that turns a night{" "}
              <span className="pink">into a business.</span>
            </h2>
            <p className="mk-machine-lede">
              Four tools, one system — the funnel, the follow-up and the memory
              all run themselves, so you can just host.
            </p>
            <div className="mk-machine-nav">
              {HOST_ROWS.map((row, i) => (
                <button
                  key={row.k}
                  type="button"
                  className={`mk-machine-navitem ${active === i ? "on" : ""}`}
                  onClick={() => cardRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                >
                  <span className="mk-machine-navnum">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mk-machine-navlbl">{row.kicker}</span>
                </button>
              ))}
            </div>
            <div className="mk-machine-count" aria-hidden="true">
              <b>{String(active + 1).padStart(2, "0")}</b>
              <span> / {String(HOST_ROWS.length).padStart(2, "0")}</span>
            </div>
          </div>
        </aside>
        <div className="mk-machine-cards">
          {HOST_ROWS.map((row, i) => (
            <div
              key={row.k}
              className="mk-machine-cardwrap"
              data-idx={i}
              ref={(el) => { cardRefs.current[i] = el; }}
            >
              <BentoCard row={row} order={7 + i} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════ ACT VI · OWNERSHIP — the asset is yours, and only yours ════════
   Pulled out of a bento card into its own beat: data ownership is the moat and
   the #1 reason creators trust the platform. Transparency reads bright. */
function OwnershipSection() {
  return (
    <section className="mk-own" data-mk-section="ownership" data-mk-order="11">
      <div className="mk-own-head">
        <Reveal><p className="mk-part-tag">What you're really building</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="mk-h2" style={{ marginBottom: 0 }}>
            Every night, you build an asset.<br />
            <span className="pink">Make sure it's yours.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mk-own-lede">
            Most platforms rent you tools and quietly keep your data. PullUp is the
            opposite. Every name, number, photo and message lives in a database in
            your name — in your cloud, not ours. We hold one scoped key to run the
            room; you see everything it touches, export the whole thing in a click,
            and revoke us any time. The room is still there. Still yours.
          </p>
        </Reveal>
      </div>
      <div className="mk-own-grid">
        {OWNERSHIP.map((o, i) => (
          <Reveal key={o.title} className="own-card own-card--lg" y={20} delay={i * 0.06}>
            <span className="own-card-ic"><o.icon size={19} strokeWidth={2} /></span>
            <span className="own-card-t">{o.title}</span>
            <span className="own-card-b">{o.body}</span>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.1}>
        <p className="mk-own-creed">We run the room. <span className="pink">You hold the keys.</span></p>
      </Reveal>
    </section>
  );
}

/* ─── Movement II — the host's machine, as tight feature rows ─── */

const HOST_ROWS = [
  {
    k: "autodm",
    kicker: "The funnel, automated",
    title: "A comment turns into a guest — while you sleep.",
    body: "Someone comments on your reel. PullUp DMs them your link and confirms them on WhatsApp. You wake up to a fuller room.",
    visual: <InboundScene />,
    span: 3,
    tone: "ig",
  },
  {
    k: "inbox",
    kicker: "One inbox",
    title: "Every DM, WhatsApp and email — one thread per person.",
    body: "No more five apps and a dropped conversation. One place for every channel, and PullUp drafts the reply in your voice. You just send.",
    visual: <MiniChatScene />,
    span: 3,
    tone: "wa",
  },
  {
    k: "crm",
    kicker: "A memory for everyone",
    title: "You'll know every person who pulls up.",
    body: "Every night they came, every +1, the little note you'd otherwise forget — one glance and you remember them like a regular.",
    visual: <MiniProfileScene />,
    span: 3,
    tone: "teal",
  },
  {
    k: "mcp",
    kicker: "Your AI, wired in",
    title: "Run the whole thing from a sentence.",
    body: "Claude, ChatGPT, Cursor — spin up an event or draft the week's follow-ups just by asking. The platform does the work.",
    visual: <McpScene />,
    span: 3,
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

/* ════════ THE ROOM PAYS OFF — the room is a storefront for your people ════════
   The private room isn't just where the community lives — it's where you sell to
   the people who actually showed up: a link, a pack, prints, merch, a printed
   magazine. Anchored by Adam Flambo's real story, which links to the case page. */
const ROOM_SELLS = ["A link", "A preset pack", "Prints", "Real merch", "Early drops", "A printed magazine"];
function RoomCommerceSection({ onStory }) {
  return (
    <section className="mk-room" data-mk-section="room" data-mk-order="11.5">
      <div className="mk-room-head">
        <Reveal><p className="mk-part-tag">Where it pays off</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="mk-h2" style={{ marginBottom: 0 }}>
            A room full of people who showed up —{" "}
            <span className="pink">and want what you make.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mk-room-lede">
            The private room isn't a group chat. It's your storefront for the people
            who actually pulled up — sell straight to them, no algorithm in the
            middle, no strangers.
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.1}>
        <div className="mk-room-chips">
          {ROOM_SELLS.map((s, i) => (
            <span key={s} className="mk-room-chip" style={{ "--i": i }}>{s}</span>
          ))}
        </div>
      </Reveal>
      <Reveal delay={0.14} y={26}>
        <button type="button" className="mk-room-proof" onClick={onStory}>
          <span className="mk-room-proof-tag">A true story</span>
          <span className="mk-room-proof-h">
            Adam Flambo turned his room into a <span className="pink">printed magazine.</span>
          </span>
          <span className="mk-room-proof-b">
            Six Stockholm photo walks. 334 photos, uploaded by the people who came.
            Because every one carried a name and their consent, he printed them —
            with 26 pullupers as credited contributors.
          </span>
          <span className="mk-room-proof-cta">Read Adam's story <ArrowRight size={16} /></span>
        </button>
      </Reveal>
    </section>
  );
}

/* ─── The marketing scroll ───
   Two movements over a cinematic dark→light→dark rhythm. Movement I is the
   guest's story, told top-down as they live it: the dark hero (real rooms
   drifting behind a cursor spotlight) → the immersive page → the door closing
   → the private room. Movement II flips to the host: the machine, as tight
   feature rows on the bright control-room canvas. Brand-soul kept: pink accent,
   the eyes, pixel cursor, trust marquee. */
// The landing is one page for everyone — logged in or out. It never reads auth
// state: it always offers "Log in" / "Get started". A returning user either
// taps in (the /login + /start action validates the session and drops them in
// their room) or goes straight to their room URL. Keeping the public page
// auth-agnostic is what makes it stable — no optimistic redirect off a token
// that might be dead.
function MarketingScroll({ onGetStarted, onStartHosting, onLogin, onStory }) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      const doc = document.documentElement;
      const max = (doc.scrollHeight || 1) - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cursor spotlight — the hero's real event posters sit in the dark; the
  // pointer position drives a radial clearing that "lights up" whatever the
  // visitor points at. Pure CSS vars, throttled to rAF-free set (cheap).
  const onHeroMove = (e) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };

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

  return (
    <div className="mk">
      {/* ─── scroll-progress rail — a thin pink line tracking depth ─── */}
      <div className="mk-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* ─── Top bar — wordmark + log in / get started. Over the dark hero it's
          light; once scrolled it snaps to a white glass bar. ─── */}
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

      {/* ─── HERO — a cinematic dark stage of real rooms, lit by the cursor ─── */}
      <section
        className="mk-hero"
        data-mk-section="hero"
        data-mk-order="1"
        ref={heroRef}
        onMouseMove={onHeroMove}
      >
        <HeroPosterField />
        <div className="mk-hero-spot" aria-hidden="true" />
        <div className="mk-hero-atmos" aria-hidden="true" />
        <div className="mk-grain" aria-hidden="true" />

        <div className="mk-hero-center">
          <Reveal delay={0.06}>
            <p className="mk-eyebrow mk-eyebrow-live">
              <span className="mk-eyebrow-dot" />
              The event platform for creators
            </p>
          </Reveal>
          <h1 className="mk-hero-h">
            <span className="mk-hero-line"><span style={{ animationDelay: "0.12s" }}>Where your followers</span></span>
            <span className="mk-hero-line"><span className="mk-grad" style={{ animationDelay: "0.24s" }}>become your people.</span></span>
          </h1>
          <Reveal delay={0.36}>
            <p className="mk-hero-sub">
              You've spent years growing an audience you don't own. PullUp turns it
              into a community you do — one night, one room, one real relationship
              at a time.
            </p>
          </Reveal>
          <Reveal delay={0.44}>
            <LiveRotator />
          </Reveal>
          <Reveal delay={0.5}>
            <div className="mk-hero-cta">
              <button
                type="button"
                className="mk-cta mk-cta-glow"
                onClick={() => {
                  trackEvent("cta_click", { location: "hero" });
                  onGetStarted();
                }}
              >
                Start hosting
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="mk-hero-ghost"
                onClick={() => {
                  trackEvent("cta_click", { location: "hero_login" });
                  onLogin();
                }}
              >
                Log in
              </button>
            </div>
          </Reveal>
          <Reveal delay={0.56}>
            <p className="mk-hero-proof">
              <strong>125 kr/month</strong>&nbsp;· cancel anytime · your data stays yours
            </p>
          </Reveal>
        </div>

        {/* trust lands with the hero — brands visible without a scroll */}
        <div className="mk-hero-brands" data-mk-section="proof" data-mk-order="2">
          <Reveal delay={0.62} y={10}>
            <p className="mk-proof-label">Trusted by the rooms you already know</p>
          </Reveal>
          <Reveal delay={0.66} y={0}>
            <LogoMarquee invert />
          </Reveal>
        </div>

        <span className="mk-hero-scrollcue" aria-hidden="true" />
      </section>

      {/* ════════ THE PROBLEM — reach is not relationship ════════ */}
      <ProblemSection />

      {/* ════════ THE TURN — the one moment it all hinges on ════════ */}
      <PullUpSection />

      {/* ════════ THE JOURNEY — one follower becomes one of your people ════════ */}
      <JourneySection />

      {/* ════════ THE FLIP — the feeling ends, the machine begins ════════ */}
      <section className="mk-flip" data-mk-section="flip" data-mk-order="6">
        <div className="mk-grain" aria-hidden="true" />
        <Reveal><p className="mk-flip-a">That's what turns a follower into someone who shows up.</p></Reveal>
        <Reveal delay={0.12}>
          <p className="mk-flip-b">
            Here's the machine <span className="pink">that makes it happen.</span>
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

      {/* ════════ THE MACHINE — sticky-rail scrollytelling of the tools ════════ */}
      <MachineSection />

      {/* ════════ OWNERSHIP — the asset is yours, and only yours ════════ */}
      <OwnershipSection />

      {/* ════════ THE ROOM PAYS OFF — sell to the people who show up ════════ */}
      <RoomCommerceSection onStory={onStory} />

      {/* ─── JOIN (pricing — one honest number, then the door. The old
          waitlist is retired: the subscription IS the gate now.) ─── */}
      <section id="join" className="mk-final" data-mk-section="join" data-mk-order="12">
        <div className="mk-grain" aria-hidden="true" />
        <div className="mk-final-glow" aria-hidden="true" />
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
            Your events, your community page, your products, your inbox, your CRM —
            and a database that stays yours to keep. 125 kr/month plus 3% on paid
            tickets. Cancel anytime; your people and your data stay yours either way.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mk-join">
            <button
              type="button"
              className="mk-cta mk-cta-glow"
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
              className="mk-final-login"
              onClick={() => {
                trackEvent("cta_click", { location: "join_login" });
                onLogin();
              }}
            >
              Already hosting? Log in
            </button>
          </div>
        </Reveal>
        <Reveal delay={0.26}>
          <p className="mk-final-agency">
            Running a team or agency? The Agency plan is coming soon —{" "}
            <a href="mailto:hello@pullup.se">say hi</a>{" "}
            and we'll onboard you personally meanwhile.
          </p>
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
        onStory={() => navigate("/stories/adam-flambo")}
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

  /* ─── scroll-progress rail ─── */
  .mk-progress {
    position: fixed; top: 0; left: 0; right: 0; z-index: 60;
    height: 2.5px; background: transparent; pointer-events: none;
  }
  .mk-progress span {
    display: block; height: 100%; width: 100%;
    transform-origin: 0 50%; transform: scaleX(0);
    background: linear-gradient(90deg, ${PINK}, #ff5cc0);
    box-shadow: 0 0 12px rgba(236,23,143,0.6);
    transition: transform 0.08s linear;
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
  .mk-nav-brand img { height: 26px; width: auto; display: block; transition: filter 0.3s; }
  /* over the dark hero the wordmark inverts to white; the glass bar restores it */
  .mk-nav:not(.is-scrolled) .mk-nav-brand img { filter: brightness(0) invert(1); }
  .mk-nav-actions { display: flex; align-items: center; gap: clamp(8px, 2vw, 20px); }
  .mk-nav-login {
    background: none; border: 0; padding: 8px 6px;
    font: inherit; font-size: 14px; font-weight: 500;
    color: rgba(10,10,10,0.6);
    transition: color 0.18s;
  }
  .mk-nav:not(.is-scrolled) .mk-nav-login { color: rgba(255,255,255,0.72); }
  .mk-nav-login:hover { color: ${INK}; }
  .mk-nav:not(.is-scrolled) .mk-nav-login:hover { color: #fff; }
  @media (max-width: 380px) { .mk-nav-login { display: none; } }
  .mk-nav-cta {
    padding: 9px 20px; border-radius: 999px; border: 0;
    background: ${PINK}; color: #fff;
    font: inherit; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 20px -8px rgba(236,23,143,0.7);
    transition: transform 0.18s, box-shadow 0.18s, background 0.18s;
  }
  .mk-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px -8px rgba(236,23,143,0.85); }

  /* ─── shared section frame ─── */
  .mk-eyebrow {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.42);
    font-weight: 600;
  }
  .mk-h2 {
    margin: 0 0 28px;
    font-size: clamp(30px, 5.4vw, 52px);
    font-weight: 800; letter-spacing: -0.03em; line-height: 1.06;
  }

  /* ════════ HERO — cinematic dark stage ════════ */
  .mk-hero {
    position: relative;
    /* exactly one viewport: copy centered, brand marquee riding the fold.
       svh (not dvh) so mobile URL-bar collapse can't push it under. */
    box-sizing: border-box;
    min-height: 100svh;
    display: flex; flex-direction: column;
    padding: clamp(72px, 10vh, 96px) clamp(22px, 6vw, 48px) 0;
    background: ${NIGHT};
    color: #fff;
    isolation: isolate;
    --mx: 50%; --my: 40%;
  }
  /* base cinematic atmosphere: a dark vignette + top fade (under the nav) and a
     bottom fade that dissolves the dark into the white journey act below */
  .mk-hero-atmos {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(120% 80% at 50% 8%, rgba(236,23,143,0.14), transparent 46%),
      linear-gradient(180deg, rgba(8,8,14,0.72) 0%, rgba(8,8,14,0.1) 22%, rgba(8,8,14,0.1) 62%, rgba(8,8,14,0.86) 88%, ${NIGHT} 100%);
  }
  /* the cursor spotlight: near the pointer the posters are clear (bright);
     away they fall into the dark. one radial does both jobs. */
  .mk-hero-spot {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: radial-gradient(38vmax 38vmax at var(--mx) var(--my),
      rgba(8,8,14,0.05) 0%,
      rgba(8,8,14,0.55) 42%,
      rgba(8,8,14,0.9) 78%);
    transition: background 0.12s linear;
  }
  @media (hover: none) {
    /* no pointer to track — hold a calm centered spotlight */
    .mk-hero-spot { background: radial-gradient(46vmax 46vmax at 50% 38%, rgba(8,8,14,0.12) 0%, rgba(8,8,14,0.78) 70%); }
  }
  .mk-hero-center {
    position: relative; z-index: 3;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 18px; text-align: center;
    padding: 0 0 clamp(24px, 5vh, 56px);
  }
  .mk-eyebrow-live {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 7px 15px 7px 12px; border-radius: 999px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    color: rgba(255,255,255,0.82);
    letter-spacing: 0.14em; font-size: 11px;
  }
  .mk-eyebrow-dot {
    width: 7px; height: 7px; border-radius: 999px; background: #34e39b;
    box-shadow: 0 0 0 3px rgba(52,227,155,0.22), 0 0 12px rgba(52,227,155,0.7);
    animation: proofpulse 2.2s ease-in-out infinite;
  }
  .mk-hero-h {
    margin: 0;
    font-size: clamp(42px, 7vw, 92px);
    font-weight: 850; letter-spacing: -0.04em; line-height: 0.98;
    max-width: 15ch;
  }
  .mk-hero-line { display: block; overflow: hidden; padding-bottom: 0.04em; }
  .mk-hero-line > span {
    display: block;
    transform: translateY(110%);
    animation: mk-riseline 0.95s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  @keyframes mk-riseline { to { transform: translateY(0); } }
  /* the pink line: an animated gradient wash + a soft bloom */
  .mk-grad {
    background: linear-gradient(100deg, #ff5cc0 0%, ${PINK} 40%, #ff77cb 70%, ${PINK} 100%);
    background-size: 260% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: mk-riseline 0.95s cubic-bezier(0.16,1,0.3,1) forwards, mk-shimmer 6s ease-in-out infinite 1s;
    filter: drop-shadow(0 6px 30px rgba(236,23,143,0.35));
  }
  @keyframes mk-shimmer { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  .mk-hero-sub {
    margin: 0;
    font-size: clamp(16px, 2.1vw, 21px);
    line-height: 1.5;
    color: rgba(255,255,255,0.7);
    max-width: 44ch;
  }
  /* live rotator — the honest "rooms live right now" proof line */
  .mk-live {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 16px; border-radius: 999px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: 13px; color: rgba(255,255,255,0.62);
    max-width: 92vw;
  }
  .mk-live-dot {
    width: 8px; height: 8px; border-radius: 999px; background: ${PINK}; flex: 0 0 auto;
    box-shadow: 0 0 0 3px rgba(236,23,143,0.22), 0 0 10px rgba(236,23,143,0.8);
    animation: proofpulse 1.8s ease-in-out infinite;
  }
  .mk-live-label { font-weight: 700; color: rgba(255,255,255,0.82); letter-spacing: 0.01em; }
  .mk-live-sep { width: 3px; height: 3px; border-radius: 999px; background: rgba(255,255,255,0.3); flex: 0 0 auto; }
  .mk-live-ev {
    min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-weight: 600; color: #fff;
    animation: mk-live-in 0.5s ease;
  }
  .mk-live-ev em { font-style: normal; color: rgba(255,255,255,0.5); font-weight: 500; }
  @keyframes mk-live-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .mk-hero-cta {
    display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: center;
    margin-top: 6px;
  }
  .mk-hero-ghost {
    padding: 14px 26px; border-radius: 999px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff; font: inherit; font-size: 15px; font-weight: 600;
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    transition: background 0.18s, border-color 0.18s, transform 0.18s;
  }
  .mk-hero-ghost:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.4); transform: translateY(-1px); }
  .mk-hero-proof {
    margin: 2px 0 0;
    font-size: 13.5px; color: rgba(255,255,255,0.5);
  }
  .mk-hero-proof strong { color: #fff; font-weight: 800; }
  /* the trust band rides inside the hero at the fold */
  .mk-hero-brands {
    position: relative; z-index: 3;
    flex: 0 0 auto;
    margin: 0 calc(-1 * clamp(22px, 6vw, 48px));
    padding: 4px 0 2px;
    text-align: center;
  }
  .mk-hero-brands .mk-proof-label {
    margin-bottom: 0;
    font-size: 10px; letter-spacing: 0.24em;
    color: rgba(255,255,255,0.34);
  }
  .mk-hero-brands .logo-marquee { padding: 12px 0 20px; }
  /* a soft scroll cue — a falling comet line at the base of the hero */
  .mk-hero-scrollcue {
    position: absolute; left: 50%; bottom: 14px; z-index: 3;
    width: 1px; height: 34px; transform: translateX(-50%);
    background: linear-gradient(180deg, transparent, rgba(255,255,255,0.5));
    overflow: hidden;
  }
  .mk-hero-scrollcue::after {
    content: ""; position: absolute; left: 0; top: -34px; width: 1px; height: 34px;
    background: linear-gradient(180deg, transparent, #fff);
    animation: mk-cue 2.4s cubic-bezier(0.5,0,0.5,1) infinite;
  }
  @keyframes mk-cue { 0% { top: -34px; } 60%,100% { top: 34px; } }
  @media (max-width: 920px) {
    .mk-hero { padding-top: 96px; }
    .mk-hero-h { font-size: clamp(40px, 11vw, 64px); }
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
    box-shadow: 0 24px 60px -22px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
  }
  .mk-hf-card img,
  .mk-hf-card video {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; display: block;
  }
  .mk-hf-card::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 44%, rgba(0,0,0,0) 64%);
  }
  .mk-hf-meta {
    position: absolute; left: 16px; right: 16px; bottom: 14px; z-index: 1;
    text-align: left; color: #fff;
  }
  .mk-hf-meta p { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.25; letter-spacing: -0.01em; }
  .mk-hf-meta span { display: block; margin-top: 3px; font-size: 11.5px; color: rgba(255,255,255,0.72); font-weight: 500; }

  /* ─── the filmic grain overlay (dark acts only) ─── */
  .mk-grain {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    opacity: 0.4; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 160px 160px;
  }

  /* ─── the primary CTA (pink, glowing) ─── */
  .mk-cta {
    position: relative;
    display: inline-flex; align-items: center; gap: 9px;
    padding: 16px 32px; border-radius: 999px; border: 0;
    background: ${PINK}; color: #fff;
    font: inherit; font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    box-shadow: 0 10px 34px -8px rgba(236,23,143,0.6);
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s;
  }
  .mk-cta:hover { transform: translateY(-2px); box-shadow: 0 18px 48px -10px rgba(236,23,143,0.75); }
  .mk-cta:active { transform: translateY(0); }
  .mk-cta svg { transition: transform 0.2s; }
  .mk-cta:hover svg { transform: translateX(3px); }
  /* an animated bloom ring behind the button — the 'alive' pulse */
  .mk-cta-glow::before {
    content: ""; position: absolute; inset: -3px; z-index: -1; border-radius: inherit;
    background: conic-gradient(from 0deg, ${PINK}, #ff77cb, #7b2ff7, ${PINK});
    filter: blur(11px); opacity: 0.55;
    animation: mk-spin 6s linear infinite;
  }
  @keyframes mk-spin { to { transform: rotate(360deg); } }

  @keyframes proofpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

  /* ════════ ACT II · THE PROBLEM (reach vs relationship) ════════ */
  .mk-problem {
    max-width: 1080px; margin: 0 auto;
    padding: clamp(80px, 14vh, 150px) clamp(22px, 6vw, 48px);
    text-align: center;
  }
  .mk-problem-head { max-width: 720px; margin: 0 auto clamp(44px, 7vh, 72px); }
  .mk-problem-lede {
    margin: 18px 0 0; font-size: clamp(17px, 2.2vw, 21px); line-height: 1.6;
    color: rgba(10,10,10,0.6);
  }
  .mk-vs {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch;
    gap: clamp(14px, 2.2vw, 28px); text-align: left;
  }
  .mk-vs-card {
    position: relative; overflow: hidden;
    display: flex; flex-direction: column;
    padding: clamp(24px, 3vw, 38px); border-radius: 26px; min-height: 340px;
  }
  .mk-vs-label { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .mk-vs-num { margin-top: 12px; font-size: clamp(40px, 6vw, 62px); font-weight: 850; letter-spacing: -0.04em; line-height: 1; }
  .mk-vs-sub { margin-top: 4px; font-size: 13px; font-weight: 600; }
  .mk-vs-list { list-style: none; margin: auto 0 0; padding: 20px 0 0; display: flex; flex-direction: column; gap: 10px; }
  .mk-vs-list li { position: relative; padding-left: 22px; font-size: 14.5px; font-weight: 600; }
  .mk-vs-list li::before { content: ""; position: absolute; left: 0; top: 6px; width: 10px; height: 10px; border-radius: 3px; }
  /* reach — muted, rented, crossed out */
  .mk-vs-reach { background: linear-gradient(180deg, #f6f6f7, #ededee); border: 1px solid rgba(10,10,10,0.08); }
  .mk-vs-reach .mk-vs-label { color: rgba(10,10,10,0.4); }
  .mk-vs-reach .mk-vs-num { color: rgba(10,10,10,0.34); }
  .mk-vs-reach .mk-vs-sub { color: rgba(10,10,10,0.42); }
  .mk-vs-reach .mk-vs-list li { color: rgba(10,10,10,0.5); text-decoration: line-through; text-decoration-color: rgba(10,10,10,0.22); }
  .mk-vs-reach .mk-vs-list li::before { background: rgba(10,10,10,0.18); }
  .mk-vs-dots { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px; margin-top: 20px; }
  .mk-vs-dots span { aspect-ratio: 1; border-radius: 999px; background: rgba(10,10,10,0.1); }
  /* relationships — vivid, owned, alive */
  .mk-vs-rel {
    background: linear-gradient(168deg, #16111b, #0a0a0e);
    border: 1px solid rgba(236,23,143,0.4); color: #fff;
    box-shadow: 0 44px 100px -54px rgba(236,23,143,0.65);
  }
  .mk-vs-rel .mk-vs-label { color: ${PINK}; }
  .mk-vs-rel .mk-vs-num { color: #fff; }
  .mk-vs-rel .mk-vs-sub { color: rgba(255,255,255,0.6); }
  .mk-vs-rel .mk-vs-list li { color: rgba(255,255,255,0.9); }
  .mk-vs-rel .mk-vs-list li::before { background: ${PINK}; box-shadow: 0 0 10px rgba(236,23,143,0.8); }
  .mk-vs-avs { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 20px; }
  .mk-vs-avs span { width: 24px; height: 24px; border-radius: 999px; border: 1.5px solid rgba(255,255,255,0.25); }
  .mk-vs-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; }
  .mk-vs-arrow {
    display: flex; align-items: center; justify-content: center;
    width: 46px; height: 46px; border-radius: 999px; background: ${PINK}; color: #fff;
    box-shadow: 0 12px 30px -8px rgba(236,23,143,0.6);
  }
  .mk-vs-mid-t { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${PINK}; }
  .mk-problem-foot {
    margin: clamp(40px, 6vh, 64px) 0 0;
    font-size: clamp(22px, 3.6vw, 34px); font-weight: 850; letter-spacing: -0.03em;
  }
  @media (max-width: 760px) {
    .mk-vs { grid-template-columns: 1fr; }
    .mk-vs-mid { flex-direction: row; padding: 2px 0; }
    .mk-vs-mid .mk-vs-arrow { transform: rotate(90deg); }
    .mk-vs-card { min-height: 0; }
  }

  /* ════════ ACT III · THE TURN (pull up) ════════ */
  .mk-turn {
    position: relative; isolation: isolate; overflow: hidden;
    background: ${NIGHT}; color: #fff; text-align: center;
    padding: clamp(96px, 18vh, 200px) clamp(22px, 6vw, 48px);
  }
  .mk-turn > * { position: relative; z-index: 1; }
  .mk-turn .mk-grain { z-index: 0; }
  .mk-turn-glow {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: radial-gradient(50% 56% at 50% 52%, rgba(236,23,143,0.3), transparent 62%);
    animation: mk-breathe 7s ease-in-out infinite;
  }
  .mk-turn-a { margin: 14px 0 2px; font-size: clamp(15px, 2vw, 19px); font-weight: 600; color: rgba(255,255,255,0.55); }
  .mk-turn-word {
    margin: 0; font-size: clamp(72px, 17vw, 200px); font-weight: 850; letter-spacing: -0.05em; line-height: 0.9;
    background: linear-gradient(100deg, #ff5cc0, ${PINK} 45%, #ff88d2);
    background-size: 220% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    filter: drop-shadow(0 12px 55px rgba(236,23,143,0.5));
    animation: mk-shimmer 6s ease-in-out infinite;
  }
  .mk-turn-dot { -webkit-text-fill-color: #fff; color: #fff; }
  .mk-turn-body {
    margin: clamp(26px, 4.5vh, 40px) auto 0; max-width: 56ch;
    font-size: clamp(16px, 2.2vw, 21px); line-height: 1.6; color: rgba(255,255,255,0.72);
  }

  /* ════════ ACT VI · OWNERSHIP (the asset is yours) ════════ */
  .mk-own {
    position: relative;
    padding: clamp(80px, 13vh, 140px) clamp(22px, 6vw, 48px);
    text-align: center;
    background: linear-gradient(180deg, #faf8fb 0%, #fff 60%);
    border-top: 1px solid rgba(10,10,10,0.05);
  }
  .mk-own > * { max-width: 1140px; margin-left: auto; margin-right: auto; }
  .mk-own-head { max-width: 760px; margin: 0 auto clamp(40px, 6vh, 64px); }
  .mk-own-lede { margin: 18px 0 0; font-size: clamp(16px, 2.1vw, 20px); line-height: 1.65; color: rgba(10,10,10,0.6); }
  .mk-own-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(12px, 1.6vw, 18px); text-align: left; }
  .own-card--lg { padding: clamp(22px, 2.4vw, 28px); border-radius: 22px; min-height: 178px; }
  .own-card--lg .own-card-ic { width: 44px; height: 44px; border-radius: 14px; margin-bottom: 6px; }
  .own-card--lg .own-card-t { font-size: 16px; }
  .own-card--lg .own-card-b { font-size: 13.5px; }
  @media (max-width: 900px) { .mk-own-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px) { .mk-own-grid { grid-template-columns: 1fr; } }
  .mk-own-creed {
    margin: clamp(40px, 6vh, 60px) auto 0; display: inline-block;
    padding: 17px 30px; border-radius: 999px;
    background: ${INK}; color: #fff;
    font-size: clamp(18px, 2.6vw, 26px); font-weight: 850; letter-spacing: -0.02em;
    box-shadow: 0 24px 60px -34px rgba(10,10,10,0.6);
  }

  /* ════════ THE ROOM PAYS OFF (room = storefront + Adam proof) ════════ */
  .mk-room {
    max-width: 980px; margin: 0 auto;
    padding: clamp(70px, 12vh, 140px) clamp(22px, 6vw, 48px);
    text-align: center;
  }
  .mk-room-head { max-width: 720px; margin: 0 auto; }
  .mk-room-lede {
    margin: 18px auto 0; max-width: 52ch;
    font-size: clamp(16px, 2.1vw, 20px); line-height: 1.62; color: rgba(10,10,10,0.6);
  }
  .mk-room-chips {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
    margin: clamp(30px, 5vh, 44px) auto clamp(36px, 6vh, 56px);
  }
  .mk-room-chip {
    padding: 10px 18px; border-radius: 999px;
    background: #fff; border: 1px solid rgba(10,10,10,0.12);
    font-size: 14.5px; font-weight: 700; color: ${INK};
    box-shadow: 0 10px 24px -18px rgba(10,10,10,0.4);
  }
  .mk-room-chip:last-child { background: rgba(236,23,143,0.08); border-color: rgba(236,23,143,0.3); color: ${PINK}; }
  /* the Adam proof card — dark, clickable, leads to the case study */
  .mk-room-proof {
    display: block; width: 100%; text-align: left; font: inherit; cursor: pointer;
    padding: clamp(26px, 3.4vw, 40px);
    border-radius: 26px; border: 1px solid rgba(255,255,255,0.1);
    background: linear-gradient(165deg, #16111b, #0a0a0e);
    color: #fff; position: relative; overflow: hidden;
    box-shadow: 0 40px 90px -50px rgba(236,23,143,0.6);
    transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), border-color 0.25s, box-shadow 0.25s;
  }
  .mk-room-proof:hover { transform: translateY(-3px); border-color: rgba(236,23,143,0.4); box-shadow: 0 48px 110px -50px rgba(236,23,143,0.75); }
  .mk-room-proof::after {
    content: ""; position: absolute; top: -40%; right: -10%; width: 340px; height: 340px;
    background: radial-gradient(circle, rgba(236,23,143,0.22), transparent 62%); pointer-events: none;
  }
  .mk-room-proof-tag {
    display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${PINK}; margin-bottom: 14px;
  }
  .mk-room-proof-h {
    display: block; font-size: clamp(22px, 3.2vw, 32px); font-weight: 850; letter-spacing: -0.03em; line-height: 1.08;
  }
  .mk-room-proof-b {
    display: block; margin-top: 14px; max-width: 62ch;
    font-size: clamp(14.5px, 1.8vw, 16px); line-height: 1.6; color: rgba(255,255,255,0.66);
  }
  .mk-room-proof-cta {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 22px;
    font-size: 14.5px; font-weight: 700; color: #fff;
  }
  .mk-room-proof-cta svg { transition: transform 0.2s; }
  .mk-room-proof:hover .mk-room-proof-cta svg { transform: translateX(4px); }

  /* ════════ THE JOURNEY SECTION (pinned scroll-scrub on desktop) ════════ */
  .mk-story { position: relative; }
  /* loop mode (mobile / reduced-motion) — a normal centered section */
  .mk-story-loop {
    max-width: 1060px; margin: 0 auto;
    padding: clamp(72px, 12vh, 130px) clamp(22px, 6vw, 48px);
  }
  .mk-story-loop .mk-story-head { margin-bottom: clamp(40px, 7vh, 72px); }
  /* scroll mode (desktop) — the stage pins for the section's tall scroll span */
  .mk-story-scroll .mk-story-sticky {
    position: sticky; top: 0; height: 100vh; box-sizing: border-box;
    max-width: 1080px; margin: 0 auto;
    padding: clamp(84px, 11vh, 120px) clamp(22px, 6vw, 48px) clamp(28px, 5vh, 52px);
    display: flex; flex-direction: column; justify-content: center;
    gap: clamp(22px, 4vh, 46px);
  }
  .mk-story-head { text-align: center; }
  .mk-story-grid {
    display: grid;
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
    align-items: center;
    gap: clamp(36px, 6vw, 88px);
  }
  /* the step rail — numbered, with a pink spine that fills by scroll progress */
  .mk-story-steps {
    position: relative; list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column;
  }
  .mk-story-spine {
    position: absolute; left: 19px; top: 34px; bottom: 34px; width: 2px;
    border-radius: 2px; background: rgba(10,10,10,0.1); overflow: hidden;
  }
  .mk-story-spine > span {
    display: block; width: 100%;
    background: linear-gradient(180deg, ${PINK}, #ff5cc0);
    transition: height 0.18s linear;
  }
  .mk-story-steps li { position: relative; }
  .mk-story-steps button {
    display: flex; align-items: flex-start; gap: 18px;
    width: 100%; text-align: left;
    background: none; border: 0; padding: 15px 0;
    font: inherit;
  }
  .mk-story-idx {
    position: relative; z-index: 1; flex: 0 0 auto;
    width: 40px; height: 40px; border-radius: 999px; margin-top: -6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums;
    border: 2px solid rgba(10,10,10,0.14); background: #fff; color: rgba(10,10,10,0.4);
    transition: border-color 0.3s, background 0.3s, color 0.3s, box-shadow 0.3s, transform 0.3s;
  }
  .mk-story-steps li.done .mk-story-idx { border-color: ${PINK}; color: ${PINK}; }
  .mk-story-steps li.on .mk-story-idx {
    border-color: ${PINK}; background: ${PINK}; color: #fff;
    box-shadow: 0 0 0 6px rgba(236,23,143,0.14); transform: scale(1.06);
  }
  .mk-story-txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-top: 3px; }
  .mk-story-t {
    font-size: clamp(17px, 2.2vw, 21px); font-weight: 800; letter-spacing: -0.02em;
    color: rgba(10,10,10,0.4);
    transition: color 0.3s;
  }
  .mk-story-steps li.done .mk-story-t { color: rgba(10,10,10,0.6); }
  .mk-story-steps li.on .mk-story-t { color: ${INK}; }
  .mk-story-b {
    font-size: 14px; line-height: 1.5; color: rgba(10,10,10,0.45);
    max-height: 0; opacity: 0; overflow: hidden;
    transition: max-height 0.4s ease, opacity 0.3s ease, margin-top 0.3s ease;
    max-width: 40ch;
  }
  .mk-story-steps li.on .mk-story-b { max-height: 80px; opacity: 1; margin-top: 2px; }
  /* on mobile every step's body just shows (no scrub to reveal it) */
  .mk-story-loop .mk-story-b { max-height: 80px; opacity: 0.65; }
  .mk-story-loop .mk-story-steps li.on .mk-story-b { opacity: 1; }
  /* keep the pinned stage inside one viewport on short desktop windows */
  .mk-story-scroll .mk-jr-phone { width: clamp(214px, 19vw, 272px); }
  .mk-story-scroll .mk-story-head .mk-h2 { font-size: clamp(26px, 3.4vw, 42px); }
  .mk-jr-cue {
    align-self: center; margin-top: 4px;
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(10,10,10,0.3); font-weight: 700;
    animation: mk-cuefade 2.4s ease-in-out infinite;
  }
  @keyframes mk-cuefade { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
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
  .mk-part-tag {
    margin: 0 0 18px;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: ${PINK}; font-weight: 800;
  }
  .mk-flip {
    position: relative; isolation: isolate;
    background: ${NIGHT};
    color: #fff;
    text-align: center;
    padding: clamp(90px, 16vh, 170px) clamp(22px, 6vw, 48px);
    overflow: hidden;
  }
  .mk-flip > * { position: relative; z-index: 1; }
  .mk-flip .mk-grain { z-index: 0; }
  .mk-flip::before {
    content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: radial-gradient(70% 60% at 50% 0%, rgba(236,23,143,0.18), transparent 60%);
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

  /* the turn's content wrapper — sits above grain/glow, carries the parallax */
  .mk-turn-inner { position: relative; z-index: 1; }
  .mk-turn-word { will-change: transform; transition: transform 0.05s linear; }
  .mk-turn-glow { transition: opacity 0.1s linear; }

  /* ════════ THE MACHINE — sticky-rail scrollytelling ════════
     A pinned title/nav column on the left; the four tools scroll up on the
     right and light their nav item + the 01→04 counter as they pass center. */
  .mk-machine { position: relative; }
  .mk-machine-grid {
    max-width: 1220px; margin: 0 auto;
    padding: clamp(30px, 5vh, 70px) clamp(22px, 6vw, 48px) clamp(50px, 9vh, 110px);
    display: grid; grid-template-columns: minmax(0, 4.3fr) minmax(0, 7fr);
    gap: clamp(26px, 5vw, 80px); align-items: start;
  }
  .mk-machine-aside { position: sticky; top: 0; height: 100vh; display: flex; align-items: center; }
  .mk-machine-asidein { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .mk-machine-lede { margin: 2px 0 0; font-size: clamp(15px, 1.8vw, 18px); line-height: 1.6; color: rgba(10,10,10,0.58); max-width: 34ch; }
  .mk-machine-nav { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; }
  .mk-machine-navitem {
    display: flex; align-items: center; gap: 13px; width: 100%; text-align: left;
    background: none; border: 0; padding: 11px 13px; border-radius: 13px;
    font: inherit; font-size: 14.5px; font-weight: 700; color: rgba(10,10,10,0.4);
    transition: background 0.25s, color 0.25s;
  }
  .mk-machine-navitem:hover { color: rgba(10,10,10,0.72); }
  .mk-machine-navitem.on { background: rgba(236,23,143,0.07); color: ${INK}; }
  .mk-machine-navnum {
    font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums;
    color: rgba(10,10,10,0.28); transition: color 0.25s;
  }
  .mk-machine-navitem.on .mk-machine-navnum { color: ${PINK}; }
  .mk-machine-count {
    margin-top: 16px; display: flex; align-items: baseline; gap: 6px;
    font-size: 13px; color: rgba(10,10,10,0.38); font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
  }
  .mk-machine-count b { font-size: 24px; font-weight: 850; color: ${INK}; letter-spacing: -0.02em; }
  .mk-machine-cards { display: flex; flex-direction: column; }
  .mk-machine-cardwrap { min-height: 82vh; display: flex; align-items: center; }
  .mk-machine-cardwrap .mk-bento-cell { width: 100%; }
  @media (max-width: 980px) {
    .mk-machine-grid { grid-template-columns: 1fr; gap: 26px; padding-top: clamp(56px, 8vh, 84px); }
    .mk-machine-aside { position: static; height: auto; display: block; }
    .mk-machine-nav, .mk-machine-count { display: none; }
    .mk-machine-cardwrap { min-height: 0; margin-bottom: 22px; }
  }

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
    /* hero kinetic bits settle immediately */
    .mk-hero-line > span, .mk-grad { transform: none !important; animation: none !important; }
    .mk-grad { -webkit-text-fill-color: transparent; }
    .mk-hero-spot { background: radial-gradient(46vmax 46vmax at 50% 38%, rgba(8,8,14,0.12) 0%, rgba(8,8,14,0.78) 70%) !important; }
    .mk-cta-glow::before, .mk-hero-scrollcue::after, .mk-final-glow, .mk-turn-glow, .mk-turn-word { animation: none !important; }
  }

  /* ─── proof ─── */
  .mk-proof-label {
    margin: 0;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: rgba(10,10,10,0.4); font-weight: 600;
  }

  /* ─── final (dark cinematic bookend) ─── */
  .mk-final {
    position: relative; isolation: isolate; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 22px;
    padding: clamp(90px, 17vh, 190px) clamp(22px, 6vw, 48px) clamp(70px, 12vh, 120px);
    background: ${NIGHT};
    color: #fff;
  }
  .mk-final > * { position: relative; z-index: 1; }
  .mk-final .mk-grain { z-index: 0; }
  .mk-final-glow {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: radial-gradient(60% 50% at 50% 34%, rgba(236,23,143,0.22), transparent 62%);
    animation: mk-breathe 7s ease-in-out infinite;
  }
  @keyframes mk-breathe { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
  .mk-final-eyes { height: clamp(80px, 14vmin, 130px); width: auto; display: block; filter: brightness(0) invert(1); }
  .mk-final-eyes svg { width: 100%; height: 100%; display: block; }
  .mk-final-h {
    margin: 0;
    font-size: clamp(38px, 7vw, 74px);
    font-weight: 850; letter-spacing: -0.04em; line-height: 1.02;
  }
  .mk-final-sub {
    margin: 0; font-size: clamp(16px, 2.3vw, 20px); line-height: 1.55;
    color: rgba(255,255,255,0.66); max-width: 46ch;
  }
  .mk-join { width: 100%; margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .mk-final-login {
    background: none; border: 0; padding: 4px 6px;
    font: inherit; font-size: 14px; font-weight: 500;
    color: rgba(255,255,255,0.6); transition: color 0.18s;
  }
  .mk-final-login:hover { color: #fff; }
  .mk-final-agency {
    margin: 6px 0 0; font-size: 13.5px; line-height: 1.6;
    color: rgba(255,255,255,0.42); max-width: 48ch;
  }
  .mk-final-agency a { color: rgba(255,255,255,0.82); font-weight: 600; text-decoration: none; }
  .mk-final-agency a:hover { color: #fff; }

  /* ─── footer ─── */
  .mk-footer {
    padding: 30px 16px calc(30px + env(safe-area-inset-bottom));
    display: flex; align-items: center; justify-content: center;
    gap: clamp(10px, 3vw, 20px); flex-wrap: wrap;
    font-size: 11px; color: rgba(255,255,255,0.5);
    background: ${NIGHT};
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .mk-footer a { color: inherit; text-decoration: none; }
  .mk-footer a:hover { color: #fff; }
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
  /* inverted for the dark hero — white silhouettes */
  .logo-marquee--invert .logo-marquee-item { opacity: 0.62; }
  .logo-marquee--invert .logo-marquee-item:hover { opacity: 1; }
  .logo-marquee--invert .logo-marquee-item img { filter: brightness(0) invert(1); }


  @media (prefers-reduced-motion: reduce) {
    .logo-marquee-track, .mk-hf-col, .mk-flip-ticker-track { animation: none; }
    .mk-bento-card { transform: none; transition: box-shadow 0.3s ease; }
    .mk-progress span { transition: none; }
  }
`;
