// Instagram — connect ONE account for DMs. A reach channel (lives under "Get
// paid & reach"), moved out of Profile. We accept a single account, never more:
// no "reply from this" picker and no "connect another" — one Instagram, period.
// Auto-DM flows themselves are configured per event/community/product page.

import { useEffect, useState } from "react";
import { Instagram, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { InstagramEarlyAccess, ComingSoonChip } from "./InstagramEarlyAccess.jsx";

const cardFlat = {
  background: colors.surface,
  borderRadius: 14,
  border: `1px solid ${colors.borderFaint}`,
};

export function SettingsInstagramSection({ showToast, onStatus }) {
  const [ig, setIg] = useState(null); // status payload | null

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/instagram/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setIg(d); onStatus?.((d?.accounts || []).length > 0); } })
      .catch(() => { if (alive) setIg(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectInstagram() {
    try {
      const res = await authenticatedFetch("/instagram/connect-url");
      if (!res.ok) { showToast?.("Instagram connect isn't available yet", "error"); return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
      else showToast?.("Instagram connect isn't available yet", "error");
    } catch {
      showToast?.("Couldn't start Instagram connect", "error");
    }
  }

  async function refreshIg() {
    const d = await authenticatedFetch("/instagram/connection").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setIg(d);
    onStatus?.((d?.accounts || []).length > 0);
  }
  function saveIgLabel(id, label) {
    const v = (label || "").trim();
    authenticatedFetch(`/instagram/connections/${id}`, { method: "PATCH", body: JSON.stringify({ label: v }) }).catch(() => {});
    setIg((prev) => (prev ? { ...prev, accounts: (prev.accounts || []).map((a) => (a.id === id ? { ...a, label: v } : a)) } : prev));
  }
  async function disconnectIg(id) {
    if (!window.confirm("Disconnect your Instagram account?")) return;
    await authenticatedFetch(`/instagram/connections/${id}`, { method: "DELETE" }).catch(() => {});
    refreshIg();
    showToast?.("Disconnected", "success");
  }

  // One account, never more — if somehow more exist, we only surface the first.
  const account = (ig?.accounts || [])[0] || null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: colors.text, display: "flex", alignItems: "center", gap: 10 }}>
          Instagram
          <ComingSoonChip />
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          Connect your Instagram to reach guests in their DMs from your Room; Auto-DM flows are set up per event, community, or product page.
        </p>
      </div>

      {/* Not connected → the early-access ask (Meta review pending); testers
          who are already added connect through its quiet link. Connected
          accounts keep the full management card. */}
      {ig != null && !account ? (
        <InstagramEarlyAccess onConnect={connectInstagram} showToast={showToast} />
      ) : (
      <div style={cardFlat}>
        {ig == null ? (
          <div style={{ padding: 16, fontSize: 13, color: colors.textSubtle }}>Checking…</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.accentSoft, color: colors.accent }}><Instagram size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650, color: colors.text }}>@{account.ig_username || "account"}</div>
              <input
                defaultValue={account.label || ""}
                placeholder="Label — e.g. Personal or Business"
                onBlur={(e) => saveIgLabel(account.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ marginTop: 5, width: "100%", maxWidth: 260, boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 9px", fontSize: 12.5, color: colors.text, outline: "none" }}
              />
            </div>
            <button type="button" onClick={() => disconnectIg(account.id)} title="Disconnect" style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
