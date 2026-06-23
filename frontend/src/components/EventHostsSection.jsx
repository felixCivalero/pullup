import { useState, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import { useAuth } from "../contexts/AuthContext.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const inputStyle = {
  width: "100%",
  marginTop: "8px",
  padding: "12px 16px",
  borderRadius: "12px",
  border: `1px solid ${colors.border}`,
  background: colors.background,
  color: colors.text,
  fontSize: "16px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s ease",
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
  // Typeahead over the host's people (name / email / number).
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchReq = useRef(0);
  const blurTimer = useRef(null);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

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

  // Search the host's people (across all their events + IG/WA world) by name,
  // email or number as they type. Debounced; stale responses are dropped so the
  // dropdown always reflects the latest query.
  useEffect(() => {
    const q = newHostEmail.trim();
    if (!canManageHosts || q.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    const myReq = ++searchReq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await authenticatedFetch(
          `/host/crm/people?search=${encodeURIComponent(q)}&limit=8`,
        );
        const data = res.ok ? await res.json() : null;
        if (myReq !== searchReq.current) return;
        setPeople((data?.people || []).slice(0, 8));
      } catch {
        if (myReq === searchReq.current) setPeople([]);
      } finally {
        if (myReq === searchReq.current) setSearching(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [newHostEmail, canManageHosts]);

  // Adding a teammate is email-keyed (the backend matches an account or sends an
  // email invite), so a person needs an email on file to be picked.
  const pickPerson = (p) => {
    const email = (p?.email || "").trim();
    if (!email) {
      showToast("That person has no email on file — type an email to invite them.", "error");
      return;
    }
    setNewHostEmail(email);
    setPeople([]);
    setShowSug(false);
    setActiveIdx(-1);
  };

  // The line under a suggestion's name: email · number · @instagram.
  const personSub = (p) => {
    const bits = [];
    if (p.email) bits.push(p.email);
    if (p.phoneE164 || p.phone) bits.push(p.phoneE164 || p.phone);
    if (p.instagram) bits.push("@" + String(p.instagram).replace(/^@/, ""));
    return bits.join("  ·  ");
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
        border: `1px solid ${colors.border}`,
        background: colors.surface,
      }}
    >
      {loading ? (
        <div style={{ fontSize: "13px", color: colors.textMuted }}>Loading hosts...</div>
      ) : hosts.length === 0 && pendingInvitations.length === 0 ? (
        <div style={{ fontSize: "13px", color: colors.textMuted }}>No arrangers yet.</div>
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
                background: colors.background,
                border: `1px solid ${colors.borderFaint}`,
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
                <span style={{ fontWeight: 600, color: colors.text, fontSize: compact ? "12px" : "13px" }}>
                  {host.email || host.profile?.name || "Unknown user"}
                </span>
                {!compact && (
                  <span
                    style={{ color: colors.textMuted, fontSize: "12px" }}
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
                      border: `1px solid ${colors.accentBorder}`,
                      color: colors.accent,
                      background: colors.accentSoft,
                      fontWeight: 600,
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
                    <option value="room_curator">Room Curator</option>
                    <option value="reception">Reception</option>
                    <option value="analytics">Analytics</option>
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
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      background: colors.surfaceMuted,
                      fontWeight: 600,
                    }}
                  >
                    {String(host.role || "").replace(/_/g, " ")}
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
                        border: `1px solid ${colors.border}`,
                        background: colors.background,
                        color: colors.text,
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
                        border: `1px solid rgba(220, 38, 38, 0.30)`,
                        background: colors.dangerRgba,
                        color: colors.danger,
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
                background: colors.surfaceMuted,
                border: `1px solid ${colors.borderFaint}`,
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
                  style={{ fontWeight: 600, color: colors.text, fontSize: compact ? "12px" : "13px" }}
                >
                  {inv.email}
                </span>
                <span
                  style={{ color: colors.textMuted, fontSize: compact ? "11px" : "12px" }}
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
                    border: `1px solid rgba(180, 83, 9, 0.35)`,
                    color: colors.warning,
                    background: colors.warningRgba,
                    fontWeight: 600,
                  }}
                >
                  Pending
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: colors.textMuted,
                    fontWeight: 600,
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
                      border: `1px solid rgba(220, 38, 38, 0.30)`,
                      background: colors.dangerRgba,
                      color: colors.danger,
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
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <input
                type="text"
                placeholder="Search by name, email or number…"
                value={newHostEmail}
                onChange={(e) => {
                  setNewHostEmail(e.target.value);
                  setShowSug(true);
                  setActiveIdx(-1);
                }}
                onFocus={() => setShowSug(true)}
                onBlur={() => {
                  blurTimer.current = setTimeout(() => setShowSug(false), 150);
                }}
                onKeyDown={(e) => {
                  if (showSug && people.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIdx((i) => Math.min(i + 1, people.length - 1));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIdx((i) => Math.max(i - 1, -1));
                      return;
                    }
                    if (e.key === "Enter" && activeIdx >= 0) {
                      e.preventDefault();
                      pickPerson(people[activeIdx]);
                      return;
                    }
                    if (e.key === "Escape") {
                      setShowSug(false);
                      return;
                    }
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddHost();
                  }
                }}
                style={{
                  ...cInputStyle,
                  minHeight: "36px",
                  fontSize: "13px",
                  width: "100%",
                }}
                role="combobox"
                aria-expanded={showSug}
                aria-autocomplete="list"
                aria-label="Search people to add as arranger by name, email or number"
              />
              {showSug && (searching || people.length > 0) && (
                <div
                  // preventDefault keeps the input focused so the click lands as a
                  // pick before the input's blur closes the dropdown.
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "10px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    maxHeight: "260px",
                    overflowY: "auto",
                  }}
                >
                  {people.length === 0 && searching ? (
                    <div style={{ padding: "10px 12px", fontSize: "12px", color: colors.textMuted }}>
                      Searching…
                    </div>
                  ) : (
                    people.map((p, idx) => {
                      const hasEmail = !!(p.email && p.email.trim());
                      return (
                        <div
                          key={p.id || idx}
                          onClick={() => pickPerson(p)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          style={{
                            padding: "8px 12px",
                            cursor: hasEmail ? "pointer" : "default",
                            background: idx === activeIdx ? colors.accentSoft : "transparent",
                            opacity: hasEmail ? 1 : 0.55,
                            borderBottom: idx < people.length - 1 ? `1px solid ${colors.border}` : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: colors.text }}>
                              {p.name || p.email || "Unnamed"}
                            </span>
                            {!hasEmail && (
                              <span style={{ fontSize: "10px", color: colors.textMuted }}>
                                no email
                              </span>
                            )}
                          </div>
                          {personSub(p) && (
                            <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "1px" }}>
                              {personSub(p)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
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
                <option value="room_curator">Room Curator</option>
                <option value="reception">Reception</option>
                <option value="analytics">Analytics</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddHost}
              disabled={adding || !newHostEmail.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                border: "none",
                background:
                  !newHostEmail.trim() || adding
                    ? colors.surfaceMuted
                    : colors.accent,
                color:
                  !newHostEmail.trim() || adding
                    ? colors.textMuted
                    : "#fff",
                fontSize: "13px",
                fontWeight: 700,
                cursor:
                  !newHostEmail.trim() || adding ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                boxShadow:
                  !newHostEmail.trim() || adding ? "none" : colors.accentShadow,
              }}
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          <div style={{ fontSize: "11px", color: colors.textSubtle, marginTop: "6px", padding: compact ? "0 10px" : "0 12px" }}>
            {(() => {
              switch (newHostRole) {
                case "admin":
                  return "Admin: Full control. Can add/remove hosts, edit event details, and manage all aspects of the event.";
                case "editor":
                  return "Editor: Can edit event details and assist with managing the event, but cannot add or remove other hosts.";
                case "room_curator":
                  return "Room Curator: Runs the room. Can pull people up, see the guest list, get into the room regardless of their own status, and edit room access + room pages. Cannot edit event details, pricing, or hosts.";
                case "reception":
                  return "Reception: Can help greet/check in guests and manage attendee information but cannot edit event details or hosts.";
                case "analytics":
                  return "Analytics: Can view event analytics and export reports. Cannot see guest lists, edit events, or manage hosts.";
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
