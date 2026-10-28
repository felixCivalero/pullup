import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authLinkError } from "../lib/supabase.js";
import { homeFor, safeNext, useSession } from "../lib/owner.js";
import { linkFromHash, pendingLogin, requestCode, verifyCode, verifyLink } from "../lib/deviceLogin.js";
import { Turnstile } from "../components/Turnstile.jsx";

/* /login — sign in, or make an account (the first sign-in does). Email → a
   six-digit code (or the link in the same mail) that works only in this
   browser: see lib/deviceLogin.js. `?next=/path` returns there afterwards
   (the /connect page uses it). */

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  useEffect(() => {
    const prev = document.title;
    document.title = "Logga in";
    return () => { document.title = prev; };
  }, []);

  if (session) return <Navigate to={next || homeFor(session.user?.email)} replace />;
  return (
    <main className="lg">
      <style>{LOGIN_CSS}</style>
      <LoginForm onDone={(user) => navigate(next || homeFor(user?.email), { replace: true })} />
    </main>
  );
}

// The two steps, on their own: the login page and /connect both use it.
export function LoginForm({ onDone, title = "Logga in", subtitle = "Ny här? Samma steg skapar ditt konto. Det är gratis." }) {
  const pending = useRef(pendingLogin()).current;
  const link = useRef(linkFromHash()).current;
  const [step, setStep] = useState(link ? "link" : pending ? "code" : "email");
  // An invite's link (lib/teams.js) brings the invited address along.
  const [email, setEmail] = useState(() => pending?.email || (new URLSearchParams(window.location.search).get("email") || "").slice(0, 254));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstile, setTurnstile] = useState("");
  const [error, setError] = useState(authLinkError ? "Länken i mejlet är redan använd eller har gått ut. Be om en ny kod." : "");

  // Opened from the mail's link: sign in if this is the browser that asked.
  useEffect(() => {
    if (!link) return undefined;
    let alive = true;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    verifyLink(link)
      .then((user) => alive && onDone(user))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setStep(pendingLogin() ? "code" : "email");
      });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestCode(email, turnstile);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onDone(await verifyCode(code));
    } catch (err) {
      setError(err.message);
      if (["expired", "used", "locked", "replaced", "other_device"].includes(err.code)) setStep("email");
    } finally {
      setBusy(false);
    }
  }

  if (step === "link") return <p className="lg-sub">Loggar in…</p>;

  return step === "email" ? (
    <form onSubmit={sendCode}>
      <h1>{title}</h1>
      <p className="lg-sub">{subtitle}</p>
      <input
        type="email"
        name="email"
        autoComplete="email"
        placeholder="E-post"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <Turnstile onToken={setTurnstile} theme="light" />
      <button type="submit" disabled={busy || !email}>{busy ? "Skickar…" : "Skicka kod"}</button>
      {error && <p className="lg-err">{error}</p>}
    </form>
  ) : (
    <form onSubmit={verify}>
      <h1>Kolla din inkorg</h1>
      <p className="lg-sub">Vi skickade en kod till {email.trim()}. Den fungerar bara i den här webbläsaren, i 15 minuter.</p>
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Kod"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        autoFocus
      />
      <button type="submit" disabled={busy || code.length < 6}>{busy ? "Loggar in…" : "Logga in"}</button>
      {error && <p className="lg-err">{error}</p>}
      <button type="button" className="lg-back" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
        Byt adress
      </button>
    </form>
  );
}

export const LOGIN_CSS = `
  body { margin: 0; background: #fff; }
  .lg { min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box;
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; }
  .lg form { width: min(340px, 100%); display: grid; gap: 12px; }
  .lg h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; letter-spacing: -0.03em; }
  .lg-sub { margin: -4px 0 4px; font-size: 14px; line-height: 1.45; color: #6e6e73; }
  .lg input { font: inherit; font-size: 16px; padding: 13px 16px; border: 1px solid rgba(0,0,0,0.16); border-radius: 12px; outline: none; }
  .lg input:focus { border-color: #000; }
  .lg button[type="submit"] { font: inherit; font-size: 15px; font-weight: 600; padding: 13px 16px; border: 0; border-radius: 999px; background: #000; color: #fff; cursor: pointer; }
  .lg button[type="submit"]:disabled { opacity: 0.4; cursor: default; }
  .lg-err { margin: 0; font-size: 14px; line-height: 1.45; color: #D9480F; }
  .lg-back { font: inherit; font-size: 14px; background: none; border: 0; color: #6e6e73; cursor: pointer; justify-self: start; padding: 0; }
`;
