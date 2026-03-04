// backend/src/email/repos/emailSuppressionsRepo.js

import { supabase } from "../../supabase.js";

export async function isSuppressed(email) {
  if (!email) return { suppressed: false, row: null };

  const { data, error } = await supabase
    .from("email_suppressions")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[emailSuppressionsRepo] isSuppressed error", error);
  }

  return {
    suppressed: !!data,
    row: data || null,
  };
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
    email,
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

