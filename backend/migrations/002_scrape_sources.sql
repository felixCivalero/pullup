-- Migration: Create scrape_sources table
-- Purpose: Store venue/source configuration for the event scraper
-- Allows adding new venues from the admin UI without code changes

CREATE TABLE IF NOT EXISTS scrape_sources (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,                    -- Display name, e.g. "Södra Teatern"
  source_key    text NOT NULL UNIQUE,             -- Machine key for source field, e.g. "sodra_teatern"
  scrape_url    text NOT NULL,                    -- URL to scrape
  location      text NOT NULL DEFAULT 'Stockholm', -- Default location string for events
  category      text NOT NULL DEFAULT 'culture',  -- Default category: music, club, exhibition, culture, etc.
  strategy      text NOT NULL DEFAULT 'auto',     -- Scraping strategy: 'auto', 'json_ld', 'css', 'custom'
  link_selector text,                             -- CSS selector for event links, e.g. 'a[href*="/evenemang/"]'
  image_attr    text,                             -- Attribute for lazy-loaded images, e.g. 'data-lazy-src'
  enabled       boolean NOT NULL DEFAULT true,
  last_scraped_at timestamptz,
  last_event_count integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sources_enabled ON scrape_sources(enabled) WHERE enabled = true;
