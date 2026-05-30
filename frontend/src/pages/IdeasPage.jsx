import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { Lightbulb, Eye, CheckCircle, Archive, ExternalLink, User } from "lucide-react";

const STATUS_COLORS = {
  new: { bg: "rgba(59,130,246,0.10)", text: "#2563eb", border: "rgba(59,130,246,0.25)" },
  read: { bg: "rgba(10,10,10,0.06)", text: "rgba(10,10,10,0.55)", border: "rgba(10,10,10,0.14)" },
  done: { bg: "rgba(22,163,74,0.10)", text: "#16a34a", border: "rgba(22,163,74,0.25)" },
  archived: { bg: "rgba(107,114,128,0.10)", text: "#6b7280", border: "rgba(107,114,128,0.20)" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
        padding: "2px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {status}
    </span>
  );
}

const TABS = ["all", "new", "read", "done", "archived"];

export function IdeasPage() {
  const [ideas, setIdeas] = useState([]);
  const [counts, setCounts] = useState({ all: 0, new: 0, read: 0, done: 0, archived: 0 });
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);

  async function fetchIdeas(status) {
    const qs = status && status !== "all" ? `?status=${status}` : "";
    const res = await authenticatedFetch(`/admin/ideas${qs}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.ideas || [];
    }
    return [];
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await fetchIdeas();
      setIdeas(all);
      const c = { all: all.length, new: 0, read: 0, done: 0, archived: 0 };
      all.forEach((i) => {
        const s = i.status || "new";
        if (c[s] !== undefined) c[s]++;
      });
      setCounts(c);
      setLoading(false);
    })();
  }, []);

  async function handleTabChange(tab) {
    setActiveTab(tab);
    setLoading(true);
    const data = await fetchIdeas(tab);
    setIdeas(data);
    setLoading(false);
  }

  async function updateStatus(id, newStatus) {
    // Optimistic update
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
    );
    setCounts((prev) => {
      const idea = ideas.find((i) => i.id === id);
      const oldStatus = idea?.status || "new";
      if (oldStatus === newStatus) return prev;
      return {
        ...prev,
        [oldStatus]: Math.max(0, (prev[oldStatus] || 0) - 1),
        [newStatus]: (prev[newStatus] || 0) + 1,
      };
    });

    await authenticatedFetch(`/admin/ideas/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
  }

  const actionButtons = [
    { status: "read", icon: Eye, label: "Read" },
    { status: "done", icon: CheckCircle, label: "Done" },
    { status: "archived", icon: Archive, label: "Archive" },
  ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingTop: 56 }}>
        <Lightbulb size={22} color={colors.gold} />
        <h1 style={{ fontSize: 20, fontWeight: 600, color: colors.text, margin: 0 }}>Ideas</h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: active ? `1px solid rgba(180,83,9,0.25)` : `1px solid ${colors.border}`,
                background: active ? "rgba(180,83,9,0.08)" : "transparent",
                color: active ? colors.gold : colors.textMuted,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                textTransform: "capitalize",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              {tab}
              {tab === "new" && counts.new > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: "rgba(59,130,246,0.10)",
                    color: "#2563eb",
                    padding: "1px 7px",
                    borderRadius: 999,
                  }}
                >
                  {counts.new}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", color: colors.textSubtle, padding: 40 }}>
          Loading...
        </div>
      ) : ideas.length === 0 ? (
        <div style={{ textAlign: "center", color: colors.textSubtle, padding: 40 }}>
          No ideas yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ideas.map((idea) => {
            const status = idea.status || "new";
            const pageUrl = idea.page_url || idea.pageUrl;
            const userName = idea.user_name || idea.userName;
            const userEmail = idea.user_email || idea.userEmail;
            const userDisplay = userName || userEmail || null;

            return (
              <div
                key={idea.id}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
                }}
              >
                {/* Body */}
                <div style={{ fontSize: 14, color: colors.text, whiteSpace: "pre-wrap", marginBottom: 12 }}>
                  {idea.body || idea.text || idea.content}
                </div>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 12,
                    color: colors.textFaded,
                  }}
                >
                  <StatusBadge status={status} />
                  <span>{timeAgo(idea.created_at || idea.createdAt)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={12} />
                    {userDisplay || "Anonymous"}
                  </span>
                  {pageUrl && (
                    <a
                      href={pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        color: colors.textFaded,
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={12} />
                      {(() => {
                        try {
                          return new URL(pageUrl).pathname;
                        } catch {
                          return pageUrl;
                        }
                      })()}
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {actionButtons
                    .filter((a) => a.status !== status)
                    .map((a) => (
                      <button
                        key={a.status}
                        onClick={() => updateStatus(idea.id, a.status)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: `1px solid ${colors.border}`,
                          background: colors.surfaceMuted,
                          color: colors.textMuted,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(10,10,10,0.06)";
                          e.currentTarget.style.color = colors.text;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = colors.surfaceMuted;
                          e.currentTarget.style.color = colors.textMuted;
                        }}
                      >
                        <a.icon size={12} />
                        {a.label}
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
