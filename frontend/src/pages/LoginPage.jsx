import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { isOwnerEmail, useSession } from "../lib/owner.js";

/* /login — not linked from anywhere. Email → six-digit code → /admin.
   Only the owner's address gets a code; any other address sees the same
   "check your inbox" step, so the page never says who has access. */
export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const prev = document.title;
    document.title = "Logga in";
    return () => { document.title = prev; };
  }, []);

  if (session && isOwnerEmail(session.user?.email)) return <Navigate to="/admin" replace />;

  async function sendCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isOwnerEmail(email)) {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          // The mail's link signs in straight onto /admin of the site the code
          // was asked from (pullup.se or localhost), not the front page.
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (err) throw err;
      }
      setStep("code");
    } catch {
      setError("Det gick inte att skicka koden. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!isOwnerEmail(email)) throw new Error("no access");
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;
      navigate("/admin", { replace: true });
    } catch {
      setError("Fel eller utgången kod.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lg">
      <style>{LOGIN_CSS}</style>
      {step === "email" ? (
        <form onSubmit={sendCode}>
          <h1>Logga in</h1>
          <input
            type="email"
            autoComplete="email"
            placeholder="E-post"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" disabled={busy || !email}>{busy ? "Skickar…" : "Skicka kod"}</button>
          {error && <p className="lg-err">{error}</p>}
        </form>
      ) : (
        <form onSubmit={verify}>
          <h1>Kolla din inkorg</h1>
          <p className="lg-sub">Har adressen åtkomst har en kod skickats till {email.trim()}.</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Kod"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            required
            autoFocus
          />
          <button type="submit" disabled={busy || code.length < 6}>{busy ? "Loggar in…" : "Logga in"}</button>
          {error && <p className="lg-err">{error}</p>}
          <button type="button" className="lg-back" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
            Byt adress
          </button>
        </form>
      )}
    </main>
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
  .lg-err { margin: 0; font-size: 14px; color: #D9480F; }
  .lg-back { font: inherit; font-size: 14px; background: none; border: 0; color: #6e6e73; cursor: pointer; justify-self: start; padding: 0; }
`;
