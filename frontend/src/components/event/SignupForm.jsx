import { useState } from "react";
import { Check } from "lucide-react";
import { API_BASE } from "../../lib/env.js";

/* The sign-up inside the event page (dark, like the page): name, email, a
   yes to future invitations → POST /events/:slug/rsvp → confirmed (with
   add-to-calendar) or on the waitlist. In the editor's preview it's inert. */

const ERRORS = {
  missing_name: "Skriv ditt namn.",
  invalid_email: "E-postadressen ser inte rätt ut.",
  closed: "Anmälan är stängd.",
  rate_limited: "För många försök, vänta en stund.",
};

export function SignupForm({ slug, full = false, open = true, calendar = null, cta = null, preview = false }) {
  const [form, setForm] = useState({ name: "", email: "", consent: false, website: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (preview || state === "sending") return;
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

  if (!open) return <p className="sf-closed">Anmälan är stängd.</p>;

  if (state === "done") {
    const cal = result.calendar || calendar;
    const waitlist = result.status === "waitlist";
    return (
      <div className="sf">
        <style>{CSS}</style>
        <div className="sf-done">
          <span className="sf-check"><Check size={20} strokeWidth={2.4} /></span>
          <b>{waitlist ? "Du står på väntelistan" : result.already ? "Du är redan anmäld" : "Du är anmäld"}</b>
          <p>{waitlist ? `Eventet är fullt just nu. Vi mejlar ${form.email} om en plats blir ledig.` : `En bekräftelse är på väg till ${form.email}.`}</p>
          {!waitlist && cal && (
            <div className="sf-cal">
              <a href={cal.google} target="_blank" rel="noreferrer">Google Kalender</a>
              <a href={cal.ics} className="is-light">Apple / Outlook</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form className="sf" onSubmit={submit} noValidate>
      <style>{CSS}</style>
      <input placeholder="Namn" autoComplete="name" value={form.name} onChange={set("name")} readOnly={preview} />
      <input placeholder="E-post" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} readOnly={preview} />
      <label className="sf-consent">
        <input type="checkbox" checked={form.consent} onChange={set("consent")} disabled={preview} />
        <span>Jag vill få inbjudningar till kommande event.</span>
      </label>
      <input className="sf-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Skickar…" : cta || (full ? "Ställ mig i kö" : "Anmäl mig")}
      </button>
      {state === "error" && <p className="sf-error" role="alert">{error}</p>}
      <p className="sf-fine">Vi använder din e-post för bekräftelsen och info om eventet. <a href="/privacy">Integritetspolicy</a></p>
    </form>
  );
}

const CSS = `
  .sf { display: grid; gap: 10px; font-family: inherit; }
  .sf input:not([type="checkbox"]) { font: inherit; font-size: 16px; padding: 14px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: #fff; outline: none; width: 100%; box-sizing: border-box; }
  .sf input::placeholder { color: rgba(255,255,255,0.45); }
  .sf input:focus { border-color: rgba(255,255,255,0.5); }
  .sf-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; color: rgba(255,255,255,0.75); cursor: pointer; }
  .sf-consent input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: #fff; flex-shrink: 0; }
  .sf-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .sf button { font: inherit; font-size: 15px; font-weight: 700; padding: 15px; border-radius: 999px; border: 0; background: #fff; color: #000; cursor: pointer; margin-top: 4px; }
  .sf button:disabled { opacity: 0.6; cursor: default; }
  .sf-error { margin: 0; font-size: 13.5px; color: #ff9a6b; }
  .sf-fine { margin: 2px 0 0; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.45); }
  .sf-fine a { color: inherit; }
  .sf-closed { margin: 0; color: rgba(255,255,255,0.6); font-size: 15px; }
  .sf-done { display: grid; gap: 8px; justify-items: start; color: #fff; }
  .sf-done b { font-size: 19px; }
  .sf-done p { margin: 0; font-size: 14.5px; line-height: 1.5; color: rgba(255,255,255,0.75); }
  .sf-check { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: #1f7a3a; color: #fff; }
  .sf-cal { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .sf-cal a { font-size: 14px; font-weight: 700; padding: 11px 16px; border-radius: 999px; background: #fff; color: #000; text-decoration: none; }
  .sf-cal a.is-light { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.3); }
`;
