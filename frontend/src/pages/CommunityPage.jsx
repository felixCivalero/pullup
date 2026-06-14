import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Check, Instagram } from "lucide-react";
import { publicFetch } from "../lib/api.js";
import { pickTextColor, FONTS, loadFont } from "../lib/brand.js";
import { trackEvent } from "../lib/analytics.js";
import { PullupEyes } from "../components/PullupEyes.jsx";

// ════════════════════════════════════════════════════════════════════════
// The public front door to a host's world (/c/:slug). Shaped like an event
// page (brand hero, social proof, one CTA) but it doesn't end and there's no
// date: JOIN is a durable membership, not a one-night RSVP.
//
// CommunityView is the presentational shell — used by BOTH this public page
// and the host editor's live preview (the editor is preview-first, like the
// event editor, so what the host edits IS this exact component).
// ════════════════════════════════════════════════════════════════════════

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_BG = "#0a0617";
const DEFAULT_PRIMARY = "#ec178f";

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Community brand uses the SAME shape as events (events.brand / BrandThemeEditor):
//   { backgroundColor, buttonColor, buttonTextColor, buttonFontFamily }
// Resolve it to the CSS vars the view renders from (defaults = PullUp dark).
function brandVars(brand) {
  const b = brand || {};
  const bg = b.backgroundColor || DEFAULT_BG;
  const primary = b.buttonColor || DEFAULT_PRIMARY;
  const fontName = b.buttonFontFamily || "Inter";
  const fontCss = (FONTS.find((f) => f.name === fontName) || {}).family || '"Inter", sans-serif';
  return {
    fontName,
    vars: {
      "--bg": bg,
      "--ink": pickTextColor(bg),
      "--primary": primary,
      "--ink-on-primary": b.buttonTextColor || pickTextColor(primary),
      "--font": fontCss,
    },
  };
}

function Proof({ count, faces }) {
  if (!count) return null;
  return (
    <div className="cm-proof">
      {faces.length > 0 && (
        <div className="cm-faces">
          {faces.map((m, i) => <span className="cm-face" key={i} title={m.name || ""}>{initialsOf(m.name)}</span>)}
        </div>
      )}
      <span className="cm-proof-txt"><strong>{count.toLocaleString()}</strong> {count === 1 ? "person has" : "people have"} pulled up</span>
    </div>
  );
}

// ── Presentational shell (no data fetching) — used by the public page AND the
// host editor's live preview. With a cover it's a full-bleed image landing
// (like an event page); without one it falls back to the centered eyes layout.
//
// onEditPart (editor-only): click a region to open its panel —
// onEditPart({ kind: "cover" | "details" }).
export function CommunityView({ community, joinSlot, fill = false, onEditPart = null }) {
  const c = community || {};
  const { fontName, vars } = useMemo(() => brandVars(c.brand), [c.brand]);
  useEffect(() => { loadFont(fontName); }, [fontName]);

  const hostName = c.host?.name || c.host?.brand || null;
  const count = c.memberCount || 0;
  const faces = (c.recentMembers || []).slice(0, 5);
  const cover = c.coverImageUrl || null;
  const title = c.title || "Join the community";
  const edit = (kind) => (e) => { e?.stopPropagation?.(); onEditPart?.({ kind }); };
  const editable = !!onEditPart;

  return (
    <div style={{ ...vars, minHeight: fill ? "100%" : "100dvh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font)" }}>
      <style>{STYLES}</style>

      {cover ? (
        <>
          {/* Full-bleed image landing — the cover IS the first screen, with the
              identity overlaid at the bottom over a gradient. */}
          <div className={`cm-hero${editable ? " cm-editable" : ""}`} style={{ backgroundImage: `url(${cover})` }} onClick={editable ? edit("cover") : undefined}>
            <div className="cm-hero-grad" />
            {editable && <button type="button" className="cm-editbtn cm-editbtn--cover" onClick={edit("cover")}>✎ Cover</button>}
            <div className={`cm-hero-content${editable ? " cm-editable" : ""}`} onClick={editable ? edit("details") : undefined}>
              {c.host?.avatarUrl && <img src={c.host.avatarUrl} alt={hostName || "host"} className="cm-hero-av" />}
              {hostName && <p className="cm-eyebrow">{hostName}'s community</p>}
              <h1 className="cm-title">{title}</h1>
              {c.blurb && <p className="cm-blurb">{c.blurb}</p>}
              <Proof count={count} faces={faces} />
            </div>
          </div>
          <div className="cm-body">{joinSlot}</div>
        </>
      ) : (
        <div className="cm-wrap">
          <div className={`cm-head${editable ? " cm-editable" : ""}`} onClick={editable ? edit("details") : undefined}>
            {c.host?.avatarUrl
              ? <img src={c.host.avatarUrl} alt={hostName || "host"} className="cm-host-av" />
              : <PullupEyes variant="big" className="cm-eyes" />}
            {hostName && <p className="cm-eyebrow">{hostName}'s community</p>}
            <h1 className="cm-title">{title}</h1>
            {c.blurb && <p className="cm-blurb">{c.blurb}</p>}
            <Proof count={count} faces={faces} />
            {editable && <button type="button" className="cm-editbtn cm-editbtn--add" onClick={edit("cover")}>✎ Add a cover image</button>}
          </div>
          {joinSlot}
        </div>
      )}
    </div>
  );
}

// ── The live join form (public page only) ────────────────────────────────
function JoinForm({ slug, onJoined }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const valid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!valid) { setError("Add your name and a valid email."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await publicFetch(`/communities/${slug}/join`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), instagram: instagram.trim() || null, source: "link" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || "failed"); }
      onJoined();
    } catch (err) {
      setError((err?.message || "").includes("invalid") ? "That email doesn't look right." : "Couldn't join just now. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="cm-form" onSubmit={submit}>
      <input className="cm-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Name" />
      <input className="cm-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" />
      <div className="cm-ig">
        <Instagram size={17} className="cm-ig-ic" />
        <input className="cm-input cm-input--ig" type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram (optional)" aria-label="Instagram" />
      </div>
      <button type="submit" className="cm-join" disabled={submitting || !valid}>
        {submitting ? "Joining…" : "Join the community"}
        {!submitting && <ArrowRight size={17} />}
      </button>
      {error && <p className="cm-err">{error}</p>}
      <p className="cm-fine">Free to join. Your details stay with the host — never sold.</p>
    </form>
  );
}

function JoinedState({ hostName }) {
  return (
    <div className="cm-done">
      <span className="cm-done-ic"><Check size={28} /></span>
      <p className="cm-done-t">You're in.</p>
      <p className="cm-done-b">
        You're part of {hostName ? `${hostName}'s` : "the"} community now — you'll hear about
        what's next first. Keep an eye on your inbox.
      </p>
    </div>
  );
}

// A non-interactive join block for the host editor preview.
export function CommunityJoinPreview() {
  return (
    <form className="cm-form" onSubmit={(e) => e.preventDefault()} aria-hidden="true" style={{ pointerEvents: "none" }}>
      <div className="cm-input cm-input--ghost">Your name</div>
      <div className="cm-input cm-input--ghost">you@example.com</div>
      <div className="cm-input cm-input--ghost">Instagram (optional)</div>
      <div className="cm-join"><span>Join the community</span><ArrowRight size={17} /></div>
      <p className="cm-fine">Free to join. Your details stay with the host — never sold.</p>
    </form>
  );
}

// ── Public page (fetch + state) ──────────────────────────────────────────
export function CommunityPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, community: null, error: null });
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await publicFetch(`/communities/${slug}`);
        if (cancelled) return;
        if (!res.ok) { setState({ loading: false, community: null, error: res.status === 404 ? "not_found" : "error" }); return; }
        const data = await res.json();
        setState({ loading: false, community: data, error: null });
        trackEvent("community_view", { slug });
      } catch {
        if (!cancelled) setState({ loading: false, community: null, error: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (state.loading) return <div style={{ minHeight: "100dvh", background: DEFAULT_BG }} />;

  if (state.error) {
    return (
      <div style={{ minHeight: "100dvh", background: DEFAULT_BG, color: "#fff", fontFamily: '"Inter", sans-serif', display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
        <PullupEyes variant="big" />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{state.error === "not_found" ? "This community isn't here." : "Something went wrong."}</h1>
        <p style={{ opacity: 0.6, margin: 0 }}>The link may be old, or the host paused it.</p>
      </div>
    );
  }

  const hostName = state.community.host?.name || state.community.host?.brand || null;
  return (
    <CommunityView
      community={state.community}
      joinSlot={joined
        ? <JoinedState hostName={hostName} />
        : <JoinForm slug={slug} onJoined={() => { setJoined(true); trackEvent("community_joined", { slug }); }} />}
    />
  );
}

const STYLES = `
  /* Full-bleed image landing (cover present) */
  .cm-hero { position: relative; width: 100%; min-height: clamp(380px, 66vh, 640px); background-size: cover; background-position: center; display: flex; align-items: flex-end; }
  .cm-hero-grad { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 28%, color-mix(in srgb, var(--bg) 35%, transparent) 60%, var(--bg) 100%); }
  .cm-hero-content { position: relative; z-index: 1; width: 100%; max-width: 560px; margin: 0 auto; padding: 0 22px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
  .cm-hero-av { width: 60px; height: 60px; border-radius: 999px; object-fit: cover; border: 3px solid var(--bg); }
  .cm-body { max-width: 460px; margin: 0 auto; padding: 22px 22px 56px; }

  /* Editor-only click affordances */
  .cm-editable { cursor: pointer; }
  .cm-hero.cm-editable:hover { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 70%, transparent); }
  .cm-hero-content.cm-editable:hover, .cm-head.cm-editable:hover { outline: 2px dashed color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 6px; border-radius: 12px; }
  .cm-editbtn { position: absolute; z-index: 2; display: inline-flex; align-items: center; gap: 5px; border: none; cursor: pointer;
    font-family: inherit; font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 999px;
    background: var(--primary); color: var(--ink-on-primary); }
  .cm-editbtn--cover { top: 14px; right: 14px; }
  .cm-editbtn--add { position: static; margin-top: 10px; background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }

  .cm-wrap { max-width: 460px; margin: 0 auto; padding: clamp(40px, 8vh, 88px) 22px 56px; display: flex; flex-direction: column; gap: 30px; }
  .cm-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
  .cm-eyes { width: 64px; height: auto; }
  .cm-host-av { width: 72px; height: 72px; border-radius: 999px; object-fit: cover; }
  .cm-host-av--oncover { width: 60px; height: 60px; margin-top: -50px; border: 3px solid var(--bg); }
  .cm-eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.6; }
  .cm-title { margin: 0; font-size: clamp(30px, 7vw, 44px); font-weight: 850; letter-spacing: -0.03em; line-height: 1.05; }
  .cm-blurb { margin: 2px 0 0; font-size: 16px; line-height: 1.55; opacity: 0.72; max-width: 38ch; }

  .cm-proof { display: inline-flex; align-items: center; gap: 10px; margin-top: 6px; }
  .cm-faces { display: inline-flex; }
  .cm-face { width: 30px; height: 30px; border-radius: 999px; margin-left: -8px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; background: color-mix(in srgb, var(--primary) 28%, var(--bg)); color: var(--ink); border: 2px solid var(--bg); }
  .cm-face:first-child { margin-left: 0; }
  .cm-proof-txt { font-size: 13.5px; opacity: 0.7; }
  .cm-proof-txt strong { opacity: 1; font-weight: 800; }

  .cm-form { display: flex; flex-direction: column; gap: 12px; }
  .cm-input { width: 100%; padding: 15px 16px; border-radius: 13px; box-sizing: border-box; font-size: 16px; font-family: inherit;
    background: color-mix(in srgb, var(--ink) 6%, transparent); border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
    color: var(--ink); outline: none; transition: border-color 0.18s, box-shadow 0.18s; }
  .cm-input::placeholder { color: color-mix(in srgb, var(--ink) 45%, transparent); }
  .cm-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent); }
  .cm-input--ghost { color: color-mix(in srgb, var(--ink) 45%, transparent); display: flex; align-items: center; }
  .cm-ig { position: relative; display: flex; align-items: center; }
  .cm-ig-ic { position: absolute; left: 14px; opacity: 0.5; pointer-events: none; }
  .cm-input--ig { padding-left: 42px; }

  .cm-join { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 4px;
    padding: 16px 0; border-radius: 999px; border: none; cursor: pointer; font-family: inherit; font-size: 15.5px; font-weight: 800;
    background: var(--primary); color: var(--ink-on-primary); transition: transform 0.16s, opacity 0.16s; }
  .cm-join:hover { transform: translateY(-1px); }
  .cm-join:disabled { opacity: 0.45; transform: none; cursor: default; }
  .cm-err { margin: 0; font-size: 13px; color: #ff8585; text-align: center; }
  .cm-fine { margin: 2px 0 0; font-size: 12.5px; opacity: 0.5; text-align: center; }

  .cm-done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 12px 4px; }
  .cm-done-ic { width: 60px; height: 60px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--primary) 20%, transparent); color: var(--primary); }
  .cm-done-t { margin: 0; font-size: 24px; font-weight: 850; letter-spacing: -0.02em; }
  .cm-done-b { margin: 0; max-width: 34ch; font-size: 15px; line-height: 1.55; opacity: 0.72; }
`;
