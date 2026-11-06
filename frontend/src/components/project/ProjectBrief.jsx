import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { uid, useProjectDoc } from "./projectDoc.js";

/* ════════════════════════════════════════════════════════════════════════
   A project's strategy, as a plain document: the pitch on top (the ground
   the whole project stands on, linked, never copied), then the grundbultar
   (sections you write and add to after every meeting), then the content
   buckets. A bucket IS a format: the same name on the Board's format frames
   and on the timeline's cards, so the document shows how many are planned
   and opens them. Renaming a bucket renames the format on its cards.
   Stored as project_docs kind "brief": { blocks: [section | bucket] }.
   ════════════════════════════════════════════════════════════════════════ */

const TEMPLATE = [
  ["Resan", "Pitchen i några meningar: vart är vi på väg, och hur ser resan ut?"],
  ["Vision", "Varför spelar det här roll? Vad ska varumärket stå för?"],
  ["Mål", "Vad ska vara sant när vi är framme? Siffror och datum."],
  ["Målgrupp", "Vilka gör vi det här för? Vad vill de ha, var finns de?"],
  ["Identitet & ton", "Hur ser det ut, låter det och känns det?"],
  ["Nyckeldatum", "Releaser, öppningar, deadlines. Allt som räknas bakåt från."],
];

export function ProjectBrief({ clientId, projectName, pitch, formatCounts = {}, onOpenFormat, onRenameBucket, onBucketsChange }) {
  const { list: blocks, mutate, phase, status } = useProjectDoc(clientId, "brief", "blocks");
  const sections = blocks.filter((b) => b.type !== "bucket");
  const buckets = blocks.filter((b) => b.type === "bucket");

  const change = (id, patch) => mutate((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)), { changed: [id] });
  const add = (block) => {
    mutate((list) => [...list, block], { changed: [block.id] });
    if (block.type === "bucket") onBucketsChange?.([...buckets.map((b) => b.title), block.title].filter(Boolean));
  };
  const remove = (b) => {
    if (!window.confirm(`Ta bort "${b.title || (b.type === "bucket" ? "bucket" : "grundbult")}"?`)) return;
    mutate((list) => list.filter((x) => x.id !== b.id), { removed: [b.id] });
    if (b.type === "bucket") onBucketsChange?.(buckets.filter((x) => x.id !== b.id).map((x) => x.title).filter(Boolean));
  };
  const move = (b, dir) => {
    const same = blocks.filter((x) => (x.type === "bucket") === (b.type === "bucket"));
    const i = same.indexOf(b);
    const other = same[i + dir];
    if (!other) return;
    mutate((list) => {
      const next = [...list];
      const a = next.indexOf(b);
      const c = next.indexOf(other);
      [next[a], next[c]] = [next[c], next[a]];
      return next;
    }, { changed: [b.id, other.id] });
  };
  const seed = () => {
    const list = TEMPLATE.map(([title, hint]) => ({ id: uid(), type: "section", title, hint, body: "" }));
    mutate((cur) => [...list, ...cur], { changed: list.map((b) => b.id) });
  };

  if (phase === "loading") return <Center>Öppnar strategin…</Center>;
  if (phase === "error") return <Center>Kunde inte öppna strategin.</Center>;

  return (
    <div className="pb">
      <style>{CSS}</style>
      <div className="pb-page">
        <p className="pb-kicker">Strategi · {projectName}</p>
        <h1>Grundbultarna</h1>

        {pitch ? (
          <div className="pb-pitch">
            <Link to={`/admin/pitch/${pitch.slug}`} className="pb-pitch-img">{pitch.cover && <img src={pitch.cover} alt="" />}</Link>
            <div>
              <span>Grunden · pitchen</span>
              <strong>{pitch.title}</strong>
              <p>Allt i projektet utgår från pitchen. Ändras riktningen, ändra pitchen först.</p>
              <Link to={`/admin/pitch/${pitch.slug}`} className="pb-btn"><Play size={14} /> Presentera</Link>
            </div>
          </div>
        ) : (
          <p className="pb-nopitch">Ingen pitch kopplad än. När kunden får en pitch (under Pitch) blir den grunden här.</p>
        )}

        <section className="pb-sections">
          {sections.length === 0 && (
            <div className="pb-empty">
              <p>Inga grundbultar än.</p>
              <button type="button" className="pb-btn" onClick={seed}>Starta med mallen</button>
            </div>
          )}
          {sections.map((b, i) => (
            <article key={b.id} className="pb-section">
              <div className="pb-tools">
                <button type="button" onClick={() => move(b, -1)} disabled={i === 0} aria-label="Flytta upp"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(b, 1)} disabled={i === sections.length - 1} aria-label="Flytta ner"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => remove(b)} aria-label="Ta bort"><Trash2 size={14} /></button>
              </div>
              <input className="pb-title" value={b.title || ""} placeholder="Rubrik" onChange={(e) => change(b.id, { title: e.target.value })} />
              <textarea className="pb-body" value={b.body || ""} placeholder={b.hint || "Skriv här…"} onChange={(e) => change(b.id, { body: e.target.value })} rows={3} />
            </article>
          ))}
          <button type="button" className="pb-add" onClick={() => add({ id: uid(), type: "section", title: "", body: "" })}><Plus size={15} /> Lägg till grundbult</button>
        </section>

        <section className="pb-buckets">
          <h2>Content buckets</h2>
          <p className="pb-lead">Varje bucket är ett format. Samma namn på Board och Tidslinje, så allt som planeras hamnar i rätt hink.</p>
          <div className="pb-grid">
            {buckets.map((b, i) => (
              <Bucket
                key={b.id}
                bucket={b}
                count={formatCounts[String(b.title || "").trim()] || 0}
                first={i === 0}
                last={i === buckets.length - 1}
                onChange={(patch) => change(b.id, patch)}
                onRename={(from, to) => {
                  onRenameBucket?.(from, to);
                  onBucketsChange?.(buckets.map((x) => (x.id === b.id ? to : x.title)).filter(Boolean));
                }}
                onMove={(dir) => move(b, dir)}
                onRemove={() => remove(b)}
                onOpen={(view) => onOpenFormat?.(view, String(b.title || "").trim())}
              />
            ))}
            <button type="button" className="pb-bucket pb-bucket-new" onClick={() => add({ id: uid(), type: "bucket", title: "", why: "", examples: "", cadence: "" })}>
              <Plus size={18} /> Ny bucket
            </button>
          </div>
        </section>
      </div>
      <span className={`pb-status is-${status}`}>
        {status === "saving" ? <><Loader2 size={13} className="pb-spin" /> Sparar…</> : status === "offline" ? "Kunde inte spara, försöker igen" : <><Check size={13} /> Sparat</>}
      </span>
    </div>
  );
}

function Bucket({ bucket, count, first, last, onChange, onRename, onMove, onRemove, onOpen }) {
  const [named, setNamed] = useState(bucket.title || "");
  const name = String(bucket.title || "").trim();
  return (
    <article className="pb-bucket">
      <div className="pb-tools">
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Flytta vänster"><ArrowLeft size={14} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Flytta höger"><ArrowRight size={14} /></button>
        <button type="button" onClick={onRemove} aria-label="Ta bort"><Trash2 size={14} /></button>
      </div>
      <input
        className="pb-bucket-name"
        value={bucket.title || ""}
        placeholder="Namn på bucketen"
        onFocus={() => setNamed(name)}
        onChange={(e) => onChange({ title: e.target.value })}
        onBlur={() => { if (named && name && named !== name) onRename(named, name); }}
      />
      <label>Varför<textarea value={bucket.why || ""} placeholder="Vad ska den göra för varumärket?" onChange={(e) => onChange({ why: e.target.value })} rows={2} /></label>
      <label>Exempel<textarea value={bucket.examples || ""} placeholder="Hur ser ett inlägg ut?" onChange={(e) => onChange({ examples: e.target.value })} rows={2} /></label>
      <label>Hur ofta<input value={bucket.cadence || ""} placeholder="t.ex. en per plats, varje vecka" onChange={(e) => onChange({ cadence: e.target.value })} /></label>
      <footer>
        <button type="button" disabled={!name} onClick={() => onOpen("tidslinje")}>{count ? `${count} på tidslinjen` : "Planera på tidslinjen"}</button>
        <button type="button" disabled={!name} onClick={() => onOpen("board")}>Boarden</button>
      </footer>
    </article>
  );
}

function Center({ children }) {
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#6e6e73", fontSize: 15 }}>{children}</div>;
}

const CSS = `
  .pb { position: absolute; inset: 0; overflow-y: auto; background: #fbfbf9; }
  .pb-page { max-width: 920px; margin: 0 auto; padding: 96px clamp(16px, 4vw, 40px) 120px; }
  .pb-kicker { margin: 0; font: 700 11.5px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: #ec178f; }
  .pb h1 { margin: 8px 0 24px; font-size: clamp(36px, 5vw, 56px); letter-spacing: -0.045em; line-height: 1; }
  .pb-pitch { display: flex; gap: 20px; align-items: stretch; padding: 14px; margin-bottom: 40px; border: 1px solid #151515; border-radius: 14px; background: #fff; box-shadow: 3px 3px 0 rgba(0,0,0,.12); }
  .pb-pitch-img { flex: 0 0 220px; border-radius: 9px; overflow: hidden; background: #151515; aspect-ratio: 16 / 9; }
  .pb-pitch-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pb-pitch > div { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
  .pb-pitch span { font: 700 11px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: #ec178f; }
  .pb-pitch strong { font-size: 22px; letter-spacing: -0.02em; }
  .pb-pitch p { margin: 0 0 8px; font-size: 14px; color: #5f5e5a; }
  .pb-nopitch { margin: 0 0 40px; padding: 14px 16px; border: 1px dashed #9b9a95; border-radius: 12px; color: #5f5e5a; font-size: 14px; }
  .pb-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 999px; border: 0; background: #151515; color: #fff; cursor: pointer; text-decoration: none; }
  .pb-btn:hover { background: #ec178f; }
  .pb-sections { display: flex; flex-direction: column; gap: 8px; }
  .pb-empty { display: flex; align-items: center; gap: 16px; padding: 18px; border: 1px dashed #9b9a95; border-radius: 12px; }
  .pb-empty p { margin: 0; color: #5f5e5a; }
  .pb-section { position: relative; padding: 18px 0 22px; border-top: 1px solid #e2e0da; }
  .pb-title { width: 100%; border: 0; background: none; padding: 0; font: inherit; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: #151515; outline: none; }
  .pb-body { width: 100%; margin-top: 8px; border: 0; background: none; padding: 0; font: inherit; font-size: 16.5px; line-height: 1.6; color: #2a2a28; resize: none; outline: none; field-sizing: content; min-height: 3lh; }
  .pb-title::placeholder, .pb-body::placeholder { color: #b0afaa; }
  .pb-tools { position: absolute; top: 14px; right: 0; display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
  .pb-section:hover .pb-tools, .pb-section:focus-within .pb-tools, .pb-bucket:hover .pb-tools, .pb-bucket:focus-within .pb-tools { opacity: 1; }
  .pb-tools button { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; border: 0; background: none; color: #6e6e73; cursor: pointer; }
  .pb-tools button:hover:not(:disabled) { background: #efeee9; color: #151515; }
  .pb-tools button:disabled { opacity: .3; cursor: default; }
  .pb-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font: inherit; font-size: 14px; font-weight: 600; padding: 8px 12px; border-radius: 9px; border: 1px dashed #9b9a95; background: none; color: #3a3935; cursor: pointer; }
  .pb-add:hover { border-color: #151515; color: #151515; }
  .pb-buckets { margin-top: 56px; }
  .pb-buckets h2 { margin: 0; font-size: 30px; letter-spacing: -0.03em; }
  .pb-lead { margin: 6px 0 20px; color: #5f5e5a; font-size: 15px; }
  .pb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .pb-bucket { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid #c9c8c3; border-radius: 14px; background: #fff; }
  .pb-bucket .pb-tools { top: 10px; right: 10px; }
  .pb-bucket-name { width: calc(100% - 90px); border: 0; padding: 0; font: inherit; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; outline: none; background: none; }
  .pb-bucket label { display: flex; flex-direction: column; gap: 3px; font: 700 10.5px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; color: #8e8d88; }
  .pb-bucket textarea, .pb-bucket label input { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Inter Tight", sans-serif; letter-spacing: 0; text-transform: none; color: #151515; border: 1px solid transparent; border-radius: 7px; padding: 5px 7px; margin: 0 -7px; background: #f6f5f1; resize: none; outline: none; field-sizing: content; }
  .pb-bucket textarea:focus, .pb-bucket label input:focus { border-color: #151515; background: #fff; }
  .pb-bucket footer { display: flex; gap: 8px; margin-top: auto; padding-top: 6px; }
  .pb-bucket footer button { font: inherit; font-size: 12.5px; font-weight: 700; padding: 6px 10px; border-radius: 999px; border: 1px solid #151515; background: #fff; color: #151515; cursor: pointer; }
  .pb-bucket footer button:first-child { background: #151515; color: #fff; }
  .pb-bucket footer button:disabled { opacity: .35; cursor: default; }
  .pb-bucket-new { align-items: center; justify-content: center; flex-direction: row; min-height: 200px; border-style: dashed; background: none; font: inherit; font-size: 15px; font-weight: 600; color: #3a3935; cursor: pointer; }
  .pb-bucket-new:hover { border-color: #151515; color: #151515; }
  .pb-status { position: fixed; right: 18px; bottom: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #fff; border: 1px solid #e2e0da; font-size: 12px; font-weight: 600; color: #16a34a; }
  .pb-status.is-saving { color: #6e6e73; }
  .pb-status.is-offline { color: #dc2626; }
  .pb-spin { animation: pbSpin .9s linear infinite; }
  @keyframes pbSpin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) { .pb-pitch { flex-direction: column; } .pb-pitch-img { flex-basis: auto; } .pb-page { padding-top: 130px; } }
`;
