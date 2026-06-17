// Instagram — connect personal/business accounts for DMs and pick which one
// replies send from. A reach channel (lives under "Get paid & reach"), moved
// out of Profile. Auto-DM flows themselves are configured per event/community/
// product page, not here. Logic moved verbatim from the old Profile block.

import { useEffect, useState } from "react";
import { Instagram, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

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
  async function setDefaultIg(id) {
    await authenticatedFetch(`/instagram/connections/${id}/default`, { method: "POST" }).catch(() => {});
    setIg((prev) => (prev ? { ...prev, accounts: (prev.accounts || []).map((a) => ({ ...a, isDefault: a.id === id })) } : prev));
    showToast?.("Replies will send from this account", "success");
  }
  function saveIgLabel(id, label) {
    const v = (label || "").trim();
    authenticatedFetch(`/instagram/connections/${id}`, { method: "PATCH", body: JSON.stringify({ label: v }) }).catch(() => {});
    setIg((prev) => (prev ? { ...prev, accounts: (prev.accounts || []).map((a) => (a.id === id ? { ...a, label: v } : a)) } : prev));
  }
  async function disconnectIg(id) {
    if (!window.confirm("Disconnect this Instagram account?")) return;
    await authenticatedFetch(`/instagram/connections/${id}`, { method: "DELETE" }).catch(() => {});
    refreshIg();
    showToast?.("Disconnected", "success");
  }

  const igAccounts = ig?.accounts || [];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: colors.text }}>Instagram</h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          Connect Instagram to reach guests in their DMs from your Room, and pick which account your replies send from. Auto-DM flows are set up per event, community, or product page.
        </p>
      </div>

      <div style={cardFlat}>
        {ig == null ? (
          <div style={{ padding: 16, fontSize: 13, color: colors.textSubtle }}>Checking…</div>
        ) : igAccounts.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.surfaceMuted, color: colors.textMuted }}><Instagram size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>Instagram</div>
              <div style={{ fontSize: 12.5, color: colors.textMuted }}>Not connected yet</div>
            </div>
            <button type="button" onClick={connectInstagram} style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Connect</button>
          </div>
        ) : (
          <>
            {igAccounts.map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${colors.borderFaint}` : "none" }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.accentSoft, color: colors.accent }}><Instagram size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 650, color: colors.text }}>@{a.ig_username || "account"}</span>
                    {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, background: colors.accentSoft, padding: "2px 7px", borderRadius: 999 }}>Replies send from here</span>}
                  </div>
                  <input
                    defaultValue={a.label || ""}
                    placeholder="Label — e.g. Personal or Business"
                    onBlur={(e) => saveIgLabel(a.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ marginTop: 5, width: "100%", maxWidth: 260, boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 9px", fontSize: 12.5, color: colors.text, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {!a.isDefault && (
                    <button type="button" onClick={() => setDefaultIg(a.id)} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Reply from this</button>
                  )}
                  <button type="button" onClick={() => disconnectIg(a.id)} title="Disconnect" style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
                </div>
              </div>
            ))}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.borderFaint}` }}>
              <button type="button" onClick={connectInstagram} style={{ padding: "8px 14px", borderRadius: 999, border: `1px dashed ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>+ Connect another account</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
