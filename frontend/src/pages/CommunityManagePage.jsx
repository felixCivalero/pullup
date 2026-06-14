import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, Users, ExternalLink, ImagePlus, Loader2 } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { uploadCommunityCoverDirect } from "../lib/imageUtils.js";
import { BrandThemeEditor } from "../components/BrandThemeEditor.jsx";
import { CommunityView, CommunityJoinPreview } from "./CommunityPage.jsx";

// ════════════════════════════════════════════════════════════════════════
// CommunityManagePage — the community editor, preview-first like the event
// editor. The host edits on the left; the right shows the REAL community page
// (/c/:slug) rendered live from the same component guests see. Copy + controls
// are community-shaped: a cover, a name, the pitch, the theme, the share link,
// and the member count.
// ════════════════════════════════════════════════════════════════════════

const PINK = "#ec178f";
const INK = "#0a0a0a";

export function CommunityManagePage() {
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  // Editable fields (live, drive the preview).
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [brand, setBrand] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [coverPct, setCoverPct] = useState(null); // upload progress, null = idle
  const fileRef = useRef(null);

  const hydrate = (data) => {
    setCommunity(data);
    setTitle(data.title || "");
    setBlurb(data.blurb || "");
    setBrand(data.brand || null);
    setCoverImageUrl(data.coverImageUrl || null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch("/host/community");
        if (cancelled) return;
        if (res.ok) hydrate(await res.json());
        else setError("Couldn't load your community.");
      } catch {
        if (!cancelled) setError("Couldn't load your community.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dirty = community && (
    title.trim() !== (community.title || "") ||
    blurb.trim() !== (community.blurb || "") ||
    JSON.stringify(brand || null) !== JSON.stringify(community.brand || null)
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedFetch("/host/community", {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), blurb: blurb.trim(), brand: brand || null }),
      });
      if (!res.ok) throw new Error("save_failed");
      hydrate(await res.json());
      setSavedAt(Date.now());
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setCoverPct(0);
    try {
      const payload = await uploadCommunityCoverDirect({ file, onProgress: (p) => setCoverPct(Math.round(p)) });
      hydrate(payload); // payload is the host community (incl. new coverImageUrl + counts)
    } catch {
      setError("Cover upload failed. Try a different image.");
    } finally {
      setCoverPct(null);
    }
  };

  const copyLink = async () => {
    if (!community?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(community.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — field is selectable */ }
  };

  // The live object the preview renders — current edits over the loaded payload.
  const preview = useMemo(() => ({
    ...(community || {}),
    title, blurb, brand, coverImageUrl,
  }), [community, title, blurb, brand, coverImageUrl]);

  if (loading) return <div className="cme"><style>{STYLES}</style></div>;

  return (
    <div className="cme">
      <style>{STYLES}</style>

      {/* ── Controls ── */}
      <div className="cme-controls">
        <header className="cme-head">
          <p className="cme-kicker">Your community</p>
          <h1 className="cme-h1">The front door to your world.</h1>
          <p className="cme-sub">One link. People who join become part of your world — reachable on every channel, pulled into your events. This is exactly what they'll see.</p>
        </header>

        {error && <p className="cme-error">{error}</p>}

        {/* Share + members */}
        <section className="cme-card cme-card--accent">
          <div className="cme-count">
            <Users size={18} />
            <span><strong>{(community?.memberCount || 0).toLocaleString()}</strong> {community?.memberCount === 1 ? "member" : "members"}</span>
          </div>
          <div className="cme-share">
            <input className="cme-link" readOnly value={community?.shareUrl || ""} onFocus={(e) => e.target.select()} />
            <button type="button" className="cme-copy" onClick={copyLink}>
              {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
            </button>
          </div>
          {community?.slug && (
            <a className="cme-open" href={`/c/${community.slug}`} target="_blank" rel="noopener noreferrer">
              Open the live page <ExternalLink size={13} />
            </a>
          )}
        </section>

        {/* Cover */}
        <section className="cme-card">
          <p className="cme-label">Cover</p>
          <button type="button" className="cme-cover-btn" onClick={() => fileRef.current?.click()} disabled={coverPct !== null}
            style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : undefined}>
            {coverPct !== null ? (
              <span className="cme-cover-ph"><Loader2 size={18} className="cme-spin" /> Uploading… {coverPct}%</span>
            ) : coverImageUrl ? (
              <span className="cme-cover-replace">Change cover</span>
            ) : (
              <span className="cme-cover-ph"><ImagePlus size={18} /> Add a cover image</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickCover} />
        </section>

        {/* Name + pitch */}
        <section className="cme-card">
          <p className="cme-label">Name</p>
          <input className="cme-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Nairobi crew" />
          <p className="cme-label" style={{ marginTop: 16 }}>The pitch</p>
          <textarea className="cme-input cme-textarea" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={4}
            placeholder="What is this community, and what do people get for joining? Keep it short and real." />
        </section>

        {/* Theme */}
        <section className="cme-card">
          <p className="cme-label">Theme</p>
          <p className="cme-hint">Make the page yours — background, join button, font. It updates in the preview as you go.</p>
          <BrandThemeEditor value={brand} onChange={setBrand} />
        </section>

        <div className="cme-actions">
          {savedAt > 0 && !dirty && <span className="cme-saved">Saved</span>}
          <button type="button" className="cme-save" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* ── Live preview (the real page) ── */}
      <div className="cme-preview">
        <div className="cme-previewbar">Live preview</div>
        <div className="cme-phone">
          <div className="cme-phone-scroll">
            <CommunityView community={preview} joinSlot={<CommunityJoinPreview />} fill />
          </div>
        </div>
      </div>
    </div>
  );
}

const STYLES = `
  .cme { display: grid; grid-template-columns: minmax(0, 460px) 1fr; gap: 0; min-height: 100%; }
  .cme-controls { padding: clamp(20px, 3vw, 36px) clamp(16px, 3vw, 32px) 100px; color: ${INK}; overflow-y: auto; }
  .cme-head { margin-bottom: 20px; }
  .cme-kicker { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(10,10,10,0.42); }
  .cme-h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 30px); font-weight: 850; letter-spacing: -0.03em; line-height: 1.08; }
  .cme-sub { margin: 0; font-size: 14.5px; line-height: 1.55; color: rgba(10,10,10,0.6); }
  .cme-error { margin: 0 0 14px; font-size: 13.5px; color: #c0392b; }

  .cme-card { background: #fff; border: 1px solid rgba(10,10,10,0.1); border-radius: 16px; padding: 18px; margin-bottom: 14px; }
  .cme-card--accent { border-color: rgba(236,23,143,0.25); background: linear-gradient(180deg, rgba(236,23,143,0.04), #fff 60%); }
  .cme-label { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(10,10,10,0.5); }
  .cme-hint { margin: -2px 0 12px; font-size: 12.5px; line-height: 1.45; color: rgba(10,10,10,0.5); }

  .cme-count { display: flex; align-items: center; gap: 10px; color: ${PINK}; font-size: 14.5px; margin-bottom: 14px; }
  .cme-count strong { color: ${INK}; font-size: 19px; font-weight: 850; }
  .cme-share { display: flex; gap: 8px; }
  .cme-link { flex: 1; min-width: 0; padding: 11px 13px; border-radius: 11px; border: 1px solid rgba(10,10,10,0.16); background: #fff; font-size: 13.5px; font-family: inherit; color: ${INK}; outline: none; }
  .cme-copy { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 0 15px; border-radius: 11px; border: none; background: ${PINK}; color: #fff; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .cme-open { display: inline-flex; align-items: center; gap: 5px; margin-top: 12px; font-size: 13px; color: rgba(10,10,10,0.55); text-decoration: none; }
  .cme-open:hover { color: ${PINK}; }

  .cme-cover-btn { width: 100%; height: 132px; border-radius: 13px; cursor: pointer; border: 1px dashed rgba(10,10,10,0.22);
    background-color: rgba(10,10,10,0.03); background-size: cover; background-position: center; color: rgba(10,10,10,0.55);
    display: flex; align-items: flex-end; justify-content: center; padding: 12px; font-family: inherit; transition: border-color 0.16s; position: relative; overflow: hidden; }
  .cme-cover-btn:hover { border-color: ${PINK}; }
  .cme-cover-btn:disabled { cursor: default; }
  .cme-cover-ph { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: rgba(10,10,10,0.6); }
  .cme-cover-replace { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.55); padding: 6px 12px; border-radius: 999px; }
  .cme-spin { animation: cme-spin 0.9s linear infinite; }
  @keyframes cme-spin { to { transform: rotate(360deg); } }

  .cme-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 12px; border: 1px solid rgba(10,10,10,0.16); background: #fff; color: ${INK}; font-size: 15px; font-family: inherit; outline: none; transition: border-color 0.16s, box-shadow 0.16s; }
  .cme-input:focus { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.14); }
  .cme-textarea { resize: vertical; line-height: 1.5; }

  .cme-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 6px; }
  .cme-saved { font-size: 13px; color: #16a34a; font-weight: 600; }
  .cme-save { padding: 12px 26px; border-radius: 999px; border: none; background: ${PINK}; color: #fff; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.16s; }
  .cme-save:disabled { background: rgba(10,10,10,0.1); color: rgba(10,10,10,0.4); cursor: default; }

  .cme-preview { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: 14px;
    padding: 28px 20px; background: radial-gradient(120% 90% at 50% 0%, rgba(236,23,143,0.06), rgba(10,10,10,0.03)); border-left: 1px solid rgba(10,10,10,0.08); }
  .cme-previewbar { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(10,10,10,0.4); font-weight: 700; }
  .cme-phone { width: 390px; max-width: 100%; flex: 1; min-height: 0; border-radius: 38px; padding: 10px; background: #0a0a0a;
    box-shadow: 0 40px 90px -30px rgba(10,10,10,0.5); }
  .cme-phone-scroll { width: 100%; height: 100%; border-radius: 30px; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; background: #000; }

  @media (max-width: 980px) {
    .cme { grid-template-columns: 1fr; }
    .cme-preview { position: relative; height: auto; order: -1; border-left: none; border-bottom: 1px solid rgba(10,10,10,0.08); padding: 18px; }
    .cme-phone { width: 340px; height: 520px; flex: 0 0 auto; }
  }
`;
