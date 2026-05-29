// backend/src/whatsapp/templates/submitter.js
//
// Programmatic submission of templates to Meta's Graph API. The
// registry is the source of truth for what we WANT live; this module
// reconciles it against what Meta actually has, submitting the diff.
//
// Two entry points:
//   submitTemplate(key)       — push one template from the registry
//   submitAllTier1()          — push the Tier-1 set if they're not
//                                already PENDING/APPROVED on Meta
//   fetchProviderStatus()     — pull current statuses for the catalog
//
// Note: Meta's submission is async. Returns immediately with a
// provider template id + status (usually PENDING). The actual approval
// happens on Meta's clock (utility ~30 min – 2h, marketing ~24h).

import {
  META_GRAPH_VERSION,
  META_WABA_ID,
  META_ACCESS_TOKEN,
  WHATSAPP_SANDBOX_MODE,
} from "../config.js";
import { TEMPLATES, TIER_1_TEMPLATES, getTemplate } from "./registry.js";
import { logger } from "../../logger.js";

function graphUrl(path) {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Submit a single template from the registry to Meta for approval.
 * Returns { ok, status, provider_template_id, error? }.
 */
export async function submitTemplate(templateKey) {
  if (WHATSAPP_SANDBOX_MODE) {
    return {
      ok: true,
      sandbox: true,
      status: "PENDING",
      provider_template_id: `sbx-tmpl-${templateKey}`,
    };
  }
  if (!META_WABA_ID || !META_ACCESS_TOKEN) {
    return { ok: false, error: "META_WABA_ID/META_ACCESS_TOKEN missing" };
  }

  const tmpl = getTemplate(templateKey);
  const payload = {
    name: tmpl.name,
    language: tmpl.locale || "en",
    category: tmpl.meta_category || "UTILITY",
    components: tmpl.components || [
      { type: "BODY", text: tmpl.body },
    ],
  };

  try {
    const res = await fetch(graphUrl(`/${META_WABA_ID}/message_templates`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger?.warn?.(`[templates/submitter] submit ${templateKey} failed`, json);
      return {
        ok: false,
        error: json?.error?.message || `HTTP ${res.status}`,
        code: json?.error?.code,
      };
    }
    return {
      ok: true,
      status: json.status || "PENDING",
      provider_template_id: json.id,
      category: json.category,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Pull the current Meta-side status of every template we know about.
 * Returns a map keyed by template name.
 */
export async function fetchProviderStatus() {
  if (WHATSAPP_SANDBOX_MODE) return {};
  if (!META_WABA_ID || !META_ACCESS_TOKEN) {
    throw new Error("META_WABA_ID/META_ACCESS_TOKEN missing");
  }
  const res = await fetch(
    graphUrl(`/${META_WABA_ID}/message_templates?fields=name,status,category,id&limit=200`),
    { headers: authHeaders() },
  );
  const json = await res.json().catch(() => ({}));
  const out = {};
  for (const t of json?.data ?? []) {
    out[t.name] = { status: t.status, category: t.category, id: t.id };
  }
  return out;
}

/**
 * Reconcile the registry's Tier-1 set against Meta. Submits any that
 * aren't already PENDING / APPROVED.
 *
 * Returns { submitted: [], skipped: [], failed: [] }.
 */
export async function submitAllTier1() {
  const current = WHATSAPP_SANDBOX_MODE ? {} : await fetchProviderStatus();
  const submitted = [];
  const skipped = [];
  const failed = [];

  for (const key of TIER_1_TEMPLATES) {
    const tmpl = TEMPLATES[key];
    if (!tmpl) {
      failed.push({ key, error: "not in registry" });
      continue;
    }
    const existing = current[tmpl.name];
    if (existing && ["PENDING", "APPROVED", "IN_APPEAL"].includes(existing.status)) {
      skipped.push({ key, status: existing.status, id: existing.id });
      continue;
    }
    const result = await submitTemplate(key);
    if (result.ok) {
      submitted.push({ key, status: result.status, id: result.provider_template_id });
    } else {
      failed.push({ key, error: result.error, code: result.code });
    }
  }

  return { submitted, skipped, failed };
}
