import { useState, useRef, useEffect } from "react";
import { ArrowRight, ArrowLeft, Mail, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// ════════════════════════════════════════════════════════════════════════
// DoorVerify — the light step-2 at the door.
//
// A guest who scanned the host's live QR has already proven PRESENCE (the
// rotating code, carried as a presence pass). All that's left is to prove WHO,
// and at a door that has to be fast and guest-framed — NOT the host
// onboarding modal ("create your creator account / pick your cloud storage").
//
// So this is the whole identity step: give your name + a contact, get a short
// code, type it, and you're in. Verifying mints a real Supabase session; the
// room page then replays the presence pass and lands you inside — nothing here
// needs to navigate. If you already had a session, you never see this at all
// (the scan records instantly).
//
// Email-first by design: email is the RSVP identity anchor, so verifying it
// links a walk-in back to the RSVP they already made. WhatsApp is a drop-in
// second method, hidden behind VITE_DOOR_WHATSAPP_OTP until Meta approves the
// auth template (the send hard-fails until then).
// ════════════════════════════════════════════════════════════════════════

const PINK = "#EC178F";
const INK = "#0a0a0a";

// Off until Meta clears the WhatsApp auth-OTP template — then flip the env flag.
const WA_ENABLED = import.meta.env.VITE_DOOR_WHATSAPP_OTP === "true";

// Light E.164-ish tidy: keep a single leading +, digits only after.
function normPhone(raw) {
  const t = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  return t.replace(/\D/g, "");
}

export function DoorVerify({ eventTitle = null }) {
  const { sendEmailCode, verifyEmailCode, sendWhatsappCode, verifyWhatsappCode } = useAuth();
  const [method, setMethod] = useState("email"); // "email" | "whatsapp"
  const [stage, setStage] = useState("contact"); // "contact" | "code" | "in"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contactRef = useRef(null);
  const codeRef = useRef(null);

  const isWA = method === "whatsapp";

  useEffect(() => {
    if (stage === "contact") setTimeout(() => contactRef.current?.focus(), 80);
    if (stage === "code") setTimeout(() => codeRef.current?.focus(), 80);
  }, [stage, method]);

  const sendCode = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    if (isWA) {
      const p = normPhone(phone);
      if (p.replace(/\D/g, "").length < 8) { setError("Enter your WhatsApp number, with country code."); return; }
      setError(""); setBusy(true);
      try { await sendWhatsappCode(p); setStage("code"); }
      catch (err) { setError(err?.message || "Couldn't send a WhatsApp code. Try email."); }
      finally { setBusy(false); }
      return;
    }
    const addr = email.trim();
    if (!addr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      setError("Enter the email you'll get the code at.");
      return;
    }
    setError(""); setBusy(true);
    try { await sendEmailCode(addr, name.trim() || null); setStage("code"); }
    catch (err) { setError(err?.message || "Couldn't send the code. Try again."); }
    finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    const token = code.trim();
    if (token.length < 6) { setError("Enter the 6-digit code we sent."); return; }
    setError(""); setBusy(true);
    try {
      if (isWA) await verifyWhatsappCode(normPhone(phone), token);
      else await verifyEmailCode(email.trim(), token);
      // Session is live now — the room page sees `user` flip, replays the
      // presence pass, records the pull-up and swaps in the room. Hold a warm
      // "you're in" beat so the door doesn't flash empty in between.
      setStage("in");
    } catch {
      setError("That code didn't match. Check it and try again.");
      setBusy(false);
    }
  };

  const switchMethod = (m) => {
    if (m === method) return;
    setMethod(m); setStage("contact"); setCode(""); setError("");
  };

  const sentTo = isWA ? normPhone(phone) : email.trim();

  return (
    <div style={S.backdrop}>
      <style>{KEYFRAMES}</style>
      <div style={S.card} role="dialog" aria-modal="true" aria-label="Confirm it's you">
        {stage === "in" ? (
          <div style={S.inWrap}>
            <Loader2 size={26} color={PINK} style={{ animation: "dv-spin 0.9s linear infinite" }} />
            <p style={S.inText}>You're in — opening the room…</p>
          </div>
        ) : (
          <>
            <div style={S.head}>
              <span style={S.kicker}>You're at the door</span>
              <h2 style={S.title}>
                {eventTitle ? <>Step into <span style={{ color: PINK }}>{eventTitle}</span>.</> : <>Confirm it's <span style={{ color: PINK }}>you</span>.</>}
              </h2>
              <p style={S.sub}>
                {stage === "contact"
                  ? "You scanned in — quick check it's really you, then you're inside."
                  : <>We sent a 6-digit code to <strong>{sentTo}</strong>. Pop it in below.</>}
              </p>
            </div>

            {stage === "contact" ? (
              <form onSubmit={sendCode} style={S.form}>
                {WA_ENABLED && (
                  <div style={S.seg}>
                    <button type="button" onClick={() => switchMethod("email")} style={{ ...S.segBtn, ...(isWA ? null : S.segOn) }}>Email</button>
                    <button type="button" onClick={() => switchMethod("whatsapp")} style={{ ...S.segBtn, ...(isWA ? S.segOn : null) }}>WhatsApp</button>
                  </div>
                )}
                <input
                  style={S.input}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
                {isWA ? (
                  <input
                    ref={contactRef}
                    style={S.input}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 7… (with country code)"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                ) : (
                  <input
                    ref={contactRef}
                    style={S.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    inputMode="email"
                  />
                )}
                {error && <p style={S.error}>{error}</p>}
                <button type="submit" style={{ ...S.cta, ...(busy ? S.ctaBusy : null) }} disabled={busy}>
                  {busy ? "Sending…" : <>Send my code <ArrowRight size={16} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={verify} style={S.form}>
                <div style={S.codeWrap}>
                  <Mail size={16} color="rgba(10,10,10,0.4)" />
                  <input
                    ref={codeRef}
                    style={S.codeInput}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>
                {error && <p style={S.error}>{error}</p>}
                <button type="submit" style={{ ...S.cta, ...(busy ? S.ctaBusy : null) }} disabled={busy}>
                  {busy ? "Checking…" : <>Step inside <ArrowRight size={16} /></>}
                </button>
                <div style={S.footRow}>
                  <button type="button" style={S.linkBtn} onClick={() => { setStage("contact"); setCode(""); setError(""); }}>
                    <ArrowLeft size={13} /> {isWA ? "Wrong number" : "Wrong email"}
                  </button>
                  <button type="button" style={S.linkBtn} onClick={sendCode} disabled={busy}>
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes dv-spin { to { transform: rotate(360deg); } }
@keyframes dv-pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
`;

const S = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 200,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    background: "rgba(10,10,12,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  },
  card: {
    width: "100%", maxWidth: 420, background: "#fff",
    border: "1px solid rgba(10,10,10,0.08)", borderRadius: 24,
    boxShadow: "0 30px 80px -16px rgba(10,10,10,0.4)",
    padding: "28px clamp(20px, 5vw, 30px)", boxSizing: "border-box",
    animation: "dv-pop 0.32s cubic-bezier(0.16,1,0.3,1)",
    color: INK,
  },
  head: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 },
  kicker: { fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(10,10,10,0.42)" },
  title: { margin: 0, fontSize: "clamp(26px, 4.4vw, 34px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.08 },
  sub: { margin: 0, fontSize: 15, lineHeight: 1.5, color: "rgba(10,10,10,0.6)" },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  seg: {
    display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(10,10,10,0.05)", marginBottom: 2,
  },
  segBtn: {
    flex: 1, padding: "9px 0", borderRadius: 9, border: "none", background: "transparent",
    fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "rgba(10,10,10,0.55)", cursor: "pointer",
  },
  segOn: { background: "#fff", color: INK, boxShadow: "0 1px 3px rgba(10,10,10,0.12)" },
  input: {
    width: "100%", padding: "14px 16px", borderRadius: 12,
    border: "1px solid rgba(10,10,10,0.16)", background: "#fff", color: INK,
    fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  },
  codeWrap: {
    display: "flex", alignItems: "center", gap: 10, padding: "4px 14px",
    border: "1px solid rgba(10,10,10,0.16)", borderRadius: 12, background: "#fff",
  },
  codeInput: {
    flex: 1, padding: "12px 0", border: "none", outline: "none", background: "transparent",
    fontSize: 22, fontFamily: "inherit", letterSpacing: "0.4em", color: INK,
  },
  error: { margin: 0, fontSize: 13, color: "#c0264e" },
  cta: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "13px 22px", borderRadius: 999, border: "none", background: PINK, color: "#fff",
    fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4,
  },
  ctaBusy: { opacity: 0.6, cursor: "default" },
  footRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  linkBtn: {
    display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none",
    color: "rgba(10,10,10,0.55)", fontFamily: "inherit", fontSize: 13, cursor: "pointer", padding: 0,
  },
  inWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 10px" },
  inText: { margin: 0, fontSize: 14, fontWeight: 600, color: "rgba(10,10,10,0.65)" },
};
