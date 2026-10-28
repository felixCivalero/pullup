import { useState } from "react";
import { Clock } from "lucide-react";
import { compressImage, validateImageFile } from "../lib/imageUtils.js";
import { formatReadableDateTime, formatRelativeTime } from "../lib/dateUtils.js";
import { fromZonedInput, toZonedInput } from "../../../lib/zonedTime.js";
import { Toggle } from "./editorUi.jsx";
import { useCurrentBrand } from "../../../lib/brand.js";

/* The page body: reorderable content blocks (the old app's sections
   builder, branch pullup-app CreateEventPage step 2). Title, place and time
   are fixed blocks that edit the event's own fields; the rest — text,
   Spotify, Apple Music, SoundCloud, YouTube, social links, hosted by — can be
   added, moved (arrows or drag) and removed. Hovering a block outlines it in
   the preview. */

const LABELS = { title: "Titel", location: "Plats", datetime: "Datum & tid", socials: "Sociala länkar", spotify: "Spotify", applemusic: "Apple Music", soundcloud: "SoundCloud", youtube: "YouTube", hostedby: "Arrangör", text: "Text" };
const FIXED = new Set(["title", "location", "datetime"]);
const ADD = [
  { data: { type: "text", title: "Rubrik", text: "Skriv något här..." }, icon: "T", label: "Text" },
  { data: { type: "spotify", url: "" }, icon: "♫", label: "Spotify" },
  { data: { type: "applemusic", url: "" }, icon: "♪", label: "Apple" },
  { data: { type: "soundcloud", url: "" }, icon: "♪", label: "SoundCloud" },
  { data: { type: "youtube", url: "" }, icon: "▶", label: "YouTube" },
  { data: { type: "socials", instagram: "", spotify: "", tiktok: "", soundcloud: "" }, icon: "@", label: "Sociala" },
  { data: { type: "hostedby", name: "", logo: "", email: "", website: "" }, icon: "★", label: "Arrangör" },
];

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.pathname.startsWith("/embed/") ? u.pathname.split("/embed/")[1] : u.searchParams.get("v");
  } catch { /* not a url yet */ }
  return null;
}

export function SectionsPanel({ draft, update, hovered, setHovered }) {
  // The organiser block starts with the brand the event belongs to.
  const brand = useCurrentBrand();
  const sections = draft.sections || [];
  const setSections = (next) => update({ sections: next });
  const setAt = (i, patch) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const tz = draft.timezone || "Europe/Stockholm";

  const move = (from, to) => {
    const u = [...sections];
    const [m] = u.splice(from, 1);
    u.splice(to, 0, m);
    setSections(u);
    setHovered(to);
  };

  return (
    <div className="ee-panel">
      {sections.map((section, i) => (
        <div
          key={i}
          data-section-editor={i}
          className={`ee-card${hovered === i ? " is-hover" : ""}${dragIndex === i ? " is-drag" : ""}`}
          onMouseEnter={() => dragIndex === null && setHovered(i)}
          onMouseLeave={() => dragIndex === null && setHovered(null)}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragIndex === null) return;
            const r = e.currentTarget.getBoundingClientRect();
            setDragOver(e.clientY < r.top + r.height / 2 ? i : i + 1);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex === null || dragOver === null) return;
            move(dragIndex, dragOver > dragIndex ? dragOver - 1 : dragOver);
            setDragIndex(null);
            setDragOver(null);
          }}
        >
          {dragIndex !== null && dragOver === i && dragIndex !== i && dragIndex !== i - 1 && <div className="ee-drop-line" style={{ top: -5 }} />}
          {dragIndex !== null && dragOver === i + 1 && dragIndex !== i && dragIndex !== i + 1 && <div className="ee-drop-line" style={{ bottom: -5 }} />}

          <div
            className="ee-card-head"
            draggable
            onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => { setDragIndex(null); setDragOver(null); setHovered(null); }}
          >
            <div className="ee-arrows" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" draggable={false} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Flytta upp">&#9650;</button>
              <button type="button" draggable={false} disabled={i === sections.length - 1} onClick={() => move(i, i + 1)} aria-label="Flytta ned">&#9660;</button>
            </div>
            <span className="ee-kind">{LABELS[section.type] || "Text"}</span>
            <span className="ee-grow" />
            {!FIXED.has(section.type) && (
              <button type="button" className="ee-x" draggable={false} onClick={() => setSections(sections.filter((_, j) => j !== i))} aria-label="Ta bort">&times;</button>
            )}
          </div>

          {section.type === "title" ? (
            <>
              <input className="ee-bare is-title" value={draft.title || ""} onChange={(e) => update({ title: e.target.value })} placeholder="Eventets namn" />
              <div style={{ marginTop: 8 }}>
                <Toggle on={draft.titleSettings?.visible !== false} onChange={(v) => update({ titleSettings: { ...(draft.titleSettings || {}), visible: v } })} label="Visa titeln på sidan" />
              </div>
            </>
          ) : section.type === "location" ? (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <input className="ee-input" value={draft.location || ""} onChange={(e) => update({ location: e.target.value })} placeholder="Var är eventet?" />
              <Toggle on={!!draft.hideLocation} onChange={(v) => update({ hideLocation: v })} label="Avslöja platsen senare" />
              {draft.hideLocation && (
                <input className="ee-input" maxLength={80} value={draft.revealHint || ""} onChange={(e) => update({ revealHint: e.target.value })} placeholder="t.ex. Platsen släpps på fredag" />
              )}
            </div>
          ) : section.type === "datetime" ? (
            <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
              {[["startsAt", "Start"], ["endsAt", "Slut (valfritt)"]].map(([k, l]) => (
                <label key={k} className="ee-when">
                  <input type="datetime-local" value={toZonedInput(draft[k], tz)} onChange={(e) => update({ [k]: e.target.value ? fromZonedInput(e.target.value, tz) : null })} />
                  <Clock size={16} />
                  {draft[k] ? <span>{formatReadableDateTime(new Date(draft[k]), tz)}</span> : <span className="is-empty">{l}</span>}
                  {draft[k] && <small style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>{formatRelativeTime(new Date(draft[k]))}</small>}
                </label>
              ))}
              <div style={{ marginTop: 6 }}>
                <Toggle on={!!draft.hideDate} onChange={(v) => update({ hideDate: v })} label="Avslöja datumet senare" hint={draft.hideDate ? "Datumet ovan används bara för sortering och påminnelser. Sidan visar din ledtråd." : null} />
              </div>
              {draft.hideDate && (
                <input className="ee-input" style={{ marginTop: 8 }} maxLength={80} value={draft.dateRevealHint || ""} onChange={(e) => update({ dateRevealHint: e.target.value })} placeholder="t.ex. Datum kommer snart" />
              )}
            </div>
          ) : section.type === "spotify" ? (
            <Embed value={section.url} onChange={(url) => setAt(i, { url })} placeholder="Klistra in en Spotify-länk (låt, album, artist eller spellista)">
              {section.url?.includes("spotify.com") && (
                <iframe title="Spotify" className="ee-embed" src={section.url.replace("spotify.com/", "spotify.com/embed/").split("?")[0]} height={section.url.includes("/track/") ? 80 : 152} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
              )}
            </Embed>
          ) : section.type === "applemusic" ? (
            <Embed value={section.url} onChange={(url) => setAt(i, { url })} placeholder="Klistra in en Apple Music-länk">
              {section.url?.includes("music.apple.com") && (
                <iframe title="Apple Music" className="ee-embed" src={section.url.replace("music.apple.com", "embed.music.apple.com")} height={section.url.includes("/song/") || section.url.includes("?i=") ? 175 : 450} allow="autoplay *; encrypted-media *; fullscreen *" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" loading="lazy" />
              )}
            </Embed>
          ) : section.type === "soundcloud" ? (
            <Embed value={section.url} onChange={(url) => setAt(i, { url })} placeholder="Klistra in en SoundCloud-länk">
              {section.url?.includes("soundcloud.com") && (
                <iframe title="SoundCloud" className="ee-embed" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(section.url)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`} height={section.url.includes("/sets/") ? 300 : 166} allow="autoplay" loading="lazy" />
              )}
            </Embed>
          ) : section.type === "youtube" ? (
            <Embed value={section.url} onChange={(url) => setAt(i, { url })} placeholder="Klistra in en YouTube-länk">
              {youtubeId(section.url || "") && (
                <iframe title="YouTube" className="ee-embed" style={{ aspectRatio: "16/9" }} src={`https://www.youtube.com/embed/${youtubeId(section.url)}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" />
              )}
            </Embed>
          ) : section.type === "socials" ? (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {[["instagram", "Instagram", "https://instagram.com/..."], ["spotify", "Spotify", "https://open.spotify.com/..."], ["tiktok", "TikTok", "https://tiktok.com/@..."], ["soundcloud", "SoundCloud", "https://soundcloud.com/..."]].map(([k, l, ph]) => (
                <div key={k} className="ee-row">
                  <span>{l}</span>
                  <input className="ee-input" type="url" value={section[k] || ""} onChange={(e) => setAt(i, { [k]: e.target.value })} placeholder={ph} />
                </div>
              ))}
            </div>
          ) : section.type === "hostedby" ? (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <div className="ee-row" style={{ gap: 12 }}>
                <label className="ee-logo">
                  {section.logo ? <img src={section.logo} alt="" /> : <span style={{ fontSize: 18, opacity: 0.5 }}>+</span>}
                  <input type="file" accept="image/*" hidden onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const v = validateImageFile(file, 2);
                    if (!v.valid) { window.alert(v.error); return; }
                    setAt(i, { logo: await compressImage(file, 200, 200, 0.85, "image/png") });
                  }} />
                </label>
                <div style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>{section.logo ? "Klicka för att byta logga" : "Klicka för att lägga till en logga"}</div>
                {section.logo && <button type="button" className="ee-x" onClick={() => setAt(i, { logo: "" })}>&times;</button>}
              </div>
              <input className="ee-input" value={section.name || ""} onChange={(e) => setAt(i, { name: e.target.value })} placeholder="Arrangör eller byrå" />
              <input className="ee-input" type="email" value={section.email || ""} onChange={(e) => setAt(i, { email: e.target.value })} placeholder="Kontaktmejl" />
              <input className="ee-input" type="url" value={section.website || ""} onChange={(e) => setAt(i, { website: e.target.value })} placeholder="Webbplats" />
            </div>
          ) : (
            <>
              <input className="ee-bare is-h" value={section.title || ""} onChange={(e) => setAt(i, { title: e.target.value })} placeholder="Rubrik (t.ex. Om, Line-up, Meny...)" />
              <textarea className="ee-bare" value={section.text || ""} onChange={(e) => setAt(i, { text: e.target.value })} placeholder="Skriv ditt innehåll..." />
            </>
          )}
        </div>
      ))}

      <div className="ee-add">
        <p>Lägg till sektion</p>
        <div className="ee-add-grid">
          {ADD.map((a) => (
            <button key={a.data.type} type="button" onClick={() => { setSections([...sections, { ...a.data, ...(a.data.type === "hostedby" && brand ? { name: brand.name } : {}) }]); setHovered(sections.length); }}>
              <b>{a.icon}</b>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Embed({ value, onChange, placeholder, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <input className="ee-input" type="url" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {children}
    </div>
  );
}
