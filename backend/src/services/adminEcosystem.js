// backend/src/services/adminEcosystem.js
//
// THE ECOSYSTEM CRM (admin-only) — the god view of PullUp's entire human graph.
//
// The old /admin/crm was host-centric: one row per profile, a sales pipeline for
// the creators PullUp sells to. But the system grew underneath it — a creator
// WAITLIST at the top of the funnel, the GUESTS who RSVP, the ones who PULL UP,
// and COMMUNITY members who join a host's world directly. None of that was
// visible. This service reframes the CRM around the person atom (see
// [[project_the_room_is_pullup]]): every row is a human, and roles are facets
// layered on where they appear.
//
// Person-anchored, silos attached: we anchor on `people` (the 2k-row atom),
// attach host / waitlist / lead / community facets where email or auth links,
// and surface pre-account waitlisters / leads (no people row yet) as their own
// lightweight segment rather than force-merging them. The identity spine
// (person_identities) already de-dupes within people; this never re-litigates it.
//
// Sibling of adminMatching.js (identity merge cockpit) and adminCrmSales.js
// (the legacy host sales pipeline, kept for its lead CRUD which we reuse).

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

const lc = (v) => (v ? String(v).toLowerCase().trim() : null);

// A live guest edge — an RSVP that wasn't cancelled. Used identically by the
// funnel and the list so their "guest" counts agree.
const isLiveRsvp = (r) => r.status !== "cancelled" && r.booking_status !== "CANCELLED";

// Supabase caps a single request at 1000 rows regardless of .limit(); the god
// view must see ALL ~2k people, so page through with .range() until drained.
// `build` is a () => query factory (so each page starts from a fresh builder).
async function fetchAllPaged(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) {
      logger?.warn?.("[adminEcosystem] paged read failed", { error: error.message });
      break;
    }
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// ── FUNNEL ───────────────────────────────────────────────────────────
// The two intertwined funnels, in counts — the "true picture" header.
//   Creators (PullUp's customers): waitlist → registered host → activated → leads
//   Audience (each host's people):  people → guests → pulled up → community
export async function getEcosystemFunnel() {
  const [
    waitlistRes,
    profilesRes,
    eventHostsRes,
    leadsRes,
    peopleRes,
    rsvps,
    community,
  ] = await Promise.all([
    supabase.from("creator_waitlist").select("status"),
    supabase.from("profiles").select("id"),
    supabase.from("events").select("host_id"),
    supabase.from("sales_leads").select("id, profile_id, status"),
    supabase.from("people").select("id", { count: "exact", head: true }),
    fetchAllPaged(() => supabase.from("rsvps").select("person_id, pulled_up, booking_status, status")),
    fetchAllPaged(() => supabase.from("community_members").select("person_id")),
  ]);

  const waitlist = waitlistRes.data || [];
  const profiles = profilesRes.data || [];
  const events = eventHostsRes.data || [];
  const leads = leadsRes.data || [];

  const activatedHosts = new Set(events.map((e) => e.host_id).filter(Boolean));

  const guestPeople = new Set();
  const pulledUpPeople = new Set();
  for (const r of rsvps) {
    if (!r.person_id) continue;
    if (isLiveRsvp(r)) guestPeople.add(r.person_id);
    if (r.pulled_up) pulledUpPeople.add(r.person_id);
  }
  const communityPeople = new Set(community.map((c) => c.person_id).filter(Boolean));

  const waitlistOpen = waitlist.filter((w) => w.status !== "joined").length;

  return {
    creators: {
      waitlist: waitlistOpen,
      hosts: profiles.length,
      activated: activatedHosts.size,
      leads: leads.length,
      leadsOpen: leads.filter((l) => !["won", "joined", "lost", "churned"].includes(l.status)).length,
    },
    audience: {
      people: peopleRes.count || 0,
      guests: guestPeople.size,
      pulledUp: pulledUpPeople.size,
      community: communityPeople.size,
    },
  };
}

// ── PEOPLE GOD-LIST ──────────────────────────────────────────────────
// One row per human, anchored on `people`, each enriched with derived role
// facets + the one signal that matters for their segment. Silo-only humans
// (waitlist / leads with no people row) are appended as lightweight rows.
//
// Everything is small (people ~2k, rsvps <1k, profiles/leads/waitlist tiny) so
// we load it all and assemble in memory — same shape as listMatches.
export async function listEcosystemPeople({ q = "", segment = "all", limit = 50, offset = 0 } = {}) {
  // 1. People (optionally text-filtered) — paged so we see ALL ~2k, not the
  //    first 1000 Supabase returns by default.
  const s = q && q.trim() ? q.trim().replace(/[%,]/g, " ") : null;
  const people = await fetchAllPaged(() => {
    let pq = supabase
      .from("people")
      .select("id, name, email, phone_e164, instagram, ig_user_id, company, auth_user_id, acquisition_channel, created_at")
      .order("created_at", { ascending: true });
    if (s) pq = pq.or(`name.ilike.%${s}%,email.ilike.%${s}%,instagram.ilike.%${s}%,phone_e164.ilike.%${s}%`);
    return pq;
  });

  // 2. The silo tables. Profiles/leads/waitlist are tiny; rsvps/events/community
  //    are paged in case they outgrow 1000.
  const [profilesRes, leadsRes, waitlistRes, events, rsvps, community] = await Promise.all([
    supabase.from("profiles").select("id, name, brand, contact_email, created_at, last_login_at, login_count"),
    supabase.from("sales_leads").select("id, profile_id, name, email, company, phone, city, status, source, notes, priority, created_at"),
    supabase.from("creator_waitlist").select("id, email, name, role, handle, note, source, status, created_at"),
    fetchAllPaged(() => supabase.from("events").select("id, host_id, title, starts_at")),
    fetchAllPaged(() => supabase.from("rsvps").select("person_id, event_id, pulled_up, booking_status, status, total_guests, party_size, created_at")),
    fetchAllPaged(() => supabase.from("community_members").select("person_id, community_id, joined_at")),
  ]);

  const profiles = profilesRes.data || [];
  const leads = leadsRes.data || [];
  const waitlist = waitlistRes.data || [];

  // Indexes.
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const eventsByHost = new Map();
  for (const e of events) {
    if (!e.host_id) continue;
    if (!eventsByHost.has(e.host_id)) eventsByHost.set(e.host_id, []);
    eventsByHost.get(e.host_id).push(e);
  }
  const rsvpsByPerson = new Map();
  for (const r of rsvps) {
    if (!r.person_id) continue;
    if (!rsvpsByPerson.has(r.person_id)) rsvpsByPerson.set(r.person_id, []);
    rsvpsByPerson.get(r.person_id).push(r);
  }
  const communityByPerson = new Map();
  for (const c of community) {
    if (!c.person_id) continue;
    if (!communityByPerson.has(c.person_id)) communityByPerson.set(c.person_id, []);
    communityByPerson.get(c.person_id).push(c);
  }
  const leadByProfile = new Map();
  const leadByEmail = new Map();
  for (const l of leads) {
    if (l.profile_id) leadByProfile.set(l.profile_id, l);
    if (l.email) leadByEmail.set(lc(l.email), l);
  }
  const waitlistByEmail = new Map();
  for (const w of waitlist) {
    if (w.email) waitlistByEmail.set(lc(w.email), w);
  }

  // 3. Assemble one row per person.
  const matchedLeadIds = new Set();
  const matchedWaitlistEmails = new Set();
  const matchedProfileIds = new Set();

  const items = (people || []).map((p) => {
    const email = lc(p.email);
    const profile = p.auth_user_id ? profileById.get(p.auth_user_id) : null;
    const isHost = !!profile;

    // Host facet — events + sales pipeline.
    let host = null;
    if (isHost) {
      matchedProfileIds.add(profile.id);
      const evList = eventsByHost.get(profile.id) || [];
      const dates = evList.map((e) => new Date(e.starts_at).getTime()).filter(Number.isFinite);
      const lead = leadByProfile.get(profile.id) || (email ? leadByEmail.get(email) : null);
      if (lead) matchedLeadIds.add(lead.id);
      host = {
        profileId: profile.id,
        brand: profile.brand || null,
        eventsTotal: evList.length,
        lastEventAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        lastLoginAt: profile.last_login_at || null,
        sales: lead
          ? { leadId: lead.id, status: lead.status, priority: lead.priority || "normal", source: lead.source || null }
          : null,
      };
    } else if (email && leadByEmail.has(email)) {
      // Lead facet on a non-host person (a prospect we already know as a person).
      const lead = leadByEmail.get(email);
      matchedLeadIds.add(lead.id);
      host = { profileId: null, brand: null, eventsTotal: 0, lastEventAt: null, lastLoginAt: null,
        sales: { leadId: lead.id, status: lead.status, priority: lead.priority || "normal", source: lead.source || null } };
    }

    // Guest / pulled-up facet.
    const myRsvps = (rsvpsByPerson.get(p.id) || []).filter(isLiveRsvp);
    let guest = null;
    if (myRsvps.length) {
      const confirmed = myRsvps.filter(
        (r) => r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending",
      );
      const pulled = myRsvps.filter((r) => r.pulled_up);
      const rdates = myRsvps.map((r) => new Date(r.created_at).getTime()).filter(Number.isFinite);
      guest = {
        rsvpCount: myRsvps.length,
        eventsConfirmed: confirmed.length,
        pulledUpCount: pulled.length,
        lastRsvpAt: rdates.length ? new Date(Math.max(...rdates)).toISOString() : null,
      };
    }

    // Community facet.
    const myComm = communityByPerson.get(p.id) || [];
    const community = myComm.length
      ? { count: myComm.length, joinedAt: myComm.map((c) => c.joined_at).sort().slice(-1)[0] || null }
      : null;

    // Waitlist facet (a person who is also on the creator waitlist).
    let waitlistFacet = null;
    if (email && waitlistByEmail.has(email)) {
      const w = waitlistByEmail.get(email);
      matchedWaitlistEmails.add(email);
      waitlistFacet = { id: w.id, status: w.status, role: w.role, handle: w.handle, createdAt: w.created_at };
    }

    const roles = [];
    if (waitlistFacet) roles.push("waitlist");
    if (isHost) roles.push("host");
    if (isHost && (host?.eventsTotal || 0) > 0) roles.push("activated");
    if (host?.sales) roles.push("lead");
    if (guest) roles.push("guest");
    if (guest && guest.pulledUpCount > 0) roles.push("pulledup");
    if (community) roles.push("community");

    // The activity timestamp that drives the default sort.
    const lastActivity = [host?.lastEventAt, host?.lastLoginAt, guest?.lastRsvpAt, community?.joinedAt, p.created_at]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .reduce((a, b) => Math.max(a, b), 0);

    return {
      personId: p.id,
      name: p.name || (p.email ? p.email.split("@")[0] : null) || (p.instagram ? `@${p.instagram}` : "Unknown"),
      email: p.email || null,
      instagram: p.instagram || null,
      phone: p.phone_e164 || null,
      company: p.company || null,
      acquisition: p.acquisition_channel || null,
      createdAt: p.created_at,
      roles,
      isHost,
      host,
      guest,
      community,
      waitlist: waitlistFacet,
      _lastActivity: lastActivity,
    };
  });

  // 4. Silo-only humans (no people row): host profiles never resolved into a
  //    person, unredeemed waitlist applicants, and unlinked leads. They show as
  //    lightweight rows rather than being force-merged (person-anchored, silos
  //    attached).
  for (const pr of profiles) {
    if (matchedProfileIds.has(pr.id)) continue;
    const evList = eventsByHost.get(pr.id) || [];
    const dates = evList.map((e) => new Date(e.starts_at).getTime()).filter(Number.isFinite);
    const lead = leadByProfile.get(pr.id) || (pr.contact_email ? leadByEmail.get(lc(pr.contact_email)) : null);
    if (lead) matchedLeadIds.add(lead.id);
    const roles = ["host"];
    if (evList.length) roles.push("activated");
    if (lead) roles.push("lead");
    items.push({
      personId: `profile:${pr.id}`,
      siloOnly: "host",
      name: pr.name || pr.brand || (pr.contact_email ? pr.contact_email.split("@")[0] : "Host"),
      email: pr.contact_email || null,
      instagram: null,
      phone: null,
      company: pr.brand || null,
      acquisition: null,
      createdAt: pr.created_at,
      roles,
      isHost: true,
      host: {
        profileId: pr.id,
        brand: pr.brand || null,
        eventsTotal: evList.length,
        lastEventAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        lastLoginAt: pr.last_login_at || null,
        sales: lead
          ? { leadId: lead.id, status: lead.status, priority: lead.priority || "normal", source: lead.source || null }
          : null,
      },
      guest: null,
      community: null,
      waitlist: null,
      _lastActivity: new Date(pr.last_login_at || pr.created_at || 0).getTime(),
    });
  }
  for (const w of waitlist) {
    const email = lc(w.email);
    if (email && matchedWaitlistEmails.has(email)) continue;
    items.push({
      personId: `waitlist:${w.id}`,
      siloOnly: "waitlist",
      name: w.name || (w.email ? w.email.split("@")[0] : "Applicant"),
      email: w.email || null,
      instagram: w.handle || null,
      phone: null,
      company: null,
      acquisition: w.source || null,
      createdAt: w.created_at,
      roles: ["waitlist"],
      isHost: false,
      host: null,
      guest: null,
      community: null,
      waitlist: { id: w.id, status: w.status, role: w.role, handle: w.handle, createdAt: w.created_at },
      _lastActivity: new Date(w.created_at || 0).getTime(),
    });
  }
  for (const l of leads) {
    if (matchedLeadIds.has(l.id)) continue;
    if (l.profile_id) continue; // attached to a host above (or its profile has no person — still a lead row, surface it)
    items.push({
      personId: `lead:${l.id}`,
      siloOnly: "lead",
      name: l.name || (l.email ? l.email.split("@")[0] : "Lead"),
      email: l.email || null,
      instagram: null,
      phone: l.phone || null,
      company: l.company || null,
      acquisition: l.source || null,
      createdAt: l.created_at,
      roles: ["lead"],
      isHost: false,
      host: { profileId: null, brand: l.company || null, eventsTotal: 0, lastEventAt: null, lastLoginAt: null,
        sales: { leadId: l.id, status: l.status, priority: l.priority || "normal", source: l.source || null } },
      guest: null,
      community: null,
      waitlist: null,
      _lastActivity: new Date(l.created_at || 0).getTime(),
    });
  }

  // 5. Segment counts across the (search-filtered) set — drives the chips.
  const counts = { all: items.length };
  const SEGMENTS = ["waitlist", "host", "activated", "lead", "guest", "pulledup", "community"];
  for (const seg of SEGMENTS) counts[seg] = 0;
  for (const it of items) {
    for (const seg of SEGMENTS) if (it.roles.includes(seg)) counts[seg]++;
  }

  // 6. Filter by segment.
  let filtered = items;
  if (segment && segment !== "all") {
    filtered = items.filter((it) => it.roles.includes(segment));
  }

  // 7. Sort (most-recent activity first) and paginate.
  filtered.sort((a, b) => b._lastActivity - a._lastActivity);
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(({ _lastActivity, ...rest }) => rest);
  return { total, counts, items: page };
}

// ── PERSON DETAIL — the drawer ───────────────────────────────────────
// Everything we know about one human, across every facet: their timeline
// (person_events), the events they host, the events they RSVP'd to, their
// community memberships, sales pipeline + waitlist state. Accepts a real person
// uuid or a silo-only synthetic id (waitlist:/lead:/profile:).
export async function getEcosystemPersonDetail(rawId) {
  if (!rawId) return null;

  // Silo-only synthetic rows resolve straight from their source table.
  const silo = /^(waitlist|lead|profile):(.+)$/.exec(rawId);
  if (silo) return getSiloDetail(silo[1], silo[2]);

  const personId = rawId;
  const { data: person } = await supabase.from("people").select("*").eq("id", personId).maybeSingle();
  if (!person) return null;
  const email = lc(person.email);

  const [timelineRes, rsvpsRes, communityRes, waitlistRes] = await Promise.all([
    supabase.from("person_events")
      .select("type, channel, direction, body, occurred_at, host_id")
      .eq("person_id", personId).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("rsvps")
      .select("event_id, booking_status, status, pulled_up, total_guests, created_at")
      .eq("person_id", personId),
    supabase.from("community_members")
      .select("community_id, joined_at, source")
      .eq("person_id", personId),
    email
      ? supabase.from("creator_waitlist").select("id, status, role, handle, note, source, created_at").eq("email", email).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Host facet — their profile + the events they run.
  let host = null;
  let hostEvents = [];
  let sales = null;
  if (person.auth_user_id) {
    const { data: profile } = await supabase
      .from("profiles").select("id, name, brand, contact_email, created_at, last_login_at, login_count")
      .eq("id", person.auth_user_id).maybeSingle();
    if (profile) {
      host = { profileId: profile.id, brand: profile.brand || null, lastLoginAt: profile.last_login_at || null, loginCount: profile.login_count || 0 };
      const { data: evs } = await supabase
        .from("events").select("id, title, slug, starts_at, status").eq("host_id", profile.id).order("starts_at", { ascending: false });
      hostEvents = await withConfirmedCounts(evs || []);
      sales = await fetchSales({ profileId: profile.id, email });
    }
  }
  if (!sales && email) sales = await fetchSales({ profileId: null, email });

  // Guest facet — events they RSVP'd to, with titles.
  const rsvps = (rsvpsRes.data || []).filter(isLiveRsvp);
  const evIds = [...new Set(rsvps.map((r) => r.event_id).filter(Boolean))];
  const evTitleById = new Map();
  if (evIds.length) {
    const { data: evs } = await supabase.from("events").select("id, title, slug, starts_at").in("id", evIds);
    for (const e of evs || []) evTitleById.set(e.id, e);
  }
  const attended = rsvps.map((r) => {
    const e = evTitleById.get(r.event_id) || {};
    return {
      eventId: r.event_id, title: e.title || "Untitled", slug: e.slug || null, startsAt: e.starts_at || null,
      status: r.status || r.booking_status, pulledUp: !!r.pulled_up, createdAt: r.created_at,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Community memberships, with titles.
  const memberships = communityRes.data || [];
  let communities = [];
  if (memberships.length) {
    const cids = [...new Set(memberships.map((m) => m.community_id))];
    const { data: comms } = await supabase.from("communities").select("id, title, slug").in("id", cids);
    const byId = new Map((comms || []).map((c) => [c.id, c]));
    communities = memberships.map((m) => ({
      id: m.community_id, title: byId.get(m.community_id)?.title || "Community",
      joinedAt: m.joined_at, source: m.source || null,
    }));
  }

  const waitlist = waitlistRes.data || null;

  const roles = [];
  if (waitlist) roles.push("waitlist");
  if (host) roles.push("host");
  if (host && hostEvents.length) roles.push("activated");
  if (sales) roles.push("lead");
  if (attended.length) roles.push("guest");
  if (attended.some((a) => a.pulledUp)) roles.push("pulledup");
  if (communities.length) roles.push("community");

  return {
    kind: "person",
    matchPersonId: personId, // link target for the identity merge cockpit
    person: {
      id: person.id, name: person.name || (person.email ? person.email.split("@")[0] : "Unknown"),
      email: person.email || null, instagram: person.instagram || null, phone: person.phone_e164 || null,
      company: person.company || null, acquisition: person.acquisition_channel || null,
      createdAt: person.created_at,
    },
    roles,
    host,
    hostEvents,
    sales,
    attended,
    communities,
    waitlist,
    timeline: (timelineRes.data || []).map((e) => ({
      type: e.type, channel: e.channel, direction: e.direction, body: e.body, occurredAt: e.occurred_at,
    })),
  };
}

async function getSiloDetail(kind, id) {
  if (kind === "waitlist") {
    const { data: w } = await supabase.from("creator_waitlist").select("*").eq("id", id).maybeSingle();
    if (!w) return null;
    return {
      kind: "waitlist", matchPersonId: null,
      person: { id: `waitlist:${w.id}`, name: w.name || (w.email ? w.email.split("@")[0] : "Applicant"), email: w.email, instagram: w.handle, phone: null, company: null, acquisition: w.source, createdAt: w.created_at },
      roles: ["waitlist"], host: null, hostEvents: [], sales: null, attended: [], communities: [],
      waitlist: { id: w.id, status: w.status, role: w.role, handle: w.handle, note: w.note, source: w.source, created_at: w.created_at },
      timeline: [],
    };
  }
  if (kind === "lead") {
    const { data: l } = await supabase.from("sales_leads").select("*").eq("id", id).maybeSingle();
    if (!l) return null;
    return {
      kind: "lead", matchPersonId: null,
      person: { id: `lead:${l.id}`, name: l.name || (l.email ? l.email.split("@")[0] : "Lead"), email: l.email, instagram: null, phone: l.phone, company: l.company, acquisition: l.source, createdAt: l.created_at },
      roles: ["lead"], host: null, hostEvents: [], attended: [], communities: [], waitlist: null,
      sales: { leadId: l.id, status: l.status, priority: l.priority || "normal", source: l.source, notes: l.notes },
      timeline: [],
    };
  }
  // profile:<id> — a host with no people row.
  const { data: pr } = await supabase.from("profiles").select("id, name, brand, contact_email, created_at, last_login_at, login_count").eq("id", id).maybeSingle();
  if (!pr) return null;
  const { data: evs } = await supabase.from("events").select("id, title, slug, starts_at, status").eq("host_id", pr.id).order("starts_at", { ascending: false });
  const hostEvents = await withConfirmedCounts(evs || []);
  const sales = await fetchSales({ profileId: pr.id, email: lc(pr.contact_email) });
  const roles = ["host"];
  if (hostEvents.length) roles.push("activated");
  if (sales) roles.push("lead");
  return {
    kind: "profile", matchPersonId: null,
    person: { id: `profile:${pr.id}`, name: pr.name || pr.brand || (pr.contact_email ? pr.contact_email.split("@")[0] : "Host"), email: pr.contact_email || null, instagram: null, phone: null, company: pr.brand || null, acquisition: null, createdAt: pr.created_at },
    roles,
    host: { profileId: pr.id, brand: pr.brand || null, lastLoginAt: pr.last_login_at || null, loginCount: pr.login_count || 0 },
    hostEvents, sales, attended: [], communities: [], waitlist: null, timeline: [],
  };
}

// Attach confirmed-guest counts to a host's events (one batched rsvp read).
async function withConfirmedCounts(events) {
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const rsvps = await fetchAllPaged(() =>
    supabase.from("rsvps").select("event_id, booking_status, status, total_guests, party_size").in("event_id", ids),
  );
  const byEvent = new Map();
  for (const r of rsvps) {
    if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
      byEvent.set(r.event_id, (byEvent.get(r.event_id) || 0) + (r.total_guests ?? r.party_size ?? 1));
    }
  }
  return events.map((e) => ({
    id: e.id, title: e.title || "Untitled", slug: e.slug || null, startsAt: e.starts_at,
    status: e.status || null, confirmedGuests: byEvent.get(e.id) || 0,
  }));
}

async function fetchSales({ profileId, email }) {
  let lead = null;
  if (profileId) {
    const { data } = await supabase.from("sales_leads").select("id, status, priority, source, notes").eq("profile_id", profileId).maybeSingle();
    lead = data || null;
  }
  if (!lead && email) {
    const { data } = await supabase.from("sales_leads").select("id, status, priority, source, notes").eq("email", email).maybeSingle();
    lead = data || null;
  }
  return lead ? { leadId: lead.id, status: lead.status, priority: lead.priority || "normal", source: lead.source, notes: lead.notes } : null;
}

// ── WAITLIST ACTION ──────────────────────────────────────────────────
// Move a waitlist applicant along (pending → invited → joined). Stamps the
// matching timestamp so the funnel reflects it.
export async function setWaitlistStatus(id, status) {
  const VALID = ["pending", "invited", "joined"];
  if (!VALID.includes(status)) throw new Error("invalid status");
  const patch = { status };
  if (status === "invited") patch.invited_at = new Date().toISOString();
  if (status === "joined") patch.joined_at = new Date().toISOString();
  const { data, error } = await supabase.from("creator_waitlist").update(patch).eq("id", id).select("id, status").maybeSingle();
  if (error) throw error;
  return data;
}
