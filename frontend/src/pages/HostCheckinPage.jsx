// HostCheckinPage — the live rotating QR the host holds up at the door.
// Authenticator-style: the code refreshes every window (server-driven), so a
// screenshot is dead within seconds and the only way to register is to scan
// THIS live screen, in the room. Guests scan → /p/:eventId → they pull up.

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

export default function HostCheckinPage() {
  const { id } = useParams();
  const [code, setCode] = useState(null);
  const [count, setCount] = useState(null);
  const [err, setErr] = useState("");
  const timer = useRef(null);

  const fetchCode = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/host/events/${id}/checkin-code`);
      if (!res.ok) { setErr("Couldn't load the check-in code."); return; }
      const data = await res.json();
      setCode(data);
      // Re-fetch a hair after this window expires so the QR is never stale.
      clearTimeout(timer.current);
      timer.current = setTimeout(fetchCode, Math.max(1500, (data.expiresInMs || 15000) + 400));
    } catch {
      setErr("Couldn't load the check-in code.");
    }
  }, [id]);

  useEffect(() => {
    fetchCode();
    return () => clearTimeout(timer.current);
  }, [fetchCode]);

  // Live "who's pulled up" counter — counts only, polled.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await publicFetch(`/p/${id}/teaser`);
        const d = r.ok ? await r.json() : null;
        if (alive && d) setCount(d.peopleInside);
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [id]);

  const scanUrl = code ? `${window.location.origin}${code.url}` : "";

  return (
    <div style={{
      minHeight: "100dvh", background: "#08070d", color: "#f5f4f7",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, textAlign: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,244,247,0.5)" }}>
        Scan to pull up
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 24px" }}>
        Point your camera here
      </h1>

      <div style={{ background: "#fff", padding: 22, borderRadius: 24, boxShadow: "0 20px 60px rgba(236,23,143,0.25)" }}>
        {scanUrl ? (
          <QRCodeSVG value={scanUrl} size={260} level="M" marginSize={0} />
        ) : (
          <div style={{ width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
            {err || "Loading…"}
          </div>
        )}
      </div>

      <div style={{ marginTop: 22, fontSize: 14, color: "rgba(245,244,247,0.45)" }}>
        Refreshes every {code?.stepSeconds || 15}s — a screenshot won't work.
      </div>

      {count != null && (
        <div style={{ marginTop: 28, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: colors.accent }}>{count}</span>
          <span style={{ fontSize: 15, color: "rgba(245,244,247,0.55)" }}>
            {count === 1 ? "person pulled up" : "people pulled up"}
          </span>
        </div>
      )}
    </div>
  );
}
