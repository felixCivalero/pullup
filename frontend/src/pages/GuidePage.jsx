import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../lib/env.js";
import { trackEvent } from "../lib/analytics.js";
import { initTracking, trackPageView } from "../lib/track.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { Turnstile } from "../components/Turnstile.jsx";
import { useT } from "../components/agency/i18n.js";
import { GUIDE_META } from "./homeMeta.js";

/* /stockholm — what's on, with filters, and the Thursday mail. The rows come
   from the nightly scrape (backend routes/stockholm.js): the facts and a link
   to the organiser. Following keeps the topics picked here. */
const ZONE = "Europe/Stockholm";
const TOPICS = [["music", "Music"], ["art", "Art"], ["stage", "Stage"], ["culture", "Culture"]];
const WHEN = [["all", "All"], ["today", "Today"], ["weekend", "This weekend"], ["week", "Next 7 days"]];
const PAGE = 100;

const dayKey = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: ZONE });
const dayLabel = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });
// Sources that only give a date arrive as midnight UTC: no time to show.
const clock = (d) => (d.includes("T00:00:00") ? "" : new Date(d).toLocaleTimeString("sv-SE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" }));
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The span of days a choice means, in Stockholm dates.
function span(when, today) {
  if (when === "today") return [today, today];
  if (when === "week") return [today, addDays(today, 6)];
  if (when === "weekend") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
    return [addDays(today, Math.max(5 - weekday, 0)), addDays(today, 7 - weekday)];
  }
  return null;
}

const hits = (e, { when, today, topics, area, q }) => {
  if (topics.length && !topics.includes(e.topic)) return false;
  if (area && e.area !== area) return false;
  if (q && !`${e.title} ${e.place || ""}`.toLowerCase().includes(q)) return false;
  const range = span(when, today);
  if (!range) return true;
  const start = dayKey(e.startsAt);
  const end = e.endsAt ? dayKey(e.endsAt) : start;
  return start <= range[1] && end >= range[0];
};

export function GuidePage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);
  const [when, setWhen] = useState("all");
  const [topics, setTopics] = useState([]);
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [more, setMore] = useState({ key: "", n: PAGE });
  const [note, setNote] = useState("");

  useEffect(() => {
    initTracking();
    trackPageView("stockholm");
    document.title = GUIDE_META.title;
    fetch(`${API_BASE}/stockholm/events`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEvents(d.events || []))
      .catch(() => setFailed(true));
  }, []);

  // The link in the confirmation mail lands here; the page does the POST, so
  // a mail scanner opening the link confirms nobody.
  const confirm = params.get("folj");
  useEffect(() => {
    if (!confirm) return;
    fetch(`${API_BASE}/stockholm/confirm/${encodeURIComponent(confirm)}`, { method: "POST" })
      .then((r) => setNote(r.ok ? "You're following Stockholm. See you on Thursday." : "That link doesn't work any more."))
      .catch(() => setNote("That link doesn't work any more."))
      .finally(() => setParams({}, { replace: true }));
  }, [confirm, setParams]);

  // New filters start the list over.
  const filterKey = JSON.stringify([when, topics, area, search]);
  const shown = more.key === filterKey ? more.n : PAGE;

  const today = dayKey(new Date());
  const areas = useMemo(() => [...new Set((events || []).map((e) => e.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")), [events]);
  const { days, running, total } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = (events || []).filter((e) => hits(e, { when, today, topics, area, q }));
    const later = found.filter((e) => dayKey(e.startsAt) >= today);
    const map = new Map();
    for (const e of later.slice(0, shown)) {
      const k = dayKey(e.startsAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return { days: [...map.values()], running: found.filter((e) => dayKey(e.startsAt) < today), total: later.length };
  }, [events, when, today, topics, area, search, shown]);

  const toggle = (topic) => setTopics((l) => (l.includes(topic) ? l.filter((x) => x !== topic) : [...l, topic]));

  return (
    <AgencyShell css={GUIDE_CSS} brand>
      <div className="gd" data-pc-tone="dark" data-pc-section="guide" data-pc-order="1">
        <header className="gd-head">
          <h1>Stockholm</h1>
          <p>{t("Everything on, in one place. Free.")}</p>
          {note && <p className="gd-note" role="status">{t(note)}</p>}
        </header>

        <div className="gd-filters">
          <div className="gd-row" role="group" aria-label={t("When")}>
            {WHEN.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}>{t(label)}</button>
            ))}
          </div>
          <div className="gd-row" role="group" aria-label={t("What")}>
            {TOPICS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={topics.includes(k)} onClick={() => toggle(k)}>{t(label)}</button>
            ))}
          </div>
          <div className="gd-row">
            <select aria-label={t("Where")} value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">{t("All of Stockholm")}</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="search" aria-label={t("Search")} placeholder={t("Search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Follow topics={topics} />

        {failed && <p className="gd-empty">{t("The list didn't load. Try again in a moment.")}</p>}
        {events && !days.length && !running.length && <p className="gd-empty">{t("Nothing matches. Try fewer filters.")}</p>}

        {days.map((list) => (
          <section key={list[0].id} className="gd-day">
            <h2>{dayLabel(list[0].startsAt)}</h2>
            <ul>{list.map((e) => <Row key={e.id} e={e} left={clock(e.startsAt)} />)}</ul>
          </section>
        ))}
        {total > shown && (
          <button type="button" className="gd-more" onClick={() => setMore({ key: filterKey, n: shown + PAGE })}>{t("Show more")}</button>
        )}
        {running.length > 0 && (
          <section className="gd-day">
            <h2>{t("Running now")}</h2>
            <ul>{running.map((e) => <Row key={e.id} e={e} left={e.endsAt ? new Date(e.endsAt).toLocaleDateString("sv-SE", { timeZone: ZONE, day: "numeric", month: "short" }) : ""} />)}</ul>
          </section>
        )}
      </div>
    </AgencyShell>
  );
}

// Every row has a picture: the organiser's own image, shown from their
// server, or a tile in the topic's colours when there is none or it won't load.
function Thumb({ e }) {
  const [broken, setBroken] = useState(false);
  if (e.image && !broken) {
    return (
      <i className="gd-thumb">
        <img
          src={e.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          // A pre-rendered page may fail the image before React is listening.
          ref={(img) => { if (img?.complete && img.naturalWidth === 0) setBroken(true); }}
          onError={() => setBroken(true)}
        />
      </i>
    );
  }
  return <i className={`gd-thumb is-${e.topic}`} aria-hidden="true"><span>{e.title.trim().charAt(0)}</span></i>;
}

function Row({ e, left }) {
  const t = useT();
  return (
    <li>
      <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("cta_click", { location: "guide_event" })}>
        <Thumb e={e} />
        <time>{left}</time>
        <b>{e.title}</b>
        <span>{[e.place, e.area].filter(Boolean).join(" · ")}</span>
        <em>{t(TOPICS.find(([k]) => k === e.topic)?.[1] || "")}</em>
      </a>
    </li>
  );
}

function Follow({ topics }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [turnstile, setTurnstile] = useState("");
  const [state, setState] = useState("idle");

  const submit = async (e) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}/stockholm/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, topics, website, turnstile }),
      });
      if (!res.ok) throw new Error("failed");
      trackEvent("cta_click", { location: "guide_follow" });
      // Statistik: that this visit followed, and for what — never the email.
      trackEvent("input", { form: "follow", value: topics.length ? topics.join(", ") : "allt" });
      setState("sent");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") return <p className="gd-follow gd-sent">{t("Almost there. Confirm in the mail we just sent.")}</p>;
  return (
    <form className="gd-follow" onSubmit={submit}>
      <label htmlFor="gd-email">{t(topics.length ? "Get your picks by email every Thursday." : "Get it by email every Thursday.")}</label>
      <div>
        <input id="gd-email" type="email" required autoComplete="email" placeholder={t("Your email")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="gd-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <button type="submit" disabled={state === "sending"}>{t("Follow")}</button>
      </div>
      <Turnstile onToken={setTurnstile} theme="light" />
      {state === "error" && <p role="alert">{t("That didn't work. Check the address and try again.")}</p>}
    </form>
  );
}

const GUIDE_CSS = `
  .pc .cb { background: rgba(18,4,9,.94); color: #fff; border-color: rgba(255,255,255,.14); }
  .pc .cb .cb-p { color: rgba(255,255,255,.65); }
  .pc .cb .cb-p a { color: #fff; }
  .pc .cb .cb-seg { background: rgba(255,255,255,.08); }
  .pc .cb .cb-seg button { color: #fff; }
  .gd { background: #0a0a0a; color: #f4f1ea; min-height: 100svh; padding: 96px clamp(16px, 5vw, 56px) 80px; }
  .gd-row select option { color: #0a0a0a; }
  .gd-head h1 { margin: 0; font-family: "Instrument Serif", serif; font-size: clamp(64px, 12vw, 180px); line-height: .95; letter-spacing: -0.03em; font-weight: 400; }
  .gd-head p { margin: 12px 0 0; font-size: clamp(17px, 1.6vw, 21px); letter-spacing: -0.01em; color: rgba(255,255,255,.6); }
  .gd-head .gd-note { color: #f4f1ea; font-weight: 600; }
  .gd-filters { display: grid; gap: 8px; margin: 32px 0 20px; }
  .gd-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .gd-row button, .gd-row select, .gd-row input { height: 38px; padding: 0 15px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: transparent; color: #fff; font: inherit; font-size: 14px; font-weight: 500; }
  .gd-row button { cursor: pointer; transition: background .15s ease, color .15s ease; }
  .gd-row button[aria-pressed="true"] { background: #f4f1ea; border-color: #f4f1ea; color: #0a0a0a; }
  .gd-row input { flex: 1 1 160px; max-width: 320px; min-width: 0; }
  .gd-follow { margin: 0 0 32px; padding: 16px 0; border-block: 1px solid rgba(255,255,255,.16); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .gd-follow label { display: block; margin-bottom: 8px; }
  .gd-follow > div { display: flex; gap: 6px; max-width: 420px; }
  .gd-follow input[type="email"] { flex: 1; min-width: 0; height: 42px; padding: 0 16px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: transparent; color: #fff; font: inherit; font-size: 15px; font-weight: 400; }
  .gd-follow button { height: 42px; padding: 0 20px; border: 0; border-radius: 999px; background: #f4f1ea; color: #0a0a0a; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .gd-follow p { margin: 8px 0 0; font-weight: 500; color: rgba(255,255,255,.6); }
  .gd-sent { color: #f4f1ea; }
  .gd-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .gd-empty { padding: 32px 0; color: rgba(255,255,255,.6); }
  .gd-day { margin-bottom: 32px; }
  .gd-day h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,.6); }
  .gd-day h2::first-letter { text-transform: uppercase; }
  .gd-day ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(255,255,255,.16); }
  .gd-day a { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-content: center; gap: 2px 14px; padding: 12px 0; color: inherit; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.16); }
  .gd-thumb { grid-row: 1 / span 3; display: block; width: 84px; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #1a1a1a; font-style: normal; }
  .gd-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .5s cubic-bezier(.16,1,.3,1); }
  .gd-day a:hover .gd-thumb img { transform: scale(1.06); }
  .gd-thumb span { display: grid; place-items: center; height: 100%; font-size: 36px; font-weight: 700; letter-spacing: -0.05em; color: #0a0a0a; text-transform: uppercase; }
  .gd-thumb.is-music { background: radial-gradient(120% 120% at 30% 20%, #f43aa5 0%, #ec178f 50%, #5a0636 100%); }
  .gd-thumb.is-art { background: linear-gradient(135deg, #f5efe8 0%, #f7b6d6 100%); }
  .gd-thumb.is-stage { background: radial-gradient(120% 120% at 70% 20%, #4a0d2e 0%, #141414 70%); }
  .gd-thumb.is-stage span { color: #ec178f; }
  .gd-thumb.is-culture { background: linear-gradient(135deg, #ec178f 0%, #ff8a3d 100%); }
  .gd-day time { font-size: 13px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.6); }
  .gd-day b { font-size: 17px; line-height: 1.25; letter-spacing: -0.015em; font-weight: 500; }
  .gd-day span { font-size: 14px; color: rgba(255,255,255,.6); }
  .gd-day em { display: none; font-style: normal; font-size: 13px; color: rgba(255,255,255,.6); }
  .gd-day a:hover b { color: #ec178f; }
  @media (min-width: 900px) {
    .gd-day a { grid-template-columns: 120px 64px minmax(0, 3fr) minmax(0, 2fr) 72px; align-items: center; gap: 0 16px; }
    .gd-thumb { grid-row: auto; width: 120px; aspect-ratio: 4 / 3; }
    .gd-day time { font-size: 14px; }
    .gd-day em { display: block; text-align: right; }
  }
  .gd-more { height: 42px; padding: 0 20px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: transparent; color: #fff; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 32px; }
`;
