// Working together (migrations/151). A brand's head — the account that owns
// it — invites people by email; they sign in with that address, say yes, and
// work in the brand like the head does (lib/brands.js: role member). The
// brand's team can also invite someone to one event only (event_hosts, the
// old app's co-hosts): they edit that event and run its guest list, nothing
// else of the brand.
//
// An invite is bound to an address: only someone signed in with it can take
// it (sign-in proves the address, lib/deviceLogin.js). Invites are capped per
// sender and per address, so the invite mail can't be used to spam anyone.
import { supabase } from "../supabase.js";
import { sendEmail } from "../email/index.js";
import { ActionError } from "./actionError.js";
import { brandScope, brandShape, currentBrand, isHead, isTeam } from "./brands.js";
import { isValidEmail, normalizeEmail } from "./emailAddress.js";
import { teamInviteEmail } from "./eventEmails.js";
import { getFrontendUrl } from "./urls.js";
import { over } from "./abuse.js";
import { userById } from "../agents/oauthProvider.js";
import { eventBrand, eventFor } from "../repos/hostEvents.js";

export const INVITE_DAYS = 30;
export const MAX_TEAM = 50; // members + open invites, per brand or event
const INVITES_PER_HOUR = 20; // per sender
const INVITES_PER_ADDRESS = 3; // per address and day
const HOUR = 3600_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const liveSince = () => new Date(Date.now() - INVITE_DAYS * 86400_000).toISOString();
const notFound = (what = "invite") => new ActionError("not_found", `No ${what} with that id.`);

async function emailOf(id) {
  const user = id ? await userById(id).catch(() => null) : null;
  return (user?.email || "").toLowerCase();
}

async function emailsOf(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  return new Map(await Promise.all(unique.map(async (id) => [id, await emailOf(id)])));
}

async function userIdByEmail(email) {
  const { data, error } = await supabase.rpc("auth_user_id_by_email", { p_email: email });
  if (error) throw error;
  return data || null;
}

function cleanEmail(raw, caller) {
  const email = normalizeEmail(raw).slice(0, 254);
  if (!isValidEmail(email)) throw new ActionError("invalid", "That isn't an email address.", { detail: "email" });
  if (email === caller.email) throw new ActionError("invalid", "That's you.", { detail: "self" });
  return email;
}

function checkRate(caller, email) {
  if (over(`invite:${caller.userId}`, INVITES_PER_HOUR, HOUR)) throw new ActionError("rate_limited", "Too many invites in a short time. Wait a while.");
  if (over(`invite-to:${email}`, INVITES_PER_ADDRESS, 24 * HOUR)) throw new ActionError("rate_limited", "That address has been invited several times today. Try again tomorrow.");
}

// One open invite per address and target: a new one renews the old.
async function saveInvite(target, email, caller) {
  const col = target.brand_id ? "brand_id" : "event_id";
  const { data: old, error } = await supabase.from("team_invites").select("id").eq(col, target[col]).eq("email", email).maybeSingle();
  if (error) throw error;
  const row = { ...target, email, invited_by: caller.userId, created_at: new Date().toISOString() };
  const q = old ? supabase.from("team_invites").update(row).eq("id", old.id) : supabase.from("team_invites").insert(row);
  const { data, error: saveErr } = await q.select("id, email, created_at").single();
  if (saveErr) throw saveErr;
  return data;
}

async function mailInvite({ caller, email, brand, event = null }) {
  const login = `${getFrontendUrl()}/login?next=${encodeURIComponent("/admin/events")}&email=${encodeURIComponent(email)}`;
  const mail = teamInviteEmail({ inviter: caller.email, brand, event, loginUrl: login });
  try {
    await sendEmail({ from: process.env.EVENT_FROM_EMAIL || '"PullUp" <no-reply@pullup.se>', to: email, ...mail, replyTo: caller.email });
    return true;
  } catch (err) {
    console.error("[teams] invite mail failed:", err?.message);
    return false;
  }
}

const inviteShape = (r) => ({ id: r.id, email: r.email, at: r.created_at });

// ── A brand's team ────────────────────────────────────────────────────────

// The brand the page works in: its head, members and open invites. The team
// sees it; only the head can change it.
export async function brandTeam(caller) {
  const brand = await currentBrand(caller);
  if (!isTeam(brand)) throw new ActionError("forbidden", `You co-host single events in ${brand.name}; its team is run by its head.`, { detail: "cohost" });
  const [members, invites] = await Promise.all([
    supabase.from("brand_members").select("user_id, created_at").eq("brand_id", brand.id).order("created_at", { ascending: true }),
    supabase.from("team_invites").select("id, email, created_at").eq("brand_id", brand.id).gte("created_at", liveSince()).order("created_at", { ascending: false }),
  ]);
  if (members.error) throw members.error;
  if (invites.error) throw invites.error;
  const emails = await emailsOf([brand.hostId, ...(members.data || []).map((m) => m.user_id)]);
  return {
    brand: brandShape(brand),
    canManage: isHead(brand),
    head: { email: emails.get(brand.hostId) || "", you: brand.hostId === caller.hostId },
    members: (members.data || []).map((m) => ({ userId: m.user_id, email: emails.get(m.user_id) || "", since: m.created_at, you: m.user_id === caller.userId })),
    invites: (invites.data || []).map(inviteShape),
  };
}

export async function inviteToBrand(caller, rawEmail) {
  const brand = await currentBrand(caller);
  if (!isHead(brand)) throw new ActionError("forbidden", "Only the brand's head can invite people to it.");
  const email = cleanEmail(rawEmail, caller);
  const userId = await userIdByEmail(email);
  if (userId === brand.hostId) throw new ActionError("invalid", "That's the brand's head.", { detail: "already" });
  const [{ data: member }, { count }] = await Promise.all([
    userId ? supabase.from("brand_members").select("user_id").eq("brand_id", brand.id).eq("user_id", userId).maybeSingle() : { data: null },
    supabase.from("brand_members").select("user_id", { count: "exact", head: true }).eq("brand_id", brand.id),
  ]);
  if (member) throw new ActionError("invalid", `${email} is already in the team.`, { detail: "already" });
  const { count: open } = await supabase.from("team_invites").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).gte("created_at", liveSince());
  if ((count || 0) + (open || 0) >= MAX_TEAM) throw new ActionError("invalid", `A team can have at most ${MAX_TEAM} people.`, { detail: "too_many" });
  checkRate(caller, email);
  const invite = await saveInvite({ brand_id: brand.id }, email, caller);
  const mailed = await mailInvite({ caller, email, brand: brand.name });
  return { invite: inviteShape(invite), mailed };
}

// The head removes someone; a member can leave.
export async function removeMember(caller, userId) {
  const brand = await currentBrand(caller);
  if (!UUID.test(String(userId || ""))) throw notFound("member");
  const leaving = userId === caller.userId && brand.role === "member";
  if (!leaving && !isHead(brand)) throw new ActionError("forbidden", "Only the brand's head can remove people.");
  const { data, error } = await supabase.from("brand_members").delete().eq("brand_id", brand.id).eq("user_id", userId).select("user_id");
  if (error) throw error;
  if (!data?.length) throw notFound("member");
  return { removed: true, left: leaving };
}

// ── One event's co-hosts ──────────────────────────────────────────────────

// May the caller invite to and remove from this event: the brand's team (the
// owner on his own events).
async function manages(caller, ev) {
  if (caller.isOwner) return ev.host_id === caller.hostId;
  return isTeam(await eventBrand(caller, ev));
}

export async function eventTeam(caller, eventId) {
  const ev = await eventFor(caller, eventId);
  const [hosts, invites, canManage] = await Promise.all([
    supabase.from("event_hosts").select("user_id, created_at").eq("event_id", ev.id).neq("role", "owner").order("created_at", { ascending: true }),
    supabase.from("team_invites").select("id, email, created_at").eq("event_id", ev.id).gte("created_at", liveSince()).order("created_at", { ascending: false }),
    manages(caller, ev),
  ]);
  if (hosts.error) throw hosts.error;
  if (invites.error) throw invites.error;
  const rows = (hosts.data || []).filter((h) => h.user_id !== ev.host_id);
  const emails = await emailsOf(rows.map((h) => h.user_id));
  return {
    canManage,
    cohosts: rows.map((h) => ({ userId: h.user_id, email: emails.get(h.user_id) || "", since: h.created_at, you: h.user_id === caller.userId })),
    invites: canManage ? (invites.data || []).map(inviteShape) : [],
  };
}

export async function inviteToEvent(caller, eventId, rawEmail) {
  const ev = await eventFor(caller, eventId);
  if (!(await manages(caller, ev))) throw new ActionError("forbidden", "Only the brand's team can invite co-hosts.");
  const email = cleanEmail(rawEmail, caller);
  const userId = await userIdByEmail(email);
  if (userId === ev.host_id) throw new ActionError("invalid", "That's the event's organiser.", { detail: "already" });
  if (userId) {
    const [{ data: host }, { data: member }] = await Promise.all([
      supabase.from("event_hosts").select("user_id").eq("event_id", ev.id).eq("user_id", userId).maybeSingle(),
      ev.brand_id ? supabase.from("brand_members").select("user_id").eq("brand_id", ev.brand_id).eq("user_id", userId).maybeSingle() : { data: null },
    ]);
    if (host || member) throw new ActionError("invalid", `${email} already works on this event.`, { detail: "already" });
  }
  const [{ count: hosts }, { count: open }] = await Promise.all([
    supabase.from("event_hosts").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    supabase.from("team_invites").select("id", { count: "exact", head: true }).eq("event_id", ev.id).gte("created_at", liveSince()),
  ]);
  if ((hosts || 0) + (open || 0) >= MAX_TEAM) throw new ActionError("invalid", `An event can have at most ${MAX_TEAM} co-hosts.`, { detail: "too_many" });
  checkRate(caller, email);
  const invite = await saveInvite({ event_id: ev.id }, email, caller);
  const { brands } = await brandScope(caller);
  const brandName = brands.find((b) => b.id === ev.brand_id)?.name || "PullUp";
  const mailed = await mailInvite({ caller, email, brand: brandName, event: ev.title || "Event" });
  return { invite: inviteShape(invite), mailed };
}

// The team removes a co-host; a co-host can step down.
export async function removeCohost(caller, eventId, userId) {
  const ev = await eventFor(caller, eventId);
  if (!UUID.test(String(userId || ""))) throw notFound("co-host");
  if (userId !== caller.userId && !(await manages(caller, ev))) throw new ActionError("forbidden", "Only the brand's team can remove co-hosts.");
  const { data, error } = await supabase.from("event_hosts").delete().eq("event_id", ev.id).eq("user_id", userId).neq("role", "owner").select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("co-host");
  return { removed: true, left: userId === caller.userId };
}

// ── Invites ───────────────────────────────────────────────────────────────

// Take back an invite before it's answered: whoever may send it.
export async function cancelInvite(caller, id) {
  if (!UUID.test(String(id || ""))) throw notFound();
  const { data: inv, error } = await supabase.from("team_invites").select("id, brand_id, event_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!inv) throw notFound();
  if (inv.brand_id) {
    const { brands } = await brandScope(caller);
    if (!isHead(brands.find((b) => b.id === inv.brand_id))) throw notFound();
  } else {
    const ev = await eventFor(caller, inv.event_id).catch(() => null);
    if (!ev || !(await manages(caller, ev))) throw notFound();
  }
  await supabase.from("team_invites").delete().eq("id", inv.id);
  return { cancelled: true };
}

// Invites waiting for the signed-in address: what, from whom.
export async function myInvites(caller) {
  if (!caller.email) return [];
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, brand_id, event_id, invited_by, created_at")
    .eq("email", caller.email)
    .gte("created_at", liveSince())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!data?.length) return [];
  const eventIds = data.map((r) => r.event_id).filter(Boolean);
  const { data: evs } = eventIds.length ? await supabase.from("events").select("id, title, brand_id").in("id", eventIds) : { data: [] };
  const events = new Map((evs || []).map((e) => [e.id, e]));
  const brandIds = [...data.map((r) => r.brand_id), ...(evs || []).map((e) => e.brand_id)].filter(Boolean);
  const { data: bs } = brandIds.length ? await supabase.from("brands").select("id, name").in("id", [...new Set(brandIds)]) : { data: [] };
  const names = new Map((bs || []).map((b) => [b.id, b.name]));
  const from = await emailsOf(data.map((r) => r.invited_by));
  return data
    .map((r) => {
      const ev = r.event_id ? events.get(r.event_id) : null;
      const brandId = r.brand_id || ev?.brand_id;
      return { id: r.id, kind: r.brand_id ? "brand" : "event", brandId, brand: names.get(brandId) || "", eventId: ev?.id || null, event: ev?.title || null, from: from.get(r.invited_by) || "" };
    })
    .filter((r) => r.brand && (r.kind === "brand" || r.eventId));
}

async function ownInvite(caller, id) {
  if (!UUID.test(String(id || "")) || !caller.email) throw notFound();
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, brand_id, event_id, invited_by")
    .eq("id", id)
    .eq("email", caller.email)
    .gte("created_at", liveSince())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return data;
}

// Say yes: join the brand's team, or become the event's co-host. → where to go.
export async function acceptInvite(caller, id) {
  const inv = await ownInvite(caller, id);
  let brandId = inv.brand_id;
  if (inv.brand_id) {
    const { data: brand } = await supabase.from("brands").select("id, host_id").eq("id", inv.brand_id).maybeSingle();
    if (!brand) throw notFound();
    if (brand.host_id !== caller.hostId) {
      const { error } = await supabase.from("brand_members")
        .upsert({ brand_id: brand.id, user_id: caller.userId, added_by: inv.invited_by }, { onConflict: "brand_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    }
  } else {
    const { data: ev } = await supabase.from("events").select("id, host_id, brand_id").eq("id", inv.event_id).maybeSingle();
    if (!ev) throw notFound();
    brandId = ev.brand_id;
    if (ev.host_id !== caller.hostId) {
      const { error } = await supabase.from("event_hosts")
        .upsert({ event_id: ev.id, user_id: caller.userId, role: "cohost" }, { onConflict: "event_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    }
  }
  await supabase.from("team_invites").delete().eq("id", inv.id);
  caller._brandScope = null;
  return { brandId: brandId || null, eventId: inv.event_id || null };
}

export async function declineInvite(caller, id) {
  const inv = await ownInvite(caller, id);
  await supabase.from("team_invites").delete().eq("id", inv.id);
  return { declined: true };
}
