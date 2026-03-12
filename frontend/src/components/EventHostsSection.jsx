import { useState, useEffect } from "react";
import { useToast } from "./Toast";
import { useAuth } from "../contexts/AuthContext.jsx";
import { authenticatedFetch } from "../lib/api.js";

const inputStyle = {
  width: "100%",
  marginTop: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(20, 16, 30, 0.6)",
  color: "#fff",
  fontSize: "16px",
  outline: "none",
  boxSizing: "border-box",
  transition: "all 0.3s ease",
  backdropFilter: "blur(10px)",
  minHeight: "44px",
};

export function EventHostsSection({ eventId, canManageHosts = false, compact = false }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [hosts, setHosts] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newHostEmail, setNewHostEmail] = useState("");
  const [newHostRole, setNewHostRole] = useState("editor");
  const [adding, setAdding] = useState(false);

  const applyHostsResponse = (data) => {
    const list = (data.hosts || []).sort((a, b) =>
      a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0,
    );
    setHosts(list);
    setPendingInvitations(data.pendingInvitations || []);
  };

  useEffect(() => {
    let isMounted = true;
    async function loadHosts() {
      setLoading(true);
      try {
        const res = await authenticatedFetch(`/host/events/${eventId}/hosts`);
        if (!res.ok) throw new Error("Failed to load hosts");
        const data = await res.json();
        if (isMounted) applyHostsResponse(data);
      } catch (err) {
        console.error("Failed to load hosts:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    if (eventId) {
      loadHosts();
    }
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const handleAddHost = async () => {
    if (!newHostEmail.trim()) return;
    if (!canManageHosts) {
      showToast("Only the event owner or admin can add hosts", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await authenticatedFetch(`/host/events/${eventId}/hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newHostEmail.trim(),
          role: newHostRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to add host");
      }
      applyHostsResponse(data);
      setNewHostEmail("");
      const wasInvitation = (data.pendingInvitations || []).some(
        (p) => p.email === newHostEmail.trim().toLowerCase(),
      );
      showToast(
        wasInvitation
          ? "Invitation sent. They'll receive an email to sign up."
          : "Arranger added. They'll receive an email.",
        "success",
      );
    } catch (err) {
      console.error("Failed to add host:", err);
      showToast(err.message || "Failed to add host", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveHost = async (hostToRemove) => {
    if (!canManageHosts) {
      showToast("Only the event owner or admin can remove hosts", "error");
      return;
    }
    if (hostToRemove.role === "owner") {
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to remove this arranger?",
    );
    if (!confirmed) return;
    try {
      const res = await authenticatedFetch(
        `/host/events/${eventId}/hosts/${hostToRemove.userId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to remove host");
      }

      setHosts((prev) =>
        prev.filter(
          (h) =>
            !(h.userId === hostToRemove.userId && h.role === hostToRemove.role),
        ),
      );
      showToast("Host removed", "success");
      const refetch = await authenticatedFetch(`/host/events/${eventId}/hosts`);
      if (refetch.ok) {
        const data = await refetch.json();
        applyHostsResponse(data);
      }
    } catch (err) {
      console.error("Failed to remove host:", err);
      showToast(err.message || "Failed to remove host", "error");
    }
  };

  const handleRevokeInvitation = async (email) => {
    if (!canManageHosts) {
      showToast(
        "Only the event owner or admin can revoke invitations",
        "error",
      );
      return;
    }
    try {
      const res = await authenticatedFetch(
        `/host/events/${eventId}/invitations/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Failed to revoke");
      }
      const data = await res.json();
      applyHostsResponse(data);
      showToast("Invitation revoked", "success");
    } catch (err) {
      console.error("Failed to revoke invitation:", err);
      showToast(err.message || "Failed to revoke invitation", "error");
    }
  };

  const [updatingRoleFor, setUpdatingRoleFor] = useState(null);
  const [editingRoleFor, setEditingRoleFor] = useState(null);
  const handleUpdateRole = async (host, newRole) => {
    if (!canManageHosts || host.role === "owner") return;
    if (host.role === newRole) return;
    setUpdatingRoleFor(host.userId);
    try {
      const res = await authenticatedFetch(
        `/host/events/${eventId}/hosts/${host.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to update role");
      }
      const data = await res.json();
      const list = data.hosts || [];
      setHosts(
        list.sort((a, b) =>
          a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0,
        ),
      );
      showToast(`Role updated to ${newRole}`, "success");
    } catch (err) {
      console.error("Failed to update host role:", err);
      showToast(err.message || "Failed to update role", "error");
    } finally {
      setUpdatingRoleFor(null);
      setEditingRoleFor(null);
    }
  };

  if (!eventId) return null;

  const cInputStyle = compact
    ? { ...inputStyle, padding: "8px 12px", fontSize: "13px", minHeight: "36px", marginTop: "0" }
    : inputStyle;

  return (
    <div
      style={{
        padding: compact ? "12px 14px" : "16px 20px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(12, 10, 18, 0.8)",
      }}
    >
      {loading ? (
        <div style={{ fontSize: "13px", opacity: 0.7 }}>Loading hosts...</div>
      ) : hosts.length === 0 && pendingInvitations.length === 0 ? (
        <div style={{ fontSize: "13px", opacity: 0.7 }}>No arrangers yet.</div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: compact ? "6px" : "8px",
            marginBottom: "12px",
          }}
        >
          {hosts.map((host) => (
            <div
              key={`${host.userId}-${host.role}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: compact ? "8px 10px" : "10px 12px",
                borderRadius: "8px",
                background: "rgba(20, 16, 30, 0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
                fontSize: "13px",
                gap: compact ? "8px" : "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span style={{ fontWeight: 600, color: "#fff", fontSize: compact ? "12px" : "13px" }}>
                  {host.email || host.profile?.name || "Unknown user"}
                </span>
                {!compact && (
                  <span
                    style={{ opacity: 0.6, color: "#9ca3af", fontSize: "12px" }}
                  >
                    {host.email ? host.email : `ID: ${host.userId}`}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: compact ? "6px" : "10px",
                  flexShrink: 0,
                }}
              >
                {host.role === "owner" ? (
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: compact ? "2px 8px" : "4px 10px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    Owner
                  </span>
                ) : editingRoleFor === host.userId ? (
                  <select
                    value={host.role}
                    onChange={(e) => handleUpdateRole(host, e.target.value)}
                    disabled={updatingRoleFor === host.userId}
                    style={{
                      ...cInputStyle,
                      minHeight: "32px",
                      fontSize: "12px",
                      padding: "4px 8px",
                      minWidth: "110px",
                      width: "auto",
                    }}
                    aria-label={`Change role for ${host.profile?.name || host.email}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="reception">Reception</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: compact ? "2px 8px" : "4px 8px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    {host.role}
                  </span>
                )}
                {canManageHosts && host.role !== "owner" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRoleFor(
                          editingRoleFor === host.userId ? null : host.userId,
                        )
                      }
                      style={{
                        width: compact ? 24 : 28,
                        height: compact ? 24 : 28,
                        borderRadius: "999px",
                        border: "1px solid rgba(148,163,184,0.5)",
                        background: "rgba(15,23,42,0.8)",
                        color: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: compact ? "11px" : "13px",
                        cursor: "pointer",
                      }}
                      aria-label={`Edit role for ${
                        host.profile?.name || host.email || "arranger"
                      }`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveHost(host)}
                      style={{
                        width: compact ? 24 : 28,
                        height: compact ? 24 : 28,
                        borderRadius: "999px",
                        border: "1px solid rgba(248,113,113,0.7)",
                        background: "rgba(127,29,29,0.5)",
                        color: "#fecaca",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: compact ? "11px" : "13px",
                        cursor: "pointer",
                      }}
                      aria-label={`Remove ${
                        host.profile?.name || host.email || "arranger"
                      }`}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {pendingInvitations.map((inv) => (
            <div
              key={inv.id || inv.email}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: compact ? "8px 10px" : "10px 12px",
                borderRadius: "8px",
                background: "rgba(20, 16, 30, 0.5)",
                border: "1px solid rgba(255,255,255,0.06)",
                fontSize: "13px",
                gap: compact ? "8px" : "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span
                  style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", fontSize: compact ? "12px" : "13px" }}
                >
                  {inv.email}
                </span>
                <span
                  style={{ opacity: 0.6, color: "#9ca3af", fontSize: compact ? "11px" : "12px" }}
                >
                  Invitation sent – awaiting sign up
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: compact ? "6px" : "10px",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: compact ? "2px 8px" : "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(234,179,8,0.6)",
                    color: "#fef08a",
                    background: "rgba(234,179,8,0.2)",
                  }}
                >
                  Pending
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {inv.role}
                </span>
                {canManageHosts && (
                  <button
                    type="button"
                    onClick={() => handleRevokeInvitation(inv.email)}
                    style={{
                      padding: compact ? "2px 8px" : "4px 10px",
                      borderRadius: "8px",
                      border: "1px solid rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#fecaca",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManageHosts && (
        <>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "4px",
            }}
          >
            <input
              type="text"
              placeholder="Email address..."
              value={newHostEmail}
              onChange={(e) => setNewHostEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddHost();
                }
              }}
              style={{
                ...cInputStyle,
                minHeight: "36px",
                fontSize: "13px",
                flex: "1 1 200px",
              }}
              aria-label="Email of person to add as arranger"
            />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <select
                id="new-host-role"
                value={newHostRole}
                onChange={(e) => setNewHostRole(e.target.value)}
                style={{
                  ...cInputStyle,
                  minHeight: "36px",
                  fontSize: "13px",
                  width: "auto",
                  minWidth: "110px",
                }}
                aria-label="Role for new arranger"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="reception">Reception</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddHost}
              disabled={adding || !newHostEmail.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background:
                  !newHostEmail.trim() || adding
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor:
                  !newHostEmail.trim() || adding ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          <div style={{ fontSize: "11px", opacity: 0.4, marginTop: "6px", padding: compact ? "0 10px" : "0 12px" }}>
            {(() => {
              switch (newHostRole) {
                case "admin":
                  return "Admin: Full control. Can add/remove hosts, edit event details, and manage all aspects of the event.";
                case "editor":
                  return "Editor: Can edit event details and assist with managing the event, but cannot add or remove other hosts.";
                case "reception":
                  return "Reception: Can help greet/check in guests and manage attendee information but cannot edit event details or hosts.";
                case "viewer":
                  return "Viewer: Can see event details and the guest list but cannot make changes.";
                default:
                  return null;
              }
            })()}
          </div>
        </>
      )}
    </div>
  );
}
