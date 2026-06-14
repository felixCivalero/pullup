import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, User, Users } from "lucide-react";
import { publicFetch } from "../../lib/api.js";
import { trackEvent } from "../../lib/analytics.js";
import { AUTH_STYLES } from "./AuthGate.jsx";

// ════════════════════════════════════════════════════════════════════════
// WaitlistGate — the landing's new front door for NEW people.
//
// With BYO-Supabase, PullUp no longer self-serves account creation: every new
// creator (and agency) is onboarded by hand. So "Get started" lands here — a
// short capture form — instead of the old onboarding flow. Returning users
// still log in (AuthGate). Reuses AuthGate's modal shell + field styles.
//
// Props:
//   onDismiss   – close the modal (backdrop, Esc, Back).
//   onLogin     – switch to the login surface ("Already have an account?").
//   initialEmail – prefill (e.g. an email typed at the login screen that had
//                  no account, handed off here).
// ════════════════════════════════════════════════════════════════════════

const ROLES = [
  { key: "creator", label: "I'm a creator", desc: "Solo — my own events and people", icon: User },
  { key: "agency", label: "We're an agency", desc: "We run events for our creators", icon: Users },
];

export function WaitlistGate({ onDismiss, onLogin, initialEmail = "" }) {
  const [role, setRole] = useState("creator");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail || "");
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    trackEvent("waitlist_view");
  }, []);

  // Esc closes (the gate is always dismissable on the landing).
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!emailValid) { setError("Enter a valid email."); return; }
    setError("");
    setSubmitting(true);
    trackEvent("waitlist_submit", { role });
    try {
      const res = await publicFetch("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          role,
          handle: handle.trim() || null,
          note: note.trim() || null,
          source: "landing",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "failed");
      }
      trackEvent("waitlist_joined", { role });
      setDone(true);
    } catch (err) {
      setError(
        (err?.message || "").includes("invalid")
          ? "That email doesn't look right."
          : "Couldn't add you just now. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" onClick={onDismiss}>
      <style>{AUTH_STYLES}</style>
      <style>{EXTRA_STYLES}</style>
      <div
        className="auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Join the waitlist"
        onClick={(ev) => ev.stopPropagation()}
      >
        {done ? (
          <div className="auth-panel">
            <div className="wl-done">
              <span className="wl-done-ic"><Check size={26} /></span>
              <h2 className="auth-title">You're on the <span className="pink">list</span>.</h2>
              <p className="auth-sub">
                We onboard creators by hand right now, so every setup is done right.
                We'll reach out personally when it's your turn — check your inbox for
                a confirmation.
              </p>
              <button type="button" className="auth-continue wl-done-btn" onClick={onDismiss}>
                Back to the page
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <form className="auth-panel" onSubmit={submit}>
            <div className="auth-panel-topbar">
              {onDismiss ? (
                <button type="button" className="auth-back" onClick={onDismiss} aria-label="Close">
                  <ArrowLeft size={16} />
                  Back
                </button>
              ) : <span />}
              <button type="button" className="auth-link-small auth-link-btn" onClick={onLogin}>
                Already have an account? <strong>Log in</strong>
              </button>
            </div>

            <div className="auth-card-wrap">
              <p className="auth-kicker">Get on PullUp</p>
              <h2 className="auth-title">
                Claim your <span className="pink">room</span>.
              </h2>
              <p className="auth-sub">
                We're onboarding creators one by one so every space is set up right —
                on a database you own from day one. Tell us where to reach you and we'll
                bring you in.
              </p>

              <div className="wl-roles">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const on = role === r.key;
                  return (
                    <button
                      type="button"
                      key={r.key}
                      className={`wl-role${on ? " is-on" : ""}`}
                      onClick={() => setRole(r.key)}
                      aria-pressed={on}
                    >
                      <span className="wl-role-ic"><Icon size={18} /></span>
                      <span className="wl-role-txt">
                        <span className="wl-role-t">{r.label}</span>
                        <span className="wl-role-d">{r.desc}</span>
                      </span>
                      <span className="wl-role-check">{on ? <Check size={17} /> : null}</span>
                    </button>
                  );
                })}
              </div>

              <input
                className="auth-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "agency" ? "Agency name" : "Your name"}
                aria-label="Name"
              />
              <input
                className="auth-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
              />
              <input
                className="auth-input"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={role === "agency" ? "Website or main handle" : "Instagram or website"}
                aria-label="Handle or website"
              />
              <textarea
                className="auth-input wl-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  role === "agency"
                    ? "Who do you manage? (optional)"
                    : "What do you make? (optional)"
                }
                rows={2}
                aria-label="Note"
              />

              <button type="submit" className="wl-submit" disabled={submitting || !emailValid}>
                {submitting ? "Adding you…" : "Join the waitlist"}
                {!submitting && <ArrowRight size={16} />}
              </button>

              {error && <p className="wl-error">{error}</p>}

              <p className="onb-note">
                No account is created yet — joining the list just tells us you're
                interested. Your data will live in a database you own.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const EXTRA_STYLES = `
  .wl-roles { display: flex; flex-direction: column; gap: 8px; }
  .wl-role {
    display: flex; align-items: center; gap: 13px; width: 100%;
    padding: 12px 14px; border-radius: 14px; text-align: left; cursor: pointer;
    border: 1px solid rgba(10,10,10,0.14); background: #fff;
    font: inherit; transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }
  .wl-role:hover { border-color: rgba(236,23,143,0.4); }
  .wl-role.is-on {
    border-color: #EC178F; background: rgba(236,23,143,0.04);
    box-shadow: 0 0 0 3px rgba(236,23,143,0.12);
  }
  .wl-role-ic {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236,23,143,0.08); color: #EC178F;
  }
  .wl-role-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .wl-role-t { font-size: 15px; font-weight: 800; color: #0a0a0a; }
  .wl-role-d { font-size: 13px; color: rgba(10,10,10,0.55); }
  .wl-role-check { flex: 0 0 auto; color: #EC178F; display: flex; align-items: center; }

  .wl-note { resize: none; line-height: 1.45; font-family: inherit; }

  .wl-submit {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 14px 0; border-radius: 999px; border: none;
    background: #EC178F; color: #fff; font-family: inherit; font-size: 14px;
    font-weight: 700; cursor: pointer; margin-top: 2px;
    transition: opacity 0.18s, transform 0.18s;
  }
  .wl-submit:hover { transform: translateY(-1px); }
  .wl-submit:disabled { background: rgba(10,10,10,0.08); color: rgba(10,10,10,0.4); transform: none; cursor: default; }
  .wl-error { margin: 0; font-size: 12.5px; color: #c0392b; text-align: center; }

  .wl-done { display: flex; flex-direction: column; gap: 14px; text-align: center; align-items: center; padding: 24px 4px; }
  .wl-done-ic {
    width: 56px; height: 56px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236,23,143,0.1); color: #EC178F; margin-bottom: 2px;
  }
  .wl-done .auth-sub { max-width: 36ch; }
  .wl-done-btn { margin-top: 6px; }
`;
