// PullUp MCP integration card on the Settings page.
//
// MCP (Model Context Protocol) is open — any client that speaks it can
// connect: Claude (web/Desktop/Code), ChatGPT, Cursor, Cline, Windsurf,
// Continue, Goose, etc. This card surfaces the endpoint URL, tabbed
// per-client setup guides, and the host's PAT manager.
//
// Backend endpoints used:
//   POST   /host/tokens   { name } → { id, name, token, createdAt }
//   GET    /host/tokens                → [{ id, name, createdAt, lastUsedAt, revokedAt }]
//   DELETE /host/tokens/:id            → { revoked: true }

import { useEffect, useState } from "react";
import {
  Plug,
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

// ─── Per-client setup guides ────────────────────────────────────────────
// Each guide is keyed by a stable slug used for the tab state. `note` is
// shown below the steps if present (e.g. plan requirements).

const GUIDES = [
  {
    slug: "claude-web",
    label: "claude.ai",
    oauth: true,
    steps: [
      'Open claude.ai → click the "Customize" button in the top menu → Connectors.',
      'Click "+" → "Add custom connector".',
      "Name: PullUp.",
      `Remote MCP server URL: ${MCP_URL}`,
      'Click "Add" → "Connect".',
      'A PullUp authorization page opens — click "Allow".',
      "You're connected. Start a new chat and Claude can manage your events.",
    ],
  },
  {
    slug: "chatgpt",
    label: "ChatGPT",
    oauth: true,
    note: "Custom connectors require a ChatGPT Plus, Pro, Team, or Enterprise plan.",
    steps: [
      "Open chatgpt.com → Settings → Connectors.",
      'Click "Create" (or "Add connector" → "Custom").',
      "Name: PullUp.",
      `MCP server URL: ${MCP_URL}`,
      'Click "Create" → "Connect".',
      'A PullUp authorization page opens — click "Allow".',
      "Done. Enable the PullUp connector in the chat where you want to use it.",
    ],
  },
  {
    slug: "claude-desktop",
    label: "Claude Desktop",
    oauth: true,
    steps: [
      "Open Claude Desktop → Settings → Connectors.",
      'Click "Add custom connector".',
      "Name: PullUp.",
      `URL: ${MCP_URL}`,
      'Click "Add" → "Connect".',
      'A PullUp authorization page opens in your browser — click "Allow".',
      "Restart Claude Desktop if prompted. Tools are now available.",
    ],
  },
  {
    slug: "cursor",
    label: "Cursor",
    steps: [
      "Open Cursor → Settings (⌘,) → MCP, or edit ~/.cursor/mcp.json.",
      "Add the entry below.",
      "Restart Cursor. On first use it opens a PullUp authorization page — click Allow.",
    ],
    code: `{
  "mcpServers": {
    "pullup": {
      "url": "${MCP_URL}"
    }
  }
}`,
  },
  {
    slug: "claude-code",
    label: "Claude Code",
    steps: [
      "Run this command in your terminal.",
      "On first invocation, Claude Code opens the PullUp authorization page — click Allow.",
    ],
    code: `claude mcp add pullup --transport http ${MCP_URL}`,
  },
  {
    slug: "other",
    label: "Other",
    steps: [
      "PullUp speaks standard MCP over Streamable HTTP with OAuth 2.1 + Dynamic Client Registration, so any MCP-capable client (Cline, Windsurf, Continue, Goose, Gemini CLI, LibreChat, Zed, Sourcegraph Cody, …) works.",
      `Endpoint: ${MCP_URL}`,
      "Auth: OAuth flow auto-discovers from the resource (RFC 9728). The user authorizes in their browser; the client receives a Bearer token transparently.",
      "Fallback: paste a personal access token directly as Authorization: Bearer pup_… if your client doesn't trigger OAuth.",
      "Tools exposed: 9 (event create/update/publish/list/get, RSVP list, image upload, gallery list).",
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────

export function SettingsMcpIntegration({ showToast }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeGuide, setActiveGuide] = useState(GUIDES[0].slug);
  const [mintOpen, setMintOpen] = useState(false);
  const [mintName, setMintName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintedPlaintext, setMintedPlaintext] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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
    if (
      !confirm(
        `Revoke "${name}"? Any AI client using this token will stop working immediately.`
      )
    ) {
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
      } else if (which === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 1500);
      }
    } catch {
      showToast?.("Copy failed — select the text manually", "error");
    }
  }

  const guide = GUIDES.find((g) => g.slug === activeGuide) || GUIDES[0];
  const activeTokens = tokens.filter((t) => !t.revokedAt);

  return (
    <>
      {/* Single combined card — both stages are part of one flow */}
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <div style={iconBubbleStyle}>
            <SilverIcon as={Plug} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={cardTitleStyle}>Connect any AI assistant</div>
            <div style={cardDescStyle}>
              MCP is an open protocol. Anything that speaks it — Claude, ChatGPT,
              Cursor, Cline, Gemini CLI, Goose — can manage your PullUp events.
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
          </div>
        </div>

        {/* STAGE 1 — Pick your client */}
        <StageHeader number={1} title="In your AI assistant — start adding a connector" />

        <div style={stageBodyStyle}>
          {/* Tabs */}
          <div style={tabBarStyle} role="tablist" aria-label="Setup guides">
            {GUIDES.map((g) => {
              const active = g.slug === activeGuide;
              return (
                <button
                  key={g.slug}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveGuide(g.slug)}
                  style={active ? tabActiveStyle : tabStyle}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ marginTop: "14px" }}>
            <ol style={stepListStyle}>
              {guide.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            {guide.code && (
              <div style={codeBlockWrapperStyle}>
                <pre style={codeBlockStyle}>{guide.code}</pre>
                <button
                  type="button"
                  style={{ ...iconButtonStyle, position: "absolute", top: 8, right: 8 }}
                  onClick={() => copyToClipboard(guide.code, "code")}
                  title="Copy"
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
            {guide.note && (
              <div style={noteStyle}>
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>{guide.note}</span>
              </div>
            )}
          </div>
        </div>

        {/* STAGE 2 — Approve / manage tokens */}
        <StageHeader
          number={2}
          title="Approve the connection — or manage tokens"
          subtitle={
            activeTokens.length === 0
              ? "Most clients open a PullUp authorization page automatically. No token to copy."
              : `${activeTokens.length} active token${activeTokens.length === 1 ? "" : "s"} — manage below.`
          }
          action={
            <button type="button" style={secondaryButtonStyle} onClick={() => setMintOpen(true)}>
              <Plus size={16} style={{ marginRight: "6px", verticalAlign: "-3px" }} />
              Manual token
            </button>
          }
        />

        <div style={stageBodyStyle}>
          {loading ? (
            <div style={{ opacity: 0.6, fontSize: "14px" }}>Loading…</div>
          ) : tokens.length === 0 ? (
            <div style={emptyStateStyle}>
              Nothing here yet. When you authorize a client (or mint one manually), it'll appear here so you can revoke it later.
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
              placeholder={"e.g. \"ChatGPT on my Mac\" or \"Cursor at work\""}
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

      {/* Plaintext display modal — shown once after mint */}
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
              Anyone with this token can manage your PullUp events. Treat it like a password. Paste it into your AI client's connector settings, then revoke it here if your device is ever lost.
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

// Numbered stage separator. Used between the in-card sections to make the
// 1 → 2 sequence visually obvious.
function StageHeader({ number, title, subtitle, action }) {
  return (
    <div style={stageHeaderStyle}>
      <div style={stageBadgeStyle}>{number}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: "12px", opacity: 0.6, marginTop: "2px" }}>{subtitle}</div>
        )}
      </div>
      {action}
    </div>
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

const stageHeaderStyle = {
  marginTop: "28px",
  paddingTop: "20px",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const stageBadgeStyle = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  background: "rgba(232, 232, 232, 0.14)",
  border: "1px solid rgba(232, 232, 232, 0.25)",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const stageBodyStyle = {
  marginTop: "16px",
};

const tabBarStyle = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  paddingBottom: "10px",
};

const tabStyle = {
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.02)",
  color: "rgba(255,255,255,0.7)",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};

const tabActiveStyle = {
  ...tabStyle,
  background: "rgba(232, 232, 232, 0.14)",
  borderColor: "rgba(232, 232, 232, 0.25)",
  color: "#fff",
};

const stepListStyle = {
  paddingLeft: "20px",
  fontSize: "13px",
  opacity: 0.85,
  lineHeight: 1.7,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  margin: 0,
};

const codeBlockWrapperStyle = {
  position: "relative",
  marginTop: "12px",
};

const codeBlockStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "12px",
  background: "rgba(10, 8, 18, 0.7)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "8px",
  padding: "12px 14px",
  paddingRight: "44px",
  color: "rgba(255,255,255,0.9)",
  whiteSpace: "pre",
  overflowX: "auto",
  margin: 0,
};

const noteStyle = {
  marginTop: "12px",
  padding: "8px 10px",
  background: "rgba(245, 158, 11, 0.06)",
  border: "1px solid rgba(245, 158, 11, 0.12)",
  borderRadius: "6px",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "rgba(245, 158, 11, 0.9)",
  display: "flex",
  gap: "8px",
  alignItems: "flex-start",
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
