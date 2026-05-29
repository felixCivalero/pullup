// backend/src/whatsapp/repos/whatsappSuppressionsRepo.js
//
// Suppression-list checks before queueing a WhatsApp send. Mirrors the
// email_suppressions pattern: one row per phone, populated by explicit
// opt-outs, Meta marking the number unreachable, or "STOP" replies.

import { supabase } from "../../supabase.js";

export async function isSuppressed(phoneE164) {
  if (!phoneE164) return { suppressed: false, row: null };
  const { data, error } = await supabase
    .from("whatsapp_suppressions")
    .select("*")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[whatsappSuppressionsRepo] isSuppressed error", error);
  }
  return { suppressed: !!data, row: data || null };
}

export async function suppress({ phoneE164, reason, source, details = {} }) {
  const { data, error } = await supabase
    .from("whatsapp_suppressions")
    .upsert(
      {
        phone_e164: phoneE164,
        reason,
        source,
        details,
      },
      { onConflict: "phone_e164" },
    )
    .select()
    .single();
  if (error) {
    console.error("[whatsappSuppressionsRepo] suppress error", error);
    throw new Error(`Failed to suppress phone: ${error.message}`);
  }
  return data;
}

export async function unsuppress(phoneE164) {
  const { error } = await supabase
    .from("whatsapp_suppressions")
    .delete()
    .eq("phone_e164", phoneE164);
  if (error) {
    console.error("[whatsappSuppressionsRepo] unsuppress error", error);
    throw new Error(`Failed to unsuppress phone: ${error.message}`);
  }
}
