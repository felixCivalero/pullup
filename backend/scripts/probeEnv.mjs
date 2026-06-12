// Shared credential resolution for the HTTP probes, so the same script runs
// on a dev machine AND inside the deploy gate on the EC2 box: prefer real
// environment variables, fall back to the backend/frontend .env files located
// RELATIVE to this script (works in any checkout, no absolute paths).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // <repo>/backend/scripts
const backendEnv = path.join(here, "..", ".env");
const frontendEnv = path.join(here, "..", "..", "frontend", ".env");

function grab(file, key) {
  try {
    return (fs.readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]
      ?.trim()
      .replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

export const SUPABASE_URL = process.env.SUPABASE_URL || grab(backendEnv, "SUPABASE_URL");
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || grab(backendEnv, "SUPABASE_SERVICE_KEY");
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || grab(frontendEnv, "VITE_SUPABASE_ANON_KEY");
// Where the server-under-test listens. The deploy gate boots the NEW code on a
// side port and points this at it; locally it defaults to the dev convention.
export const API_BASE = process.env.API_BASE || "http://localhost:3210";

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, ANON_KEY })) {
  if (!v) {
    console.error(`probeEnv: missing ${k} (set it in the environment or the .env files)`);
    process.exit(1);
  }
}
