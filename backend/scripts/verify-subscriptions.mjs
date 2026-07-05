// Contract probe: the Creator-tier paywall end-to-end over real HTTP.
//
// A brand-new host (post-cutoff, no plan row) must: get a typed 402 on ANY
// page creation — draft or published — draft and publish once 'active', keep
// hosting on 'past_due' (grace), and degrade to read-only on 'canceled' —
// with the guest side showing rsvpsPaused and refusing new RSVPs. An 'early'
// host must pass everything, free. Subscription states are written directly
// to creator_billing_plans
// (what the Stripe webhooks write); GET /host/subscription is called between
// flips because it invalidates the entitlement cache — exactly what the
// webhook does in-process.
//
// Needs the local server running with STRIPE_CREATOR_PRICE_ID set (any value —
// no Stripe call is made here) so enforcement is on:
//   STRIPE_CREATOR_PRICE_ID=price_probe npm run dev
// If enforcement is off the probe reports SKIP (exit 2).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const tag = Date.now();
const hostEmail = `e2e_subs_host_${tag}@example.com`;
let hostUserId = null, draftId = null, publishedId = null, slug = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

async function makeSession(email) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { userId: created.user.id, token: sess.session.access_token };
}

const authed = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

// Flip the subscription state the way the webhook does, then hit the status
// endpoint (which invalidates the entitlement cache, like the webhook does).
async function setSubState(token, hostId, patch) {
  await admin.from("creator_billing_plans").upsert({ host_id: hostId, ...patch }, { onConflict: "host_id" });
  return fetch(`${API}/host/subscription`, { headers: authed(token) }).then((r) => r.json());
}

try {
  const { userId, token } = await makeSession(hostEmail);
  hostUserId = userId;

  // 0. enforcement gate
  const status0 = await fetch(`${API}/host/subscription`, { headers: authed(token) }).then((r) => r.json());
  if (!status0?.enforced) {
    console.log("⏭  subscriptions not enforced on this server (set STRIPE_CREATOR_PRICE_ID) — probe skipped");
    process.exit(2);
  }
  ok(status0.tier?.priceSek === 125, `tier is 125 SEK (${status0.tier?.priceSek})`);
  ok(status0.entitlement?.canHost === false, "brand-new host cannot host yet");
  ok(status0.entitlement?.reason === "subscription_required", "refusal is typed");

  const eventBody = (status, title) => ({
    title,
    startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    status,
    createdVia: "create",
  });

  // 1. drafts sit behind the wall too — creating ANY page needs the tier
  const draftTry = await fetch(`${API}/events`, { method: "POST", headers: authed(token), body: JSON.stringify(eventBody("DRAFT", "Subs probe draft")) });
  const draftTryBody = await draftTry.json().catch(() => ({}));
  ok(draftTry.status === 402 && draftTryBody.error === "subscription_required", `unsubscribed draft create → 402 subscription_required (${draftTry.status})`);

  // 2. create-as-published → same typed 402
  const createPub = await fetch(`${API}/events`, { method: "POST", headers: authed(token), body: JSON.stringify(eventBody("PUBLISHED", "Subs probe direct")) });
  const createPubBody = await createPub.json().catch(() => ({}));
  ok(createPub.status === 402 && createPubBody.error === "subscription_required", `create-as-published → 402 subscription_required (${createPub.status})`);

  // 3. subscription active (what the webhook writes) → draft + publish work
  const sActive = await setSubState(token, hostUserId, { plan: "creator", subscription_status: "active" });
  ok(sActive.entitlement?.canHost === true && sActive.entitlement?.reason === "subscribed", "active subscription → can host");
  const draft = await fetch(`${API}/events`, { method: "POST", headers: authed(token), body: JSON.stringify(eventBody("DRAFT", "Subs probe draft")) }).then((r) => r.json());
  draftId = draft.id;
  ok(!!draftId && draft.status === "DRAFT", "subscribed host can save a draft");
  const pub = await fetch(`${API}/host/events/${draftId}/publish`, { method: "PUT", headers: authed(token) });
  ok(pub.ok, `publish succeeds while active (${pub.status})`);
  publishedId = draftId;
  const evRow = await admin.from("events").select("slug,status").eq("id", draftId).maybeSingle();
  slug = evRow.data?.slug;
  ok(evRow.data?.status === "PUBLISHED", "event is PUBLISHED in the DB");

  // 4. past_due = grace: still hosting
  const sGrace = await setSubState(token, hostUserId, { subscription_status: "past_due" });
  ok(sGrace.entitlement?.canHost === true && sGrace.entitlement?.reason === "grace", "past_due → grace, still hosting");

  // 5. canceled = read-only degradation
  const sCanceled = await setSubState(token, hostUserId, { subscription_status: "canceled" });
  ok(sCanceled.entitlement?.canHost === false, "canceled → cannot host");

  const pubAgain = await fetch(`${API}/host/events/${draftId}/publish`, { method: "PUT", headers: authed(token) });
  ok(pubAgain.status === 402, `re-publish while canceled → 402 (${pubAgain.status})`);

  const guestView = await fetch(`${API}/events/${slug}`).then((r) => r.json());
  ok(guestView?.id === draftId, "guest page still renders (never a 404)");
  ok(guestView?.rsvpsPaused === true, "guest page carries rsvpsPaused");

  const rsvp = await fetch(`${API}/events/${slug}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Probe Guest", email: `e2e_subs_guest_${tag}@example.com` }),
  });
  const rsvpBody = await rsvp.json().catch(() => ({}));
  ok(rsvp.status === 403 && rsvpBody.error === "rsvps_paused", `guest RSVP refused while lapsed (${rsvp.status} ${rsvpBody.error})`);

  // 6. resubscribe → everything flips back on, nothing lost
  const sBack = await setSubState(token, hostUserId, { subscription_status: "active" });
  ok(sBack.entitlement?.canHost === true, "resubscribe → hosting again");
  const guestView2 = await fetch(`${API}/events/${slug}`).then((r) => r.json());
  ok(guestView2?.rsvpsPaused === false, "guest page live again after resubscribe");

  // 7. agency tier: same rails, its own price — the status endpoint reports
  // the host's OWN tier (450) once the plan says agency
  const sAgency = await setSubState(token, hostUserId, { plan: "agency", subscription_status: "active" });
  ok(sAgency.entitlement?.canHost === true, "agency + active → hosts");
  ok(sAgency.tier?.name === "agency" && sAgency.tier?.priceSek === 450, `agency host sees the 450 SEK tier (${sAgency.tier?.priceSek})`);
  ok(sAgency.tiers?.creator?.priceSek === 125 && sAgency.tiers?.agency?.priceSek === 450, "both tiers advertised");
  const sAgencyLapsed = await setSubState(token, hostUserId, { subscription_status: "canceled" });
  ok(sAgencyLapsed.entitlement?.canHost === false, "agency lapse paywalls like creator");

  // 8. early tier trumps everything — and the founding flag survives a paid
  // upgrade + cancel (the "founder pays anyway" path)
  const sEarly = await setSubState(token, hostUserId, { plan: "early", founding: true, subscription_status: "canceled" });
  ok(sEarly.entitlement?.canHost === true && sEarly.entitlement?.reason === "early", "early host hosts free, whatever Stripe says");
  const sFounderPaying = await setSubState(token, hostUserId, { plan: "creator", subscription_status: "active" });
  ok(sFounderPaying.entitlement?.reason === "subscribed", "founder who upgrades is a subscriber while paying");
  const sFounderLapsed = await setSubState(token, hostUserId, { subscription_status: "canceled" });
  ok(sFounderLapsed.entitlement?.canHost === true && sFounderLapsed.entitlement?.reason === "early", "founder cancels → hosting free again (founding flag)");

  // 9. deletion request: durable row, ok:true (no Stripe sub here → cancel skips)
  const del = await fetch(`${API}/me/deletion-request`, { method: "POST", headers: authed(token), body: "{}" });
  const delBody = await del.json().catch(() => ({}));
  ok(del.ok && delBody.ok === true, "deletion request accepted");
  const delRow = await admin.from("account_deletion_requests").select("status").eq("user_id", hostUserId).maybeSingle();
  ok(delRow.data?.status === "pending", "deletion request recorded durably");
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  // cleanup — children first
  if (publishedId || draftId) {
    const id = publishedId || draftId;
    await admin.from("rsvps").delete().eq("event_id", id);
    await admin.from("events").delete().eq("id", id);
  }
  if (hostUserId) {
    await admin.from("account_deletion_requests").delete().eq("user_id", hostUserId);
    await admin.from("creator_billing_plans").delete().eq("host_id", hostUserId);
    await admin.from("profiles").delete().eq("id", hostUserId);
    await admin.auth.admin.deleteUser(hostUserId).catch(() => {});
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll subscription-paywall checks passed");
