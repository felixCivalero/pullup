import { useEffect, useState, useCallback } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
  Calendar,
  ExternalLink,
} from "lucide-react";

const STATUS_OPTIONS = [
  "new",
  "contacted",
  "meeting",
  "negotiating",
  "won",
  "lost",
  "churned",
];

const STATUS_COLORS = {
  new: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  contacted: { bg: "rgba(168,85,247,0.15)", text: "#c084fc", border: "rgba(168,85,247,0.3)" },
  meeting: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  negotiating: { bg: "rgba(249,115,22,0.15)", text: "#fb923c", border: "rgba(249,115,22,0.3)" },
  won: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  lost: { bg: "rgba(239,68,68,0.15)", text: "#f87171", border: "rgba(239,68,68,0.3)" },
  churned: { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", border: "rgba(107,114,128,0.3)" },
};

const SOURCE_OPTIONS = ["cold", "referral", "inbound", "event", "other"];

const EMPTY_FORM = {
  name: "",
  company: "",
  email: "",
  phone: "",
  city: "",
  source: "",
  notes: "",
};

function StatusBadge({ status, onClick }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {status}
    </span>
  );
}

function AccountBadge({ profile, eventCount }) {
  if (!profile) {
    return (
      <span
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.3)",
          fontStyle: "italic",
        }}
      >
        No account
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 600,
          background: "rgba(34,197,94,0.12)",
          color: "#4ade80",
          border: "1px solid rgba(34,197,94,0.25)",
        }}
      >
        <User size={10} /> Signed up
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 500,
          background:
            eventCount > 0
              ? "rgba(245,158,11,0.12)"
              : "rgba(255,255,255,0.05)",
          color: eventCount > 0 ? "#fbbf24" : "rgba(255,255,255,0.4)",
          border: `1px solid ${eventCount > 0 ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)"}`,
        }}
      >
        <Calendar size={10} /> {eventCount} event{eventCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export function SalesPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchLeads = useCallback(async () => {
    try {
      const res = await authenticatedFetch(
        `/admin/sales/leads${filter !== "all" ? `?status=${filter}` : ""}`
      );
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await authenticatedFetch("/admin/sales/leads", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm(EMPTY_FORM);
        setShowAdd(false);
        fetchLeads();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id) {
    try {
      const res = await authenticatedFetch(`/admin/sales/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        fetchLeads();
      }
    } catch (err) {
      console.error("Failed to update lead:", err);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await authenticatedFetch(`/admin/sales/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      fetchLeads();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this lead?")) return;
    try {
      await authenticatedFetch(`/admin/sales/leads/${id}`, {
        method: "DELETE",
      });
      fetchLeads();
    } catch (err) {
      console.error("Failed to delete lead:", err);
    }
  }

  const inputStyle = {
    padding: "9px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(12,10,20,0.9)",
    color: "#fff",
    fontSize: "13px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.5)",
    marginBottom: "4px",
    display: "block",
  };

  // Stats
  const stats = {
    total: leads.length,
    active: leads.filter((l) => !["won", "lost", "churned"].includes(l.status)).length,
    won: leads.filter((l) => l.status === "won").length,
    signedUp: leads.filter((l) => l.profile).length,
  };

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: colors.background,
        paddingBottom: 40,
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                margin: 0,
                color: "#fff",
              }}
            >
              Sales Pipeline
            </h1>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.4)",
                margin: "4px 0 0",
              }}
            >
              {stats.total} leads &middot; {stats.active} active &middot;{" "}
              {stats.won} won &middot; {stats.signedUp} signed up
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus size={14} /> Add Lead
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <form
            onSubmit={handleAdd}
            style={{
              background: "rgba(12,10,20,0.7)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "16px",
              padding: "20px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  style={inputStyle}
                  placeholder="Contact name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Company</label>
                <input
                  style={inputStyle}
                  placeholder="Venue / org"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  placeholder="+46..."
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input
                  style={inputStyle}
                  placeholder="Stockholm"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Source</label>
                <select
                  style={{ ...inputStyle, appearance: "auto" }}
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                >
                  <option value="">Select...</option>
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
                placeholder="Any notes about this lead..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setForm(EMPTY_FORM);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: colors.gradientGold,
                  color: "#000",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: saving || !form.name.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Saving..." : "Add Lead"}
              </button>
            </div>
          </form>
        )}

        {/* Filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {["all", ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                border:
                  filter === s
                    ? "1px solid rgba(255,255,255,0.2)"
                    : "1px solid transparent",
                background:
                  filter === s ? "rgba(255,255,255,0.1)" : "transparent",
                color:
                  filter === s ? "#fff" : "rgba(255,255,255,0.4)",
                fontSize: "12px",
                fontWeight: filter === s ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Leads list */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            Loading...
          </div>
        ) : leads.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "rgba(255,255,255,0.3)",
              fontSize: "14px",
            }}
          >
            {filter === "all"
              ? "No leads yet. Add your first one!"
              : `No leads with status "${filter}"`}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {leads.map((lead) => {
              const isExpanded = expandedId === lead.id;
              const isEditing = editingId === lead.id;
              const sc = STATUS_COLORS[lead.status] || STATUS_COLORS.new;

              return (
                <div
                  key={lead.id}
                  style={{
                    background: "rgba(12,10,20,0.6)",
                    border: `1px solid ${isExpanded ? sc.border : "rgba(255,255,255,0.07)"}`,
                    borderRadius: "14px",
                    overflow: "hidden",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => {
                      setExpandedId(isExpanded ? null : lead.id);
                      if (!isExpanded) setEditingId(null);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      cursor: "pointer",
                    }}
                  >
                    {/* Name + company */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {lead.name}
                        {lead.company && (
                          <span
                            style={{
                              fontWeight: 400,
                              color: "rgba(255,255,255,0.4)",
                              marginLeft: 8,
                              fontSize: "13px",
                            }}
                          >
                            {lead.company}
                          </span>
                        )}
                      </div>
                      {lead.email && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "rgba(255,255,255,0.35)",
                            marginTop: 2,
                          }}
                        >
                          {lead.email}
                        </div>
                      )}
                    </div>

                    {/* Account status */}
                    <div
                      style={{
                        flexShrink: 0,
                        display: "none",
                      }}
                      className="sales-account-badge"
                    >
                      <AccountBadge
                        profile={lead.profile}
                        eventCount={lead.event_count}
                      />
                    </div>

                    {/* Status badge */}
                    <StatusBadge status={lead.status} />

                    {/* Expand icon */}
                    {isExpanded ? (
                      <ChevronUp size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
                    ) : (
                      <ChevronDown size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "0 16px 16px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {/* Account link status - always visible when expanded */}
                      <div style={{ padding: "12px 0 8px" }}>
                        <AccountBadge
                          profile={lead.profile}
                          eventCount={lead.event_count}
                        />
                        {lead.profile?.brand && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "12px",
                              color: "rgba(255,255,255,0.4)",
                            }}
                          >
                            Brand: {lead.profile.brand}
                          </span>
                        )}
                      </div>

                      {isEditing ? (
                        /* Edit mode */
                        <div style={{ paddingTop: 8 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                            }}
                          >
                            <div>
                              <label style={labelStyle}>Name</label>
                              <input
                                style={inputStyle}
                                value={editForm.name ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    name: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Company</label>
                              <input
                                style={inputStyle}
                                value={editForm.company ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    company: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Email</label>
                              <input
                                style={inputStyle}
                                value={editForm.email ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    email: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Phone</label>
                              <input
                                style={inputStyle}
                                value={editForm.phone ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    phone: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>City</label>
                              <input
                                style={inputStyle}
                                value={editForm.city ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    city: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Source</label>
                              <select
                                style={{ ...inputStyle, appearance: "auto" }}
                                value={editForm.source ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    source: e.target.value,
                                  })
                                }
                              >
                                <option value="">Select...</option>
                                {SOURCE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <label style={labelStyle}>Notes</label>
                            <textarea
                              style={{
                                ...inputStyle,
                                resize: "vertical",
                                minHeight: 60,
                              }}
                              value={editForm.notes ?? ""}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  notes: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <label style={labelStyle}>Status</label>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() =>
                                    setEditForm({ ...editForm, status: s })
                                  }
                                  style={{
                                    padding: "4px 12px",
                                    borderRadius: "999px",
                                    border: `1px solid ${
                                      editForm.status === s
                                        ? STATUS_COLORS[s].border
                                        : "rgba(255,255,255,0.08)"
                                    }`,
                                    background:
                                      editForm.status === s
                                        ? STATUS_COLORS[s].bg
                                        : "transparent",
                                    color:
                                      editForm.status === s
                                        ? STATUS_COLORS[s].text
                                        : "rgba(255,255,255,0.4)",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    cursor: "pointer",
                                  }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 14,
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              style={{
                                padding: "7px 14px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "transparent",
                                color: "rgba(255,255,255,0.6)",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdate(lead.id)}
                              style={{
                                padding: "7px 18px",
                                borderRadius: "8px",
                                border: "none",
                                background: colors.gradientGold,
                                color: "#000",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div style={{ paddingTop: 4 }}>
                          {/* Quick details */}
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "6px 16px",
                              fontSize: "13px",
                              color: "rgba(255,255,255,0.55)",
                              padding: "8px 0",
                            }}
                          >
                            {lead.phone && <span>Phone: {lead.phone}</span>}
                            {lead.city && <span>City: {lead.city}</span>}
                            {lead.source && (
                              <span>
                                Source:{" "}
                                {lead.source.charAt(0).toUpperCase() +
                                  lead.source.slice(1)}
                              </span>
                            )}
                            <span>
                              Added:{" "}
                              {new Date(lead.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Notes */}
                          {lead.notes && (
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: "10px",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                fontSize: "13px",
                                color: "rgba(255,255,255,0.65)",
                                lineHeight: 1.5,
                                whiteSpace: "pre-line",
                                marginTop: 4,
                              }}
                            >
                              {lead.notes}
                            </div>
                          )}

                          {/* Quick status change */}
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              marginTop: 12,
                            }}
                          >
                            {STATUS_OPTIONS.filter(
                              (s) => s !== lead.status
                            ).map((s) => (
                              <button
                                key={s}
                                onClick={() => handleStatusChange(lead.id, s)}
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: "999px",
                                  border: `1px solid ${STATUS_COLORS[s].border}`,
                                  background: "transparent",
                                  color: STATUS_COLORS[s].text,
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  cursor: "pointer",
                                  opacity: 0.6,
                                  transition: "opacity 0.15s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.opacity = "0.6")
                                }
                              >
                                {s}
                              </button>
                            ))}
                          </div>

                          {/* Actions */}
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 12,
                              paddingTop: 12,
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <button
                              onClick={() => {
                                setEditingId(lead.id);
                                setEditForm({
                                  name: lead.name || "",
                                  company: lead.company || "",
                                  email: lead.email || "",
                                  phone: lead.phone || "",
                                  city: lead.city || "",
                                  source: lead.source || "",
                                  notes: lead.notes || "",
                                  status: lead.status,
                                });
                              }}
                              style={{
                                padding: "6px 14px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.05)",
                                color: "rgba(255,255,255,0.7)",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>
                            {lead.profile && (
                              <button
                                onClick={() =>
                                  window.open(
                                    `/app/events?host=${lead.profile_id}`,
                                    "_blank"
                                  )
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "6px 14px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(34,197,94,0.2)",
                                  background: "rgba(34,197,94,0.08)",
                                  color: "#4ade80",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                <ExternalLink size={11} /> View Account
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(lead.id)}
                              style={{
                                marginLeft: "auto",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "6px 12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(239,68,68,0.15)",
                                background: "transparent",
                                color: "rgba(239,68,68,0.6)",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 640px) {
          .sales-account-badge {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
