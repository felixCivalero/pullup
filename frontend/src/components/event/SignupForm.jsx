import { useState } from "react";
import { eventVisitId } from "../../lib/eventView.js";
import { Check } from "lucide-react";
import { API_BASE } from "../../lib/env.js";
import { Turnstile } from "../Turnstile.jsx";

/* The sign-up inside the event page (dark, like the page): name, email, a
   yes to future invitations from the organiser (the brand behind the event,
   named — the yes is to them, not to PullUp or anyone else) → POST /events/:slug/rsvp → confirmed (with
   add-to-calendar) or on the waitlist. In the editor's preview it's inert. */

const ERRORS = {
  missing_name: "Skriv ditt namn.",
  invalid_email: "E-postadressen ser inte rätt ut.",
  closed: "Anmälan är stängd.",
  rate_limited: "För många försök, vänta en stund.",
  bot_check: "Vi kunde inte bekräfta att du är en människa. Ladda om sidan och försök igen.",
  missing_phone: "Skriv ditt telefonnummer.",
  invalid_phone: "Telefonnumret ser inte rätt ut.",
  missing_instagram: "Skriv ditt Instagram-namn.",
  invalid_instagram: "Instagram-namnet ser inte rätt ut.",
};

export function SignupForm({ slug, full = false, open = true, calendar = null, cta = null, organizer = null, preview = false, form: ask = null, lang = "sv" }) {
  // What this event asks besides name and email (backend lib/eventForm.js).
  const f = { phone: "off", instagram: "off", plusOnes: 0, questions: [], ...(ask || {}) };
  const questions = (f.questions || []).filter((q) => q.label && (q.type !== "choice" || (q.options || []).filter(Boolean).length >= 2));
  const [form, setForm] = useState({ name: "", email: "", consent: false, website: "", phone: "", instagram: "", plusOnes: 0 });
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [turnstile, setTurnstile] = useState("");
  const [check, setCheck] = useState(0); // a new bot check after a failed try (a token works once)
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
        body: JSON.stringify({ ...form, answers, turnstile, visitId: eventVisitId(), lang }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        setError(ERRORS[out.error] || (out.error === "missing_answer" ? `Svara på: ${out.question}` : out.error === "invalid_answer" ? `Välj ett alternativ: ${out.question}` : "Något gick fel. Försök igen."));
        setState("error");
        setTurnstile("");
        setCheck((n) => n + 1);
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
          <p>{waitlist ? `Eventet är fullt just nu. Vi mejlar ${form.email} om en plats blir ledig.` : `En bekräftelse är på väg till ${form.email}.${form.plusOnes ? ` Du är anmäld med ${form.plusOnes} ${form.plusOnes === 1 ? "gäst" : "gäster"}.` : ""}`}</p>
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
      {f.phone !== "off" && (
        <input placeholder={f.phone === "required" ? "Telefon" : "Telefon (valfritt)"} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} readOnly={preview} />
      )}
      {f.instagram !== "off" && (
        <div className="sf-at">
          <span>@</span>
          <input placeholder={f.instagram === "required" ? "Instagram" : "Instagram (valfritt)"} autoCapitalize="none" autoCorrect="off" value={form.instagram} onChange={set("instagram")} readOnly={preview} />
        </div>
      )}
      {questions.map((q) => (
        q.type === "check" ? (
          <label key={q.id} className="sf-consent sf-q-check">
            <input type="checkbox" checked={!!answers[q.id]} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.checked }))} disabled={preview} />
            <span>{q.label}{q.required ? " *" : ""}</span>
          </label>
        ) : q.type === "choice" ? (
          <label key={q.id} className="sf-q">
            <span>{q.label}{q.required ? " *" : ""}</span>
            <select value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} disabled={preview}>
              <option value="">Välj…</option>
              {q.options.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ) : (
          <input key={q.id} placeholder={`${q.label}${q.required ? "" : " (valfritt)"}`} maxLength={500} value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} readOnly={preview} />
        )
      ))}
      {f.plusOnes > 0 && (
        // Guests they bring: a quiet stepper after the fields, not a menu
        // among them. Each one counts as a place.
        <div className="sf-guests">
          <div className="sf-guests-text">
            <b>Tar du med någon?</b>
            <small>{form.plusOnes ? `Du + ${form.plusOnes} ${form.plusOnes === 1 ? "gäst" : "gäster"}` : "Bara du"}</small>
          </div>
          <div className="sf-step">
            <button type="button" aria-label="Färre" disabled={preview || form.plusOnes === 0} onClick={() => setForm((x) => ({ ...x, plusOnes: x.plusOnes - 1 }))}>−</button>
            <span aria-live="polite">{form.plusOnes ? `+${form.plusOnes}` : "0"}</span>
            <button type="button" aria-label="Fler" disabled={preview || form.plusOnes >= f.plusOnes} onClick={() => setForm((x) => ({ ...x, plusOnes: x.plusOnes + 1 }))}>+</button>
          </div>
        </div>
      )}
      <label className="sf-consent">
        <input type="checkbox" checked={form.consent} onChange={set("consent")} disabled={preview} />
        <span>{organizer ? `Jag vill få inbjudningar till kommande event från ${organizer}.` : "Jag vill få inbjudningar till kommande event."}</span>
      </label>
      {!preview && <Turnstile key={check} onToken={setTurnstile} theme="dark" />}
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
  .sf-at { position: relative; }
  .sf-at span { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.45); font-size: 16px; pointer-events: none; }
  .sf-at input { padding-left: 32px !important; }
  .sf-guests { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 10px 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); }
  .sf-guests-text { display: grid; gap: 1px; min-width: 0; }
  .sf-guests-text b { font-size: 15px; font-weight: 600; color: #fff; }
  .sf-guests-text small { font-size: 12.5px; color: rgba(255,255,255,0.55); }
  .sf-step { display: flex; align-items: center; gap: 4px; flex: none; }
  .sf .sf-step button { width: 36px; height: 36px; padding: 0; margin: 0; border-radius: 999px; border: 1px solid rgba(255,255,255,0.22); background: transparent; color: #fff; font-size: 19px; font-weight: 500; line-height: 1; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
  .sf .sf-step button:hover:not(:disabled) { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.5); }
  .sf .sf-step button:disabled { opacity: .3; cursor: default; }
  .sf-step span { min-width: 30px; text-align: center; font-size: 15px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
  .sf-plus, .sf-q { display: grid; gap: 6px; font-size: 13.5px; color: rgba(255,255,255,0.75); }
  .sf-plus { grid-template-columns: 1fr auto; align-items: center; }
  .sf select { font: inherit; font-size: 15px; padding: 12px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: #fff; outline: none; width: 100%; box-sizing: border-box; }
  .sf-plus select { width: auto; min-width: 130px; }
  .sf select option { color: #000; }
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
