import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authLinkError } from "../lib/supabase.js";
import { homeFor, safeNext, useSession } from "../lib/owner.js";
import { linkFromHash, pendingLogin, requestCode, verifyCode, verifyLink } from "../lib/deviceLogin.js";
import { Turnstile } from "../components/Turnstile.jsx";

// Swedish or English: the visitor's own pick (pullup.lang, shared with the
// front page), else the browser's language — Swedish only for Swedish ones.
const KEY = "pullup.lang";
function startLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "sv" || saved === "en") return saved;
  } catch { /* storage blocked */ }
  return (navigator.language || "").toLowerCase().startsWith("sv") ? "sv" : "en";
}
const WORDS = {
  sv: {
    login: "Logga in", newTitle: "Skapa konto", loginSub: "Ny här? Samma steg skapar ditt konto. Det är gratis.",
    newSub: "Gratis. Inget kort, ingen provperiod. Skriv din e-post så mejlar vi en kod.",
    yourEmail: "Din e-post", email: "E-post", send: "Skicka kod →", sending: "Skickar…",
    inbox: "Kolla din inkorg.", sent: (e) => `Vi skickade en kod till ${e}. Den fungerar bara i den här webbläsaren, i 15 minuter.`,
    sixDigit: "Sexsiffrig kod", code: "Kod", signIn: "Logga in →", signingIn: "Loggar in…", change: "← Byt adress", linking: "Loggar in…",
    usedLink: "Länken i mejlet är redan använd eller har gått ut. Be om en ny kod.",
  },
  en: {
    login: "Log in", newTitle: "Create account", loginSub: "New here? The same steps make your account. It's free.",
    newSub: "Free. No card, no trial. Type your email and we'll mail you a code.",
    yourEmail: "Your email", email: "Email", send: "Send code →", sending: "Sending…",
    inbox: "Check your inbox.", sent: (e) => `We sent a code to ${e}. It works only in this browser, for 15 minutes.`,
    sixDigit: "Six-digit code", code: "Code", signIn: "Log in →", signingIn: "Logging in…", change: "← Change address", linking: "Logging in…",
    usedLink: "The link in the mail has been used or has expired. Ask for a new code.",
  },
};
// The server answers in Swedish; in English, by its code.
const ERRORS_EN = {
  invalid_email: "Type a valid email address.",
  rate_limited: "You've asked for many codes. Wait a while.",
  expired: "The code has expired. Ask for a new one.",
  used: "The code has been used. Ask for a new one.",
  locked: "Too many wrong tries. Ask for a new code.",
  replaced: "A newer code has been sent. Use that one.",
  other_device: "The code and link work only in the browser where you asked for them.",
  wrong_code: "Wrong code.",
  missing: "Type the code from the mail.",
  bot_check: "We couldn't confirm you're human. Reload the page and try again.",
};

function LangToggle({ lang, setLang }) {
  return (
    <div className="lg-lang" role="radiogroup" aria-label="Language / Språk">
      {[["sv", "SV"], ["en", "EN"]].map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={lang === k} className={lang === k ? "is-on" : ""} onClick={() => { try { localStorage.setItem(KEY, k); } catch { /* fine */ } setLang(k); }}>{l}</button>
      ))}
    </div>
  );
}

/* /login — sign in, or make an account (the first sign-in does). Email → a
   six-digit code (or the link in the same mail) that works only in this
   browser: see lib/deviceLogin.js. `?next=/path` returns there afterwards
   (the /connect page uses it). */

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  // ?ny=1: the same steps, worded for someone making an account (the first
  // sign-in creates it), from "Skapa konto" on /eventverktyg.
  const isNew = params.get("ny") === "1";
  const [lang, setLang] = useState(startLang);
  const w = WORDS[lang];

  useEffect(() => {
    const prev = document.title;
    document.title = isNew ? w.newTitle : w.login;
    return () => { document.title = prev; };
  }, [isNew, w]);

  if (session) return <Navigate to={next || homeFor(session.user?.email)} replace />;
  return (
    <main className="lg is-brand">
      <style>{LOGIN_CSS}</style>
      <Link to="/" className="lg-logo" aria-label="PullUp"><img src="/pullup-textlogo.svg" alt="PullUp" /></Link>
      <LangToggle lang={lang} setLang={setLang} />
      <LoginForm
        lang={lang}
        onDone={(user) => navigate(next || homeFor(user?.email), { replace: true })}
        title={isNew ? w.newTitle : w.login}
        subtitle={isNew ? w.newSub : w.loginSub}
      />
    </main>
  );
}

// The two steps, on their own: the login page and /connect both use it.
export function LoginForm({ onDone, lang = "sv", title = null, subtitle = null }) {
  const w = WORDS[lang] || WORDS.sv;
  const say = (err) => (lang === "en" ? ERRORS_EN[err.code] || "Something went wrong. Try again." : err.message);
  // A new bot check after every try: a token works once.
  const [check, setCheck] = useState(0);
  const pending = useRef(pendingLogin()).current;
  const link = useRef(linkFromHash()).current;
  const [step, setStep] = useState(link ? "link" : pending ? "code" : "email");
  // An invite's link (lib/teams.js) brings the invited address along.
  const [email, setEmail] = useState(() => pending?.email || (new URLSearchParams(window.location.search).get("email") || "").slice(0, 254));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstile, setTurnstile] = useState("");
  const [error, setError] = useState(authLinkError ? w.usedLink : "");

  // Opened from the mail's link: sign in if this is the browser that asked.
  useEffect(() => {
    if (!link) return undefined;
    let alive = true;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    verifyLink(link)
      .then((user) => alive && onDone(user))
      .catch((err) => {
        if (!alive) return;
        setError(say(err));
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
      setError(say(err));
    } finally {
      setBusy(false);
      setTurnstile("");
      setCheck((n) => n + 1);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onDone(await verifyCode(code));
    } catch (err) {
      setError(say(err));
      if (["expired", "used", "locked", "replaced", "other_device"].includes(err.code)) setStep("email");
    } finally {
      setBusy(false);
    }
  }

  if (step === "link") return <p className="lg-sub">{w.linking}</p>;

  return step === "email" ? (
    <form className="lg-box" onSubmit={sendCode}>
      <h1>{title || w.login}</h1>
      <p className="lg-sub">{subtitle || w.loginSub}</p>
      <div className="lg-panel">
      <div className="lg-head"><i className="lg-led" aria-hidden="true" />{w.yourEmail}</div>
      <input
        type="email"
        name="email"
        autoComplete="email"
        placeholder={w.email}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <Turnstile key={check} onToken={setTurnstile} theme="light" />
      <button type="submit" disabled={busy || !email}>{busy ? w.sending : w.send}</button>
      {error && <p className="lg-err">{error}</p>}
      </div>
    </form>
  ) : (
    <form className="lg-box" onSubmit={verify}>
      <h1>{w.inbox}</h1>
      <p className="lg-sub">{w.sent(email.trim())}</p>
      <div className="lg-panel">
      <div className="lg-head"><i className="lg-led" aria-hidden="true" />{w.sixDigit}</div>
      <input
        className="lg-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={w.code}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        autoFocus
      />
      <button type="submit" disabled={busy || code.length < 6}>{busy ? w.signingIn : w.signIn}</button>
      {error && <p className="lg-err">{error}</p>}
      </div>
      <button type="button" className="lg-back" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
        {w.change}
      </button>
    </form>
  );
}

export const LOGIN_CSS = `
  body { margin: 0; background: #fff; }
  .lg { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; position: relative; min-height: 100dvh; display: grid; place-items: center; padding: 88px 16px 40px; box-sizing: border-box;
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #0a0a0a; }
  /* /login itself: PullUp's pink, like the front page */
  .lg.is-brand { background: radial-gradient(120% 90% at 70% 20%, #f43aa5 0%, #ec178f 55%, #d90f80 100%); }
  .lg-logo { position: absolute; top: 22px; left: clamp(20px, 3.4vw, 48px); display: block; }
  .lg-lang { position: absolute; top: 18px; right: clamp(20px, 3.4vw, 48px); display: inline-flex; padding: 3px; gap: 2px; border: 1px solid rgba(0,0,0,.35); border-radius: 7px; background: rgba(255,255,255,.35); }
  .lg-lang button { border: 0; border-radius: 5px; background: none; padding: 5px 10px; cursor: pointer; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #111; }
  .lg-lang button.is-on { background: #0a0a0a; color: #fff; }
  .lg-logo img { height: 24px; display: block; filter: brightness(0); }
  .lg-box { width: min(440px, 100%); display: grid; gap: 14px; animation: lg-in .55s cubic-bezier(.16,1,.3,1) both; }
  @keyframes lg-in { from { opacity: 0; transform: translateY(16px); } }
  .lg h1 { margin: 0; font-size: clamp(30px, 4vw, 40px); line-height: .95; font-weight: 700; letter-spacing: -0.045em; }
  .lg.is-brand h1 { font-size: clamp(52px, 9vw, 92px); letter-spacing: -0.06em; }
  .lg.is-brand .lg-box { width: min(580px, 100%); }
  .lg-sub { margin: 0 0 6px; font-size: 15px; line-height: 1.45; color: #6e6e73; }
  .lg.is-brand .lg-sub { color: rgba(10,10,10,.75); font-size: 17px; font-weight: 500; }
  /* the form: the grey technical panel from the front page's tools */
  .lg-panel { display: grid; gap: 10px; padding: 14px; border-radius: 10px; border: 1px solid #8f8e89; background: linear-gradient(180deg, #e4e3df, #cfcec9);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.85), inset 0 -2px 0 rgba(0,0,0,.12), 0 24px 50px -22px rgba(70,0,40,.6); }
  .lg-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; margin-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,.14); box-shadow: 0 1px 0 rgba(255,255,255,.7); font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .lg-led { width: 7px; height: 7px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #ec178f; animation: lg-led 2.4s ease-in-out infinite; }
  @keyframes lg-led { 50% { opacity: .45; } }
  .lg input { font-family: var(--mono); font-size: 16px; height: 48px; padding: 0 12px; border: 1px solid #7d7c77; border-radius: 6px; outline: none; background: #f7f6f1; color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.14); }
  .lg input:focus { border-color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.14), 0 0 0 2px #ec178f; }
  .lg input.lg-code { font-size: 26px; letter-spacing: .5em; text-align: center; padding-left: .5em; }
  .lg button[type="submit"] { height: 48px; padding: 0 18px; border: 1px solid #000; border-radius: 6px; background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); }
  .lg button[type="submit"]:hover:not(:disabled) { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .lg button[type="submit"]:disabled { opacity: 0.5; cursor: default; }
  .lg-err { margin: 0; font-size: 14px; line-height: 1.45; color: #a3000a; font-weight: 500; }
  .lg-back { font: inherit; font-size: 14px; font-weight: 500; background: none; border: 0; color: inherit; opacity: .7; cursor: pointer; justify-self: start; padding: 0; }
  .lg-back:hover { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .lg-box, .lg-led { animation: none; } }
`;
