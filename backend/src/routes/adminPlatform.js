// The owner's view of the event tool (/admin/platform): how many organisers
// have an account, how many events are out, every account with its brands,
// events, sign-ups and mail credits — and credits can be given (a customer
// set up by hand, like Nigab). Owner only.
import { isOwnerEmail, requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { selectAllPaged } from "../lib/selectAllPaged.js";
import { creditBalance } from "../lib/emailCredits.js";

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

export async function platformStats(now = Date.now()) {
  const [brands, events] = await Promise.all([
    selectAllPaged(() => supabase.from("brands").select("id, host_id, name, parent_id, created_at").order("created_at", { ascending: true })),
    selectAllPaged(() => supabase.from("events").select("id, host_id, brand_id, title, status, starts_at, ends_at, created_at, created_via").or("kind.is.null,kind.eq.event").order("created_at", { ascending: true })),
  ]);
  // Organisers: accounts with a brand (signed up to the event tool), not the
  // owner, not test addresses.
  const users = await usersById([...new Set(brands.map((b) => b.host_id))]);
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
      credits: await creditBalance(u.id).catch(() => null),
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

export function registerAdminPlatformRoutes(app) {
  app.get("/admin/platform", requireOwner, async (_req, res) => {
    try {
      return res.json(await platformStats());
    } catch (err) {
      console.error("[platform] stats:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // Give an account mail credits (a customer set up by hand). Logged in the
  // credit ledger as an "adjust" with the owner's note.
  app.post("/admin/platform/credits", requireOwner, async (req, res) => {
    try {
      const hostId = String(req.body?.hostId || "");
      const count = Math.round(Number(req.body?.count));
      if (!/^[0-9a-f-]{36}$/i.test(hostId) || !Number.isFinite(count) || count < 1 || count > 1000000) return res.status(400).json({ error: "invalid" });
      const { error } = await supabase.from("email_credit_ledger").insert({ host_id: hostId, delta: count, reason: "adjust", note: String(req.body?.note || "").slice(0, 200) || null });
      if (error) throw error;
      return res.json({ ok: true, balance: await creditBalance(hostId) });
    } catch (err) {
      console.error("[platform] credits:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
