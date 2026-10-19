import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { API_BASE } from "../../lib/env.js";
import { trackEvent } from "../../lib/analytics.js";
import { CONTACT, OFFER } from "./agencyData.js";
import { requestMeta } from "./request.js";
import { useT } from "./i18n.js";

/* "Start a conversation": who you are, where you want to go, when we can
   talk — posted to /agency-requests, which emails it to
   hello@pullup.se with where the visitor came from. Opened via openRequest(). */
const WHEN = ["This week", "Next week", "Within a month", "Pick a time"];

export function RequestDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [form, setForm] = useState({ name: "", email: "", company: "", description: "", website: "" });
  const [when, setWhen] = useState("");
  const [at, setAt] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    const onOpen = (e) => {
      setSource(e.detail?.source || "");
      setState((s) => (s === "done" ? "idle" : s));
      setError("");
      setOpen(true);
      trackEvent("request_open", { source: e.detail?.source || "" });
    };
    window.addEventListener("pullup:request", onOpen);
    return () => window.removeEventListener("pullup:request", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => firstRef.current?.focus(), 80);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    const preferredTime =
      when === "Pick a time" ? (at ? new Date(at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }) : "") : when;
    try {
      const res = await fetch(`${API_BASE}/agency-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          preferredTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          source,
          meta: requestMeta(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          {
            invalid_email: t("That email doesn't look right."),
            missing_name: t("Tell us your name."),
            missing_description: t("Tell us a little more — a sentence or two."),
            rate_limited: t("Too many tries — give it a minute."),
          }[data.error] || t("Something went wrong. Try again, or email {email}.", { email: CONTACT }),
        );
        setState("error");
        return;
      }
      trackEvent("request_sent", { source });
      setState("done");
    } catch {
      setError(t("Couldn't reach us. Check your connection and try again."));
      setState("error");
    }
  };

  return (
    <div className="rq-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="rq" role="dialog" aria-modal="true" aria-labelledby="rq-title">
        <button type="button" className="rq-close" onClick={() => setOpen(false)} aria-label={t("Close")}>
          <X size={20} strokeWidth={1.75} />
        </button>

        {state === "done" ? (
          <div className="rq-done" role="status">
            <span className="rq-done-icon"><Check size={26} strokeWidth={2} /></span>
            <h2 id="rq-title">{t("Request sent.")}</h2>
            <p>
              {t("Thanks, {name}. It's with us at {contact} — we'll get back to you at {email} to find a time.", {
                name: form.name.split(" ")[0] || t("friend"),
                contact: CONTACT,
                email: form.email,
              })}
            </p>
            <button type="button" className="pc-btn pc-btn-dark" onClick={() => setOpen(false)}>{t("Close")}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="rq-k">{t("Start a conversation")}</p>
            <h2 id="rq-title" className="rq-h">{t("Tell us who you are and where you want to go.")}</h2>
            <p className="rq-offer">
              <b>{t(OFFER.label)} · {t(OFFER.price)} {t(OFFER.cadence)}</b>
              {t("First month: full scope. Not happy? Money back.")}
            </p>

            <div className="rq-row">
              <label className="rq-field">
                <span>{t("Name")}</span>
                <input ref={firstRef} required autoComplete="name" value={form.name} onChange={set("name")} />
              </label>
              <label className="rq-field">
                <span>{t("Email")}</span>
                <input type="email" inputMode="email" required autoComplete="email" value={form.email} onChange={set("email")} />
              </label>
            </div>
            <label className="rq-field">
              <span>{t("Brand or company")} <em>{t("optional")}</em></span>
              <input autoComplete="organization" value={form.company} onChange={set("company")} />
            </label>
            <label className="rq-field">
              <span>{t("What's going on")}</span>
              <textarea
                required
                rows={4}
                placeholder={t("Who you are, what you're building, and what you want to happen next.")}
                value={form.description}
                onChange={set("description")}
              />
            </label>

            <fieldset className="rq-field">
              <legend>{t("When can we talk?")} <em>{t("30 minutes")}</em></legend>
              <div className="rq-chips">
                {WHEN.map((w) => (
                  <button
                    type="button"
                    key={w}
                    className={`rq-chip${when === w ? " is-on" : ""}`}
                    aria-pressed={when === w}
                    onClick={() => setWhen(when === w ? "" : w)}
                  >
                    {t(w)}
                  </button>
                ))}
              </div>
              {when === "Pick a time" && (
                <input className="rq-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              )}
            </fieldset>

            {/* honeypot */}
            <input className="rq-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />

            <button type="submit" className="pc-btn pc-btn-dark rq-send" disabled={state === "sending"}>
              {state === "sending" ? t("Sending…") : t("Send request")}
              <ArrowRight size={18} strokeWidth={1.75} />
            </button>
            {state === "error" && <p className="rq-error" role="alert">{error}</p>}
            <p className="rq-fine">{t("Goes straight to {email}. No lists, no spam.", { email: CONTACT })}</p>
          </form>
        )}
      </div>
    </div>
  );
}
