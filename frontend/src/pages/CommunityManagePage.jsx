import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Users, ExternalLink, ArrowRight } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

// ════════════════════════════════════════════════════════════════════════
// CommunityManagePage — the host sets up their community's public join page.
//
// One community per host (auto-created on first load). Here the host names it,
// writes the pitch, grabs the share link to drop on Instagram, and watches the
// member count climb. Slicing those members (community-only / both / events-
// only) happens in the Room people view.
// ════════════════════════════════════════════════════════════════════════

const PINK = "#ec178f";
const INK = "#0a0a0a";

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function CommunityManagePage() {
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/community");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setCommunity(data);
          setTitle(data.title || "");
          setBlurb(data.blurb || "");
        } else {
          setError("Couldn't load your community.");
        }
      } catch {
        if (!cancelled) setError("Couldn't load your community.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedFetch("/host/community", {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), blurb: blurb.trim() }),
      });
      if (!res.ok) throw new Error("save_failed");
      const data = await res.json();
      setCommunity(data);
      setSavedAt(Date.now());
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!community?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(community.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the field is selectable anyway */ }
  };

  const dirty = community && (title.trim() !== (community.title || "") || blurb.trim() !== (community.blurb || ""));

  if (loading) {
    return <div className="cmm" style={{ minHeight: "60vh" }}><style>{STYLES}</style></div>;
  }

  return (
    <div className="cmm">
      <style>{STYLES}</style>

      <header className="cmm-head">
        <p className="cmm-kicker">Your community</p>
        <h1 className="cmm-h1">The front door to your world.</h1>
        <p className="cmm-sub">
          One link. People who join become part of your world — reachable on every
          channel, pulled into your events. Share it where your people already are.
        </p>
      </header>

      {error && <p className="cmm-error">{error}</p>}

      {/* Member count + share link */}
      <section className="cmm-card cmm-card--accent">
        <div className="cmm-count">
          <Users size={20} />
          <span><strong>{(community?.memberCount || 0).toLocaleString()}</strong> {community?.memberCount === 1 ? "member" : "members"}</span>
        </div>
        {community?.recentMembers?.length > 0 && (
          <div className="cmm-faces">
            {community.recentMembers.slice(0, 8).map((m, i) => (
              <span className="cmm-face" key={i} title={m.name || ""}>{initialsOf(m.name)}</span>
            ))}
          </div>
        )}
        <div className="cmm-share">
          <input className="cmm-link" readOnly value={community?.shareUrl || ""} onFocus={(e) => e.target.select()} />
          <button type="button" className="cmm-copy" onClick={copyLink}>
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
          </button>
        </div>
        {community?.slug && (
          <a className="cmm-preview" href={`/c/${community.slug}`} target="_blank" rel="noopener noreferrer">
            Preview the join page <ExternalLink size={13} />
          </a>
        )}
      </section>

      {/* Editor */}
      <section className="cmm-card">
        <label className="cmm-label">Name</label>
        <input className="cmm-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Nairobi crew" />

        <label className="cmm-label" style={{ marginTop: 16 }}>The pitch</label>
        <textarea className="cmm-input cmm-textarea" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={4}
          placeholder="What is this community, and what do people get for joining? Keep it short and real." />

        <div className="cmm-actions">
          {savedAt > 0 && !dirty && <span className="cmm-saved">Saved</span>}
          <button type="button" className="cmm-save" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <Link to="/room" className="cmm-peoplelink">
        See and filter your members in the Room
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

const STYLES = `
  .cmm { max-width: 640px; margin: 0 auto; padding: clamp(20px, 4vw, 40px) 18px 80px; color: ${INK}; }
  .cmm-head { margin-bottom: 22px; }
  .cmm-kicker { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.42); }
  .cmm-h1 { margin: 0 0 8px; font-size: clamp(26px, 5vw, 34px); font-weight: 850; letter-spacing: -0.03em; line-height: 1.08; }
  .cmm-sub { margin: 0; font-size: 15px; line-height: 1.55; color: rgba(10,10,10,0.6); max-width: 52ch; }
  .cmm-error { margin: 0 0 16px; font-size: 13.5px; color: #c0392b; }

  .cmm-card { background: #fff; border: 1px solid rgba(10,10,10,0.1); border-radius: 18px; padding: 20px; margin-bottom: 16px; box-shadow: 0 18px 44px -38px rgba(10,10,10,0.4); }
  .cmm-card--accent { border-color: rgba(236,23,143,0.25); background: linear-gradient(180deg, rgba(236,23,143,0.04), #fff 60%); }

  .cmm-count { display: flex; align-items: center; gap: 10px; color: ${PINK}; font-size: 15px; }
  .cmm-count strong { color: ${INK}; font-size: 20px; font-weight: 850; }
  .cmm-faces { display: flex; margin: 14px 0 4px; }
  .cmm-face { width: 32px; height: 32px; border-radius: 999px; margin-left: -8px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; background: rgba(236,23,143,0.12); color: ${PINK}; border: 2px solid #fff; }
  .cmm-face:first-child { margin-left: 0; }

  .cmm-share { display: flex; gap: 8px; margin-top: 16px; }
  .cmm-link { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 11px; border: 1px solid rgba(10,10,10,0.16); background: #fff;
    font-size: 14px; font-family: inherit; color: ${INK}; outline: none; }
  .cmm-copy { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 0 16px; border-radius: 11px; border: none;
    background: ${PINK}; color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  .cmm-preview { display: inline-flex; align-items: center; gap: 5px; margin-top: 12px; font-size: 13px; color: rgba(10,10,10,0.55); text-decoration: none; }
  .cmm-preview:hover { color: ${PINK}; }

  .cmm-label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(10,10,10,0.5); margin-bottom: 8px; }
  .cmm-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 12px; border: 1px solid rgba(10,10,10,0.16);
    background: #fff; color: ${INK}; font-size: 15px; font-family: inherit; outline: none; transition: border-color 0.16s, box-shadow 0.16s; }
  .cmm-input:focus { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.14); }
  .cmm-textarea { resize: vertical; line-height: 1.5; }
  .cmm-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 16px; }
  .cmm-saved { font-size: 13px; color: #16a34a; font-weight: 600; }
  .cmm-save { padding: 11px 24px; border-radius: 999px; border: none; background: ${PINK}; color: #fff; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.16s; }
  .cmm-save:disabled { background: rgba(10,10,10,0.1); color: rgba(10,10,10,0.4); cursor: default; }

  .cmm-peoplelink { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; font-weight: 700; color: ${PINK}; text-decoration: none; }
  .cmm-peoplelink:hover { gap: 11px; }
`;
