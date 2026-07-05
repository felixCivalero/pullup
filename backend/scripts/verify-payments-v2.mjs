// Contract probe: the rail-agnostic checkout end-to-end on the MOCK rail —
// paid event → RSVP comes back PENDING_PAYMENT with a paymentV2 descriptor →
// charge on 'mock' → settle via the mock confirm (the rail's "webhook") →
// RSVP CONFIRMED, payment succeeded, ledger metered exactly once.
//
// Needs the local server running with:
//   PAYMENTS_V2_ENABLED=true BILLING_METERING_ENABLED=true npm run dev
// (mock rail is automatic outside production). If the flags are off the probe
// reports SKIP (exit 2) rather than failing — it's a v2 probe, not a v1 one.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API, grantHosting, revokeHosting } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const tag = Date.now();
const hostEmail = `e2e_payv2_host_${tag}@example.com`;
const guestEmail = `e2e_payv2_guest_${tag}@example.com`;
let hostUserId = null, eventId = null, slug = null, guestPersonId = null, paymentId = null, providerRef = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

// flag gate: skip cleanly when v2 is off
const cfg = await fetch(`${API}/payments/v2/config`).then((r) => r.json()).catch(() => null);
if (!cfg?.enabled) {
  console.log("⏭  PAYMENTS_V2_ENABLED is off on this server — probe skipped");
  process.exit(2);
}
ok(cfg.rails?.mock, "mock rail available");

try {
  // throwaway host with a real session
  const { data: created } = await admin.auth.admin.createUser({ email: hostEmail, email_confirm: true });
  hostUserId = created.user.id;
  await grantHosting(admin, hostUserId); // paywall: throwaway host must be allowed to publish
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: hostEmail });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;

  // published PAID throwaway event — 150.00 SEK
  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Payments v2 probe",
      startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: "PUBLISHED",
      createdVia: "create",
      ticketType: "paid",
      ticketPrice: 15000,
      ticketCurrency: "sek",
      maxPlusOnesPerGuest: 3, // so the +1 below survives and the party math is exercised
    }),
  }).then((r) => r.json());
  eventId = ev.id; slug = ev.slug;
  ok(!!eventId && ev.ticketType === "paid", `published paid probe event (${slug})`);

  // suppress the guest address so no real email ever sends
  await admin.from("email_suppressions").insert({ email: guestEmail.toLowerCase(), reason: "probe", source: "probe", details: "verify-payments-v2 throwaway" });

  // 1. RSVP → must come back payment-required, NOT confirmed
  const rsvpRes = await fetch(`${API}/events/${slug}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Probe Payer", email: guestEmail, plusOnes: 1 }),
  });
  const rsvpBody = await rsvpRes.json().catch(() => ({}));
  ok(rsvpRes.status === 201, `POST rsvp ok (${rsvpRes.status}${rsvpBody?.error ? `: ${rsvpBody.error}` : ""})`);
  const pv2 = rsvpBody.paymentV2;
  ok(!!pv2?.required, "response carries paymentV2.required");
  ok((pv2?.rails || []).includes("mock"), `rails offered: ${(pv2?.rails || []).join(",")}`);
  // party of 2 × 150 kr = 30000; fee 3% = 900; total 30900
  ok(pv2?.breakdown?.ticketAmount === 30000, `gross priced (${pv2?.breakdown?.ticketAmount})`);
  ok(pv2?.breakdown?.platformFeeAmount === 900, `fee = 3% (${pv2?.breakdown?.platformFeeAmount})`);
  ok(pv2?.amount === 30900 && pv2?.currency === "sek", "guest total + currency right");

  const { data: rsvpRow } = await admin.from("rsvps").select("id, person_id, booking_status, payment_status").eq("event_id", eventId).maybeSingle();
  guestPersonId = rsvpRow?.person_id || null;
  ok(rsvpRow?.booking_status === "PENDING_PAYMENT", `rsvp is PENDING_PAYMENT (${rsvpRow?.booking_status})`);

  // 2. charge on the mock rail
  const chargeRes = await fetch(`${API}/public/rsvps/${pv2.rsvpId}/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rail: "mock" }),
  });
  const charge = await chargeRes.json().catch(() => ({}));
  paymentId = charge.paymentId || null;
  ok(chargeRes.ok && !!paymentId, `charge created (${chargeRes.status}${charge?.error ? `: ${charge.error}` : ""})`);
  ok(charge.instructions?.type === "mock" && !!charge.instructions?.confirmPath, "mock instructions returned");

  const { data: payRow } = await admin.from("payments").select("provider, provider_ref, status, amount, metadata").eq("id", paymentId).maybeSingle();
  providerRef = payRow?.provider_ref || null;
  ok(payRow?.provider === "mock" && payRow?.status === "pending", `payment row pending on mock rail`);
  ok(payRow?.metadata?.feeCents === 900, `fee stamped in metadata (${payRow?.metadata?.feeCents})`);

  // 3. settle (the mock rail's webhook)
  const confirmRes = await fetch(`${API}${charge.instructions.confirmPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const confirm = await confirmRes.json().catch(() => ({}));
  ok(confirmRes.ok && confirm.ok, `mock confirm settled (${JSON.stringify(confirm)})`);

  // 4. the public status endpoint the frontend polls
  const status = await fetch(`${API}/payments/${paymentId}/status`).then((r) => r.json());
  ok(status?.status === "succeeded", `status poll → succeeded (${status?.status})`);

  // 5. booking confirmed
  const { data: rsvpAfter } = await admin.from("rsvps").select("booking_status, payment_status, status").eq("id", pv2.rsvpId).maybeSingle();
  ok(rsvpAfter?.booking_status === "CONFIRMED" && rsvpAfter?.payment_status === "paid", `rsvp CONFIRMED + paid (${rsvpAfter?.booking_status}/${rsvpAfter?.payment_status})`);

  // 6. the ledger: rsvp motion + ticket_sale motion, fee landed, exactly once
  const { data: ledger } = await admin.from("transaction_ledger").select("motion, amount_cents, fee_cents, currency").eq("event_id", eventId);
  ok((ledger || []).some((l) => l.motion === "rsvp"), "ledger has the rsvp motion");
  const sale = (ledger || []).find((l) => l.motion === "ticket_sale");
  ok(!!sale && sale.fee_cents === 900 && sale.amount_cents === 30000, `ticket_sale metered gross=30000 fee=900 (${sale?.amount_cents}/${sale?.fee_cents})`);

  // 7. replayed settlement is a true no-op
  const replay = await fetch(`${API}${charge.instructions.confirmPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json());
  ok(replay?.deduped === true || replay?.ok === true, "replayed confirm dedupes");
  const { count: saleCount } = await admin.from("transaction_ledger").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("motion", "ticket_sale");
  ok(saleCount === 1, `still exactly one ticket_sale row (${saleCount})`);

  // 8. the host billing summary read path — the two-revenue-line model:
  //    ticket fees counted, subscription state present, NO storage line.
  const sum = await fetch(`${API}/host/billing/summary`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  ok(sum?.month?.ticketSales >= 1, `billing summary counts the ticket sale (${sum?.month?.ticketSales})`);
  ok(!("storageService" in (sum || {})), "storage markup line is gone from the summary");
  ok(sum?.plan?.ticketFeeBps === 300, `plan ticket fee is 3% (${sum?.plan?.ticketFeeBps} bps)`);
  ok(typeof sum?.plan?.subscriptionStatus === "string", `plan carries subscription status (${sum?.plan?.subscriptionStatus})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  // cleanup — children first
  const guestAuthId = guestPersonId
    ? (await admin.from("people").select("auth_user_id").eq("id", guestPersonId).maybeSingle()).data?.auth_user_id
    : null;
  if (eventId) {
    await admin.from("transaction_ledger").delete().eq("event_id", eventId);
    if (providerRef) await admin.from("payment_events").delete().eq("provider_ref", providerRef);
    await admin.from("payments").delete().eq("event_id", eventId);
  }
  await admin.from("email_outbox").delete().eq("to_email", guestEmail.toLowerCase());
  await admin.from("magic_link_tokens").delete().contains("payload", { email: guestEmail.toLowerCase() });
  await admin.from("email_suppressions").delete().eq("email", guestEmail.toLowerCase());
  if (guestPersonId) {
    await admin.from("person_events").delete().eq("person_id", guestPersonId);
    await admin.from("person_identities").delete().eq("person_id", guestPersonId);
    await admin.from("person_source_profiles").delete().eq("person_id", guestPersonId);
  }
  if (eventId) {
    await admin.from("rsvps").delete().eq("event_id", eventId);
    await admin.from("event_channels").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  if (guestPersonId) await admin.from("people").delete().eq("id", guestPersonId);
  if (guestAuthId) await admin.auth.admin.deleteUser(guestAuthId).catch(() => {});
  await admin.from("people").delete().eq("email", hostEmail.toLowerCase());
  await revokeHosting(admin, hostUserId);
  if (hostUserId) await admin.auth.admin.deleteUser(hostUserId).catch(() => {});
  console.log("🧹 cleaned host, guest, paid event, payment, ledger");
}
process.exit(failures ? 1 : 0);
