/**
 * Creates the stockholm_events table in Supabase.
 * Run once: node backend/scripts/setup-stockholm-events.js
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SQL = `
CREATE TABLE IF NOT EXISTS stockholm_events (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title                text NOT NULL,
  description          text,
  image_url            text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  location             text,
  url                  text UNIQUE,
  source               text,
  category             text,
  status               text NOT NULL DEFAULT 'pending',
  include_in_newsletter boolean NOT NULL DEFAULT false,
  newsletter_sent_at   timestamptz,
  scraped_at           timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stockholm_events_status ON stockholm_events(status);
CREATE INDEX IF NOT EXISTS idx_stockholm_events_starts_at ON stockholm_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_stockholm_events_newsletter ON stockholm_events(include_in_newsletter) WHERE include_in_newsletter = true;
`;

async function run() {
  console.log("🔧 Creating stockholm_events table...\n");

  // Try via Supabase Management API (requires personal access token)
  // Fall back to printing the SQL for manual execution.
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_URL.split(".")[0].split("//")[1]}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    }
  );

  if (res.ok) {
    console.log("✅ Table created successfully!");
  } else {
    const body = await res.text();
    console.warn("⚠️  Could not auto-create via API:", body);
    console.log("\nPlease run the following SQL in your Supabase SQL Editor:");
    console.log("  https://supabase.com/dashboard/project/pydmumupoppgnopcegxq/sql\n");
    console.log(SQL);
  }
}

run().catch(console.error);
