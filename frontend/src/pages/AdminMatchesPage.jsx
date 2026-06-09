import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search, Users, AlertTriangle, GitMerge, Scissors, Check, X,
  Pencil, ShieldCheck, Link2, Instagram, Mail, Phone, MessageCircle,
  ChevronRight, RefreshCw, History, Layers, ExternalLink, KeyRound,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

// Confidence bands — hard-verified → soft-claim → open-collision. The whole
// point of the page: nothing hidden, everything graded so the eye knows where
// the machine guessed. See backend services/adminMatching.js.
const BAND = {
  confirmed: { label: "Confirmed", c: "#16a34a", bg: "rgba(22,163,74,0.10)", b: "rgba(22,163,74,0.25)" },
  verified:  { label: "Verified",  c: "#0d9488", bg: "rgba(13,148,136,0.10)", b: "rgba(13,148,136,0.25)" },
  follower:  { label: "Follows you · confirmed", c: "#0891b2", bg: "rgba(8,145,178,0.10)", b: "rgba(8,145,178,0.28)" },
  strong:    { label: "Strong",    c: "#2563eb", bg: "rgba(37,99,235,0.10)",  b: "rgba(37,99,235,0.25)" },
  declared:  { label: "Declared",  c: "#b45309", bg: "rgba(180,83,9,0.10)",   b: "rgba(180,83,9,0.25)" },
  claim:     { label: "Soft claim",c: "#ea580c", bg: "rgba(234,88,12,0.10)",  b: "rgba(234,88,12,0.28)" },
  collision: { label: "Collision", c: "#dc2626", bg: "rgba(220,38,38,0.10)",  b: "rgba(220,38,38,0.28)" },
};

const CHANNEL = {
  email:     { label: "Email",     Icon: Mail,          c: "#6b7280" },
  instagram: { label: "Instagram", Icon: Instagram,     c: "#d6249f" },
  whatsapp:  { label: "WhatsApp",  Icon: MessageCircle, c: "#25d366" },
  tiktok:    { label: "TikTok",    Icon: MessageCircle, c: "#0a0a0a" },
  twitter:   { label: "Twitter",   Icon: MessageCircle, c: "#1d9bf0" },
  other:     { label: "Other",     Icon: Link2,         c: "#6b7280" },
};

const KIND_LABEL = {
  email: "Email", phone: "Phone", ig_user_id: "IG user-id (IGSID)",
  ig_handle: "IG @handle", tiktok: "TikTok", twitter: "Twitter",
};

// Deep-link an identifier out to the real third-party surface, so a match can
// be confirmed by eye in one click (open the actual Instagram, WhatsApp chat…).
// IGSID can't be deep-linked; everything else can.
function idLink(kind, value) {
  if (!value) return null;
  const v = String(value).trim();
  switch (kind) {
    case "ig_handle": return `https://instagram.com/${v.replace(/^@/, "")}`;
    case "tiktok": return `https://www.tiktok.com/@${v.replace(/^@/, "")}`;
    case "twitter": return `https://x.com/${v.replace(/^@/, "")}`;
    case "email": return `mailto:${v}`;
    case "phone": return `https://wa.me/${v.replace(/[^0-9]/g, "")}`;
    default: return null;
  }
}

// An identifier value, rendered as an external link when one exists.
function IdValue({ kind, value, size = 13 }) {
  const href = idLink(kind, value);
  if (!href) return <span style={{ fontSize: size, color: colors.text, wordBreak: "break-all" }}>{value}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{ fontSize: size, color: colors.secondary, wordBreak: "break-all", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {value}<ExternalLink size={Math.round(size * 0.85)} style={{ flexShrink: 0, opacity: 0.7 }} />
    </a>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "collision", label: "Collisions" },
  { key: "claim", label: "Soft claims" },
  { key: "multi", label: "Multi-source" },
  { key: "confirmed", label: "Confirmed" },
];

async function apiGet(url) {
  const r = await authenticatedFetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function apiSend(url, method = "POST", body) {
  const r = await authenticatedFetch(url, { method, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `${r.status}`);
  return j;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function Badge({ band, small }) {
  const s = BAND[band] || BAND.declared;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: 0.2,
      color: s.c, background: s.bg, border: `1px solid ${s.b}`,
      padding: small ? "1px 6px" : "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function ChannelChip({ channel }) {
  const c = CHANNEL[channel] || CHANNEL.other;
  const Icon = c.Icon;
  return (
    <span title={c.label} style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10, fontWeight: 600, color: c.c,
      background: "rgba(10,10,10,0.04)", border: colors.borderFaint,
      borderRadius: 6, padding: "2px 6px",
    }}>
      <Icon size={11} color={c.c} /> {c.label}
    </span>
  );
}

// ── Ledger row ──────────────────────────────────────────────────────
function LedgerRow({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "10px 12px", border: "none", borderBottom: `1px solid ${colors.borderFaint}`,
        background: active ? colors.accentSoft : "transparent", cursor: "pointer",
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 999, flexShrink: 0,
        background: item.needsReview ? (BAND[item.band] || BAND.claim).c : "transparent",
        border: item.needsReview ? "none" : `1px solid ${colors.border}`,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </span>
          <Badge band={item.band} small />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {item.channels.map((ch) => <ChannelChip key={ch} channel={ch} />)}
          <span style={{ fontSize: 10, color: colors.textFaded, alignSelf: "center" }}>{item.identityCount} id{item.identityCount === 1 ? "" : "s"}</span>
        </div>
      </div>
      <ChevronRight size={15} color={colors.textFaded} />
    </button>
  );
}

// ── Side card: one channel, every parameter the source gave ─────────
function SideCard({ channel, identities, profile, thread, onSplit, busy }) {
  const c = CHANNEL[channel] || CHANNEL.other;
  const Icon = c.Icon;
  const raw = profile?.data && typeof profile.data === "object" ? profile.data : null;
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: colors.surface, borderBottom: `1px solid ${colors.borderFaint}` }}>
        <Icon size={15} color={c.c} />
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{c.label}</span>
        {profile && <span style={{ fontSize: 10, color: colors.textFaded, marginLeft: "auto" }}>snapshot {timeAgo(profile.last_refreshed_at)}</span>}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Identifier links */}
        {identities.map((idn) => (
          <div key={idn.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: colors.textSubtle, fontWeight: 600 }}>{KIND_LABEL[idn.kind] || idn.kind}</div>
              <IdValue kind={idn.kind} value={idn.value} />
              <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                <Badge band={idn.band} small />
                <span style={{ fontSize: 10, color: colors.textFaded }}>via {idn.source || "?"}</span>
                {idn.verifiedAt && <ShieldCheck size={11} color={BAND.verified.c} />}
                {idn.reviewedAt && <Check size={11} color={BAND.confirmed.c} />}
              </div>
            </div>
            <button
              onClick={() => onSplit(idn)} disabled={busy}
              title="Split this identifier onto a separate person"
              style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: colors.danger, background: "transparent", border: `1px solid ${colors.dangerRgba}`, borderRadius: 7, padding: "3px 7px", cursor: busy ? "default" : "pointer" }}
            >
              <Scissors size={11} /> Split
            </button>
          </div>
        ))}
        {/* Source-profile extras (followers / verified / bio etc) */}
        {raw && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4, borderTop: `1px solid ${colors.borderFaint}` }}>
            {("followerCount" in raw || "follower_count" in raw) && <Stat k="Followers" v={raw.followerCount ?? raw.follower_count} />}
            {(raw.isVerified || raw.is_verified_user) && <Stat k="Verified" v="yes" />}
            {(raw.is_user_follow_business || raw.isUserFollowBusiness) && <Stat k="Follows you" v="yes" />}
            {(raw.is_business_follow_user || raw.isBusinessFollowUser) && <Stat k="You follow" v="yes" />}
            {profile?.display_name && <Stat k="Name on source" v={profile.display_name} />}
            {profile?.handle && <Stat k="Handle" v={`@${profile.handle}`} />}
          </div>
        )}
        {thread && (
          <div style={{ fontSize: 11, color: colors.textMuted, paddingTop: 4, borderTop: `1px solid ${colors.borderFaint}` }}>
            Last DM {thread.last_message_direction === "in" ? "← in" : "→ out"} {timeAgo(thread.updated_at)}
            {thread.last_message_preview ? ` · "${String(thread.last_message_preview).slice(0, 40)}"` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
function Stat({ k, v }) {
  return (
    <span style={{ fontSize: 10, color: colors.textMuted, background: "rgba(10,10,10,0.04)", borderRadius: 6, padding: "2px 7px" }}>
      <b style={{ color: colors.text }}>{String(v)}</b> {k}
    </span>
  );
}

// ── Merge-with picker ───────────────────────────────────────────────
// Fuse this person with ANY other — not just a resolver-flagged collision.
// Search the ledger, pick the other human, confirm. The backend orients the
// merge by anchor strength (the stronger PullUp profile survives, the other is
// absorbed + its params flow in), so the admin never has to pick a direction.
function MergePicker({ excludeId, busy, onPick, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    let cancel = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: q.trim(), filter: "all", limit: "8" });
        const data = await apiGet(`/admin/matches?${params}`);
        if (!cancel) setResults((data.items || []).filter((it) => it.personId !== excludeId));
      } catch { if (!cancel) setResults([]); }
      finally { if (!cancel) setSearching(false); }
    }, 280);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, excludeId]);

  return (
    <Section title="Merge with another person" icon={GitMerge} tint={colors.gold}>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, background: colors.surface }}>
        {pending ? (
          <div>
            <div style={{ fontSize: 13, color: colors.text, marginBottom: 4 }}>
              Merge <b>{pending.name}</b> with this person?
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
              The stronger PullUp profile survives and absorbs the other; empty params (name, handle,
              IG id, phone, pic) fill in. Reversible — every merge is audited and can be split back.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn primary disabled={busy} onClick={() => onPick(pending.personId)}>
                <GitMerge size={13} /> Merge them
              </ActionBtn>
              <ActionBtn disabled={busy} onClick={() => setPending(null)}><X size={13} /> Back</ActionBtn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={14} color={colors.textFaded} style={{ position: "absolute", left: 9, top: 9 }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, @handle, phone…"
                style={{ width: "100%", padding: "7px 10px 7px 30px", fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {searching && <div style={{ fontSize: 11, color: colors.textFaded, padding: "6px 2px" }}>Searching…</div>}
              {!searching && q.trim() && !results.length && <div style={{ fontSize: 11, color: colors.textFaded, padding: "6px 2px" }}>No one else matches.</div>}
              {results.map((it) => (
                <button key={it.personId} onClick={() => setPending(it)} disabled={busy}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 9px", border: `1px solid ${colors.borderFaint}`, borderRadius: 8, background: "#fff", cursor: busy ? "default" : "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                      <Badge band={it.band} small />
                    </div>
                    <div style={{ fontSize: 10, color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[it.email, it.instagram && `@${String(it.instagram).replace(/^@/, "")}`, it.phone].filter(Boolean).join(" · ") || `${it.identityCount} id${it.identityCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <GitMerge size={14} color={colors.gold} />
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <ActionBtn disabled={busy} onClick={onCancel}><X size={13} /> Cancel</ActionBtn>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

// ── Detail panel ────────────────────────────────────────────────────
function DetailPanel({ personId, onChanged, onMerged, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [err, setErr] = useState(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await apiGet(`/admin/matches/${personId}`);
      setD(data);
      setForm({ name: data.person.name || "", instagram: data.person.instagram || "", email: data.person.email || "", phone: data.person.phone || "" });
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  // Group identities + source profiles + threads into per-channel "sides".
  const sides = useMemo(() => {
    if (!d) return [];
    const order = ["instagram", "whatsapp", "email", "tiktok", "twitter", "other"];
    const byCh = {};
    for (const idn of d.identities) {
      const ch = idn.channel || "other";
      (byCh[ch] = byCh[ch] || { channel: ch, identities: [], profile: null, thread: null }).identities.push(idn);
    }
    for (const p of d.sourceProfiles || []) {
      const ch = p.source === "rsvp" || p.source === "manual" || p.source === "import" ? "email" : p.source;
      (byCh[ch] = byCh[ch] || { channel: ch, identities: [], profile: null, thread: null });
      if (!byCh[ch].profile) byCh[ch].profile = p;
    }
    for (const t of d.instagramThreads || []) if (byCh.instagram) byCh.instagram.thread = t;
    for (const t of d.whatsappThreads || []) if (byCh.whatsapp) byCh.whatsapp.thread = t;
    return order.filter((ch) => byCh[ch]).map((ch) => byCh[ch]);
  }, [d]);

  const act = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); await load(); onChanged?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // Merge another person into this one. The backend orients by anchor strength,
  // so the survivor may be the OTHER person — if so, hand selection to the page;
  // if we survived, just reload our own detail.
  const doMerge = async (otherId) => {
    setBusy(true); setErr(null);
    try {
      const res = await apiSend(`/admin/matches/merge`, "POST", { canonicalId: personId, mergedId: otherId });
      const survivor = res.canonicalId || personId;
      setMergeOpen(false);
      onChanged?.();
      if (survivor === personId) await load();
      else onMerged?.(survivor);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <PanelShell onClose={onClose}><Spinner /></PanelShell>;
  if (err && !d) return <PanelShell onClose={onClose}><div style={{ color: colors.danger, padding: 20 }}>{err}</div></PanelShell>;
  if (!d) return null;

  return (
    <PanelShell onClose={onClose}>
      {/* Header */}
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            {editing ? (
              <div style={{ display: "grid", gap: 6 }}>
                {["name", "instagram", "email", "phone"].map((f) => (
                  <input key={f} value={form[f]} placeholder={f}
                    onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                    style={{ fontSize: 13, padding: "6px 9px", border: `1px solid ${colors.border}`, borderRadius: 7, color: colors.text }} />
                ))}
              </div>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: colors.text }}>{d.person.name}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge band={d.band} />
                  {d.needsReview && (
                    <span style={{ fontSize: 11, color: colors.warning, display: "inline-flex", gap: 3, alignItems: "center" }}>
                      <AlertTriangle size={12} /> needs a look
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: colors.textFaded }}>added {timeAgo(d.person.createdAt)}</span>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <ActionBtn primary disabled={busy} onClick={() => act(async () => { await apiSend(`/admin/matches/${personId}/params`, "PATCH", form); setEditing(false); })}>
                <Check size={13} /> Save
              </ActionBtn>
              <ActionBtn disabled={busy} onClick={() => setEditing(false)}><X size={13} /> Cancel</ActionBtn>
            </>
          ) : (
            <>
              <ActionBtn primary disabled={busy} onClick={() => act(() => apiSend(`/admin/matches/${personId}/confirm`))}>
                <ShieldCheck size={13} /> Confirm matches
              </ActionBtn>
              <ActionBtn disabled={busy} onClick={() => setEditing(true)}><Pencil size={13} /> Edit params</ActionBtn>
              <ActionBtn disabled={busy} onClick={() => setMergeOpen((v) => !v)}><GitMerge size={13} /> Merge with…</ActionBtn>
            </>
          )}
        </div>
        {err && <div style={{ color: colors.danger, fontSize: 12, marginTop: 8 }}>{err}</div>}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {/* Merge with any person (not just a flagged collision) */}
        {mergeOpen && (
          <MergePicker excludeId={personId} busy={busy} onPick={doMerge} onCancel={() => setMergeOpen(false)} />
        )}

        {/* Collisions — side-by-side decide */}
        {d.collisions.length > 0 && (
          <Section title="Possible duplicates" icon={AlertTriangle} tint={colors.danger}>
            {d.collisions.map((col) => (
              <div key={col.candidateId} style={{ border: `1px solid ${BAND.collision.b}`, borderRadius: 12, padding: 12, background: BAND.collision.bg }}>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                  Resolver flagged: <b>{col.reason}</b>
                </div>
                {col.other && (
                  <div style={{ fontSize: 13, color: colors.text }}>
                    <b>{col.other.name}</b>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                      {col.other.identities.map((i, idx) => (
                        <span key={idx} style={{ fontSize: 11, color: colors.textMuted }}>
                          {KIND_LABEL[i.kind] || i.kind}: <IdValue kind={i.kind} value={i.value} size={11} />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <ActionBtn primary disabled={busy}
                    onClick={() => act(() => apiSend(`/admin/matches/merge`, "POST", { canonicalId: personId, mergedId: col.other?.personId, candidateId: col.candidateId }))}>
                    <GitMerge size={13} /> Same person — merge in
                  </ActionBtn>
                  <ActionBtn disabled={busy} onClick={() => act(() => apiSend(`/admin/match-candidates/${col.candidateId}/reject`))}>
                    <X size={13} /> Not the same
                  </ActionBtn>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* The sides — every parameter on each source */}
        <Section title="Linked sources" icon={Layers}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sides.map((s) => (
              <SideCard key={s.channel} {...s} busy={busy}
                onSplit={(idn) => act(() => apiSend(`/admin/matches/${personId}/split`, "POST", { identityId: idn.id }))} />
            ))}
            {!sides.length && <Empty>No linked identifiers.</Empty>}
          </div>
        </Section>

        {/* Login accounts — the auth layer. Multiple = linked, all resolve here. */}
        {d.logins?.length > 0 && (
          <Section title="Login accounts" icon={KeyRound}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.logins.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <KeyRound size={12} color={colors.textFaded} />
                  <span style={{ color: colors.text }}>{l.email || (l.auth_user_id ? l.auth_user_id.slice(0, 8) + "…" : "account")}</span>
                  <span style={{ fontSize: 10, color: colors.textFaded }}>{l.method}</span>
                  {l.is_primary && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: colors.secondary, background: colors.secondarySoft, border: `1px solid ${colors.secondaryBorder}`, borderRadius: 999, padding: "1px 7px" }}>primary</span>
                  )}
                </div>
              ))}
            </div>
            {d.logins.length > 1 && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
                All {d.logins.length} logins resolve to this one person — he can sign in with any of them and land here.
              </div>
            )}
          </Section>
        )}

        {/* Activity */}
        {d.timeline.length > 0 && (
          <Section title="Recent activity" icon={MessageCircle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.timeline.slice(0, 8).map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: colors.textMuted, alignItems: "center" }}>
                  {e.channel && <ChannelChip channel={e.channel === "web" ? "other" : e.channel} />}
                  <span style={{ color: colors.text }}>{e.type}</span>
                  {e.body && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {e.body}</span>}
                  <span style={{ marginLeft: "auto", color: colors.textFaded, flexShrink: 0 }}>{timeAgo(e.occurred_at)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Audit */}
        {(d.reviewLog.length > 0 || d.mergeHistory.length > 0) && (
          <Section title="Review history" icon={History}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {d.mergeHistory.map((m, i) => (
                <div key={`m${i}`} style={{ fontSize: 11, color: colors.textMuted }}>
                  Merged in a duplicate · {timeAgo(m.created_at)}
                </div>
              ))}
              {d.reviewLog.map((r, i) => (
                <div key={`r${i}`} style={{ fontSize: 11, color: colors.textMuted }}>
                  {r.action.replace(/_/g, " ")} · {timeAgo(r.created_at)}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({ children, onClose }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {children}
    </div>
  );
}
function Section({ title, icon: Icon, tint, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {Icon && <Icon size={14} color={tint || colors.textSubtle} />}
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: tint || colors.textSubtle }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
function ActionBtn({ children, primary, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
      padding: "7px 12px", borderRadius: 8, cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.55 : 1,
      color: primary ? "#fff" : colors.text,
      background: primary ? colors.gold : "#fff",
      border: primary ? "none" : `1px solid ${colors.border}`,
    }}>{children}</button>
  );
}
const iconBtn = { display: "inline-flex", padding: 6, border: `1px solid ${colors.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", color: colors.textMuted };
function Empty({ children }) { return <div style={{ fontSize: 12, color: colors.textFaded, padding: "12px 0" }}>{children}</div>; }
function Spinner() { return <div style={{ padding: 30, textAlign: "center", color: colors.textFaded }}><RefreshCw size={18} className="spin" /></div>; }

// ── Page ────────────────────────────────────────────────────────────
export function AdminMatchesPage() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("needs_review");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, limit: "200" });
      if (q.trim()) params.set("q", q.trim());
      const data = await apiGet(`/admin/matches?${params}`);
      setItems(data.items || []);
      setCounts(data.counts || {});
      setTotal(data.total || 0);
    } catch (e) { setItems([]); } finally { setLoading(false); }
  }, [filter, q]);

  useEffect(() => { const t = setTimeout(load, q ? 280 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 16px 60px" }}>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitMerge size={20} color={colors.gold} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.text }}>Identity Matching</h1>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textMuted, maxWidth: 640 }}>
            Every person, and how they were fused across Instagram, WhatsApp, email and PullUp — graded by
            confidence. Verify a match by eye, fix a name or handle, split a wrong claim, or merge two people into one.
          </p>
        </div>
        <button onClick={load} style={{ ...iconBtn, marginLeft: "auto" }} title="Refresh"><RefreshCw size={15} className={loading ? "spin" : ""} /></button>
      </div>

      {/* Stat strip */}
      <div style={{ display: "flex", gap: 18, margin: "14px 0", flexWrap: "wrap" }}>
        <StatBox icon={Users} label="People" value={counts.all ?? total} />
        <StatBox icon={AlertTriangle} label="Need review" value={counts.needs_review ?? 0} tint={colors.warning} />
        <StatBox icon={AlertTriangle} label="Collisions" value={counts.collision ?? 0} tint={colors.danger} />
        <StatBox icon={ShieldCheck} label="Confirmed" value={counts.confirmed ?? 0} tint={colors.success} />
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search size={15} color={colors.textFaded} style={{ position: "absolute", left: 10, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, @handle, phone…"
            style={{ width: "100%", padding: "8px 10px 8px 32px", fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 9, color: colors.text }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = f.key === "all" ? counts.all : counts[f.key];
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                color: active ? "#fff" : colors.textMuted,
                background: active ? colors.gold : "#fff",
                border: active ? "none" : `1px solid ${colors.border}`,
              }}>
                {f.label}{typeof n === "number" ? ` ${n}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ledger + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(280px, 1fr) minmax(360px, 1.3fr)" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
          {loading ? <Spinner /> : items.length ? (
            items.map((it) => (
              <LedgerRow key={it.personId} item={it} active={selected === it.personId} onClick={() => setSelected(it.personId)} />
            ))
          ) : <Empty>No people match this filter.</Empty>}
          {!loading && total > items.length && (
            <div style={{ padding: 10, textAlign: "center", fontSize: 11, color: colors.textFaded }}>
              Showing {items.length} of {total}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: "hidden", position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", display: "flex" }}>
            <DetailPanel personId={selected} onChanged={load} onMerged={(id) => setSelected(id)} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, tint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={16} color={tint || colors.textSubtle} />
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: tint || colors.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10, color: colors.textFaded, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      </div>
    </div>
  );
}

export default AdminMatchesPage;
