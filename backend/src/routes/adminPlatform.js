// The owner's view of the event tool (/admin/platform): how many organisers
// have an account, how many events are out, every account with its brands,
// events, sign-ups and mail credits; per account the deal (lib/
// accountSettings.js: invoice billing, price, perks, limits), invoices (lib/
// accountInvoices.js) and signals worth acting on. Owner only. The same
// functions back the owner's MCP tools (actions/platform.js).
import { isOwnerEmail, requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { selectAllPaged } from "../lib/selectAllPaged.js";
import { creditBalance } from "../lib/emailCredits.js";
import { brandStats } from "../lib/eventStats.js";
import { creditsView, setSettings, shapeSettings, floorFor, priceFor } from "../lib/accountSettings.js";
import { allInvoices, createInvoice, invoiceCsv, invoicesFor, setInvoiceStatus, unbilledFor } from "../lib/accountInvoices.js";

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

// What's worth acting on for one account: pure, so the list, the panel and
// the owner's assistant say the same. level: bad > warn > info.
export function signalsFor({ settings, balance = 0, lastSignIn = null, events = [], invoices = [], now = Date.now() }) {
  const out = [];
  const days = (iso) => Math.floor((Date.parse(iso) - now) / DAY);
  const invoice = settings?.billing === "invoice";
  if (settings?.contractUntil) {
    const d = days(`${settings.contractUntil}T23:59:59Z`);
    if (d < 0) out.push({ key: "contract_ended", level: "bad", text: `Avtalet gick ut ${settings.contractUntil}` });
    else if (d <= 30) out.push({ key: "contract_ending", level: "warn", text: `Avtalet går ut om ${d} dagar` });
  }
  if (invoice) {
    const limit = settings.creditLimit || 0;
    const used = Math.max(0, -balance);
    if (limit === 0) out.push({ key: "no_credit_limit", level: "warn", text: "Fakturakund utan kreditgräns: kan inte skicka" });
    else if (used >= limit) out.push({ key: "credit_limit_reached", level: "bad", text: "Kreditgränsen är nådd: utskick stoppas" });
    else if (used >= limit * 0.8) out.push({ key: "credit_limit_near", level: "warn", text: `${Math.round((used / limit) * 100)} % av kreditgränsen använd` });
    if (used > 0) out.push({ key: "unbilled", level: "info", text: `${used.toLocaleString("sv-SE")} utskick att fakturera` });
  }
  for (const inv of invoices) {
    if (inv.status === "sent" && inv.sentAt && now - Date.parse(inv.sentAt) > 30 * DAY) out.push({ key: "invoice_overdue", level: "bad", text: `${inv.number} obetald sedan ${String(inv.sentAt).slice(0, 10)}` });
    if (inv.status === "draft" && now - Date.parse(inv.createdAt) > 7 * DAY) out.push({ key: "invoice_unsent", level: "warn", text: `${inv.number} är inte skickad` });
  }
  for (const e of events) {
    if (e.status !== "PUBLISHED" || !e.starts_at) continue;
    const d = days(e.starts_at);
    if (d >= 0 && d <= 14 && !(e.signups > 0)) out.push({ key: "event_soon_empty", level: "warn", text: `"${e.title}" om ${d} dagar, inga anmälda än` });
  }
  if (events.some((e) => e.status === "PUBLISHED" && Date.parse(e.ends_at || e.starts_at) > now) && lastSignIn && now - Date.parse(lastSignIn) > 30 * DAY) {
    out.push({ key: "quiet_host", level: "info", text: "Har kommande event men har inte loggat in på 30 dagar" });
  }
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
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
  const [{ data: profile }, brands, events, ledger, settingsRow, invoices, credits] = await Promise.all([
    supabase.from("profiles").select("name, brand, city, brand_website, contact_email, mobile_number, login_count, last_login_at, signup_origin").eq("id", id).maybeSingle(),
    selectAllPaged(() => supabase.from("brands").select("id, name, parent_id, created_at, sender_email, sender_verified_at").eq("host_id", id).order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("events").select("id, slug, title, status, starts_at, ends_at, created_at, updated_at, brand_id, created_via, total_capacity, location").eq("host_id", id).or("kind.is.null,kind.eq.event").order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("email_credit_ledger").select("id, delta, reason, pack, amount_sek, note, created_at").eq("host_id", id).order("created_at", { ascending: false })),
    supabase.from("account_settings").select("*").eq("host_id", id).maybeSingle(),
    invoicesFor(id),
    creditsView(id),
  ]);
  const settings = shapeSettings(settingsRow?.data);
  const brandIds = brands.map((b) => b.id);
  const eventIds = events.map((e) => e.id);
  const [rsvps, views, pullups, members, contacts, imports, mails] = await Promise.all([
    rowsIn("rsvps", "id, event_id, person_id, status, pulled_up, created_at, marketing_opt_in, visitor_id", "event_id", eventIds),
    rowsIn("event_page_views", "id, event_id, visitor_id, referrer, utm_source, device_type, created_at", "event_id", eventIds),
    rowsIn("pullups", "id, event_id, person_id", "event_id", eventIds),
    brandIds.length ? selectAllPaged(() => supabase.from("brand_members").select("brand_id, user_id, created_at").in("brand_id", brandIds).order("created_at", { ascending: true })) : [],
    brandIds.length ? selectAllPaged(() => supabase.from("brand_contacts").select("brand_id, person_id, consent").in("brand_id", brandIds).order("person_id", { ascending: true })) : [],
    brandIds.length ? selectAllPaged(() => supabase.from("data_imports").select("id, brand_id, file_name, rows_total, rows_added, rows_consented, dpa_version, dpa_accepted_at, created_at").in("brand_id", brandIds).order("created_at", { ascending: false })) : [],
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
    limits: settings,
    settings,
    // The data agreement: signed on paper (settings) and/or accepted in the
    // app when contacts were imported (data_imports).
    dpa: { signedAt: settings.dpaSignedAt, acceptedInApp: imports.find((i) => i.dpa_accepted_at)?.dpa_accepted_at || null, version: imports.find((i) => i.dpa_version)?.dpa_version || null },
    billing: { ...credits, unbilledSek: Math.round((credits.unbilled / 1000) * credits.pricePer1000Sek * 100) / 100 },
    invoices,
    signals: signalsFor({ settings, balance: credits.balance, lastSignIn: u.last_sign_in_at, events: events.map((e) => ({ ...e, signups: byEvent.get(e.id)?.signups || 0 })), invoices, now }),
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
  const [users, settingRows, invoices] = await Promise.all([
    usersById([...new Set(brands.map((b) => b.host_id))]),
    selectAllPaged(() => supabase.from("account_settings").select("*").order("host_id", { ascending: true })),
    allInvoices(),
  ]);
  const settingsOf = new Map(settingRows.map((r) => [r.host_id, shapeSettings(r)]));
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
      limits: settingsOf.get(u.id) || shapeSettings(null),
      settings: settingsOf.get(u.id) || shapeSettings(null),
    };
  }));
  // Signals per account (contract, credit limit, invoices, empty events).
  for (const a of accounts) {
    const evs = theirs.filter((e) => e.host_id === a.id).map((e) => ({ ...e, signups: signups.get(e.id) || 0 }));
    a.signals = signalsFor({ settings: a.settings, balance: a.credits || 0, lastSignIn: a.lastSignIn, events: evs, invoices: invoices.filter((i) => i.hostId === a.id), now });
    a.unbilled = a.settings.billing === "invoice" ? Math.max(0, -(a.credits || 0)) : 0;
    a.unbilledSek = Math.round((a.unbilled / 1000) * priceFor(a.settings) * 100) / 100;
    // What the account can send now (an invoice customer: down to its limit).
    a.available = a.credits == null ? null : a.credits - floorFor(a.settings);
  }
  const since = (ms) => organisers.filter((u) => Date.parse(u.created_at) > now - ms).length;
  const open = invoices.filter((i) => i.status === "draft" || i.status === "sent");
  return {
    billing: {
      invoiceCustomers: accounts.filter((a) => a.settings.billing === "invoice").length,
      unbilledSends: accounts.reduce((n, a) => n + a.unbilled, 0),
      unbilledSek: Math.round(accounts.reduce((n, a) => n + a.unbilledSek, 0) * 100) / 100,
      openInvoices: open.length,
      openSek: Math.round(open.reduce((n, i) => n + i.totalSek, 0) * 100) / 100,
      paidSek: Math.round(invoices.filter((i) => i.status === "paid").reduce((n, i) => n + i.totalSek, 0) * 100) / 100,
      signals: accounts.reduce((n, a) => n + a.signals.filter((x) => x.level !== "info").length, 0),
    },
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

// ─── Actions, shared by the page's routes and the owner's MCP tools ─────────

// Credits by hand: a positive count gives, a negative takes back (never
// below zero). Logged as an "adjust" with the note.
export async function giveCredits(hostId, count, note = "") {
  const n = Math.round(Number(count));
  if (!UUID.test(String(hostId)) || !Number.isFinite(n) || n === 0 || Math.abs(n) > 1000000) throw Object.assign(new Error("invalid"), { code: "invalid" });
  if (n < 0 && (await creditBalance(hostId)) + n < 0) throw Object.assign(new Error("below_zero"), { code: "below_zero" });
  const { error } = await supabase.from("email_credit_ledger").insert({ host_id: hostId, delta: n, reason: "adjust", note: String(note || "").slice(0, 200) || null });
  if (error) throw error;
  return creditBalance(hostId);
}

// Stop or let back in an account's login (Supabase's own ban). Never the owner.
export async function setBanned(hostId, banned) {
  const { data } = await supabase.auth.admin.getUserById(hostId);
  if (!data?.user) throw Object.assign(new Error("not_found"), { code: "not_found" });
  if (isOwnerEmail(data.user.email)) throw Object.assign(new Error("owner"), { code: "owner" });
  const { error } = await supabase.auth.admin.updateUserById(hostId, { ban_duration: banned ? "876000h" : "none" });
  if (error) throw error;
  return !!banned;
}

export async function setEventStatus(eventId, status) {
  if (status !== "PUBLISHED" && status !== "DRAFT") throw Object.assign(new Error("invalid"), { code: "invalid" });
  const { data, error } = await supabase.from("events").update({ status }).eq("id", eventId).select("id, status").maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("not_found"), { code: "not_found" });
  return data.status;
}

// An account by id or e-mail address (organisers only).
export async function findAccountId(ref) {
  const r = String(ref || "").trim();
  if (UUID.test(r)) return r;
  const { accounts } = await platformStats();
  return accounts.find((a) => a.email?.toLowerCase() === r.toLowerCase())?.id || null;
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

  // The account's settings (lib/accountSettings.js): the deal (invoice
  // billing, credit limit, price), perks, the agreement and the limits.
  // Only the fields sent change. /limits is the older name.
  const saveSettings = async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      const settings = await setSettings(req.params.id, req.body || {});
      return res.json({ ok: true, settings, limits: settings });
    } catch (err) {
      if (err?.code === "invalid") return res.status(400).json({ error: "invalid", detail: err.detail?.detail || err.message });
      console.error("[platform] settings:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  };
  app.post("/admin/platform/accounts/:id/settings", requireOwner, saveSettings);
  app.post("/admin/platform/accounts/:id/limits", requireOwner, saveSettings);

  // Invoices (lib/accountInvoices.js): what an invoice made now would hold,
  // make one, mark it sent/paid/void, and its basis as CSV.
  app.get("/admin/platform/accounts/:id/unbilled", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json(await unbilledFor(req.params.id));
    } catch (err) {
      console.error("[platform] unbilled:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
  app.post("/admin/platform/accounts/:id/invoices", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json({ ok: true, invoice: await createInvoice(req.params.id, { note: req.body?.note }) });
    } catch (err) {
      if (err?.code === "invalid") return res.status(400).json({ error: "invalid", detail: err.detail?.detail, message: err.message });
      console.error("[platform] invoice:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
  app.post("/admin/platform/invoices/:id/status", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json({ ok: true, invoice: await setInvoiceStatus(req.params.id, req.body?.status) });
    } catch (err) {
      if (err?.code === "invalid" || err?.code === "not_found") return res.status(400).json({ error: err.code, message: err.message });
      console.error("[platform] invoice status:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
  app.get("/admin/platform/invoices/:id/csv", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      const { data: row } = await supabase.from("account_invoices").select("*").eq("id", req.params.id).maybeSingle();
      if (!row) return res.status(404).json({ error: "not_found" });
      const [{ data: user }, settings] = await Promise.all([supabase.auth.admin.getUserById(row.host_id), supabase.from("account_settings").select("*").eq("host_id", row.host_id).maybeSingle()]);
      const inv = (await invoicesFor(row.host_id)).find((i) => i.id === row.id);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${row.number}.csv"`);
      return res.send(invoiceCsv(inv, shapeSettings(settings?.data), user?.user?.email || ""));
    } catch (err) {
      console.error("[platform] invoice csv:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Stop or let back in an account's login (Supabase's own ban: no new
  // sessions, and the current one ends when its token next refreshes).
  // Its published pages stay up; unpublish them one by one if needed.
  app.post("/admin/platform/accounts/:id/ban", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json({ ok: true, banned: await setBanned(req.params.id, req.body?.banned === true) });
    } catch (err) {
      if (err?.code === "not_found") return res.status(404).json({ error: "not_found" });
      if (err?.code === "owner") return res.status(400).json({ error: "owner" });
      console.error("[platform] ban:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Publish or unpublish one organiser's event from the panel.
  app.post("/admin/platform/events/:id/status", requireOwner, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: "invalid" });
      return res.json({ ok: true, status: await setEventStatus(req.params.id, req.body?.status) });
    } catch (err) {
      if (err?.code === "invalid") return res.status(400).json({ error: "invalid" });
      if (err?.code === "not_found") return res.status(404).json({ error: "not_found" });
      console.error("[platform] event status:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Give an account mail credits (a customer set up by hand), or take some
  // back (a negative count, never below zero). Logged in the credit ledger
  // as an "adjust" with the owner's note.
  app.post("/admin/platform/credits", requireOwner, async (req, res) => {
    try {
      return res.json({ ok: true, balance: await giveCredits(String(req.body?.hostId || ""), req.body?.count, req.body?.note) });
    } catch (err) {
      if (err?.code === "invalid" || err?.code === "below_zero") return res.status(400).json({ error: err.code });
      console.error("[platform] credits:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
