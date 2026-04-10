import { useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { Lightbulb, Eye, CheckCircle, Archive, ExternalLink, User } from "lucide-react";

const STATUS_COLORS = {
  new: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  read: { bg: "rgba(192,192,192,0.12)", text: "#c0c0c0", border: "rgba(192,192,192,0.25)" },
  done: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  archived: { bg: "rgba(107,114,128,0.12)", text: "#9ca3af", border: "rgba(107,114,128,0.25)" },
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
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 }}>Ideas</h1>
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
                border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.45)",
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
                    background: "rgba(59,130,246,0.2)",
                    color: "#60a5fa",
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
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>
          Loading...
        </div>
      ) : ideas.length === 0 ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>
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
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {/* Body */}
                <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap", marginBottom: 12 }}>
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
                    color: "rgba(255,255,255,0.35)",
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
                        color: "rgba(255,255,255,0.35)",
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
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
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
