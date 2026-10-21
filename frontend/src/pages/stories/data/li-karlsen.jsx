import { Narrow, Outcome, ReelDesk, Waffle } from "../../../components/agency/story/StoryKit.jsx";
import { REEL_BEATS } from "../../../components/agency/agencyData.js";

/* Week-Li — BKM Health's format on women's health, built on Li Karlsén's
   knowledge. The work was FOR BKM, not for Li as a person: the story is about
   the format, never about her (no photos of her, no freediving, no personal
   angle — Li asked, 2026-10-19; her own brand, book and documentary stay
   hers). BKM's own growth is told in its own story (/work/bkm).
   Facts: one reel went from 8 hours to 30 minutes; 30-minute sprints; reels
   of 1–1.5 minutes; five beats (Hook, Introduction, Build-up, Climax, CTA).
   The narrowing widths and the edit loop are illustrative and say so.
   No quote until Li sends her own words. */

const ALL = Array.from({ length: 16 }, (_, i) => i);

export default {
  slug: "li-karlsen",
  theme: { surface: "#0A4B4F", mid: "#06333A", deep: "#03222A", abyss: "#011318", a: "#14A391", ai: "#5FD4C3", b: "#B57A3C", glow: "20,163,145" },
  hero: {
    sub: "Week-Li was BKM Health's format on women's health, built on Li Karlsén's knowledge. We took it from whole topics down to reels of a minute and a half — and each reel from a working day to half an hour.",
    facts: [["8 h → 30 min", "per reel"], ["1–1.5 min", "per reel"], ["5 beats", "in every reel"]],
  },
  chapters: [["top", "Week-Li"], ["narrow", "Topic → seconds"], ["beats", "Five beats"], ["sprint", "30 minutes"], ["result", "For BKM"]],
  blocks: [
    {
      type: "band", anchor: "narrow", tone: "mid", layout: "split-wide", tight: true, section: "figure_narrow", order: 10,
      k: "The format", h: "One topic. Far too big for a reel.",
      body: "Li's knowledge of women's health is deep and broad — the strength of the format, and the problem. Everything had to be boiled down: from a topic, to one question, to a reel, to the seconds inside it.",
      node: (
        <Narrow
          levels={[
            { k: "Topic", v: "Women's health", w: 100, b: "Where Week-Li started: a field Li knows both broadly and deeply. Far too much for one reel — so nothing was filmed at this level." },
            { k: "Question", v: "One question", w: 52, b: "Each sprint picked one thing a viewer actually wonders about. Everything else waited for another reel." },
            { k: "Reel", v: "1–1.5 min", w: 24, b: "One answer: short, informative and personal. Long enough to be worth keeping, short enough to be watched to the end." },
            { k: "Seconds", v: "5 beats", w: 9, b: "Hook, introduction, build-up, climax, CTA. Every second has a job — and a second without one is cut." },
          ]}
          note="The bars show the narrowing, not a measurement."
        />
      ),
    },
    {
      type: "band", anchor: "beats", tone: "deep", layout: "stack", tight: true, section: "figure_edit", order: 20,
      k: "The reel", h: "Five beats. Every reel.",
      body: "Every Week-Li reel followed the same shape, then was cut frame by frame. A frame that didn't move the point forward came out. The loop below shows the idea, not a real edit.",
      node: <ReelDesk beats={REEL_BEATS} />,
    },
    {
      type: "band", anchor: "sprint", tone: "mid", tight: true, section: "figure_time", order: 30,
      k: "The sprint", h: "Thirty minutes. One question.",
      body: "No brainstorms, no drafts. One focused 30-minute conversation per reel, pointed at a single question and shaped into the five beats while it happened. A reel used to take a whole working day; now it takes one half-hour.",
      node: (
        <Waffle
          cells={16}
          label="Time to make one reel"
          states={[
            { label: "Before", lit: ALL, value: "8 h", aria: "Before: sixteen half-hour blocks, eight hours per reel" },
            { label: "Now", lit: [0], value: "30 min", aria: "Now: one half-hour block, thirty minutes per reel" },
          ]}
          legend={[["a", "Half an hour of work on one reel"]]}
        />
      ),
    },
    {
      type: "band", anchor: "result", tone: "abyss", layout: "stack", tight: true, section: "result", order: 40,
      k: "Made for BKM",
      h: "A format BKM could keep running — without a working day behind every reel.",
      body: "Week-Li was BKM's: Li's knowledge, in BKM's channel, for BKM's audience. How the whole brand grew is its own story.",
      node: (
        <Outcome link={["BKM's whole story", "bkm"]} />
      ),
    },
  ],
  creditNote: "No photographs on this page. The story card elsewhere on the site uses a Wikimedia Commons photo, credited below.",
  credits: [
    ["Soleil à travers un paysage sous-marin de Bretagne (913)", "Olivier Dugornay / Ifremer", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_(Ifremer_00378-48922_-_913).jpg"],
  ],
};
