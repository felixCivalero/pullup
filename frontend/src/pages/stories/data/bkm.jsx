/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { Rhythm, Steps, Waffle } from "../../../components/agency/story/StoryKit.jsx";

/* BKM Health, told as a dive (Li Karlsén is an elite freediver).
   Facts: 0 → 10,000+ ORGANIC followers in one year; founders Li and Tolga;
   30-minute sprints; pace up to two edited pieces a week + a production day
   about monthly; sales and subscriptions growing exponentially (words only).
   Never claim "no paid ads". Photos: Wikimedia Commons placeholders. */

const IMG = (f) => `/stories/bkm/${f}.webp`;

const tenK = (v, done) => (done || v >= 9999 ? "10,000+" : (Math.round(v / 50) * 50).toLocaleString("en-US"));

export default {
  slug: "bkm",
  theme: { surface: "#0B4A6F", mid: "#072C47", deep: "#04182A", abyss: "#020B14", a: "#B7832A", ai: "#E8B86A", b: "#2AA3C9", glow: "183,131,42" },
  hero: {
    img: IMG("blue-hole-line"),
    alt: "Two freedivers beside a buoy line, just under the surface",
    pos: "center 30%",
    sub: "Two founders, a vision, no audience — and the discipline of a freediver. How BKM grew to 10,000+ organic followers in one year.",
    cue: "Scroll to descend",
  },
  chapters: [["surface", "Surface"], ["breath", "One breath"], ["line", "The line"], ["deep", "The deep"], ["up", "Into the light"]],
  blocks: [
    {
      type: "scene", img: IMG("duck-dive"), alt: "A freediver duck-diving down from the surface", pos: "center 35%", section: "ch_surface", order: 10,
      chapter: ["01", "The surface", "A vision, and no audience."],
      cards: [
        { k: "The start", b: "Li and Tolga founded BKM Health with a clear idea of what they wanted to build — and nobody listening yet." },
        { k: "The obvious move", b: "Hire a big, expensive marketing agency and hand the voice to someone else. We did the opposite." },
        { k: "The decision", h: "The founders would be the brand.", b: "Not a campaign face. Their own thinking, their own standards, in their own voice." },
      ],
    },
    {
      type: "scene", anchor: "breath", img: IMG("descent"), alt: "A freediver descending along the line in clear blue water", pos: "center 40%", section: "ch_breath", order: 20,
      chapter: ["02", "One breath", "In the deep, nothing is wasted."],
      cards: [
        { k: "The freediver", b: "Li Karlsén is an elite freediver. One breath, a fixed budget of energy, a line down and back. Anything that isn't the dive is a cost." },
        { k: "The translation", h: "Bring that stillness to content.", b: "Long brainstorms and endless drafts spend the breath before the work begins. So we cut them." },
      ],
    },
    {
      type: "band", tone: "mid", section: "figure_sprint", order: 22,
      k: "Per sprint", h: "Thirty minutes. One breath.",
      body: "A single conversation pointed at what the founders know best — then run through a strict dramaturgical framework on the spot. No brainstorming. Nothing that isn't the dive.",
      node: (
        <Waffle
          cells={16}
          label="One 30-minute block out of sixteen in an 8-hour working day"
          states={[{ label: "A working day", lit: [0], value: "30 min" }]}
          legend={[["a", "The sprint"], ["off", "The rest of an 8-hour day, back on the business"]]}
        />
      ),
    },
    { type: "drift", imgs: [IMG("alone-deep"), IMG("monofin"), IMG("sun-deep")] },
    {
      type: "scene", anchor: "line", img: IMG("big-blue"), alt: "A freediver heading head-first into deep blue", pos: "center 25%", section: "ch_line", order: 30,
      chapter: ["03", "The line", "Founder-led only works when it's systematic."],
      cards: [
        { k: "The insight", b: "Raw founder genius is the most valuable material a young company has — and the most wasted. Captured in a fixed rhythm, it compounds." },
        { h: "Not a bigger team. A line to follow.", b: "A strict 30-minute rhythm, the same every time, so the founders always know where the next breath goes." },
      ],
    },
    {
      type: "band", tone: "deep", layout: "split-wide", section: "system", order: 31,
      k: "The system", h: "Two tracks. Thirty minutes each. One line.",
      node: (
        <Steps
          tracks
          items={[
            ["Track A", "Operational sprints", "Thirty minutes on the stack, the pipelines and the system architecture. Nothing else enters the room."],
            ["Track B", "Content sprints", "Thirty minutes of the founders talking — captured, then shaped through a strict dramaturgical framework."],
            ["The bridge", "One line", "Where A and B meet: the operational truth becomes content blueprints anyone on the team can execute without guessing."],
          ]}
        />
      ),
    },
    {
      type: "band", tone: "deep", layout: "stack", section: "figure_rhythm", order: 32,
      k: "The pace", h: "A year, one breath at a time.",
      body: "Content is scoped together, never a quota. At BKM the pace settled at up to two edited pieces a week, with a production day about once a month.",
      node: (
        <Rhythm
          weekly="Up to two edited pieces"
          monthly="Production day"
          aria="Fifty-two weeks: up to two edited pieces each week, and a production day about once a month"
          source="The working pace, drawn as a year. A rhythm, not a log of what shipped each week."
        />
      ),
    },
    {
      type: "quote", anchor: "deep", img: IMG("sun-deeper"), n: "04", label: "The deep", section: "quote", order: 40,
      text: "The 30-minute BKM flow completely stripped the noise from my messaging. It brought the exact discipline of deep freediving straight into our content production.",
      who: "Li Karlsén", role: "Co-founder, BKM",
    },
    { type: "still", img: IMG("moon-jelly"), line: "It doesn't need to be loud to be powerful.", em: "It needs to be precise.", section: "statement", order: 41 },
    {
      type: "count", anchor: "up", img: IMG("ascent"), alt: "Freedivers rising along the line towards the surface", pos: "center 40%", section: "result", order: 50,
      n: "05", label: "Into the light", from: 0, to: 10000, fmt: tenK,
      unit: "organic followers", top: "One year later", bottom: "Start · 0",
      note: "Zero at the start. 10,000+ one year later. Founder-led, organic.",
    },
    {
      type: "finale", img: IMG("into-the-light"), alt: "A freediver swimming up into a burst of sunlight", section: "result_business", order: 51,
      k: "They lived it",
      h: "They didn't hit 10,000. They lived the brand every week for a year — and 10,000 people came along.",
      body: "Sales and subscriptions grew exponentially alongside. The journey was the marketing.",
      facts: [["10,000+", "organic followers in one year"], ["2 founders", "the faces of their own brand"], ["30 min", "per sprint"]],
    },
  ],
  credits: [
    ["Free divers at the Blue Hole", "Tim Sheerman-Chase", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Free_divers_at_the_Blue_Hole.jpg"],
    ["Duck Dive", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Duck_Dive_(439544482).jpg"],
    ["Freediving in Ireland", "Simukas771", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Freediving_in_Ireland.jpg"],
    ["Freediving in the Ocean — Liv & Big Blue", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_in_the_Ocean_Liv_%26_Big_Blue_(1045709386).jpg"],
    ["A woman freedives", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:A_woman_freedives_wearing_a_bikini.jpg"],
    ["Karimunjawa Freedive", "Sabda Priyanto", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Karimunjawa_Freedive.jpg"],
    ["Soleil à travers un paysage sous-marin de Bretagne", "Olivier Dugornay / Ifremer", "CC BY 4.0", "https://commons.wikimedia.org/w/index.php?search=Soleil+%C3%A0+travers+un+paysage+sous-marin+de+Bretagne+Ifremer"],
    ["Moon jellyfish in Rågårdsdal", "W.carter", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Moon_jellyfish_in_R%C3%A5g%C3%A5rdsdal_1.jpg"],
    ["Freediver with Two Safety Divers Rapidly Ascending", "Tim Sheerman-Chase", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediver_with_Two_Safety_Divers_Rapidly_Ascending.jpg"],
    ["Freediving the Ocean — Into the Light", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_the_Ocean_-_Into_the_Light_(440785178).jpg"],
  ],
};
