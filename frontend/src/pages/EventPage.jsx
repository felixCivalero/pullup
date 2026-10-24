import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { API_BASE } from "../lib/env.js";
import { formatEventWhen } from "../lib/zonedTime.js";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* /e/:slug — an event, the way a guest expects one: what, when, where, sign
   up, get a confirmation and put it in the calendar. Nothing else. Backend:
   routes/events.js (crawlers get share previews from /e/:slug there). */

const ERRORS = {
  missing_name: "Skriv ditt namn.",
  invalid_email: "E-postadressen ser inte rätt ut.",
  closed: "Anmälan är stängd.",
  rate_limited: "För många försök, vänta en stund.",
};

export function EventPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", consent: false, website: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/events/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => alive && setData(d))
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!data) return undefined;
    const prev = document.title;
    document.title = data.event.title;
    return () => { document.title = prev; };
  }, [data]);

  const submit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/events/${encodeURIComponent(slug)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        setError(ERRORS[out.error] || "Något gick fel. Försök igen.");
        setState("error");
        return;
      }
      setResult(out);
      setState("done");
    } catch {
      setError("Kunde inte nå servern. Kolla uppkopplingen och försök igen.");
      setState("error");
    }
  };

  if (missing) {
    return (
      <main className="ev">
        <style>{EVENT_CSS}</style>
        <div className="ev-empty"><h1>Eventet finns inte</h1><p>Länken kan vara fel, eller så har eventet tagits bort.</p></div>
      </main>
    );
  }
  if (!data) return <main className="ev"><style>{EVENT_CSS}</style></main>;

  const ev = data.event;
  const calendar = result?.calendar || data.calendar;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const mapUrl = ev.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}` : null;

  return (
    <main className="ev">
      <style>{EVENT_CSS}</style>
      <article className="ev-card">
        {ev.imageUrl && <img className="ev-img" src={ev.imageUrl} alt="" />}
        <div className="ev-body">
          <h1>{ev.title}</h1>
          <p className="ev-meta"><CalendarDays size={18} strokeWidth={1.75} />{cap(formatEventWhen(ev.startsAt, ev.endsAt, ev.timezone, { year: true }))}</p>
          {ev.location && (
            <p className="ev-meta"><MapPin size={18} strokeWidth={1.75} /><a href={mapUrl} target="_blank" rel="noreferrer">{ev.location}</a></p>
          )}
          {ev.text && <div className="ev-text">{ev.text}</div>}

          <section className="ev-rsvp" aria-live="polite">
            {state === "done" ? (
              <div className="ev-done">
                <span className="ev-check"><Check size={22} strokeWidth={2.2} /></span>
                <h2>{result.status === "waitlist" ? "Du står på väntelistan" : result.already ? "Du är redan anmäld" : "Du är anmäld"}</h2>
                <p>
                  {result.status === "waitlist"
                    ? `Eventet är fullt just nu. Vi mejlar ${form.email} om en plats blir ledig.`
                    : `En bekräftelse är på väg till ${form.email}. Lägg in det i kalendern:`}
                </p>
                {result.status !== "waitlist" && (
                  <div className="ev-cal">
                    <a className="ev-btn" href={calendar.google} target="_blank" rel="noreferrer">Google Kalender</a>
                    <a className="ev-btn ev-btn-light" href={calendar.ics}>Apple / Outlook</a>
                  </div>
                )}
              </div>
            ) : !ev.open ? (
              <p className="ev-closed">Anmälan är stängd.</p>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2>{ev.full ? "Fullt, men skriv upp dig på väntelistan" : "Anmäl dig"}</h2>
                {ev.spotsLeft != null && ev.spotsLeft > 0 && ev.spotsLeft <= 20 && <p className="ev-left">{ev.spotsLeft} platser kvar</p>}
                <label><span>Namn</span><input required autoComplete="name" value={form.name} onChange={set("name")} /></label>
                <label><span>E-post</span><input required type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} /></label>
                <label className="ev-consent">
                  <input type="checkbox" checked={form.consent} onChange={set("consent")} />
                  <span>Jag vill få inbjudningar till kommande event.</span>
                </label>
                <input className="ev-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />
                <button type="submit" className="ev-btn ev-send" disabled={state === "sending"}>
                  {state === "sending" ? "Skickar…" : ev.full ? "Ställ mig i kö" : "Anmäl mig"}
                </button>
                {state === "error" && <p className="ev-error" role="alert">{error}</p>}
                <p className="ev-fine">Vi använder din e-post för bekräftelsen och info om eventet. Läs mer i <a href="/privacy">integritetspolicyn</a>.</p>
              </form>
            )}
          </section>
        </div>
      </article>
      <p className="ev-foot">Skapat med PullUp</p>
    </main>
  );
}

const EVENT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');
  body { margin: 0; background: #f4f4f5; }
  .ev { min-height: 100dvh; padding: clamp(0px, 4vw, 40px) 0 32px; box-sizing: border-box; font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; }
  .ev-card { max-width: 620px; margin: 0 auto; background: #fff; border-radius: clamp(0px, 4vw, 24px); overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06); }
  .ev-img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #e4e4e7; }
  .ev-body { padding: 24px 20px 28px; }
  @media (min-width: 560px) { .ev-body { padding: 32px 36px 36px; } }
  .ev h1 { margin: 0 0 14px; font-size: clamp(28px, 6vw, 38px); line-height: 1.08; letter-spacing: -0.03em; }
  .ev-meta { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 8px; font-size: 16px; line-height: 1.4; }
  .ev-meta svg { flex-shrink: 0; margin-top: 1px; color: #6e6e73; }
  .ev-meta a { color: inherit; text-decoration-color: rgba(0,0,0,0.25); text-underline-offset: 3px; }
  .ev-text { margin: 20px 0 0; font-size: 16px; line-height: 1.6; color: #3a3a3e; white-space: pre-wrap; }
  .ev-rsvp { margin-top: 28px; padding-top: 24px; border-top: 1px solid rgba(0,0,0,0.08); }
  .ev-rsvp h2 { margin: 0 0 14px; font-size: 20px; letter-spacing: -0.02em; }
  .ev-rsvp form { display: grid; gap: 12px; }
  .ev-left { margin: -8px 0 2px; font-size: 14px; color: #D9480F; font-weight: 600; }
  .ev-rsvp label:not(.ev-consent) { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: #3a3a3e; }
  .ev-rsvp input:not([type="checkbox"]) { font: inherit; font-size: 16px; padding: 13px 14px; border: 1px solid rgba(0,0,0,0.16); border-radius: 12px; outline: none; background: #fff; }
  .ev-rsvp input:focus { border-color: #0a0a0a; }
  .ev-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.4; color: #3a3a3e; cursor: pointer; }
  .ev-consent input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: #0a0a0a; flex-shrink: 0; }
  .ev-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .ev-btn { display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 15px; font-weight: 600; padding: 14px 20px; border-radius: 999px; border: 1px solid #0a0a0a; background: #0a0a0a; color: #fff; text-decoration: none; cursor: pointer; }
  .ev-btn:disabled { opacity: 0.5; cursor: default; }
  .ev-btn-light { background: #fff; color: #0a0a0a; border-color: rgba(0,0,0,0.18); }
  .ev-send { width: 100%; margin-top: 4px; }
  .ev-error { margin: 0; font-size: 14px; color: #D9480F; }
  .ev-fine { margin: 2px 0 0; font-size: 12.5px; line-height: 1.5; color: #8a8a8e; }
  .ev-fine a { color: inherit; }
  .ev-closed { margin: 0; font-size: 16px; color: #6e6e73; }
  .ev-done { display: grid; gap: 8px; justify-items: start; }
  .ev-done h2 { margin: 6px 0 0; }
  .ev-done p { margin: 0; font-size: 15px; line-height: 1.5; color: #3a3a3e; }
  .ev-check { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; background: #1f7a3a; color: #fff; }
  .ev-cal { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .ev-foot { text-align: center; margin: 22px 0 0; font-size: 12px; color: #a1a1aa; }
  .ev-empty { max-width: 420px; margin: 20vh auto 0; padding: 0 16px; text-align: center; }
  .ev-empty p { color: #6e6e73; }
`;
