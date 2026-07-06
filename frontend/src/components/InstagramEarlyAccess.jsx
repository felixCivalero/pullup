// Instagram early access — the structured ask that replaces the "say hi"
// mailto. While Meta reviews the app, only accounts added as internal testers
// in the Meta app can connect. This card collects exactly what that takes
// (IG handle + a contact) into ig_access_requests and pings hello@; the host
// sees a clear "you're in line" state. Testers who are already added keep a
// quiet Connect path underneath.
//
//   compact    — tighter paddings for the editor rail
//   onConnect  — the surface's existing connect flow (shown as the tester path)
//   showToast  — optional toast fn

import { useEffect, useState } from "react";
import { Instagram, Check } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";

// The one chip every Instagram surface wears while Meta reviews the app.
export function ComingSoonChip() {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b45309", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
      Coming soon
    </span>
  );
}

export function InstagramEarlyAccess({ compact = false, onConnect, showToast }) {
  const { user } = useAuth();
  const [request, setRequest] = useState(undefined); // undefined = loading, null = none, {} = requested
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/instagram/early-access")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setRequest(d?.request || null); })
      .catch(() => { if (alive) setRequest(null); });
    return () => { alive = false; };
  }, []);

  // Prefill the contact from the signed-in account; the handle they type.
  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function submit(e) {
    e?.preventDefault?.();
    const ig = handle.trim().replace(/^@+/, "");
    if (!ig) { showToast?.("Add your Instagram handle", "error"); return; }
    setBusy(true);
    try {
      const res = await authenticatedFetch("/instagram/early-access", {
        method: "POST",
        body: JSON.stringify({
          igHandle: ig,
          email: email.trim(),
          name: user?.user_metadata?.full_name || user?.user_metadata?.name || "",
        }),
      });
      if (res.status === 402) {
        // Early access rides the Creator tier — the concierge loop only works
        // for hosts who can actually host.
        showToast?.("Early access is for Creator members — set up your plan at pullup.se/start first", "error");
        return;
      }
      if (!res.ok) throw new Error();
      setRequest({ ig_handle: ig, email: email.trim(), status: "pending" });
      showToast?.("Request sent — you're in line", "success");
    } catch {
      showToast?.("Couldn't send the request — try again in a moment", "error");
    } finally {
      setBusy(false);
    }
  }

  const pad = compact ? "14px 14px" : "16px 18px";
  const testerLine = onConnect && (
    <p style={{ fontSize: 12, color: colors.textFaded, margin: "10px 0 0" }}>
      Already added as a tester?{" "}
      <button type="button" onClick={onConnect} style={{ background: "none", border: "none", padding: 0, color: colors.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
        Connect your Instagram
      </button>
    </p>
  );

  // ── Requested: the "you're in line" state ──
  if (request) {
    return (
      <div style={{ borderRadius: 14, border: "1px solid rgba(22,163,74,0.28)", background: "rgba(22,163,74,0.06)", padding: pad }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(22,163,74,0.14)", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Check size={15} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
            You're in line — @{request.ig_handle}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
          Your request is with <strong>felix@pullup.se</strong> — you'll get a personal reply
          {request.email ? ` at ${request.email}` : ""} (it lands in your PullUp Messages too), and we'll
          let you know the moment "Connect your Instagram" works for your account.
        </p>
        <p style={{ fontSize: 11.5, color: colors.textFaded, margin: "8px 0 0", lineHeight: 1.5 }}>
          Heads up: Instagram only allows this for <strong>Creator or Business</strong> accounts —
          switch yours in the Instagram app (Settings → Account type) before connecting.
        </p>
        {testerLine}
      </div>
    );
  }

  // ── The ask ──
  const inputStyle = {
    flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${colors.border}`,
    borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: colors.text,
    background: colors.surface, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${colors.borderFaint}`, background: colors.surfaceMuted, padding: pad }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: colors.surface, border: `1px solid ${colors.borderFaint}`, color: colors.textMuted }}>
          <Instagram size={16} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>Request early access</span>
      </div>
      <p style={{ fontSize: 12.5, color: colors.textMuted, margin: "0 0 12px", lineHeight: 1.5 }}>
        Instagram is approving our app for general use. Until then we onboard hosts
        one by one as testers — leave your handle and we'll add you. Works with
        Instagram <strong>Creator or Business</strong> accounts only (switch in the
        Instagram app under Settings → Account type).
      </p>
      <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 2, padding: 0, minWidth: compact ? 150 : 180 }}>
          <span style={{ paddingLeft: 12, color: colors.textFaded, fontSize: 13.5 }}>@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="your.instagram"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", padding: "10px 12px 10px 2px", fontSize: 13.5, color: colors.text, fontFamily: "inherit" }}
          />
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for the invite"
          style={{ ...inputStyle, minWidth: compact ? 160 : 200 }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, flexShrink: 0 }}
        >
          {busy ? "Sending…" : "Request access"}
        </button>
      </form>
      {testerLine}
    </div>
  );
}
