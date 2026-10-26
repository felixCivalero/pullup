import { Columns, Outcome, Steps } from "../../../components/agency/story/StoryKit.jsx";
import { WOW_CLIPS } from "../../../components/agency/agencyData.js";

/* Way Out West 2025 — Felix handled filming and editing for the festival's
   TikTok, on site all three days. Facts: 30 TikToks in three days; views as
   TikTok showed them on 2026-10-26 (WOW_CLIPS), 617,966 in all — say
   "600,000+"; the most-watched at 100K; 15 of 30 passed 10,000. The mix is
   read off the clips' own on-screen captions. No photographs on the page;
   the overview card has a stock cover (COVERS), credited below. */

const sek = (v) => v.toLocaleString("sv-SE");

export default {
  slug: "way-out-west",
  theme: { surface: "#123A24", mid: "#0D2B1B", deep: "#081D12", abyss: "#040F09", a: "#2FA35E", ai: "#7EDBA2", b: "#E0A23A", glow: "47,163,94" },
  hero: {
    sub: "Way Out West is three days of music in Slottsskogen, Gothenburg. I handled filming and editing for the festival's TikTok — 30 TikToks in three days, and more than 600,000 views.",
    facts: [["30", "TikToks"], ["3 days", "on site"], ["600,000+", "views"]],
  },
  chapters: [["top", "Way Out West"], ["clips", "30 TikToks"], ["mix", "The mix"], ["result", "Result"]],
  blocks: [
    {
      type: "band", anchor: "clips", tone: "mid", layout: "stack", tight: true, section: "figure_clips", order: 10,
      k: "Every clip", h: "30 TikToks, every one counted.",
      body: "Each column is one TikTok from the festival, highest first. The most-watched reached 100,000 — and half of them passed 10,000.",
      node: (
        <Columns
          rows={WOW_CLIPS}
          bare
          fmt={sek}
          unit="views"
          aria="Thirty columns, one per TikTok, from 100,000 views down to about 2,500"
          source="Views per TikTok as shown on TikTok, October 2026 — 617,966 in all. Hover a column for the clip."
        />
      ),
    },
    {
      type: "band", anchor: "mix", tone: "deep", layout: "split-wide", tight: true, section: "figure_mix", order: 20,
      k: "The mix", h: "The whole festival, not just the line-up.",
      body: "Filmed and edited on site, all three days. The shows were only part of it — the people, the food and the places in between were what made people stay.",
      node: (
        <Steps
          items={[
            ["01", "The shows", "The artists up close and the crowd around them — from Kneecap to the smaller stages."],
            ["02", "The people", "Outfit checks, the welcoming choir and the food vendors themselves, in their own words."],
            ["03", "The guide", "Five food vendors not to miss, three hidden bars, the speakers at Dungen."],
            ["04", "Before the doors", "The stages waking up and the crew rigging — the festival before anyone gets in."],
          ]}
        />
      ),
    },
    {
      type: "band", anchor: "result", tone: "abyss", layout: "stack", tight: true, section: "result", order: 30,
      k: "The result",
      h: "Three days, 30 TikToks — and more than 600,000 views.",
      body: "The festival on TikTok while it was happening. The same idea as every story here: live it in public, and people follow.",
      node: <Outcome facts={[["600,000+", "views"], ["100K", "on the most-watched"], ["15 of 30", "passed 10,000 views"]]} link={["STIGA: 28 million views in seven months", "stiga"]} />,
    },
  ],
  creditNote: "The cover photo on the overview card is from Wikimedia Commons, used under the licence below.",
  credits: [
    ["Way out west-entrance", "Fluff", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Way_out_west-entrance.jpg"],
  ],
};
