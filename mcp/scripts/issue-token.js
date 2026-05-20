#!/usr/bin/env node
// Bootstrap: mint a PullUp Personal Access Token without going through the
// browser. For "give Adam his first token" cases — once the in-app token
// settings page exists, hosts can mint their own.
//
// Usage:
//   node mcp/scripts/issue-token.js <user-email> [token-name]
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the backend's
// .env (one directory up). Requires service-role privileges because we
// look up the user by email and write to personal_access_tokens directly.

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ENV = path.resolve(__dirname, "..", "..", "backend", ".env");

async function loadEnv() {
  // Avoid pulling dotenv as an MCP dependency just for this one script.
  // Tiny inline parser: lines like `KEY=value` and `KEY="value"`.
  let raw;
  try {
    raw = await readFile(BACKEND_ENV, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read ${BACKEND_ENV}: ${err.message}\n` +
      `This script needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the backend .env.`
    );
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

async function main() {
  const [, , email, ...rest] = process.argv;
  if (!email) {
    console.error("Usage: node scripts/issue-token.js <user-email> [token-name]");
    process.exit(2);
  }
  const name = rest.join(" ").trim() || "MCP";

  const env = await loadEnv();
  const supaUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
    );
  }

  // Resolve user id by email via Supabase admin REST. Avoids depending on
  // @supabase/supabase-js here.
  const listRes = await fetch(`${supaUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!listRes.ok) {
    throw new Error(`Failed to look up user: ${listRes.status} ${await listRes.text()}`);
  }
  const listJson = await listRes.json();
  const users = listJson?.users || [];
  const user = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error(`No user found with email "${email}". Have they signed up on PullUp?`);
  }

  // Mint plaintext + hash. Must match the format used by data.js so
  // findUserIdByPatToken can resolve it.
  const random = crypto.randomBytes(36).toString("base64url");
  const plaintext = `pup_${random}`;
  const tokenHash = crypto.createHash("sha256").update(plaintext).digest("hex");

  const insertRes = await fetch(`${supaUrl}/rest/v1/personal_access_tokens`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      { user_id: user.id, token_hash: tokenHash, name },
    ]),
  });
  if (!insertRes.ok) {
    throw new Error(`Failed to insert token: ${insertRes.status} ${await insertRes.text()}`);
  }

  console.log("");
  console.log("─────────────────────────────────────");
  console.log(`  Token minted for ${user.email}`);
  console.log(`  Name:  ${name}`);
  console.log(`  Token: ${plaintext}`);
  console.log("─────────────────────────────────────");
  console.log("");
  console.log("Add to the host's Claude MCP config as PULLUP_API_TOKEN.");
  console.log("Plaintext is shown ONCE — record it now; it cannot be recovered.");
  console.log("");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
