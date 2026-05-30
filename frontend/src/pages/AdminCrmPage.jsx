import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  TrendingUp,
  Search,
  Tag,
  ExternalLink,
  Utensils,
  Crown,
  UserPlus,
  Ticket,
  CheckCircle2,
  Plus,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { AutoTagButton, AutoTagFlashStyle } from "../components/crm/AutoTagButton.jsx";

const STATUS_COLORS = {
  new: { bg: "rgba(59,130,246,0.10)", text: "#2563eb", border: "rgba(59,130,246,0.25)" },
  contacted: { bg: "rgba(168,85,247,0.10)", text: "#7c3aed", border: "rgba(168,85,247,0.25)" },
  qualified: { bg: "rgba(180,83,9,0.10)", text: "#b45309", border: "rgba(180,83,9,0.25)" },
  proposal: { bg: "rgba(236,23,143,0.10)", text: "#ec178f", border: "rgba(236,23,143,0.25)" },
  won: { bg: "rgba(22,163,74,0.10)", text: "#16a34a", border: "rgba(22,163,74,0.25)" },
  lost: { bg: "rgba(220,38,38,0.10)", text: "#dc2626", border: "rgba(220,38,38,0.25)" },
  churned: { bg: "rgba(107,114,128,0.10)", text: "#6b7280", border: "rgba(107,114,128,0.25)" },
  user: { bg: "rgba(10,10,10,0.04)", text: "rgba(10,10,10,0.45)", border: "rgba(10,10,10,0.10)" },
};
const STATUS_OPTIONS = ["new", "contacted", "qualified", "proposal", "won", "lost", "churned"];
const SOURCE_OPTIONS = ["referral", "instagram", "google", "linkedin", "facebook", "direct", "other"];

const PRIORITY_OPTIONS = ["low", "normal", "high", "vip"];
const PRIORITY_COLORS = {
  low: { bg: "rgba(107,114,128,0.10)", text: "#6b7280", border: "rgba(107,114,128,0.25)" },
  normal: { bg: "rgba(10,10,10,0.04)", text: "rgba(10,10,10,0.45)", border: "rgba(10,10,10,0.10)" },
  high: { bg: "rgba(180,83,9,0.10)", text: "#b45309", border: "rgba(180,83,9,0.25)" },
  vip: { bg: "rgba(168,85,247,0.10)", text: "#7c3aed", border: "rgba(168,85,247,0.25)" },
};

const ACTIVITY_OPTIONS = [
  { key: "all", label: "All" },
  { key: "lurker", label: "No events yet" },
  { key: "active", label: "Active (1–4)" },
  { key: "repeat", label: "Repeat (5+)" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Reaggregate top tags across an event list — used after an inline tag edit
// so the host row's tag pills stay in sync without a full /admin/crm/hosts
// refetch.
function recomputeTopTags(eventList) {
  const counts = {};
  for (const e of eventList) {
    for (const t of e.adminTags || []) counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

function timeAgo(iso) {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span
      style={{
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      {status || "—"}
    </span>
  );
}

// Tiny pill for an event feature (dinner / VIP / team / ticket / approval).
// Shown inline on the event row so admin can read the event's shape at a
// glance without leaving the CRM.
function FeaturePill({ icon: Icon, label, color }) {
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        color,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function EventFeatures({ ev }) {
  const pills = [];
  if (ev.dinnerEnabled) {
    pills.push(
      <FeaturePill
        key="dinner"
        icon={Utensils}
        label={`Dinner${ev.dinnerSeats ? ` ${ev.dinnerSeats}` : ""}`}
        color={colors.gold}
      />,
    );
  }
  if (ev.vipCount > 0) {
    pills.push(
      <FeaturePill
        key="vip"
        icon={Crown}
        label={`VIP ${ev.vipCount}`}
        color="#a78bfa"
      />,
    );
  }
  if (ev.teamCount > 1) {
    pills.push(
      <FeaturePill
        key="team"
        icon={UserPlus}
        label={`Team ${ev.teamCount}`}
        color="#60a5fa"
      />,
    );
  }
  if (ev.ticketType === "paid" && ev.ticketPrice > 0) {
    const price = (ev.ticketPrice / 100).toFixed(0);
    pills.push(
      <FeaturePill
        key="ticket"
        icon={Ticket}
        label={`${price} ${ev.ticketCurrency || ""}`.trim()}
        color="#4ade80"
      />,
    );
  }
  if (ev.requireApproval) {
    pills.push(
      <FeaturePill
        key="approval"
        icon={CheckCircle2}
        label="Approval"
        color="#f472b6"
      />,
    );
  }
  if (pills.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{pills}</div>
  );
}

// Parse a comma-separated draft string into a normalized array (matches the
// backend's normalization: lowercase, trim, dedupe).
function parseDraftTags(s) {
  return [
    ...new Set(
      (s || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function EventRow({ ev, hostId, draft, setDraft, onSave, saving, knownTags, isTagging, newTags, flashKey }) {
  const tagsString = (ev.adminTags || []).join(", ");
  const currentDraft = draft !== undefined ? draft : tagsString;
  const dirty = currentDraft !== tagsString;
  const draftSet = new Set(parseDraftTags(currentDraft));
  const newTagSet = newTags || new Set();
  const currentTags = ev.adminTags || [];

  function toggleTag(tag) {
    const current = parseDraftTags(currentDraft);
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    setDraft(next.join(", "));
  }
  return (
    <div
      key={flashKey ? `flash-${flashKey}` : ev.id}
      className={flashKey ? "autotag-flash" : undefined}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fff",
        border: isTagging
          ? "1px solid rgba(180,83,9,0.35)"
          : "1px solid rgba(10,10,10,0.08)",
        boxShadow: isTagging ? "0 0 0 2px rgba(180,83,9,0.10)" : "0 1px 4px rgba(10,10,10,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "border-color 0.25s, box-shadow 0.25s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <a
          href={`/e/${ev.slug}`}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: "1 1 240px",
            minWidth: 0,
            color: colors.text,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title || "Untitled"}
          <ExternalLink size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
        </a>
        <EventFeatures ev={ev} />
        <span
          style={{
            fontSize: 11,
            color: colors.textFaded,
            whiteSpace: "nowrap",
          }}
        >
          {formatDate(ev.startsAt)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: colors.textFaded,
            whiteSpace: "nowrap",
            minWidth: 50,
            textAlign: "right",
          }}
        >
          {ev.confirmedGuests}
          {ev.capacity > 0 && <span style={{ opacity: 0.5 }}>/{ev.capacity}</span>}
        </span>
      </div>

      {/* Visible tag pills — primary tag display. Tags freshly added by AI
          animate in with a brief gold flash. */}
      {(currentTags.length > 0 || isTagging) && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 17 }}>
          {isTagging && currentTags.length === 0 && (
            <span style={{ fontSize: 10, color: colors.gold, fontStyle: "italic" }}>
              Generating tags…
            </span>
          )}
          {currentTags.map((tag) => {
            const isNew = newTagSet.has(tag);
            return (
              <span
                key={tag}
                className={isNew ? "autotag-tag-new" : undefined}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 600,
                  background: isNew ? "rgba(180,83,9,0.18)" : "rgba(180,83,9,0.10)",
                  color: isNew ? "#92400e" : colors.gold,
                  border: isNew
                    ? "1px solid rgba(180,83,9,0.40)"
                    : "1px solid rgba(180,83,9,0.18)",
                  textTransform: "lowercase",
                  letterSpacing: "0.02em",
                  boxShadow: "none",
                }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* Tag input — admin classifies the event, count rolls into the
          host's top-tag distribution above. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Tag size={11} style={{ color: colors.gold, flexShrink: 0 }} />
        <input
          type="text"
          value={currentDraft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (dirty) onSave();
            }
          }}
          placeholder="dinner, networking, art… (comma separated)"
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            color: colors.text,
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => dirty && onSave()}
          disabled={saving || !dirty}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "none",
            background:
              !dirty || saving
                ? colors.surfaceMuted
                : "rgba(180,83,9,0.12)",
            color:
              !dirty || saving ? colors.textFaded : colors.gold,
            fontSize: 11,
            fontWeight: 600,
            cursor: !dirty || saving ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Saving…" : dirty ? "Save tags" : "Saved"}
        </button>
      </div>

      {/* Click-to-add chip cloud — every tag already used anywhere in the
          system. Filled = already on this event, outlined = available to
          add. Click toggles. Helps keep the tag vocabulary consistent so
          we don't end up with "art-show", "artshow", "art_show". */}
      {knownTags && knownTags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            paddingLeft: 17, // align under the input (icon width)
            marginTop: -2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: colors.textFaded,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              alignSelf: "center",
              marginRight: 2,
            }}
          >
            Quick add:
          </span>
          {knownTags.map((tag) => {
            const active = draftSet.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: active
                    ? "1px solid rgba(180,83,9,0.30)"
                    : `1px solid ${colors.border}`,
                  background: active
                    ? "rgba(180,83,9,0.10)"
                    : "transparent",
                  color: active ? colors.gold : colors.textSubtle,
                  whiteSpace: "nowrap",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10,
          color: colors.textFaded,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: accent || colors.text,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function AdminCrmPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [hosts, setHosts] = useState([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [originalForm, setOriginalForm] = useState(null);
  const [savingId, setSavingId] = useState(null);
  // Per-event tag editing state. Keyed by event id so each row owns its draft
  // independently and saves don't trip over each other.
  const [eventTagDrafts, setEventTagDrafts] = useState({});
  const [savingEventTagId, setSavingEventTagId] = useState(null);
  // Tracks event IDs whose row is currently being AI-tagged (shows a spinner +
  // gold pulse) and which tags on each event are fresh (animate in).
  const [taggingEventId, setTaggingEventId] = useState(null);
  const [flashedEventIds, setFlashedEventIds] = useState({});
  const [newTagsByEventId, setNewTagsByEventId] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    city: "",
    source: "",
    status: "new",
    priority: "normal",
    notes: "",
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  const fetchHosts = async () => {
    setHostsLoading(true);
    try {
      const res = await authenticatedFetch("/admin/crm/hosts");
      if (res.ok) {
        const data = await res.json();
        setHosts(data.hosts || []);
      }
    } finally {
      setHostsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchHosts();
  }, [user]);

  // Flat event list across all hosts — fed to AutoTagButton so it can walk
  // every event sequentially. Each entry keeps the parent host id so the
  // tagged-callback can patch the right host row.
  const allEvents = useMemo(() => {
    const out = [];
    for (const h of hosts) {
      for (const ev of h.events.list || []) {
        out.push({ id: ev.id, title: ev.title || "Untitled", adminTags: ev.adminTags || [], hostId: h.id });
      }
    }
    return out;
  }, [hosts]);

  // Merge the AI-generated tags into hosts state + trigger row flash + remember
  // which tags are fresh so they can animate in.
  function handleEventTagged({ eventId, adminTags, generatedTags }) {
    setHosts((prev) =>
      prev.map((h) => {
        const hasEvent = (h.events.list || []).some((e) => e.id === eventId);
        if (!hasEvent) return h;
        const updatedList = h.events.list.map((ev) =>
          ev.id === eventId ? { ...ev, adminTags } : ev,
        );
        return {
          ...h,
          events: { ...h.events, list: updatedList },
          topTags: recomputeTopTags(updatedList),
        };
      }),
    );
    setNewTagsByEventId((prev) => ({ ...prev, [eventId]: new Set(generatedTags || []) }));
    setFlashedEventIds((prev) => ({ ...prev, [eventId]: Date.now() }));
    setTaggingEventId(null);
    // Clear the "new tag" highlight after the animation finishes so further
    // edits don't keep them gold.
    setTimeout(() => {
      setNewTagsByEventId((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }, 2500);
  }

  // Aggregate the entire tag universe by walking every event's adminTags
  // (not host topTags, which is server-capped at 10). Used both for the
  // top-of-page filter chip cloud AND the per-event "quick add" cloud, so
  // the vocabulary stays consistent everywhere admins type tags.
  const allTags = useMemo(() => {
    const counts = {};
    for (const h of hosts) {
      for (const ev of h.events.list || []) {
        for (const t of ev.adminTags || []) counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [hosts]);

  // Tag names only, sorted by frequency. Cap at 40 — beyond that the cloud
  // becomes noise; the rare tail can still be typed manually.
  const knownTagNames = useMemo(
    () => allTags.slice(0, 40).map((t) => t.tag),
    [allTags],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hosts.filter((h) => {
      if (statusFilter !== "all") {
        const s = h.sales?.status || (h.events.total > 0 ? "user" : "user");
        if (s !== statusFilter) return false;
      }
      if (activityFilter !== "all" && h.activity !== activityFilter) return false;
      if (tagFilter && !(h.topTags || []).some((t) => t.tag === tagFilter)) return false;
      if (q) {
        const hay = [h.name, h.brand, h.email, h.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [hosts, search, statusFilter, activityFilter, tagFilter]);

  const stats = useMemo(() => {
    const total = hosts.length;
    const withEvents = hosts.filter((h) => h.events.total > 0).length;
    const repeat = hosts.filter((h) => h.activity === "repeat").length;
    const totalEvents = hosts.reduce((sum, h) => sum + h.events.total, 0);
    return { total, withEvents, repeat, totalEvents };
  }, [hosts]);

  // Build the editable shape from a host record. Used both when expanding a
  // row (to seed the form) and after a save (to reset originalForm to the
  // freshly-saved values, which collapses the Save bar).
  const buildFormFor = (host) => ({
    hostId: host.id,
    leadId: host.sales?.leadId || null,
    isLead: !!host.isLead,
    name: host.name || "",
    company: host.brand || "",
    email: host.email || "",
    phone: host.phone || "",
    city: host.city || "",
    status: host.sales?.status || "new",
    source: host.sales?.source || "",
    notes: host.sales?.notes || "",
    priority: host.sales?.priority || "normal",
  });

  // Whenever the expanded row changes — or the underlying host data
  // refreshes — sync editForm + originalForm to the latest values. After a
  // save this resets the Save bar to clean automatically.
  useEffect(() => {
    if (!expandedId) {
      setEditForm(null);
      setOriginalForm(null);
      return;
    }
    const h = hosts.find((x) => x.id === expandedId);
    if (!h) {
      setEditForm(null);
      setOriginalForm(null);
      return;
    }
    const data = buildFormFor(h);
    setEditForm(data);
    setOriginalForm(data);
  }, [expandedId, hosts]);

  const dirty = useMemo(() => {
    if (!editForm || !originalForm) return false;
    const keys = [
      "name",
      "company",
      "email",
      "phone",
      "city",
      "status",
      "source",
      "notes",
      "priority",
    ];
    return keys.some((k) => (editForm[k] || "") !== (originalForm[k] || ""));
  }, [editForm, originalForm]);

  const discardEdits = () => {
    if (originalForm) setEditForm(originalForm);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    const id = editForm.leadId || `user:${editForm.hostId}`;
    // Profile-linked rows: the user-owned identity fields (name, email,
    // brand/company) are locked. Phone and city ARE editable here because
    // the user can't change them in /settings — backend also mirrors them
    // onto the user's profile so the value renders consistently.
    // The backend strips locked fields as a safety net, but we don't even
    // include them in the payload to make admin's intent explicit.
    const payload = editForm.isLead
      ? {
          name: editForm.name || null,
          company: editForm.company || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          city: editForm.city || null,
          status: editForm.status,
          source: editForm.source || null,
          notes: editForm.notes || null,
          priority: editForm.priority || "normal",
        }
      : {
          phone: editForm.phone || null,
          city: editForm.city || null,
          status: editForm.status,
          source: editForm.source || null,
          notes: editForm.notes || null,
          priority: editForm.priority || "normal",
        };
    setSavingId(editForm.hostId);
    try {
      const res = await authenticatedFetch(`/admin/sales/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Refetch — the useEffect will reseed editForm + originalForm with
        // fresh data, which collapses the Save bar back to clean.
        fetchHosts();
      }
    } finally {
      setSavingId(null);
    }
  };

  const addLead = async (e) => {
    e?.preventDefault?.();
    if (!addForm.name.trim()) return;
    setAdding(true);
    try {
      const res = await authenticatedFetch("/admin/sales/leads", {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setShowAdd(false);
        setAddForm({
          name: "",
          company: "",
          email: "",
          phone: "",
          city: "",
          source: "",
          status: "new",
          priority: "normal",
          notes: "",
        });
        fetchHosts();
      }
    } finally {
      setAdding(false);
    }
  };

  const deleteLead = async (host) => {
    if (!host.isLead || !host.sales?.leadId) return;
    if (!confirm(`Delete lead "${host.name || host.email || "(unnamed)"}"?`)) return;
    setSavingId(host.id);
    try {
      await authenticatedFetch(`/admin/sales/leads/${host.sales.leadId}`, {
        method: "DELETE",
      });
      fetchHosts();
    } finally {
      setSavingId(null);
    }
  };

  // Inline per-event tag editor — same backend endpoint as /admin/events.
  const saveEventTags = async (eventId, hostId) => {
    const draft = eventTagDrafts[eventId];
    if (draft === undefined) return;
    setSavingEventTagId(eventId);
    try {
      const res = await authenticatedFetch(
        `/admin/platform-events/${eventId}/tags`,
        {
          method: "PATCH",
          body: JSON.stringify({ tags: draft }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        // Patch local state so the UI updates without a full refetch — also
        // reseeds the input from the server-normalized value.
        setHosts((prev) =>
          prev.map((h) => {
            if (h.id !== hostId) return h;
            return {
              ...h,
              events: {
                ...h.events,
                list: h.events.list.map((ev) =>
                  ev.id === eventId
                    ? { ...ev, adminTags: data.adminTags || [] }
                    : ev,
                ),
              },
              topTags: recomputeTopTags(
                h.events.list.map((ev) =>
                  ev.id === eventId
                    ? { ...ev, adminTags: data.adminTags || [] }
                    : ev,
                ),
              ),
            };
          }),
        );
        setEventTagDrafts((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
      }
    } finally {
      setSavingEventTagId(null);
    }
  };

  if (loading || hostsLoading) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          background: colors.background,
          padding: "80px 16px",
          textAlign: "center",
          color: colors.textMuted,
        }}
      >
        Loading customer CRM…
      </div>
    );
  }

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: colors.background,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 16px 40px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: colors.text,
                marginBottom: 4,
              }}
            >
              Customer CRM
            </h1>
            <p style={{ fontSize: 13, color: colors.textSubtle }}>
              One row per customer — signed-up hosts and manual prospects in
              one place. Leads auto-link by email when they sign up.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <AutoTagButton
              events={allEvents}
              endpoint={(id) => `/admin/platform-events/${id}/auto-tag`}
              onEventStart={(id) => setTaggingEventId(id)}
              onEventTagged={handleEventTagged}
            />
            <button
              onClick={() => setShowAdd((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid rgba(180,83,9,0.25)",
                background: showAdd
                  ? "rgba(180,83,9,0.12)"
                  : "rgba(180,83,9,0.06)",
                color: colors.gold,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {showAdd ? <X size={14} /> : <Plus size={14} />}
              {showAdd ? "Close" : "Add lead"}
            </button>
          </div>
        </div>
        {AutoTagFlashStyle}

        {showAdd && (
          <form
            onSubmit={addLead}
            style={{
              padding: 16,
              borderRadius: 14,
              background: "rgba(180,83,9,0.04)",
              border: "1px solid rgba(180,83,9,0.18)",
              marginBottom: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.gold,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              New lead
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <input
                required
                placeholder="Name *"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                style={addInputStyle}
              />
              <input
                placeholder="Company / brand"
                value={addForm.company}
                onChange={(e) =>
                  setAddForm({ ...addForm, company: e.target.value })
                }
                style={addInputStyle}
              />
              <input
                type="email"
                placeholder="Email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm({ ...addForm, email: e.target.value })
                }
                style={addInputStyle}
              />
              <input
                placeholder="Phone"
                value={addForm.phone}
                onChange={(e) =>
                  setAddForm({ ...addForm, phone: e.target.value })
                }
                style={addInputStyle}
              />
              <input
                placeholder="City"
                value={addForm.city}
                onChange={(e) =>
                  setAddForm({ ...addForm, city: e.target.value })
                }
                style={addInputStyle}
              />
              <select
                value={addForm.source}
                onChange={(e) =>
                  setAddForm({ ...addForm, source: e.target.value })
                }
                style={addInputStyle}
              >
                <option value="">Source…</option>
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
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
                  onClick={() => setAddForm({ ...addForm, status: s })}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    border: `1px solid ${
                      addForm.status === s
                        ? STATUS_COLORS[s].border
                        : colors.border
                    }`,
                    background:
                      addForm.status === s
                        ? STATUS_COLORS[s].bg
                        : "transparent",
                    color:
                      addForm.status === s
                        ? STATUS_COLORS[s].text
                        : colors.textSubtle,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: colors.textSubtle,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginRight: 2,
                }}
              >
                Priority:
              </span>
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAddForm({ ...addForm, priority: p })}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    border: `1px solid ${
                      addForm.priority === p
                        ? PRIORITY_COLORS[p].border
                        : colors.border
                    }`,
                    background:
                      addForm.priority === p
                        ? PRIORITY_COLORS[p].bg
                        : "transparent",
                    color:
                      addForm.priority === p
                        ? PRIORITY_COLORS[p].text
                        : colors.textSubtle,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Notes (internal)…"
              value={addForm.notes}
              onChange={(e) =>
                setAddForm({ ...addForm, notes: e.target.value })
              }
              style={{
                ...addInputStyle,
                minHeight: 60,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: "transparent",
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding || !addForm.name.trim()}
                style={{
                  padding: "8px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: colors.gradientGold,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: adding ? "default" : "pointer",
                  opacity: !addForm.name.trim() ? 0.4 : 1,
                }}
              >
                {adding ? "Adding…" : "Add lead"}
              </button>
            </div>
          </form>
        )}

        {/* Stats summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginBottom: 18,
          }}
        >
          {[
            { label: "Total hosts", value: stats.total, accent: colors.text },
            { label: "With events", value: stats.withEvents, accent: "#2563eb" },
            { label: "Repeat (5+)", value: stats.repeat, accent: colors.gold },
            { label: "Total events", value: stats.totalEvents, accent: colors.success },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fff",
                border: `1px solid ${colors.border}`,
                boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: colors.textFaded,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.accent }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: "1 1 220px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
            }}
          >
            <Search size={14} style={{ color: colors.textFaded }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, brand, email, city…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: colors.text,
                outline: "none",
                fontSize: 13,
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All statuses</option>
            <option value="user">User (no lead)</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            style={selectStyle}
          >
            {ACTIVITY_OPTIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tag chip cloud */}
        {allTags.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: colors.textFaded,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                alignSelf: "center",
              }}
            >
              Tags:
            </span>
            {allTags.slice(0, 20).map((t) => {
              const active = tagFilter === t.tag;
              return (
                <button
                  key={t.tag}
                  onClick={() => setTagFilter(active ? null : t.tag)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: `1px solid ${
                      active ? "rgba(180,83,9,0.30)" : colors.border
                    }`,
                    background: active ? "rgba(180,83,9,0.10)" : "transparent",
                    color: active ? colors.gold : colors.textSubtle,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {t.tag} <span style={{ opacity: 0.5 }}>{t.count}</span>
                </button>
              );
            })}
            {tagFilter && (
              <button
                onClick={() => setTagFilter(null)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${colors.borderFaint}`,
                  background: "transparent",
                  color: colors.textFaded,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                clear
              </button>
            )}
          </div>
        )}

        {/* Host list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: colors.textFaded,
              }}
            >
              No hosts match the current filters.
            </div>
          ) : (
            filtered.map((h) => {
              const isExpanded = expandedId === h.id;
              const status =
                (isExpanded ? editForm?.status : h.sales?.status) || "user";
              return (
                <div
                  key={h.id}
                  style={{
                    background: "#fff",
                    border: `1px solid ${
                      isExpanded ? colors.borderStrong : colors.border
                    }`,
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => {
                      // Toggling collapse silently discards any unsaved
                      // edits on this row — the Save bar makes pending
                      // changes obvious enough that this is fair UX.
                      setExpandedId(isExpanded ? null : h.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: colors.text,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {h.name || h.email?.split("@")[0] || "Unknown"}
                        {h.brand && (
                          <span
                            style={{
                              fontWeight: 400,
                              fontSize: 12,
                              color: colors.textFaded,
                            }}
                          >
                            · {h.brand}
                          </span>
                        )}
                        {h.isLead && (
                          <span
                            style={{
                              padding: "1px 7px",
                              borderRadius: 999,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              background: "rgba(180,83,9,0.10)",
                              color: colors.gold,
                              border: "1px solid rgba(180,83,9,0.25)",
                            }}
                          >
                            Lead
                          </span>
                        )}
                        {h.sales?.priority && h.sales.priority !== "normal" && (
                          <span
                            style={{
                              padding: "1px 7px",
                              borderRadius: 999,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              background: PRIORITY_COLORS[h.sales.priority].bg,
                              color: PRIORITY_COLORS[h.sales.priority].text,
                              border: `1px solid ${PRIORITY_COLORS[h.sales.priority].border}`,
                            }}
                          >
                            {h.sales.priority}
                          </span>
                        )}
                        <StatusPill status={status} />
                        {h.topTags?.slice(0, 3).map((t) => (
                          <span
                            key={t.tag}
                            style={{
                              fontSize: 10,
                              color: "rgba(180,83,9,0.85)",
                              padding: "1px 7px",
                              borderRadius: 999,
                              background: "rgba(180,83,9,0.08)",
                              border: "1px solid rgba(180,83,9,0.18)",
                            }}
                          >
                            {t.tag}
                            {t.count > 1 && (
                              <span style={{ opacity: 0.6 }}> ×{t.count}</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.textFaded,
                          marginTop: 3,
                        }}
                      >
                        {h.email || "no email"}
                        {h.city ? ` · ${h.city}` : ""}
                      </div>
                    </div>

                    {/* Compact stats */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        flexShrink: 0,
                      }}
                    >
                      <Stat
                        label="Events"
                        value={h.events.total}
                        accent={h.events.total ? colors.text : colors.textFaded}
                      />
                      <Stat
                        label="Freq/mo"
                        value={
                          h.events.frequencyPerMonth
                            ? h.events.frequencyPerMonth
                            : "—"
                        }
                      />
                      <Stat
                        label="Last event"
                        value={timeAgo(h.events.lastEventAt)}
                      />
                      {h.landing && (
                        <Stat
                          label="Visits"
                          value={h.landing.visits}
                          accent="rgba(168,85,247,0.85)"
                        />
                      )}
                      {isExpanded ? (
                        <ChevronUp
                          size={16}
                          style={{ color: colors.textSubtle }}
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          style={{ color: colors.textSubtle }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div
                      style={{
                        borderTop: `1px solid ${colors.borderFaint}`,
                        padding: "14px 16px",
                      }}
                    >
                      {/* Detailed stats grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(6, 1fr)",
                          gap: 10,
                          marginBottom: 14,
                          padding: "10px 12px",
                          background: colors.surface,
                          borderRadius: 10,
                          border: `1px solid ${colors.borderFaint}`,
                        }}
                      >
                        <Stat label="Total" value={h.events.total} />
                        <Stat label="Upcoming" value={h.events.upcoming} />
                        <Stat label="Past" value={h.events.past} />
                        <Stat
                          label="Avg cap"
                          value={h.events.avgCapacity || "—"}
                        />
                        <Stat
                          label="Total cap"
                          value={h.events.totalCapacity || "—"}
                        />
                        <Stat
                          label="Confirmed"
                          value={h.events.totalConfirmedGuests}
                        />
                      </div>

                      {/* Account meta */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px 16px",
                          fontSize: 12,
                          color: colors.textMuted,
                          marginBottom: 14,
                        }}
                      >
                        <span>Joined: {formatDate(h.createdAt)}</span>
                        <span>Last login: {timeAgo(h.lastLoginAt)}</span>
                        <span>Sessions: {h.loginCount}</span>
                        {h.events.firstEventAt && (
                          <span>
                            First event: {formatDate(h.events.firstEventAt)}
                          </span>
                        )}
                        {h.landing && (
                          <span style={{ color: "rgba(168,85,247,0.85)" }}>
                            {h.landing.visits} landing visit
                            {h.landing.visits !== 1 ? "s" : ""}
                            {h.landing.firstVisitAt && (
                              <>
                                {" · "}
                                first {formatDate(h.landing.firstVisitAt)}
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Identity + pipeline editors — always on while the
                          card is open. There's no separate edit/read mode
                          anymore; admin just types and the Save bar at the
                          bottom of the card commits. The unified flow means
                          everything about the person is editable in place,
                          including profile-owned fields (name/email/phone/
                          city) which the backend mirrors onto the user's
                          profile row when the lead is profile-linked. */}
                      {editForm && editForm.hostId === h.id && (
                        <>
                          {/* Identity. For profile-linked rows (signed-up
                              users) the user-owned trio — Name, Email,
                              Brand — renders disabled. Those values live
                              on the user's profile and admin must never
                              override them (the user controls them via
                              /settings and auth). Phone and City stay
                              editable since the user can't change them
                              themselves; admin's edits also get mirrored
                              onto the profile by the backend. */}
                          {(() => {
                            const profileLocked = !editForm.isLead;
                            const lockedStyle = {
                              ...addInputStyle,
                              opacity: 0.55,
                              cursor: "not-allowed",
                              background: colors.surface,
                            };
                            const ownedHint = (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontWeight: 500,
                                  textTransform: "none",
                                  letterSpacing: 0,
                                  color: colors.textFaded,
                                  fontSize: 10,
                                }}
                              >
                                user-owned
                              </span>
                            );
                            const labelStyle = {
                              fontSize: 11,
                              color: colors.textMuted,
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              display: "flex",
                              alignItems: "center",
                            };
                            return (
                              <div
                                style={{
                                  padding: 16,
                                  background: colors.surface,
                                  border: `1px solid ${colors.borderFaint}`,
                                  borderRadius: 12,
                                  marginBottom: 12,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: colors.textMuted,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    marginBottom: 12,
                                  }}
                                >
                                  Identity
                                  {profileLocked && (
                                    <span
                                      style={{
                                        marginLeft: 8,
                                        fontWeight: 400,
                                        textTransform: "none",
                                        letterSpacing: 0,
                                        color: colors.textFaded,
                                      }}
                                    >
                                      · name, email + brand controlled by the user
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 10,
                                  }}
                                >
                                  <label>
                                    <div style={labelStyle}>
                                      Name {profileLocked && ownedHint}
                                    </div>
                                    <input
                                      placeholder="Name"
                                      value={editForm.name}
                                      disabled={profileLocked}
                                      onChange={(e) =>
                                        !profileLocked &&
                                        setEditForm({
                                          ...editForm,
                                          name: e.target.value,
                                        })
                                      }
                                      style={
                                        profileLocked ? lockedStyle : addInputStyle
                                      }
                                    />
                                  </label>
                                  <label>
                                    <div style={labelStyle}>
                                      Brand {profileLocked && ownedHint}
                                    </div>
                                    <input
                                      placeholder="Brand or studio"
                                      value={editForm.company}
                                      disabled={profileLocked}
                                      onChange={(e) =>
                                        !profileLocked &&
                                        setEditForm({
                                          ...editForm,
                                          company: e.target.value,
                                        })
                                      }
                                      style={
                                        profileLocked ? lockedStyle : addInputStyle
                                      }
                                    />
                                  </label>
                                  <label>
                                    <div style={labelStyle}>
                                      Email {profileLocked && ownedHint}
                                    </div>
                                    <input
                                      type="email"
                                      placeholder="Email"
                                      value={editForm.email}
                                      disabled={profileLocked}
                                      onChange={(e) =>
                                        !profileLocked &&
                                        setEditForm({
                                          ...editForm,
                                          email: e.target.value,
                                        })
                                      }
                                      style={
                                        profileLocked ? lockedStyle : addInputStyle
                                      }
                                    />
                                  </label>
                                  <label>
                                    <div style={labelStyle}>Phone</div>
                                    <input
                                      placeholder="Phone"
                                      value={editForm.phone}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          phone: e.target.value,
                                        })
                                      }
                                      style={addInputStyle}
                                    />
                                  </label>
                                  <label style={{ gridColumn: "1 / -1" }}>
                                    <div style={labelStyle}>City</div>
                                    <input
                                      placeholder="City"
                                      value={editForm.city}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          city: e.target.value,
                                        })
                                      }
                                      style={addInputStyle}
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Pipeline */}
                          <div
                            style={{
                              padding: 16,
                              background: colors.surface,
                              border: `1px solid ${colors.borderFaint}`,
                              borderRadius: 12,
                              marginBottom: 14,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: colors.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 10,
                              }}
                            >
                              Pipeline ·{" "}
                              <span
                                style={{
                                  fontWeight: 400,
                                  textTransform: "none",
                                  letterSpacing: 0,
                                  color: colors.textSubtle,
                                }}
                              >
                                {h.events.total} event
                                {h.events.total !== 1 ? "s" : ""} created
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: colors.textMuted,
                                marginBottom: 6,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Status
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                marginBottom: 14,
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
                                    padding: "5px 14px",
                                    borderRadius: 999,
                                    border: `1px solid ${
                                      editForm.status === s
                                        ? STATUS_COLORS[s].border
                                        : colors.border
                                    }`,
                                    background:
                                      editForm.status === s
                                        ? STATUS_COLORS[s].bg
                                        : "transparent",
                                    color:
                                      editForm.status === s
                                        ? STATUS_COLORS[s].text
                                        : colors.textSubtle,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    cursor: "pointer",
                                  }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: colors.textMuted,
                                marginBottom: 6,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Priority
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                marginBottom: 14,
                              }}
                            >
                              {PRIORITY_OPTIONS.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() =>
                                    setEditForm({ ...editForm, priority: p })
                                  }
                                  style={{
                                    padding: "5px 14px",
                                    borderRadius: 999,
                                    border: `1px solid ${
                                      editForm.priority === p
                                        ? PRIORITY_COLORS[p].border
                                        : colors.border
                                    }`,
                                    background:
                                      editForm.priority === p
                                        ? PRIORITY_COLORS[p].bg
                                        : "transparent",
                                    color:
                                      editForm.priority === p
                                        ? PRIORITY_COLORS[p].text
                                        : colors.textSubtle,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    cursor: "pointer",
                                  }}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "180px 1fr",
                                gap: 10,
                                alignItems: "start",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: colors.textMuted,
                                    marginBottom: 6,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  Source
                                </div>
                                <select
                                  value={editForm.source}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      source: e.target.value,
                                    })
                                  }
                                  style={{
                                    ...selectStyle,
                                    width: "100%",
                                    borderRadius: 10,
                                  }}
                                >
                                  <option value="">Select…</option>
                                  {SOURCE_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: colors.textMuted,
                                    marginBottom: 6,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  Notes
                                </div>
                                <textarea
                                  value={editForm.notes}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      notes: e.target.value,
                                    })
                                  }
                                  placeholder="What we know about this customer, deal terms, follow-ups…"
                                  style={{
                                    width: "100%",
                                    minHeight: 80,
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${colors.border}`,
                                    background: colors.surface,
                                    color: colors.text,
                                    fontSize: 13,
                                    outline: "none",
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Full tag distribution */}
                      {h.topTags?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: colors.textSubtle,
                              marginBottom: 6,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Tag size={11} /> Tag distribution
                          </div>
                          <div
                            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                          >
                            {h.topTags.map((t) => (
                              <span
                                key={t.tag}
                                style={{
                                  fontSize: 11,
                                  color: "rgba(180,83,9,0.85)",
                                  padding: "3px 10px",
                                  borderRadius: 999,
                                  background: "rgba(180,83,9,0.08)",
                                  border: "1px solid rgba(180,83,9,0.18)",
                                }}
                              >
                                {t.tag} <span style={{ opacity: 0.6 }}>×{t.count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Events list — each row shows feature pills + an
                          inline admin-tag editor so we can build up
                          customer understanding tag by tag, event by event. */}
                      {h.events.list?.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              color: colors.textSubtle,
                              marginBottom: 6,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Calendar size={11} /> Events ({h.events.list.length})
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {h.events.list.slice(0, 12).map((ev) => (
                              <EventRow
                                key={ev.id}
                                ev={ev}
                                hostId={h.id}
                                draft={eventTagDrafts[ev.id]}
                                setDraft={(v) =>
                                  setEventTagDrafts((prev) => ({
                                    ...prev,
                                    [ev.id]: v,
                                  }))
                                }
                                onSave={() => saveEventTags(ev.id, h.id)}
                                saving={savingEventTagId === ev.id}
                                knownTags={knownTagNames}
                                isTagging={taggingEventId === ev.id}
                                newTags={newTagsByEventId[ev.id]}
                                flashKey={flashedEventIds[ev.id]}
                              />
                            ))}
                            {h.events.list.length > 12 && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: colors.textFaded,
                                  paddingLeft: 10,
                                }}
                              >
                                + {h.events.list.length - 12} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Unified save bar — sticky at the bottom of the
                          card. Surfaces only when something has actually
                          changed compared to the original snapshot taken
                          on expand. Lead-only rows also expose a Delete
                          button on the left so the destructive action is
                          one click away when admin is already in flow. */}
                      {(dirty || h.isLead) && (
                        <div
                          style={{
                            position: "sticky",
                            bottom: 0,
                            marginTop: 14,
                            padding: "12px 14px",
                            borderRadius: 12,
                            background: dirty
                              ? "rgba(180,83,9,0.08)"
                              : colors.surface,
                            border: dirty
                              ? "1px solid rgba(180,83,9,0.25)"
                              : `1px solid ${colors.border}`,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            backdropFilter: "blur(6px)",
                          }}
                        >
                          {h.isLead && (
                            <button
                              type="button"
                              onClick={() => deleteLead(h)}
                              disabled={savingId === h.id}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                border: "1px solid rgba(220,38,38,0.20)",
                                background: "rgba(220,38,38,0.06)",
                                color: colors.danger,
                                fontSize: 12,
                                cursor:
                                  savingId === h.id ? "default" : "pointer",
                              }}
                            >
                              Delete lead
                            </button>
                          )}
                          {dirty && (
                            <span
                              style={{
                                fontSize: 12,
                                color: "rgba(180,83,9,0.85)",
                                fontWeight: 500,
                              }}
                            >
                              Unsaved changes
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          {dirty && (
                            <>
                              <button
                                type="button"
                                onClick={discardEdits}
                                disabled={savingId === h.id}
                                style={{
                                  padding: "8px 14px",
                                  borderRadius: 8,
                                  border: `1px solid ${colors.border}`,
                                  background: "transparent",
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  cursor:
                                    savingId === h.id ? "default" : "pointer",
                                }}
                              >
                                Discard
                              </button>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={savingId === h.id}
                                style={{
                                  padding: "8px 22px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: colors.gradientGold,
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor:
                                    savingId === h.id ? "default" : "pointer",
                                }}
                              >
                                {savingId === h.id ? "Saving…" : "Save changes"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

const addInputStyle = {
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
