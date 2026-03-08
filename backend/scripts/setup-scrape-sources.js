/**
 * Creates the scrape_sources table and seeds it with existing venues.
 * Run once: node backend/scripts/setup-scrape-sources.js
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
CREATE TABLE IF NOT EXISTS scrape_sources (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  source_key    text NOT NULL UNIQUE,
  scrape_url    text NOT NULL,
  location      text NOT NULL DEFAULT 'Stockholm',
  category      text NOT NULL DEFAULT 'culture',
  strategy      text NOT NULL DEFAULT 'auto',
  link_selector text,
  image_attr    text,
  enabled       boolean NOT NULL DEFAULT true,
  last_scraped_at timestamptz,
  last_event_count integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sources_enabled ON scrape_sources(enabled) WHERE enabled = true;
`;

// Seed data — all current hardcoded venues
const SEEDS = [
  { name: "Resident Advisor", source_key: "resident_advisor", scrape_url: "https://ra.co/events/se/stockholm", location: "Stockholm", category: "club", strategy: "custom" },
  { name: "Sveriges Radio", source_key: "sveriges_radio", scrape_url: "https://api.sr.se/api/v2/events?pagination=false&format=json&locationid=105&size=50", location: "Stockholm", category: "culture", strategy: "custom" },
  { name: "Nationalmuseum", source_key: "nationalmuseum", scrape_url: "https://www.nationalmuseum.se/utstallningar/", location: "Nationalmuseum, Stockholm", category: "exhibition", strategy: "css" },
  { name: "Kulturhuset Stadsteatern", source_key: "kulturhuset", scrape_url: "https://kulturhusetstadsteatern.se/program/", location: "Kulturhuset Stadsteatern, Stockholm", category: "culture", strategy: "css" },
  { name: "Luger.se", source_key: "luger", scrape_url: "https://luger.se/konserter/", location: "Stockholm", category: "music", strategy: "custom" },
  { name: "Nalen", source_key: "nalen", scrape_url: "https://nalen.com/sv/konserter", location: "Nalen, Stockholm", category: "music", strategy: "custom" },
  { name: "Fotografiska", source_key: "fotografiska", scrape_url: "https://stockholm.fotografiska.com/sv/utstallningar/", location: "Fotografiska, Stockholm", category: "exhibition", strategy: "custom" },
  { name: "Södra Teatern", source_key: "sodra_teatern", scrape_url: "https://sodrateatern.com/pa-scen/", location: "Södra Teatern, Stockholm", category: "culture", strategy: "custom", image_attr: "data-lazy-src" },
  { name: "Berns", source_key: "berns", scrape_url: "https://berns.se/calendar/", location: "Berns, Stockholm", category: "music", strategy: "css", link_selector: "a[href*='/calendar/']" },
  { name: "Fasching", source_key: "fasching", scrape_url: "https://www.fasching.se/en/calendar/", location: "Fasching, Stockholm", category: "music", strategy: "css" },
  { name: "Riche (Östermalm)", source_key: "riche", scrape_url: "https://riche.se/kalendarium/", location: "Riche, Östermalm, Stockholm", category: "music", strategy: "css" },
  { name: "Luma Stockholm", source_key: "luma", scrape_url: "https://luma.com/stockholm", location: "Stockholm", category: "culture", strategy: "custom" },
  { name: "B-K (Banankompaniet)", source_key: "bk_banankompaniet", scrape_url: "https://www.b-k.se/whats-on", location: "B-K (Banankompaniet), Stockholm", category: "music", strategy: "css", link_selector: "a[href*='/whats-on/']" },
  { name: "Debaser", source_key: "debaser", scrape_url: "https://debaser.se/kalender/", location: "Debaser, Södermalm, Stockholm", category: "music", strategy: "css", link_selector: "a[href*='/kalender/']" },
  { name: "Stampen", source_key: "stampen", scrape_url: "https://www.stampen.se/program/", location: "Stampen, Gamla Stan, Stockholm", category: "music", strategy: "auto" },
  { name: "Glenn Miller Café", source_key: "glenn_miller", scrape_url: "https://glennmillercafe.se/en/konserter/", location: "Glenn Miller Café, Södermalm, Stockholm", category: "music", strategy: "auto" },
  { name: "Under Bron / Trädgården", source_key: "under_bron", scrape_url: "https://event.husetunderbron.se/", location: "Under Bron / Trädgården, Södermalm, Stockholm", category: "club", strategy: "auto" },
  { name: "Hosoi", source_key: "hosoi", scrape_url: "https://hosoistockholm.com/dance-listen", location: "Hosoi, Slakthusområdet, Stockholm", category: "music", strategy: "auto" },
  { name: "Artilleriet", source_key: "artilleriet", scrape_url: "https://restaurangartilleriet.se/eventkalender/", location: "Artilleriet, Östermalm, Stockholm", category: "music", strategy: "auto" },
  { name: "Winterviken", source_key: "winterviken", scrape_url: "https://winterviken.se/en/scen/", location: "Winterviken, Stockholm", category: "music", strategy: "auto" },
  { name: "Färgfabriken", source_key: "fargfabriken", scrape_url: "https://fargfabriken.se/en/exhibitions", location: "Färgfabriken, Liljeholmen, Stockholm", category: "exhibition", strategy: "css" },
  { name: "Fallan", source_key: "fallan", scrape_url: "https://fallan.nu/whats-on", location: "Fallan, Slakthusområdet, Stockholm", category: "music", strategy: "css", link_selector: "a[href*='/whats-on/']" },
  { name: "Lydmar Hotel", source_key: "lydmar", scrape_url: "https://lydmar.com/events/", location: "Lydmar Hotel, Östermalm, Stockholm", category: "music", strategy: "css" },
];

async function run() {
  console.log("🔧 Creating scrape_sources table...\n");

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
    console.warn("⚠️  Could not auto-create via API. Please run this SQL in Supabase SQL Editor:");
    console.log(`  https://supabase.com/dashboard/project/${SUPABASE_URL.split(".")[0].split("//")[1]}/sql\n`);
    console.log(SQL);
    console.log("\nThen re-run this script to seed the data.");
  }

  // Try to seed data
  console.log("\n📋 Seeding venues...");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("scrape_sources")
    .upsert(SEEDS, { onConflict: "source_key", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("❌ Seed error:", error.message);
    console.log("\nMake sure the table exists first, then re-run this script.");
  } else {
    console.log(`✅ Seeded ${data?.length || 0} venues`);
  }
}

run().catch(console.error);
