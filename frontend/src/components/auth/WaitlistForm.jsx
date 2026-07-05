import { useEffect, useState } from "react";
import { ArrowRight, Check, User, Users } from "lucide-react";
import { publicFetch } from "../../lib/api.js";
import { trackEvent } from "../../lib/analytics.js";

// ════════════════════════════════════════════════════════════════════════
// WaitlistForm — the creator/agency capture, INLINE.
//
// Lives directly in the landing scroll (no modal): joining the waitlist is a
// visible, in-page action. Self-contained styling so it drops into the light
// landing as-is. Keeps the creator vs agency split.
//
// Props:
//   source       – analytics/source tag stored on the row.
//   initialEmail – prefill (e.g. an email typed at the login screen that had
//                  no account, handed off here).
//   onLogin      – optional; renders an "Already have an account? Log in" link.
// ════════════════════════════════════════════════════════════════════════

// The split decides which tier we onboard them onto later (creator vs agency)
// — the waitlist itself never mentions tiers or prices.
const ROLES = [
  { key: "creator", label: "I'm a creator", desc: "Solo — my own events and people", icon: User },
  { key: "agency", label: "We're a team or agency", desc: "A 2+ people business running events", icon: Users },
];

export function WaitlistForm({ source = "landing", initialEmail = "", onLogin }) {
  const [role, setRole] = useState("creator");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail || "");
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { trackEvent("waitlist_view", { surface: source }); }, [source]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!emailValid) { setError("Enter a valid email."); return; }
    setError("");
    setSubmitting(true);
    trackEvent("waitlist_submit", { role, surface: source });
    try {
      const res = await publicFetch("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          role,
          handle: handle.trim() || null,
          note: note.trim() || null,
          source,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "failed");
      }
      trackEvent("waitlist_joined", { role, surface: source });
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

  if (done) {
    return (
      <div className="wlf">
        <style>{STYLES}</style>
        <div className="wlf-done">
          <span className="wlf-done-ic"><Check size={26} /></span>
          <p className="wlf-done-t">You're on the list.</p>
          <p className="wlf-done-b">
            We onboard creators by hand right now, so every setup is done right. We'll
            reach out personally when it's your turn — check your inbox for a confirmation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="wlf" onSubmit={submit}>
      <style>{STYLES}</style>

      <div className="wlf-roles">
        {ROLES.map((r) => {
          const Icon = r.icon;
          const on = role === r.key;
          return (
            <button
              type="button"
              key={r.key}
              className={`wlf-role${on ? " is-on" : ""}`}
              onClick={() => setRole(r.key)}
              aria-pressed={on}
            >
              <span className="wlf-role-ic"><Icon size={18} /></span>
              <span className="wlf-role-txt">
                <span className="wlf-role-t">{r.label}</span>
                <span className="wlf-role-d">{r.desc}</span>
              </span>
              <span className="wlf-role-check">{on ? <Check size={17} /> : null}</span>
            </button>
          );
        })}
      </div>

      <input
        className="wlf-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={role === "agency" ? "Agency name" : "Your name"}
        aria-label="Name"
      />
      <input
        className="wlf-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
      />
      <input
        className="wlf-input"
        type="text"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder={role === "agency" ? "Website or main handle" : "Instagram or website"}
        aria-label="Handle or website"
      />
      <textarea
        className="wlf-input wlf-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={role === "agency" ? "Who do you manage? (optional)" : "What do you make? (optional)"}
        rows={2}
        aria-label="Note"
      />

      <button type="submit" className="wlf-submit" disabled={submitting || !emailValid}>
        {submitting ? "Adding you…" : "Join the waitlist"}
        {!submitting && <ArrowRight size={16} />}
      </button>

      {error && <p className="wlf-error">{error}</p>}

      <p className="wlf-fine">
        No account is created yet — joining the list just tells us you're interested.
        Your data will live in a database you own.
      </p>

      {onLogin && (
        <p className="wlf-login">
          Already have an account?{" "}
          <button type="button" className="wlf-login-btn" onClick={onLogin}>Log in</button>
        </p>
      )}
    </form>
  );
}

const PINK = "#EC178F";
const INK = "#0a0a0a";

const STYLES = `
  .wlf { width: 100%; max-width: 460px; margin: 0 auto; text-align: left; display: flex; flex-direction: column; gap: 12px; }

  .wlf-roles { display: flex; flex-direction: column; gap: 8px; }
  .wlf-role {
    display: flex; align-items: center; gap: 13px; width: 100%;
    padding: 12px 14px; border-radius: 14px; text-align: left; cursor: pointer;
    border: 1px solid rgba(10,10,10,0.14); background: #fff;
    font: inherit; transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }
  .wlf-role:hover { border-color: rgba(236,23,143,0.4); }
  .wlf-role.is-on {
    border-color: ${PINK}; background: rgba(236,23,143,0.04);
    box-shadow: 0 0 0 3px rgba(236,23,143,0.12);
  }
  .wlf-role-ic {
    flex: 0 0 auto; width: 40px; height: 40px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236,23,143,0.08); color: ${PINK};
  }
  .wlf-role-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .wlf-role-t { font-size: 15px; font-weight: 800; color: ${INK}; }
  .wlf-role-d { font-size: 13px; color: rgba(10,10,10,0.55); }
  .wlf-role-check { flex: 0 0 auto; color: ${PINK}; display: flex; align-items: center; }

  .wlf-input {
    width: 100%; padding: 14px 16px; border-radius: 12px;
    border: 1px solid rgba(10,10,10,0.16); background: #fff; color: ${INK};
    font-size: 16px; font-family: inherit; outline: none; box-sizing: border-box;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .wlf-input::placeholder { color: rgba(10,10,10,0.4); }
  .wlf-input:focus { border-color: ${PINK}; box-shadow: 0 0 0 3px rgba(236,23,143,0.16); }
  .wlf-note { resize: none; line-height: 1.45; }

  .wlf-submit {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 15px 0; border-radius: 999px; border: none;
    background: ${PINK}; color: #fff; font-family: inherit; font-size: 15px;
    font-weight: 700; cursor: pointer; margin-top: 4px;
    transition: opacity 0.18s, transform 0.18s;
  }
  .wlf-submit:hover { transform: translateY(-1px); }
  .wlf-submit:disabled { background: rgba(10,10,10,0.09); color: rgba(10,10,10,0.4); transform: none; cursor: default; }
  .wlf-error { margin: 0; font-size: 13px; color: #c0392b; text-align: center; }
  .wlf-fine { margin: 2px 0 0; font-size: 12.5px; line-height: 1.5; color: rgba(10,10,10,0.46); text-align: center; }
  .wlf-login { margin: 2px 0 0; font-size: 13px; color: rgba(10,10,10,0.55); text-align: center; }
  .wlf-login-btn { background: none; border: none; padding: 0; font: inherit; color: ${PINK}; font-weight: 700; cursor: pointer; }

  .wlf-done { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 8px 4px; }
  .wlf-done-ic {
    width: 56px; height: 56px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(236,23,143,0.1); color: ${PINK};
  }
  .wlf-done-t { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: ${INK}; }
  .wlf-done-b { margin: 0; max-width: 38ch; font-size: 14.5px; line-height: 1.55; color: rgba(10,10,10,0.6); }
`;
