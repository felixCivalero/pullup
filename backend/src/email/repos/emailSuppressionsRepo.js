// backend/src/email/repos/emailSuppressionsRepo.js

import { supabase } from "../../supabase.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Addresses are stored lower-cased (see upsertSuppression). The read used to
// match on the raw string, so a row queued as "Foo@x.com" walked straight past
// a suppression stored as "foo@x.com" and sent anyway.
export async function isSuppressed(email) {
  if (!email) return { suppressed: false, row: null };

  const { data, error } = await supabase
    .from("email_suppressions")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[emailSuppressionsRepo] isSuppressed error", error);
  }

  return {
    suppressed: !!data,
    row: data || null,
  };
}

/**
 * Batch variant of isSuppressed: given a list of email addresses, returns a
 * Set containing those that are currently suppressed. Used by the CRM filter
 * index to mark unsendable contacts without one-query-per-person.
 */
export async function getSuppressedEmailSet(emails) {
  if (!Array.isArray(emails) || emails.length === 0) return new Set();
  // Normalise to lowercase and dedupe — suppression rows are stored lower-case.
  const lowered = Array.from(
    new Set(emails.filter(Boolean).map((e) => String(e).toLowerCase()))
  );
  if (lowered.length === 0) return new Set();

  // Chunked .in() — Supabase has a soft limit (~1000) on filter array size.
  const CHUNK = 500;
  const set = new Set();
  for (let i = 0; i < lowered.length; i += CHUNK) {
    const batch = lowered.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("email_suppressions")
      .select("email")
      .in("email", batch);
    if (error) {
      console.error("[emailSuppressionsRepo] getSuppressedEmailSet error", error);
      continue;
    }
    for (const row of data || []) {
      if (row.email) set.add(String(row.email).toLowerCase());
    }
  }
  return set;
}

export async function upsertSuppression({
  email,
  reason,
  source,
  details = {},
}) {
  if (!email) {
    throw new Error("[emailSuppressionsRepo] email is required");
  }

  const payload = {
    email: normalizeEmail(email),
    reason,
    source,
    details,
  };

  const { data, error } = await supabase
    .from("email_suppressions")
    .upsert(payload, { onConflict: "email" })
    .select()
    .single();

  if (error) {
    console.error("[emailSuppressionsRepo] upsertSuppression error", error);
    throw new Error(`Failed to upsert email_suppressions: ${error.message}`);
  }

  return data;
}

