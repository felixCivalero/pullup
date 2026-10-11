import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { API_BASE } from "../../lib/env.js";
import { trackEvent } from "../../lib/analytics.js";
import { BASE_MONTHLY, CONTACT, SUPERPOWERS } from "./agencyData.js";
import { requestMeta } from "./request.js";

/* "Start a conversation": who you are, where you want to go, when we can
   talk, which superpowers — posted to /agency-requests, which emails it to
   hello@pullup.se with where the visitor came from. Opened via openRequest(). */
const WHEN = ["This week", "Next week", "Within a month", "Pick a time"];
const usd = (n) => `$${n.toLocaleString("en-US")}`;

export function RequestDialog() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [powers, setPowers] = useState(() => new Set());
  const [form, setForm] = useState({ name: "", email: "", company: "", description: "", website: "" });
  const [when, setWhen] = useState("");
  const [at, setAt] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    const onOpen = (e) => {
      setSource(e.detail?.source || "");
      setPowers(new Set(e.detail?.powers || []));
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

  const picked = SUPERPOWERS.filter((p) => powers.has(p.id));
  const total = BASE_MONTHLY + picked.reduce((a, p) => a + p.price, 0);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const togglePower = (id) =>
    setPowers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          powers: [...powers],
          source,
          meta: requestMeta(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          {
            invalid_email: "That email doesn't look right.",
            missing_name: "Tell us your name.",
            missing_description: "Tell us a little more — a sentence or two.",
            rate_limited: "Too many tries — give it a minute.",
          }[data.error] || `Something went wrong. Try again, or email ${CONTACT}.`,
        );
        setState("error");
        return;
      }
      trackEvent("request_sent", { source, powers: [...powers].join(",") });
      setState("done");
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
      setState("error");
    }
  };

  return (
    <div className="rq-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="rq" role="dialog" aria-modal="true" aria-labelledby="rq-title">
        <button type="button" className="rq-close" onClick={() => setOpen(false)} aria-label="Close">
          <X size={20} strokeWidth={1.75} />
        </button>

        {state === "done" ? (
          <div className="rq-done" role="status">
            <span className="rq-done-icon"><Check size={26} strokeWidth={2} /></span>
            <h2 id="rq-title">Request sent.</h2>
            <p>
              Thanks, {form.name.split(" ")[0] || "friend"}. It's with us at {CONTACT} — we'll get back to
              you at {form.email} to find a time.
            </p>
            <button type="button" className="pc-btn pc-btn-dark" onClick={() => setOpen(false)}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="rq-k">Start a conversation</p>
            <h2 id="rq-title" className="rq-h">Tell us who you are and where you want to go.</h2>

            <div className="rq-row">
              <label className="rq-field">
                <span>Name</span>
                <input ref={firstRef} required autoComplete="name" value={form.name} onChange={set("name")} />
              </label>
              <label className="rq-field">
                <span>Email</span>
                <input type="email" inputMode="email" required autoComplete="email" value={form.email} onChange={set("email")} />
              </label>
            </div>
            <label className="rq-field">
              <span>Brand or company <em>optional</em></span>
              <input autoComplete="organization" value={form.company} onChange={set("company")} />
            </label>
            <label className="rq-field">
              <span>What's going on</span>
              <textarea
                required
                rows={4}
                placeholder="Who you are, what you're building, and what you want to happen next."
                value={form.description}
                onChange={set("description")}
              />
            </label>

            <fieldset className="rq-field">
              <legend>When can we talk? <em>30 minutes</em></legend>
              <div className="rq-chips">
                {WHEN.map((w) => (
                  <button
                    type="button"
                    key={w}
                    className={`rq-chip${when === w ? " is-on" : ""}`}
                    aria-pressed={when === w}
                    onClick={() => setWhen(when === w ? "" : w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
              {when === "Pick a time" && (
                <input className="rq-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              )}
            </fieldset>

            <fieldset className="rq-field">
              <legend>Superpowers <em>optional</em></legend>
              <div className="rq-chips">
                {SUPERPOWERS.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`rq-chip rq-power${powers.has(p.id) ? " is-on" : ""}`}
                    aria-pressed={powers.has(p.id)}
                    onClick={() => togglePower(p.id)}
                  >
                    {powers.has(p.id) && <Check size={14} strokeWidth={2.5} />}
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="rq-total">
                Core engine {usd(BASE_MONTHLY)}
                {picked.length > 0 && ` + ${picked.length} power${picked.length > 1 ? "s" : ""}`} ·{" "}
                <strong>{picked.some((p) => p.from) && "from "}{usd(total)} / month</strong>
              </p>
            </fieldset>

            {/* honeypot */}
            <input className="rq-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />

            <button type="submit" className="pc-btn pc-btn-dark rq-send" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send request"}
              <ArrowRight size={18} strokeWidth={1.75} />
            </button>
            {state === "error" && <p className="rq-error" role="alert">{error}</p>}
            <p className="rq-fine">Goes straight to {CONTACT}. No lists, no spam.</p>
          </form>
        )}
      </div>
    </div>
  );
}
