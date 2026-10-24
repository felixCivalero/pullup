import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, ExternalLink, Image as ImageIcon, Monitor, Smartphone, Type } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { useToast } from "../../components/Toast";
import { AdminShell } from "./AdminShell.jsx";
import { EventPreview } from "../../components/event/EventPreview.jsx";
import { DesktopEventLayout } from "../../components/event/DesktopEventLayout.jsx";
import { SignupForm } from "../../components/event/SignupForm.jsx";
import { pageProps } from "../../components/event/pageProps.js";
import { BasicsWizard } from "../../components/event/editor/BasicsWizard.jsx";
import { CoverPanel } from "../../components/event/editor/CoverPanel.jsx";
import { SectionsPanel } from "../../components/event/editor/SectionsPanel.jsx";
import { SignupPanel } from "../../components/event/editor/SignupPanel.jsx";
import { EDITOR_CSS, colors } from "../../components/event/editor/editorStyles.js";

/* /admin/events/new → the basics, one question at a time (BasicsWizard), then
   /admin/events/:id/edit → design the page: the old app's editor feel — a
   rail on the left (Cover, Content, Sign-up), the real page on the right
   (phone or desktop), point at a part of the preview to edit it. Saves itself
   a moment after each change; Publish makes /e/:slug live. */

const TABS = [
  { id: "cover", label: "Omslag", icon: ImageIcon },
  { id: "content", label: "Innehåll", icon: Type },
  { id: "signup", label: "Anmälan", icon: ClipboardList },
];
const SAVE_DELAY = 900;
const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1280, h: 800 };
// Fields the editor writes (media has its own routes).
const SAVED = ["title", "startsAt", "endsAt", "location", "sections", "mediaSettings", "titleSettings", "hideLocation", "hideDate", "revealHint", "dateRevealHint", "signupSettings", "capacity"];

export function EventCreatePage() {
  return (
    <AdminShell title="Nytt event">
      <CreateFlow />
    </AdminShell>
  );
}

function CreateFlow() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async (basics) => {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch("/admin/events", { method: "POST", body: JSON.stringify(basics) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      navigate(`/admin/events/${out.event.id}/edit`, { replace: true });
    } catch {
      setError("Kunde inte skapa eventet. Försök igen.");
      setBusy(false);
    }
  };
  return <BasicsWizard onDone={create} onCancel={() => navigate("/admin/events")} busy={busy} error={error} />;
}

export function EventEditorPage() {
  return (
    <AdminShell title="Designa event" fill>
      <Editor />
    </AdminShell>
  );
}

function Editor() {
  const { id } = useParams();
  const { showToast } = useToast();
  const toast = useCallback((msg) => showToast(msg, "error"), [showToast]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState("cover");
  const [device, setDevice] = useState("phone");
  const [hovered, setHovered] = useState(null);
  const [saveState, setSaveState] = useState("saved"); // saved | dirty | saving | error
  const timer = useRef(null);
  const latest = useRef(null);
  const filesRef = useRef(null);
  const railRef = useRef(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/events/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setDraft({ ...d.event, media: d.media || [] }))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [id]);
  latest.current = draft;

  const save = useCallback(async (extra = {}) => {
    const d = latest.current;
    if (!d) return null;
    clearTimeout(timer.current);
    setSaveState("saving");
    const body = Object.fromEntries(SAVED.map((k) => [k, d[k]]));
    try {
      const res = await authenticatedFetch(`/admin/events/${d.id}`, { method: "PATCH", body: JSON.stringify({ ...body, ...extra }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setSaveState("saved");
      return out.event;
    } catch {
      setSaveState("error");
      return null;
    }
  }, []);

  const update = useCallback((patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), SAVE_DELAY);
  }, [save]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Leaving with unsaved changes: save them on the way out.
  useEffect(() => {
    const onLeave = () => { if (saveState === "dirty") save(); };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saveState, save]);

  const setMedia = useCallback((fn) => setDraft((d) => ({ ...d, media: typeof fn === "function" ? fn(d.media || []) : fn })), []);

  const publish = async (status) => {
    if (status === "PUBLISHED" && (!draft.title?.trim() || !draft.startsAt)) { toast("Eventet behöver ett namn och en starttid."); return; }
    const ev = await save({ status });
    if (ev) {
      setDraft((d) => ({ ...d, status: ev.status }));
      showToast(status === "PUBLISHED" ? "Publicerat. Sidan är live." : "Avpublicerat.", "success");
    } else toast("Kunde inte spara.");
  };

  // Point at a part of the preview → open its editor.
  const onEditPart = useCallback((part) => {
    if (!part) return;
    if (part.kind === "cover") setTab("cover");
    else if (part.kind === "rsvp") setTab("signup");
    else if (part.kind === "section") {
      setTab("content");
      setHovered(part.index);
      setTimeout(() => railRef.current?.querySelector(`[data-section-editor="${part.index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }
  }, []);

  if (error) return <p style={{ padding: 24, color: colors.textSubtle }}>Kunde inte hämta eventet.</p>;
  if (!draft) return <p style={{ padding: 24, color: colors.textSubtle }}>Hämtar…</p>;
  if (!draft.mine) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: colors.textSubtle }}>Det här eventet skapades av {draft.host || "en annan arrangör"} i den gamla appen och redigeras inte här.</p>
        <Link to={`/admin/events/${id}`}>Till eventet</Link>
      </div>
    );
  }

  const live = draft.status === "PUBLISHED";
  const rsvpContent = () => <SignupForm preview slug={draft.slug} cta={draft.signupSettings?.cta || null} />;
  const props = pageProps({ ...draft, text: "" }, { rsvpContent });

  return (
    <div className="ed2">
      <style>{EDITOR_CSS + PAGE_CSS}</style>
      <aside className="ed2-rail">
        <div className="ed2-head">
          <Link to={`/admin/events/${draft.id}`} className="ed2-back"><ArrowLeft size={15} /> Eventet</Link>
          <div className="ed2-title">
            <b>{draft.title || "Utan titel"}</b>
            <span className={`ed2-save is-${saveState}`}>{{ saved: "Sparat", dirty: "Ändrat…", saving: "Sparar…", error: "Kunde inte spara" }[saveState]}</span>
          </div>
          <div className="ed2-pub">
            <a className="ed2-btn" href={draft.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {live ? "Öppna" : "Förhandsvisa"}</a>
            {live
              ? <button type="button" className="ed2-btn" onClick={() => publish("DRAFT")}>Avpublicera</button>
              : <button type="button" className="ed2-btn is-dark" onClick={() => publish("PUBLISHED")}>Publicera</button>}
          </div>
        </div>
        <nav className="ed2-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="ed2-body" ref={railRef}>
          <div style={{ display: tab === "cover" ? "block" : "none" }}>
            <CoverPanel draft={draft} setMedia={setMedia} update={update} toast={toast} filesRef={filesRef} />
          </div>
          {tab === "content" && <SectionsPanel draft={draft} update={update} hovered={hovered} setHovered={setHovered} />}
          {tab === "signup" && <SignupPanel draft={draft} update={update} />}
        </div>
      </aside>

      <Canvas device={device} setDevice={setDevice}>
        {device === "phone"
          ? <EventPreview {...props} compact hoveredSection={hovered} onEditPart={onEditPart} onCoverFiles={(files) => filesRef.current?.(files)} />
          : <DesktopEventLayout {...props} hoveredSection={hovered} onCoverFiles={(files) => filesRef.current?.(files)} />}
      </Canvas>
    </div>
  );
}

// The preview at its real size (phone 390×844, desktop 1280×800), scaled
// down to fit the space it has.
function Canvas({ device, setDevice, children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  const size = device === "phone" ? PHONE : DESKTOP;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.min(1, (r.width - 48) / size.w, (r.height - 40) / size.h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);
  return (
    <main className="ed2-canvas">
      <div className="ed2-devices">
        <button type="button" className={device === "phone" ? "is-on" : ""} onClick={() => setDevice("phone")}><Smartphone size={15} /> Mobil</button>
        <button type="button" className={device === "desktop" ? "is-on" : ""} onClick={() => setDevice("desktop")}><Monitor size={15} /> Desktop</button>
      </div>
      <div className="ed2-stage" ref={ref}>
        <div style={{ width: size.w * scale, height: size.h * scale }}>
          <div className={`ed2-frame is-${device}`} style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

const PAGE_CSS = `
  .ed2 { height: 100%; display: grid; grid-template-columns: 420px minmax(0, 1fr); min-height: 0; background: ${colors.surfaceMuted}; }
  .ed2-rail { display: flex; flex-direction: column; min-height: 0; background: #fff; border-right: 1px solid ${colors.border}; }
  .ed2-head { padding: 14px 16px 12px; border-bottom: 1px solid ${colors.border}; display: grid; gap: 10px; }
  .ed2-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: ${colors.textSubtle}; text-decoration: none; }
  .ed2-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .ed2-title b { font-size: 17px; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ed2-save { font-size: 12px; color: ${colors.textSubtle}; white-space: nowrap; }
  .ed2-save.is-error { color: ${colors.secondary}; font-weight: 600; }
  .ed2-pub { display: flex; gap: 8px; }
  .ed2-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 999px; border: 1px solid ${colors.borderStrong}; background: #fff; color: ${colors.text}; text-decoration: none; cursor: pointer; }
  .ed2-btn.is-dark { background: ${colors.text}; border-color: ${colors.text}; color: #fff; }
  .ed2-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid ${colors.border}; }
  .ed2-tabs button { font: inherit; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 0; border: 0; border-bottom: 2px solid transparent; background: none; color: ${colors.textSubtle}; cursor: pointer; }
  .ed2-tabs button.is-on { color: ${colors.text}; border-bottom-color: ${colors.text}; }
  .ed2-body { flex: 1; overflow-y: auto; padding: 16px; background: ${colors.surfaceMuted}; }
  .ed2-canvas { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .ed2-devices { display: flex; justify-content: center; gap: 6px; padding: 12px; }
  .ed2-devices button { font: inherit; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; border: 1px solid ${colors.border}; background: #fff; color: ${colors.textSubtle}; cursor: pointer; }
  .ed2-devices button.is-on { background: ${colors.text}; border-color: ${colors.text}; color: #fff; }
  .ed2-stage { flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; }
  .ed2-frame { transform-origin: top left; background: #05040a; color: #fff; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.25); }
  .ed2-frame.is-phone { border-radius: 36px; }
  .ed2-frame.is-desktop { border-radius: 12px; }
  @media (max-width: 900px) {
    .ed2 { grid-template-columns: 1fr; overflow-y: auto; }
    .ed2-rail { border-right: 0; }
    .ed2-canvas { min-height: 80vh; }
  }
`;
