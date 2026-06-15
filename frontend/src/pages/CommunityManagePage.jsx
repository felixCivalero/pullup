import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon, Type, Palette, Share2, X,
  Copy, Check, Users, ExternalLink, ImagePlus, Loader2, Smartphone, Monitor,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { uploadCommunityCoverDirect } from "../lib/imageUtils.js";
import { BrandThemeEditor } from "../components/BrandThemeEditor.jsx";
import { CommunityView, CommunityJoinPreview } from "./CommunityPage.jsx";
import { colors } from "../theme/colors.js";

// ════════════════════════════════════════════════════════════════════════
// CommunityManagePage — the community editor, built on the SAME shell as the
// event editor (CreateEventPage): a 58px parts rail + a floating editor panel
// that slides over a live preview, with click-the-preview-to-edit. It just has
// fewer parts, because a community has fewer options than an event.
// ════════════════════════════════════════════════════════════════════════

const PINK = colors.accent;

const RAIL_GROUPS = [
  {
    group: "Community",
    items: [
      { id: "cover", label: "Cover", icon: ImageIcon },
      { id: "details", label: "Details", icon: Type },
      { id: "theme", label: "Theme", icon: Palette },
      { id: "share", label: "Share", icon: Share2 },
    ],
  },
];
const RAIL_ITEMS = RAIL_GROUPS.flatMap((g) => g.items);
const PART_FROM_KIND = { cover: "cover", details: "details" };

export function CommunityManagePage() {
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable fields (live → drive the preview).
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [brand, setBrand] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);

  const [error, setError] = useState("");
  const [coverPct, setCoverPct] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [publishing, setPublishing] = useState(false);

  const isDesktopEditor0 = typeof window !== "undefined" && window.innerWidth >= 969;
  const [isDesktopEditor, setIsDesktopEditor] = useState(isDesktopEditor0);
  const [pinnedPartId, setPinnedPartId] = useState(isDesktopEditor0 ? null : "details");
  const [previewMode, setPreviewMode] = useState("phone");

  const railNavRef = useRef(null);
  const panelRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const savingRef = useRef(false);

  const openPartId = pinnedPartId;
  const panelOpen = !!openPartId;

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

  // Track desktop/mobile so the panel floats (desktop) vs sits in-flow (mobile).
  useEffect(() => {
    const onResize = () => {
      const d = window.innerWidth >= 969;
      setIsDesktopEditor(d);
      setPinnedPartId((cur) => (!d && !cur ? "details" : cur));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Click outside the rail/panel closes it (desktop only — mobile is in-flow).
  useEffect(() => {
    if (!pinnedPartId || !isDesktopEditor) return;
    const onDown = (e) => {
      if (railNavRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setPinnedPartId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pinnedPartId, isDesktopEditor]);

  const doSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await authenticatedFetch("/host/community", {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), blurb: blurb.trim(), brand: brand || null }),
      });
      if (!res.ok) throw new Error("save_failed");
      const data = await res.json();
      setCommunity(data); // sync saved baseline (don't re-hydrate inputs mid-typing)
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch {
      setError("Couldn't save. Retrying on your next change.");
      setSaveState("idle");
    } finally {
      savingRef.current = false;
    }
  };

  // Debounced autosave on edits — feels like the event editor (draft persists
  // as you go), no Save button.
  useEffect(() => {
    if (!community) return;
    const dirty =
      title.trim() !== (community.title || "") ||
      blurb.trim() !== (community.blurb || "") ||
      JSON.stringify(brand || null) !== JSON.stringify(community.brand || null);
    if (!dirty) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 700);
    return () => clearTimeout(saveTimer.current);
  }, [title, blurb, brand]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setCoverPct(0);
    try {
      const payload = await uploadCommunityCoverDirect({ file, onProgress: (p) => setCoverPct(Math.round(p)) });
      hydrate(payload);
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
    } catch { /* clipboard blocked */ }
  };

  const handleEditPart = (part) => {
    const id = PART_FROM_KIND[part?.kind];
    if (id) setPinnedPartId(id);
  };

  const isLive = community?.status === "published";
  const publish = async (next) => {
    if (publishing) return;
    setPublishing(true);
    setError("");
    try {
      // Flush any pending text/brand edits first so we never publish a stale draft.
      clearTimeout(saveTimer.current);
      const res = await authenticatedFetch("/host/community", {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), blurb: blurb.trim(), brand: brand || null, status: next }),
      });
      if (!res.ok) throw new Error("publish_failed");
      hydrate(await res.json());
    } catch {
      setError("Couldn't update publish state. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  const preview = useMemo(() => ({ ...(community || {}), title, blurb, brand, coverImageUrl }),
    [community, title, blurb, brand, coverImageUrl]);

  if (loading) {
    return <div className="page-with-header create-event-page"><style>{STYLES}</style><div style={{ minHeight: "50vh" }} /></div>;
  }

  return (
    <div className="page-with-header create-event-page">
      <style>{STYLES}</style>
      <div className="create-event-layout" style={{ position: "relative", height: "calc(100dvh - 56px)" }}>
        <div className="create-event-grid" style={{ display: "flex", height: "100%" }}>

          {/* ── Sidebar: 58px rail + floating panel ── */}
          <div className="create-event-sidebar" style={{ position: "relative", width: 58, minWidth: 58, height: "100%", overflow: "visible", background: colors.background, display: "flex", flexDirection: "row" }}>
            <nav ref={railNavRef} className="create-event-parts-rail"
              style={{ width: 58, minWidth: 58, flexShrink: 0, height: "100%", overflowY: "auto", borderRight: `1px solid ${colors.border}`, background: colors.backgroundOverlay, padding: "14px 0", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {RAIL_GROUPS.map((grp) => (
                <div key={grp.group} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
                  {grp.items.map((it) => {
                    const active = openPartId === it.id;
                    const Icon = it.icon;
                    return (
                      <button key={it.id} type="button" title={it.label} aria-label={it.label}
                        onClick={() => setPinnedPartId((cur) => (cur === it.id ? (isDesktopEditor ? null : cur) : it.id))}
                        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 11, border: `1px solid ${active ? colors.accentBorder : "transparent"}`, cursor: "pointer", background: active ? colors.accentSoft : "transparent", color: active ? colors.accent : colors.textMuted, transition: "background 0.15s, color 0.15s, border-color 0.15s" }}>
                        <Icon size={20} style={{ opacity: active ? 1 : 0.8 }} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div ref={panelRef}
              style={isDesktopEditor ? {
                position: "absolute", left: 58, top: 0, bottom: 0, width: 418, zIndex: 35,
                background: colors.background, borderRight: `1px solid ${colors.border}`,
                display: "flex", flexDirection: "column",
                transform: panelOpen ? "translateX(0)" : "translateX(-14px)",
                opacity: panelOpen ? 1 : 0, pointerEvents: panelOpen ? "auto" : "none",
                boxShadow: panelOpen ? "10px 0 34px rgba(10,10,10,0.12)" : "none",
                transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.16s ease, box-shadow 0.22s ease",
              } : { flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
              {/* header */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px 10px 20px", borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{RAIL_ITEMS.find((i) => i.id === openPartId)?.label || "Edit"}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: saveState === "saved" ? "#16a34a" : colors.textSubtle, minWidth: 44, textAlign: "right" }}>
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
                  </span>
                  {isDesktopEditor && (
                    <button type="button" onClick={() => setPinnedPartId(null)} aria-label="Close" style={{ display: "inline-flex", width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: colors.textSubtle, cursor: "pointer", alignItems: "center", justifyContent: "center" }}>
                      <X size={17} />
                    </button>
                  )}
                </span>
              </div>
              {/* content */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 22 }}>
                {error && <p className="ce-err">{error}</p>}

                {openPartId === "cover" && (
                  <>
                    <p className="ce-hint">A full-screen image is the first thing people see — make it count.</p>
                    <button type="button" className="ce-cover" onClick={() => fileRef.current?.click()} disabled={coverPct !== null}
                      style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : undefined}>
                      {coverPct !== null ? <span className="ce-cover-ph"><Loader2 size={18} className="ce-spin" /> Uploading… {coverPct}%</span>
                        : coverImageUrl ? <span className="ce-cover-replace">Change cover</span>
                        : <span className="ce-cover-ph"><ImagePlus size={18} /> Add a cover image</span>}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickCover} />
                  </>
                )}

                {openPartId === "details" && (
                  <>
                    <p className="ce-label">Name</p>
                    <input className="ce-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Nairobi crew" />
                    <p className="ce-label" style={{ marginTop: 16 }}>The pitch</p>
                    <textarea className="ce-input ce-textarea" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={5}
                      placeholder="What is this community, and what do people get for joining? Keep it short and real." />
                  </>
                )}

                {openPartId === "theme" && (
                  <>
                    <p className="ce-hint">Background, join button, font. The preview updates as you go.</p>
                    <BrandThemeEditor value={brand} onChange={setBrand} />
                  </>
                )}

                {openPartId === "share" && (
                  <>
                    <div className="ce-count"><Users size={18} /><span><strong>{(community?.memberCount || 0).toLocaleString()}</strong> {community?.memberCount === 1 ? "member" : "members"}</span></div>
                    <p className="ce-label" style={{ marginTop: 16 }}>Your link</p>
                    <div className="ce-share">
                      <input className="ce-input ce-link" readOnly value={community?.shareUrl || ""} onFocus={(e) => e.target.select()} />
                      <button type="button" className="ce-copy" onClick={copyLink}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
                    </div>
                    {community?.slug && <a className="ce-open" href={`/c/${community.slug}`} target="_blank" rel="noopener noreferrer">Open the live page <ExternalLink size={13} /></a>}
                    <p className="ce-hint" style={{ marginTop: 16 }}>Drop this link where your people already are. See and filter who joins in your Room.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Preview stage ── */}
          <div className="create-event-preview-desktop" style={{ flex: 1, height: "100%", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0d0b12" }}>
            {/* Publish bar — see if it's live, flip it like an event. */}
            <div className="cme-publishbar">
              <span className={`cme-livepill${isLive ? " is-live" : ""}`}>{isLive ? "● Live" : "Draft"}</span>
              <button type="button" className={`cme-publish${isLive ? " is-live" : ""}`} onClick={() => publish(isLive ? "draft" : "published")} disabled={publishing}>
                {publishing ? "…" : isLive ? "Unpublish" : "Publish"}
              </button>
            </div>
            <div className="cme-toggle">
              <button type="button" className={`cme-tog${previewMode === "phone" ? " is-on" : ""}`} onClick={() => setPreviewMode("phone")}><Smartphone size={13} /> Phone</button>
              <button type="button" className={`cme-tog${previewMode === "desktop" ? " is-on" : ""}`} onClick={() => setPreviewMode("desktop")}><Monitor size={13} /> Desktop</button>
            </div>
            <div className={`cme-frame cme-frame--${previewMode}`}>
              {previewMode === "phone" ? (
                <div className="cme-chrome-phone">
                  <div className="cme-statusbar"><span className="cme-clock">9:41</span><span className="cme-notch" /><span className="cme-batt" /></div>
                  <div className="cme-urlbar"><span>pullup.se/c/{community?.slug || "your-community"}</span></div>
                </div>
              ) : (
                <div className="cme-chrome-desktop"><span className="cme-dot" /><span className="cme-dot" /><span className="cme-dot" /><div className="cme-urlpill">pullup.se/c/{community?.slug || "your-community"}</div></div>
              )}
              <div className="cme-frame-scroll">
                <CommunityView community={preview} joinSlot={<CommunityJoinPreview />} fill onEditPart={handleEditPart} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const STYLES = `
  .ce-err { margin: 0 0 14px; font-size: 13px; color: #c0392b; }
  .ce-label { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(10,10,10,0.5); }
  .ce-hint { margin: 0 0 14px; font-size: 12.5px; line-height: 1.5; color: rgba(10,10,10,0.5); }
  .ce-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 12px; border: 1px solid rgba(10,10,10,0.16); background: #fff; color: #0a0a0a; font-size: 15px; font-family: inherit; outline: none; transition: border-color 0.16s, box-shadow 0.16s; }
  .ce-input:focus { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.14); }
  .ce-textarea { resize: vertical; line-height: 1.5; }

  .ce-cover { width: 100%; height: 150px; border-radius: 13px; cursor: pointer; border: 1px dashed rgba(10,10,10,0.22); background-color: rgba(10,10,10,0.03); background-size: cover; background-position: center; display: flex; align-items: flex-end; justify-content: center; padding: 12px; font-family: inherit; transition: border-color 0.16s; overflow: hidden; }
  .ce-cover:hover { border-color: ${PINK}; }
  .ce-cover-ph { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: rgba(10,10,10,0.6); }
  .ce-cover-replace { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.55); padding: 6px 12px; border-radius: 999px; }
  .ce-spin { animation: ce-spin 0.9s linear infinite; }
  @keyframes ce-spin { to { transform: rotate(360deg); } }

  .ce-count { display: flex; align-items: center; gap: 10px; color: ${PINK}; font-size: 15px; }
  .ce-count strong { color: #0a0a0a; font-size: 20px; font-weight: 850; }
  .ce-share { display: flex; gap: 8px; }
  .ce-link { flex: 1; min-width: 0; font-size: 13.5px; }
  .ce-copy { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 0 15px; border-radius: 11px; border: none; background: ${PINK}; color: #fff; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .ce-open { display: inline-flex; align-items: center; gap: 5px; margin-top: 12px; font-size: 13px; color: rgba(10,10,10,0.55); text-decoration: none; }
  .ce-open:hover { color: ${PINK}; }

  /* Publish bar — top-right of the dark stage */
  .cme-publishbar { position: absolute; top: 14px; right: 18px; z-index: 21; display: inline-flex; align-items: center; gap: 10px; }
  .cme-livepill { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 11px; border-radius: 999px; color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.14); }
  .cme-livepill.is-live { color: #fff; background: rgba(34,197,94,0.22); border-color: rgba(34,197,94,0.5); }
  .cme-publish { padding: 8px 18px; border-radius: 999px; border: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 800; background: ${PINK}; color: #fff; transition: opacity 0.16s, transform 0.16s; }
  .cme-publish:hover { transform: translateY(-1px); }
  .cme-publish.is-live { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); }
  .cme-publish:disabled { opacity: 0.6; cursor: default; transform: none; }

  /* Preview stage — device toggle + framed chrome (on the dark stage) */
  .cme-toggle { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); z-index: 20; display: inline-flex; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.10); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.14); }
  .cme-tog { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 7px; border: none; background: transparent; color: rgba(255,255,255,0.45); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.18s, color 0.18s; }
  .cme-tog.is-on { background: rgba(255,255,255,0.16); color: #fff; }

  .cme-frame { display: flex; flex-direction: column; overflow: hidden; background: #0a0a0a; box-shadow: 0 30px 80px -28px rgba(0,0,0,0.7); transition: width 0.4s cubic-bezier(0.4,0,0.2,1), border-radius 0.3s; margin-top: 26px; }
  .cme-frame--phone { width: 390px; max-width: 100%; height: calc(100% - 80px); border-radius: 42px; padding: 8px; border: 3px solid #1c1c22; }
  .cme-frame--desktop { width: min(960px, 94%); height: calc(100% - 80px); border-radius: 14px; padding: 0; border: 2px solid #1c1c22; }
  .cme-frame-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; background: #000; border-radius: inherit; }
  .cme-frame--phone .cme-frame-scroll { border-radius: 32px; }

  .cme-chrome-phone { flex-shrink: 0; background: #121018; border-radius: 32px 32px 0 0; }
  .cme-statusbar { height: 26px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
  .cme-clock { font-size: 12px; font-weight: 700; color: #fff; }
  .cme-notch { width: 64px; height: 16px; border-radius: 999px; background: #000; }
  .cme-batt { width: 22px; height: 11px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.5); }
  .cme-urlbar { padding: 2px 14px 8px; }
  .cme-urlbar span { display: block; text-align: center; font-size: 11.5px; color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.08); border-radius: 8px; padding: 6px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .cme-chrome-desktop { flex-shrink: 0; height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #1b1b1f; }
  .cme-dot { width: 11px; height: 11px; border-radius: 999px; background: rgba(255,255,255,0.2); }
  .cme-urlpill { margin-left: 10px; flex: 1; max-width: 380px; font-size: 11.5px; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); border-radius: 7px; padding: 5px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Mobile (<969px): rail goes horizontal (responsive.css), panel sits in-flow,
     desktop preview hides. Give the in-flow panel a sensible min-height. */
  @media (max-width: 968px) {
    .create-event-sidebar > div:last-child { min-height: 60vh; }
  }
`;
