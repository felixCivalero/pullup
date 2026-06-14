import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Check, Instagram } from "lucide-react";
import { publicFetch } from "../lib/api.js";
import { resolveBrand, loadBrandFont } from "../lib/brand.js";
import { trackEvent } from "../lib/analytics.js";
import { PullupEyes } from "../components/PullupEyes.jsx";

// ════════════════════════════════════════════════════════════════════════
// CommunityPage — the public front door to a host's world (/c/:slug).
//
// Shaped like an event page (brand hero, social proof, one CTA) but it doesn't
// end and there's no date: JOIN is a durable membership, not a one-night RSVP.
// Guest-facing/dark, host-brandable. Submitting runs the backend identity
// spine (same as RSVP) and drops the person into the host's Room.
// ════════════════════════════════════════════════════════════════════════

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

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

  const brand = useMemo(() => resolveBrand(state.community?.brand), [state.community]);
  useEffect(() => { loadBrandFont(brand); }, [brand]);

  const vars = {
    "--bg": brand.background,
    "--ink": brand.textColor,
    "--primary": brand.primaryColor,
    "--ink-on-primary": brand.inkOnPrimary,
    "--font": brand.fontCss,
  };

  if (state.loading) {
    return <div style={{ ...vars, minHeight: "100dvh", background: "var(--bg)" }} />;
  }

  if (state.error) {
    return (
      <div style={{ ...vars, minHeight: "100dvh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
        <PullupEyes variant="big" />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          {state.error === "not_found" ? "This community isn't here." : "Something went wrong."}
        </h1>
        <p style={{ opacity: 0.6, margin: 0 }}>The link may be old, or the host paused it.</p>
      </div>
    );
  }

  const c = state.community;
  const hostName = c.host?.name || c.host?.brand || null;
  const count = c.memberCount || 0;
  const faces = (c.recentMembers || []).slice(0, 5);

  return (
    <div style={{ ...vars, minHeight: "100dvh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font)" }}>
      <style>{STYLES}</style>
      <div className="cm-wrap">
        <div className="cm-head">
          {c.host?.avatarUrl ? (
            <img src={c.host.avatarUrl} alt={hostName || "host"} className="cm-host-av" />
          ) : (
            <PullupEyes variant="big" className="cm-eyes" />
          )}
          {hostName && <p className="cm-eyebrow">{hostName}'s community</p>}
          <h1 className="cm-title">{c.title || "Join the community"}</h1>
          {c.blurb && <p className="cm-blurb">{c.blurb}</p>}

          {count > 0 && (
            <div className="cm-proof">
              {faces.length > 0 && (
                <div className="cm-faces">
                  {faces.map((m, i) => (
                    <span className="cm-face" key={i} title={m.name || ""}>{initialsOf(m.name)}</span>
                  ))}
                </div>
              )}
              <span className="cm-proof-txt"><strong>{count.toLocaleString()}</strong> {count === 1 ? "person has" : "people have"} pulled up</span>
            </div>
          )}
        </div>

        {joined ? (
          <div className="cm-done">
            <span className="cm-done-ic"><Check size={28} /></span>
            <p className="cm-done-t">You're in.</p>
            <p className="cm-done-b">
              You're part of {hostName ? `${hostName}'s` : "the"} community now — you'll hear about
              what's next first. Keep an eye on your inbox.
            </p>
          </div>
        ) : (
          <JoinForm slug={slug} onJoined={() => { setJoined(true); trackEvent("community_joined", { slug }); }} />
        )}
      </div>
    </div>
  );
}

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
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          instagram: instagram.trim() || null,
          source: "link",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "failed");
      }
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

const STYLES = `
  .cm-wrap { max-width: 460px; margin: 0 auto; padding: clamp(40px, 8vh, 88px) 22px 56px; display: flex; flex-direction: column; gap: 30px; }
  .cm-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
  .cm-eyes { width: 64px; height: auto; }
  .cm-host-av { width: 72px; height: 72px; border-radius: 999px; object-fit: cover; }
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
