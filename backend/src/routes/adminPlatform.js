// The owner's view of the event tool (/admin/platform): how many organisers
// have an account, how many events are out, every account with its brands,
// events, sign-ups and mail credits — and credits can be given (a customer
// set up by hand, like Nigab). Owner only.
import { isOwnerEmail, requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { selectAllPaged } from "../lib/selectAllPaged.js";
import { creditBalance } from "../lib/emailCredits.js";
import { brandStats } from "../lib/eventStats.js";
import { setLimits, shapeLimits } from "../lib/accountLimits.js";

const DAY = 86400000;
// The slim event platform went live on 2026-10-19; older accounts came from the old app.
const RELAUNCH = Date.parse("2026-10-19T00:00:00Z");

// The accounts behind these ids (auth.admin.listUsers fails on this
// database, so each is read on its own, a few at a time).
async function usersById(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    const part = await Promise.all(ids.slice(i, i + 10).map((id) => supabase.auth.admin.getUserById(id).then(({ data }) => data?.user || null).catch(() => null)));
    out.push(...part.filter(Boolean));
  }
  return out;
}

const isBanned = (u, now = Date.now()) => !!u?.banned_until && Date.parse(u.banned_until) > now;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rows of `table` whose `col` is in `ids`, all pages, a hundred ids at a time.
async function rowsIn(table, columns, col, ids) {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    out.push(...(await selectAllPaged(() => supabase.from(table).select(columns).in(col, chunk).order("id", { ascending: true }))));
  }
  return out;
}

// One account, for the side panel on /admin/platform: who it is, its brands
// and team, every event with its numbers, mail and credits, contacts, and
// the limits on it.
export async function accountDetail(id, now = Date.now()) {
  const { data: auth } = await supabase.auth.admin.getUserById(id);
  const u = auth?.user;
  if (!u) return null;
  const [{ data: profile }, brands, events, ledger, limitRow] = await Promise.all([
    supabase.from("profiles").select("name, brand, city, brand_website, contact_email, mobile_number, login_count, last_login_at, signup_origin").eq("id", id).maybeSingle(),
    selectAllPaged(() => supabase.from("brands").select("id, name, parent_id, created_at, sender_email, sender_verified_at").eq("host_id", id).order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("events").select("id, slug, title, status, starts_at, ends_at, created_at, updated_at, brand_id, created_via, total_capacity, location").eq("host_id", id).or("kind.is.null,kind.eq.event").order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("email_credit_ledger").select("id, delta, reason, pack, amount_sek, note, created_at").eq("host_id", id).order("created_at", { ascending: false })),
    supabase.from("account_limits").select("*").eq("host_id", id).maybeSingle(),
  ]);
  const brandIds = brands.map((b) => b.id);
  const eventIds = events.map((e) => e.id);
  const [rsvps, views, pullups, members, contacts, imports, mails] = await Promise.all([
    rowsIn("rsvps", "id, event_id, person_id, status, pulled_up, created_at, marketing_opt_in, visitor_id", "event_id", eventIds),
    rowsIn("event_page_views", "id, event_id, visitor_id, referrer, utm_source, device_type, created_at", "event_id", eventIds),
    rowsIn("pullups", "id, event_id, person_id", "event_id", eventIds),
    brandIds.length ? selectAllPaged(() => supabase.from("brand_members").select("brand_id, user_id, created_at").in("brand_id", brandIds).order("created_at", { ascending: true })) : [],
    brandIds.length ? selectAllPaged(() => supabase.from("brand_contacts").select("brand_id, person_id, consent").in("brand_id", brandIds).order("person_id", { ascending: true })) : [],
    brandIds.length ? selectAllPaged(() => supabase.from("data_imports").select("id, brand_id, file_name, rows_total, rows_added, rows_consented, created_at").in("brand_id", brandIds).order("created_at", { ascending: false })) : [],
    selectAllPaged(() => supabase.from("email_outbox").select("id, category, status, campaign_tag, created_at").or(brandIds.length ? `host_id.eq.${id},brand_id.in.(${brandIds.join(",")})` : `host_id.eq.${id}`).order("id", { ascending: true })),
  ]);
  const memberUsers = await usersById([...new Set(members.map((m) => m.user_id))]);
  const emailOf = new Map(memberUsers.map((m) => [m.id, m.email]));
  const nameOf = new Map(brands.map((b) => [b.id, b.name]));
  const stats = brandStats({ brands: [], events, rsvps, views, pullups, now });
  const byEvent = new Map(stats.events.map((e) => [e.id, e]));
  const sent = mails.filter((m) => m.status === "sent" || m.status === "delivered");
  const sends = new Set(mails.filter((m) => m.campaign_tag && !/:test$/.test(m.campaign_tag)).map((m) => m.campaign_tag));
  return {
    id: u.id,
    email: u.email,
    name: profile?.name || null,
    profile: profile ? { city: profile.city || null, website: profile.brand_website || null, phone: profile.mobile_number || null, contactEmail: profile.contact_email || null, origin: profile.signup_origin || null, logins: profile.login_count ?? null } : null,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at || null,
    provider: u.app_metadata?.provider || null,
    confirmed: !!u.email_confirmed_at,
    banned: isBanned(u, now),
    bannedUntil: isBanned(u, now) ? u.banned_until : null,
    limits: shapeLimits(limitRow?.data),
    brands: brands.map((b) => ({ id: b.id, name: b.name, under: b.parent_id ? nameOf.get(b.parent_id) || "–" : null, sender: b.sender_email || null, senderVerified: !!b.sender_verified_at, members: members.filter((m) => m.brand_id === b.id).map((m) => emailOf.get(m.user_id) || m.user_id) })),
    totals: stats.totals,
    daily: stats.daily,
    sources: stats.sources,
    events: events
      .map((e) => ({ id: e.id, slug: e.slug, title: e.title, status: e.status, startsAt: e.starts_at, createdAt: e.created_at, updatedAt: e.updated_at, via: e.created_via, capacity: e.total_capacity, location: e.location, brand: nameOf.get(e.brand_id) || null, upcoming: e.status === "PUBLISHED" && Date.parse(e.ends_at || e.starts_at) > now, ...(byEvent.get(e.id) || {}) }))
      .sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || "")),
    contacts: { total: new Set(contacts.map((c) => c.person_id)).size, consented: new Set(contacts.filter((c) => c.consent).map((c) => c.person_id)).size },
    imports: imports.slice(0, 10).map((i) => ({ file: i.file_name, brand: nameOf.get(i.brand_id) || null, total: i.rows_total, added: i.rows_added, consented: i.rows_consented, at: i.created_at })),
    mail: {
      total: mails.length,
      sent: sent.length,
      failed: mails.filter((m) => m.status === "failed" || m.status === "bounced").length,
      last30: mails.filter((m) => Date.parse(m.created_at) > now - 30 * DAY).length,
      sends: sends.size,
      byCategory: Object.entries(mails.reduce((a, m) => ((a[m.category || "övrigt"] = (a[m.category || "övrigt"] || 0) + 1), a), {})).map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n),
    },
    credits: ledger.reduce((n, r) => n + (Number(r.delta) || 0), 0),
    ledger: ledger.slice(0, 25).map((r) => ({ delta: r.delta, reason: r.reason, pack: r.pack, amountSek: r.amount_sek, note: r.note, at: r.created_at })),
  };
}

export async function platformStats(now = Date.now()) {
  const [brands, events] = await Promise.all([
    selectAllPaged(() => supabase.from("brands").select("id, host_id, name, parent_id, created_at").order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("events").select("id, host_id, brand_id, title, status, starts_at, ends_at, created_at, created_via").or("kind.is.null,kind.eq.event").order("created_at", { ascending: true })),
  ]);
  // Organisers: accounts with a brand (signed up to the event tool), not the
  // owner, not test addresses.
  const [users, limitRows] = await Promise.all([
    usersById([...new Set(brands.map((b) => b.host_id))]),
    selectAllPaged(() => supabase.from("account_limits").select("*").order("host_id", { ascending: true })),
  ]);
  const limitsOf = new Map(limitRows.map((r) => [r.host_id, shapeLimits(r)]));
  const organisers = users.filter((u) => !isOwnerEmail(u.email) && !/@example\.(com|se)$/i.test(u.email || ""));
  const ids = new Set(organisers.map((u) => u.id));
  const theirs = events.filter((e) => ids.has(e.host_id));
  const signups = new Map();
  for (let i = 0; i < theirs.length; i += 200) {
    const slice = theirs.slice(i, i + 200).map((e) => e.id);
    const rows = await selectAllPaged(() => supabase.from("rsvps").select("id, event_id, status").in("event_id", slice).order("id", { ascending: true }));
    for (const r of rows) if (r.status !== "cancelled") signups.set(r.event_id, (signups.get(r.event_id) || 0) + 1);
  }
  const live = (e) => e.status === "PUBLISHED";
  const upcoming = (e) => live(e) && Date.parse(e.ends_at || e.starts_at) > now;
  const accounts = await Promise.all(organisers.map(async (u) => {
    const ev = theirs.filter((e) => e.host_id === u.id);
    return {
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      fromOldApp: Date.parse(u.created_at) < RELAUNCH,
      lastSignIn: u.last_sign_in_at || null,
      brands: brands.filter((b) => b.host_id === u.id).map((b) => ({ id: b.id, name: b.name, under: !!b.parent_id })),
      events: ev.length,
      published: ev.filter(live).length,
      upcoming: ev.filter(upcoming).length,
      signups: ev.reduce((n, e) => n + (signups.get(e.id) || 0), 0),
      // Each event's day, for "since the mail" counts (lib/freeToolOutreach.js).
      eventList: ev.map((e) => ({ createdAt: e.created_at, published: live(e), signups: signups.get(e.id) || 0 })),
      credits: await creditBalance(u.id).catch(() => null),
      banned: isBanned(u, now),
      limits: limitsOf.get(u.id) || shapeLimits(null),
    };
  }));
  const since = (ms) => organisers.filter((u) => Date.parse(u.created_at) > now - ms).length;
  return {
    totals: {
      accounts: organisers.length,
      new7: since(7 * DAY),
      new30: since(30 * DAY),
      sinceRelaunch: organisers.filter((u) => Date.parse(u.created_at) >= RELAUNCH).length,
      events: theirs.length,
      published: theirs.filter(live).length,
      upcoming: theirs.filter(upcoming).length,
      signups: [...signups.values()].reduce((a, b) => a + b, 0),
    },
    accounts: accounts.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
  };
}

// The event tool's own page (/eventverktyg, tracked as page "pullup"): visits
// and what they clicked, the last 30 days.
export async function toolPageStats(now = Date.now()) {
  const since = new Date(now - 30 * DAY).toISOString();
  const [views, ctas] = await Promise.all([
    selectAllPaged(() => supabase.from("analytics_events").select("id, session_id, occurred_at").eq("event_name", "page_view").eq("props->>page", "pullup").gte("occurred_at", since).order("id", { ascending: true })),
    selectAllPaged(() => supabase.from("analytics_events").select("id, session_id, occurred_at, props").eq("event_name", "cta_click").like("props->>location", "tool_%").gte("occurred_at", since).order("id", { ascending: true })),
  ]);
  const week = now - 7 * DAY;
  const visits = (rows, from = 0) => new Set(rows.filter((r) => Date.parse(r.occurred_at) >= from).map((r) => r.session_id)).size;
  const signup = ctas.filter((c) => !/_mcp$/.test(c.props?.location || ""));
  const mcp = ctas.filter((c) => /_mcp$/.test(c.props?.location || ""));
  return { visits30: visits(views), visits7: visits(views, week), signupClicks: visits(signup), mcpCopies: visits(mcp) };
}

export function registerAdminPlatformRoutes(app) {
  app.get("/admin/platform", requireOwner, async (_req, res) => {
    try {
      const [stats, page] = await Promise.all([platformStats(), toolPageStats().catch(() => null)]);
      return res.json({ ...stats, page });
    } catch (err) {
      console.error("[platform] stats:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.get("/admin/platform/accounts/:id", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      const out = await accountDetail(req.params.id);
      return out ? res.json(out) : res.status(404).json({ error: "not_found" });
    } catch (err) {
      console.error("[platform] account:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Limits on an account (lib/accountLimits.js): pause its mail, its
  // publishing, cap its events, with a note for why.
  app.post("/admin/platform/accounts/:id/limits", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json({ ok: true, limits: await setLimits(req.params.id, req.body || {}) });
    } catch (err) {
      if (err?.code === "invalid") return res.status(400).json({ error: "invalid" });
      console.error("[platform] limits:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Stop or let back in an account's login (Supabase's own ban: no new
  // sessions, and the current one ends when its token next refreshes).
  // Its published pages stay up; unpublish them one by one if needed.
  app.post("/admin/platform/accounts/:id/ban", requireOwner, async (req, res) => {
    try {
      const id = req.params.id;
      if (!UUID.test(id)) return res.status(400).json({ error: "invalid" });
      const { data } = await supabase.auth.admin.getUserById(id);
      if (!data?.user) return res.status(404).json({ error: "not_found" });
      if (isOwnerEmail(data.user.email)) return res.status(400).json({ error: "owner" });
      const banned = req.body?.banned === true;
      const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: banned ? "876000h" : "none" });
      if (error) throw error;
      return res.json({ ok: true, banned });
    } catch (err) {
      console.error("[platform] ban:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Publish or unpublish one organiser's event from the panel.
  app.post("/admin/platform/events/:id/status", requireOwner, async (req, res) => {
    try {
      const status = req.body?.status;
      if (!UUID.test(req.params.id) || (status !== "PUBLISHED" && status !== "DRAFT")) return res.status(400).json({ error: "invalid" });
      const { data, error } = await supabase.from("events").update({ status }).eq("id", req.params.id).select("id, status").maybeSingle();
      if (error) throw error;
      return data ? res.json({ ok: true, status: data.status }) : res.status(404).json({ error: "not_found" });
    } catch (err) {
      console.error("[platform] event status:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Give an account mail credits (a customer set up by hand), or take some
  // back (a negative count, never below zero). Logged in the credit ledger
  // as an "adjust" with the owner's note.
  app.post("/admin/platform/credits", requireOwner, async (req, res) => {
    try {
      const hostId = String(req.body?.hostId || "");
      const count = Math.round(Number(req.body?.count));
      if (!/^[0-9a-f-]{36}$/i.test(hostId) || !Number.isFinite(count) || count === 0 || Math.abs(count) > 1000000) return res.status(400).json({ error: "invalid" });
      if (count < 0 && (await creditBalance(hostId)) + count < 0) return res.status(400).json({ error: "below_zero" });
      const { error } = await supabase.from("email_credit_ledger").insert({ host_id: hostId, delta: count, reason: "adjust", note: String(req.body?.note || "").slice(0, 200) || null });
      if (error) throw error;
      return res.json({ ok: true, balance: await creditBalance(hostId) });
    } catch (err) {
      console.error("[platform] credits:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
