// Claude integration card on the Settings page.
//
// Two surfaces:
//   1. "Connect to Claude" — the public MCP endpoint URL + paste-this
//      instructions for the three Claude clients (web, Desktop, Code).
//   2. "Personal Access Tokens" — mint / list / revoke PATs that
//      authenticate the MCP endpoint. Plaintext is shown ONCE at mint time;
//      after the modal is dismissed it's gone forever.
//
// Backed by:
//   POST   /host/tokens   { name } → { id, name, token, createdAt }
//   GET    /host/tokens                → [{ id, name, createdAt, lastUsedAt, revokedAt }]
//   DELETE /host/tokens/:id            → { revoked: true }

import { useEffect, useState } from "react";
import {
  Bot,
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";

const MCP_URL = "https://mcp.pullup.se";

export function SettingsClaudeIntegration({ showToast }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mintOpen, setMintOpen] = useState(false);
  const [mintName, setMintName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintedPlaintext, setMintedPlaintext] = useState(null); // { token, name } once after mint
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens() {
    try {
      setLoading(true);
      const res = await authenticatedFetch("/host/tokens");
      if (!res.ok) throw new Error("Failed to load tokens");
      const data = await res.json();
      setTokens(data || []);
    } catch (err) {
      console.error("loadTokens:", err);
      showToast?.("Couldn't load tokens", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMint(e) {
    e?.preventDefault?.();
    const name = mintName.trim();
    if (!name) {
      showToast?.("Give the token a name", "error");
      return;
    }
    try {
      setMinting(true);
      const res = await authenticatedFetch("/host/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to mint token");
      }
      const created = await res.json();
      setMintedPlaintext({ token: created.token, name: created.name });
      setMintName("");
      setMintOpen(false);
      loadTokens();
    } catch (err) {
      console.error("handleMint:", err);
      showToast?.(err.message || "Couldn't mint token", "error");
    } finally {
      setMinting(false);
    }
  }

  async function handleRevoke(id, name) {
    if (!confirm(`Revoke "${name}"? Any Claude installation using this token will stop working immediately.`)) {
      return;
    }
    try {
      const res = await authenticatedFetch(`/host/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke");
      showToast?.("Token revoked", "success");
      loadTokens();
    } catch (err) {
      console.error("handleRevoke:", err);
      showToast?.("Couldn't revoke token", "error");
    }
  }

  async function copyToClipboard(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "url") {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 1500);
      } else if (which === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 1500);
      }
    } catch {
      showToast?.("Copy failed — select the text manually", "error");
    }
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header card: Connect to Claude */}
        <div style={cardStyle}>
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            <div style={iconBubbleStyle}>
              <SilverIcon as={Bot} size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={cardTitleStyle}>Connect to Claude</div>
              <div style={cardDescStyle}>
                Create, edit, publish, and check RSVPs on your PullUp events by chatting with Claude. Works in claude.ai, Claude Desktop, and Claude Code.
              </div>

              <div style={{ marginTop: "16px" }}>
                <div style={smallLabelStyle}>MCP endpoint</div>
                <div style={urlRowStyle}>
                  <code style={urlCodeStyle}>{MCP_URL}</code>
                  <button
                    type="button"
                    style={iconButtonStyle}
                    onClick={() => copyToClipboard(MCP_URL, "url")}
                    title="Copy URL"
                  >
                    {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <ol style={stepListStyle}>
                <li>
                  <b>claude.ai</b> → Settings → Connectors → <i>Add custom connector</i>. Paste the URL above and a token below.
                </li>
                <li>
                  <b>Claude Desktop</b> → Settings → Connectors → <i>Add connector</i>. Same URL + token.
                </li>
                <li>
                  <b>Claude Code</b> → run <code style={inlineCodeStyle}>{`claude mcp add pullup --transport http ${MCP_URL} --header "Authorization: Bearer pup_…"`}</code>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {/* Tokens list */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={iconBubbleStyle}>
                <SilverIcon as={Key} size={20} />
              </div>
              <div>
                <div style={cardTitleStyle}>Personal access tokens</div>
                <div style={{ ...cardDescStyle, marginTop: "2px" }}>
                  {activeTokens.length === 0
                    ? "No tokens yet. Mint one to connect Claude."
                    : `${activeTokens.length} active token${activeTokens.length === 1 ? "" : "s"}.`}
                </div>
              </div>
            </div>
            <button type="button" style={primaryButtonStyle} onClick={() => setMintOpen(true)}>
              <Plus size={16} style={{ marginRight: "6px", verticalAlign: "-3px" }} />
              New token
            </button>
          </div>

          {loading ? (
            <div style={{ opacity: 0.6, fontSize: "14px" }}>Loading…</div>
          ) : tokens.length === 0 ? (
            <div style={emptyStateStyle}>
              You haven't created any tokens yet. Mint one above and paste it into Claude.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tokens.map((t) => (
                <TokenRow key={t.id} token={t} onRevoke={handleRevoke} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mint modal */}
      {mintOpen && (
        <Modal onClose={() => !minting && setMintOpen(false)} title="New personal access token">
          <form onSubmit={handleMint}>
            <div style={smallLabelStyle}>Name</div>
            <input
              type="text"
              autoFocus
              value={mintName}
              onChange={(e) => setMintName(e.target.value)}
              placeholder={"e.g. \"Adam's Mac\" or \"My iPhone Claude app\""}
              maxLength={80}
              className="settings-input"
              style={{ marginBottom: "16px" }}
              disabled={minting}
            />
            <div style={{ ...cardDescStyle, marginBottom: "20px" }}>
              The plaintext token is shown <b>once</b> after creation. Copy it then — it can't be recovered later.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setMintOpen(false)}
                disabled={minting}
              >
                Cancel
              </button>
              <button type="submit" style={primaryButtonStyle} disabled={minting || !mintName.trim()}>
                {minting ? "Minting…" : "Mint token"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Plaintext display modal — only shown once after mint */}
      {mintedPlaintext && (
        <Modal onClose={() => setMintedPlaintext(null)} title="Token created">
          <div style={{ ...cardDescStyle, marginBottom: "16px" }}>
            <b>{mintedPlaintext.name}</b> — copy this token now. It won't be shown again.
          </div>
          <div style={tokenDisplayStyle}>
            <code style={{ ...urlCodeStyle, flex: 1, fontSize: "13px", wordBreak: "break-all" }}>
              {mintedPlaintext.token}
            </code>
            <button
              type="button"
              style={iconButtonStyle}
              onClick={() => copyToClipboard(mintedPlaintext.token, "token")}
              title="Copy token"
            >
              {copiedToken ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div style={warningStyle}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              Anyone with this token can manage your PullUp events. Treat it like a password. Paste it into Claude's connector settings, then revoke it here if your device is ever lost.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
            <button type="button" style={primaryButtonStyle} onClick={() => setMintedPlaintext(null)}>
              I've copied it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function TokenRow({ token, onRevoke }) {
  const isRevoked = !!token.revokedAt;
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        opacity: isRevoked ? 0.5 : 1,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
          {token.name}
          {isRevoked && (
            <span
              style={{
                marginLeft: "8px",
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: "999px",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
              }}
            >
              Revoked
            </span>
          )}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.6 }}>
          Created {fmtDate(token.createdAt)}
          {token.lastUsedAt ? ` · Last used ${fmtDate(token.lastUsedAt)}` : " · Never used"}
        </div>
      </div>
      {!isRevoked && (
        <button
          type="button"
          onClick={() => onRevoke(token.id, token.name)}
          style={revokeButtonStyle}
          title="Revoke this token"
        >
          <Trash2 size={14} />
          <span style={{ marginLeft: "6px" }}>Revoke</span>
        </button>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(18, 14, 28, 0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  padding: "20px",
  background: "rgba(20, 16, 30, 0.6)",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.05)",
};

const iconBubbleStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background: "rgba(192, 192, 192, 0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const cardTitleStyle = {
  fontSize: "16px",
  fontWeight: 600,
};

const cardDescStyle = {
  fontSize: "13px",
  opacity: 0.7,
  lineHeight: 1.5,
  marginTop: "2px",
};

const smallLabelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  opacity: 0.6,
  marginBottom: "6px",
};

const urlRowStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  background: "rgba(10, 8, 18, 0.6)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: "8px",
  padding: "8px 10px",
};

const urlCodeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "13px",
  color: "rgba(255,255,255,0.9)",
  background: "transparent",
};

const inlineCodeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11.5px",
  background: "rgba(255,255,255,0.06)",
  padding: "1px 5px",
  borderRadius: "4px",
};

const iconButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  flexShrink: 0,
};

const stepListStyle = {
  marginTop: "16px",
  paddingLeft: "20px",
  fontSize: "13px",
  opacity: 0.8,
  lineHeight: 1.7,
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const primaryButtonStyle = {
  padding: "9px 16px",
  borderRadius: "10px",
  border: "none",
  background: "rgba(232, 232, 232, 0.92)",
  color: "#05040a",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const secondaryButtonStyle = {
  padding: "9px 16px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};

const revokeButtonStyle = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(239, 68, 68, 0.2)",
  background: "rgba(239, 68, 68, 0.08)",
  color: "#ef4444",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const tokenDisplayStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  background: "rgba(10, 8, 18, 0.8)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "10px",
};

const warningStyle = {
  marginTop: "12px",
  padding: "10px 12px",
  background: "rgba(245, 158, 11, 0.08)",
  border: "1px solid rgba(245, 158, 11, 0.15)",
  borderRadius: "8px",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "rgba(245, 158, 11, 0.95)",
  display: "flex",
  gap: "8px",
  alignItems: "flex-start",
};

const emptyStateStyle = {
  padding: "20px",
  background: "rgba(10, 8, 18, 0.4)",
  border: "1px dashed rgba(255,255,255,0.08)",
  borderRadius: "10px",
  fontSize: "13px",
  opacity: 0.6,
  textAlign: "center",
};
