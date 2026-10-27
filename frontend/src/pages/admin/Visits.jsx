import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { CASES } from "../../components/agency/agencyData.js";
import { translate } from "../../components/agency/i18n.js";

// The sections each page has LIVE, in page order — Statistik lists only these,
// as "Sektion N – namn", so sections from older versions of the page never
// show up (Felix 2026-10-26). The front page is listed here (keep in step
// with FelixContent.jsx); each case page is read from its own story data.
const HOME_LAYOUT = [
  ["hero", "Toppen"],
  ["words", "Vad de säger"],
  ["stories", "Case"],
  ["tech", "Tekniska kunskaper och produkter"],
  ["how", "Så jobbar jag"],
  ["offer", "Boka möte"],
];
const STORIES = import.meta.glob("../stories/data/*.jsx", { eager: true, import: "default" });
const sv = (x) => (x ? translate("sv", x) : "");
function caseLayout(story) {
  const blocks = story.blocks
    .filter((b) => b.section)
    .sort((a, b) => a.order - b.order)
    .map((b) => [b.section, sv(b.k || b.chapter?.[1] || b.label) || b.section]);
  return [
    ["case_hero", "Toppen"],
    ["spine", "Caset i fyra steg"],
    ...blocks,
    ["next_case", "Nästa case"],
    ["all_stories", "Alla case"],
    ["offer", "Boka möte"],
  ];
}
const LAYOUTS = {
  "/": HOME_LAYOUT,
  ...Object.fromEntries(Object.values(STORIES).map((st) => [`/work/${st.slug}`, caseLayout(st)])),
};

/* Statistik's reading half: the funnel, where the time goes per page and
   section, and every visit as a journey you can open (GET /admin/visits,
   backend lib/visitJourneys.js). Reading time = active seconds: the tab
   visible and the visitor doing something in the last 45 s. */

const SECTION_LABELS = {
  hero: "Toppen",
  words: "Vad de säger",
  stories: "Case",
  how: "Så jobbar jag",
  tech: "Tekniska kunskaper och produkter",
  offer: "Boka möte",
  about: "Om mig",
  deck: "Booklet",
  all_stories: "Alla case",
  case_hero: "Case-toppen",
  spine: "Innehåll",
  next_case: "Nästa case",
  form: "Formuläret",
  nav: "Menyn",
  footer: "Sidfoten",
};
export const sectionLabel = (s) => SECTION_LABELS[s] || (s ? s.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : "–");
const CASE_NAMES = Object.fromEntries(CASES.map((c) => [`/work/${c.slug}`, c.name]));
export const pathLabel = (p) => (p === "/" ? "Startsidan" : CASE_NAMES[p] ? `Case: ${CASE_NAMES[p]}` : p);
const FIELDS = { name: "namn", email: "e-post", company: "företag", description: "beskrivning", when: "tid" };
const SOURCES = { direct: "Direkt", mejl: "Mejl", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", google: "Google", pullup: "pullup.se" };

export const secs = (n) => {
  if (!n) return "–";
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
};
const clock = (iso) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const when = (iso) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const FILTERS = [
  ["all", "Alla"],
  ["read", "Läste vidare"],
  ["opened", "Öppnade formuläret"],
  ["sent", "Skickade"],
];

export function Visits({ days }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState("/");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [shown, setShown] = useState(40);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    authenticatedFetch(`/admin/visits?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [days]);

  if (error) return <p className="st-muted">Kunde inte hämta besöken.</p>;
  if (!data) return <p className="st-muted">Hämtar besök…</p>;

  const base = data.funnel[0]?.count || 0;
  const pageRow = data.pages.find((p) => p.page === page) || data.pages[0];
  // The live sections in order, each with its numbers (zero if nobody got
  // there yet). A page without a known layout shows what was measured.
  const layout = pageRow && LAYOUTS[pageRow.page];
  const rows = !pageRow ? [] : layout
    ? layout.map(([id, label], i) => ({
        key: id,
        name: `Sektion ${i + 1} – ${label}`,
        ...(pageRow.sections.find((x) => x.section === id) || { reached: 0, visits: 0, readers: 0, medianSecs: 0 }),
      }))
    : pageRow.sections.map((x) => ({ key: x.section, name: sectionLabel(x.section), ...x }));
  const list = data.visits.filter((v) => filter === "all" || v[filter]);

  return (
    <div className="vs">
      <h2>Resan</h2>
      <p className="st-muted">Av alla besök: hur många som tog varje steg.</p>
      <ol className="vs-funnel">
        {data.funnel.map((f, i) => (
          <li key={f.key}>
            <span>{f.label}</span>
            <b>{f.count}</b>
            <i style={{ width: `${Math.max(2, pctOf(f.count, base))}%` }} />
            <em>{i === 0 ? "" : `${pctOf(f.count, base)} %`}</em>
          </li>
        ))}
      </ol>

      <h2>Var tiden läggs</h2>
      <p className="st-muted">Sidans sektioner i ordning, som de ser ut nu. Nådde = andel av besöken sedan sektionen fanns som kom dit. Läste = besök med lästid där, median = hur länge de stannade (aktiv tid).</p>
      {data.pages.length > 1 && (
        <div className="vs-tabs">
          {data.pages.map((p) => (
            <button key={p.page} type="button" className={p.page === pageRow?.page ? "is-on" : ""} onClick={() => setPage(p.page)}>
              {pathLabel(p.page)} <small>{p.visits}</small>
            </button>
          ))}
        </div>
      )}
      {pageRow ? (
        <table className="st-table vs-sections">
          <thead><tr><th>Sektion</th><th>Nådde</th><th>Läste</th><th>Median</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key}>
                <td>{s.name}</td>
                <td>
                  <span className="vs-reach"><i style={{ width: `${pctOf(s.reached, s.visits)}%` }} /></span>
                  {s.visits ? `${pctOf(s.reached, s.visits)} %` : "–"}
                </td>
                <td>{s.readers || "–"}</td>
                <td>{secs(s.medianSecs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="st-muted">Inga besök än.</p>
      )}

      <h2>Besök <small className="st-muted">{data.total}</small></h2>
      <div className="vs-tabs">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={filter === k ? "is-on" : ""} onClick={() => { setFilter(k); setShown(40); }}>
            {label} <small>{k === "all" ? data.visits.length : data.visits.filter((v) => v[k]).length}</small>
          </button>
        ))}
      </div>
      <ul className="vs-list">
        {list.slice(0, shown).map((v) => (
          <li key={v.id} className={openId === v.id ? "is-open" : ""}>
            <button type="button" className="vs-row" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
              <time>{when(v.start)}</time>
              <span className="vs-src">{SOURCES[v.source] || v.source} · {v.device === "mobile" ? "mobil" : "dator"}</span>
              <span className="vs-path">{v.pages.map(pathLabel).join(" → ")}</span>
              <span className="vs-num">{secs(v.active)}</span>
              <span className="vs-num">{v.depth ? `${v.depth} %` : "–"}</span>
              <span className="vs-tags">
                {v.request ? <b className="vs-tag is-sent">{v.request.name}</b> : v.sent ? <b className="vs-tag is-sent">Skickade</b> : v.started ? <b className="vs-tag is-started">Började fylla i</b> : v.opened ? <b className="vs-tag">Formulär</b> : null}
              </span>
            </button>
            {openId === v.id && <Journey id={v.id} />}
          </li>
        ))}
      </ul>
      {list.length > shown && (
        <button type="button" className="vs-more" onClick={() => setShown(shown + 40)}>Visa fler ({list.length - shown} kvar)</button>
      )}
      <p className="st-muted st-note">Aktiv tid räknas när fliken syns och besökaren gjort något de senaste 45 sekunderna. Ett besök är en sidladdning: samma person som kommer tillbaka senare blir ett nytt besök. Lästid mäts från 23 okt.</p>
    </div>
  );
}

// One visit, step by step: how long each page and section held them, then
// everything they did, in order.
export function Journey({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/visits/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [id]);
  if (error) return <p className="st-muted vs-journey">Kunde inte hämta besöket.</p>;
  if (!data) return <p className="st-muted vs-journey">Hämtar…</p>;
  const { summary, steps } = data;
  const t0 = steps[0] ? new Date(steps[0].at).getTime() : 0;
  const plus = (iso) => {
    const s = Math.max(0, Math.round((new Date(iso).getTime() - t0) / 1000));
    return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div className="vs-journey">
      {summary?.request && <p className="vs-lead">Blev förfrågan: <b>{summary.request.name}</b>{summary.request.company ? ` · ${summary.request.company}` : ""}</p>}
      <div className="vs-reading">
        {(summary?.reading || []).map((r) => {
          const top = Math.max(1, ...r.sections.map((s) => s.secs));
          return (
            <div key={r.page}>
              <p><b>{pathLabel(r.page)}</b> <span className="st-muted">{secs(r.active)} aktiv · {r.depth ? `${r.depth} % ner` : "–"}</span></p>
              {r.sections.map((s) => (
                <div key={s.section} className="vs-bar">
                  <span>{sectionLabel(s.section)}</span>
                  <i><i style={{ width: `${(s.secs / top) * 100}%` }} /></i>
                  <em>{secs(s.secs)}</em>
                </div>
              ))}
              {!r.sections.length && <p className="st-muted">Ingen lästid mätt.</p>}
            </div>
          );
        })}
      </div>
      <ol className="vs-steps">
        {steps.map((s, i) => (
          <li key={i} className={`k-${s.kind}`}>
            <time title={clock(s.at)}>{plus(s.at)}</time>
            <span>{stepText(s)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function stepText(s) {
  switch (s.kind) {
    case "page": return <>Öppnade <b>{pathLabel(s.page)}</b></>;
    case "section": return <span className="st-muted">Kom till {sectionLabel(s.section)}</span>;
    case "click": return <>Klickade <b>”{s.label || s.href}”</b>{s.href && s.label ? <span className="st-muted"> → {s.href}</span> : null}{s.section ? <span className="st-muted"> · {sectionLabel(s.section)}</span> : null}</>;
    case "copy": return <>Kopierade text{s.section ? ` i ${sectionLabel(s.section)}` : ""} <span className="st-muted">({s.chars} tecken)</span></>;
    case "open": return <><b>Öppnade formuläret</b>{s.from ? <span className="st-muted"> · från {s.from}</span> : null}</>;
    case "fields": return <>Fyllde i {s.fields.map((f) => FIELDS[f] || f).join(", ")}</>;
    case "close": return <>Stängde formuläret efter {secs(s.secs)}{s.fields.length ? ` utan att skicka (hade fyllt i ${s.fields.map((f) => FIELDS[f] || f).join(", ")})` : ""}</>;
    case "error": return <>Formuläret sa nej: {s.error}</>;
    case "sent": return <b>Skickade förfrågan</b>;
    default: return s.kind;
  }
}

export const VISITS_CSS = `
  .st h2 small { font-size: 14px; font-weight: 600; margin-left: 6px; }
  .vs-funnel { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 6px; }
  .vs-funnel li { display: grid; grid-template-columns: 170px 44px 1fr 48px; align-items: center; gap: 10px; font-size: 14px; }
  .vs-funnel b { font-variant-numeric: tabular-nums; text-align: right; }
  .vs-funnel i { display: block; height: 10px; border-radius: 999px; background: #D9480F; }
  .vs-funnel em { font-style: normal; font-size: 12.5px; color: #6e6e73; font-variant-numeric: tabular-nums; }
  @media (max-width: 520px) { .vs-funnel li { grid-template-columns: 120px 34px 1fr 40px; gap: 6px; font-size: 13px; } }
  .vs-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; }
  .vs-tabs button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; border: 1px solid rgba(0,0,0,0.12); border-radius: 999px; background: #fff; color: #3a3a3e; cursor: pointer; }
  .vs-tabs button small { color: #6e6e73; font-weight: 500; margin-left: 4px; }
  .vs-tabs button.is-on { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
  .vs-tabs button.is-on small { color: rgba(255,255,255,0.7); }
  .vs-sections { margin-top: 14px; }
  .vs-reach { display: inline-block; width: 60px; height: 6px; border-radius: 999px; background: #f0f0f0; overflow: hidden; vertical-align: 1px; margin-right: 8px; }
  .vs-reach i { display: block; height: 100%; background: #D9480F; }
  @media (max-width: 520px) { .vs-reach { display: none; } }
  .vs-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 6px; }
  .vs-list li { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; overflow: hidden; }
  .vs-list li.is-open { border-color: rgba(0,0,0,0.3); }
  .vs-row { font: inherit; width: 100%; display: grid; grid-template-columns: 112px 120px minmax(0, 1fr) 52px 44px auto; align-items: center; gap: 10px; padding: 10px 14px; border: 0; background: #fff; text-align: left; cursor: pointer; font-size: 13.5px; color: #0a0a0a; }
  .vs-row:hover { background: #fafafa; }
  .vs-row time, .vs-src { color: #6e6e73; font-size: 12.5px; white-space: nowrap; }
  .vs-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vs-num { text-align: right; font-variant-numeric: tabular-nums; }
  .vs-tags { justify-self: end; }
  .vs-tag { font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: rgba(217,72,15,0.1); color: #D9480F; white-space: nowrap; }
  .vs-tag.is-started { background: #D9480F; color: #fff; }
  .vs-tag.is-sent { background: #1f7a3a; color: #fff; }
  @media (max-width: 720px) {
    .vs-row { grid-template-columns: minmax(0, 1fr) auto auto; row-gap: 2px; }
    .vs-row time { grid-column: 1; } .vs-src { grid-column: 2 / 4; text-align: right; }
    .vs-path { grid-column: 1; } .vs-row .vs-num { grid-row: 2; }
    .vs-tags { grid-column: 1 / 4; justify-self: start; }
    .vs-tags:empty { display: none; }
  }
  .vs-more { font: inherit; font-size: 13px; font-weight: 600; margin-top: 10px; padding: 8px 14px; border: 1px solid rgba(0,0,0,0.12); border-radius: 999px; background: #fff; cursor: pointer; }
  .vs-journey { padding: 4px 14px 16px; border-top: 1px solid rgba(0,0,0,0.06); background: #fcfcfc; }
  .vs-lead { margin: 12px 0 0; font-size: 14px; color: #1f7a3a; }
  .vs-reading { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px 24px; margin-top: 12px; }
  .vs-reading p { margin: 0 0 6px; font-size: 13.5px; }
  .vs-bar { display: grid; grid-template-columns: 96px 1fr 44px; align-items: center; gap: 8px; font-size: 12.5px; margin: 3px 0; }
  .vs-bar > i { display: block; height: 6px; border-radius: 999px; background: #f0f0f0; overflow: hidden; }
  .vs-bar > i > i { display: block; height: 100%; background: #0a0a0a; }
  .vs-bar em { font-style: normal; text-align: right; color: #6e6e73; font-variant-numeric: tabular-nums; }
  .vs-steps { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 4px; font-size: 13.5px; }
  .vs-steps li { display: grid; grid-template-columns: 52px 1fr; gap: 10px; }
  .vs-steps time { color: #6e6e73; font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 1px; }
  .vs-steps .k-open span, .vs-steps .k-fields span { color: #D9480F; }
  .vs-steps .k-sent span { color: #1f7a3a; }
`;
