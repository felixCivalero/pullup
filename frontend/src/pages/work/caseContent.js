// Case page content. Every claim traces to the agency blueprint or, for STIGA,
// to the Growhouse results report (1 Dec 2024 – 30 Jun 2025); Adam Dawood:
// Felix's brief (zero → signed by Sony Sweden) + his 'audience comes last' notes. No invented
// numbers: a case without hard data stays typographic until data arrives.
//
// Block types rendered by CasePage:
//   chapter   { n, label, title, body: [] }
//   statement { text }                       full-bleed line on black
//   steps     { label, title, items: [{ k, t, b }] }
//   quote     { text, who, role }
//   channels  { label, title, period, rows, totals }   STIGA breakdown
//   image     { src, alt, caption }          rendered only when src is set

const STIGA_ROWS = [
  { channel: "Facebook", views: 14924282, interactions: 85239, followers: 11407 },
  { channel: "Instagram", views: 10276752, interactions: 204138, followers: 15018 },
  { channel: "TikTok", views: 1800000, interactions: 32000, followers: 4805 },
  { channel: "YouTube", views: 1100000, interactions: 13200, followers: 1200 },
];
const sum = (k) => STIGA_ROWS.reduce((a, r) => a + r[k], 0);
export const STIGA_TOTALS = {
  views: sum("views"),
  interactions: sum("interactions"),
  followers: sum("followers"),
};

export const CASE_CONTENT = {
  bkm: {
    eyebrow: "Case 01 — BKM",
    title: "0 to 10k without a marketing department.",
    sub: "When BKM was moving from 0 to 10k, the founders faced the ultimate dilemma: how to scale market authority without spending 20 hours a week trapped in creative loops.",
    facts: [
      ["Client", "BKM"],
      ["Stage", "0 → 10k"],
      ["Model", "Founder-led marketing"],
      ["Rhythm", "30-minute sprints"],
    ],
    stats: [
      { v: "0 → 10k", l: "The growth stage we built for" },
      { v: "30 min", l: "Per sprint. No exceptions." },
      { v: "2", l: "Tracks — operations and content" },
    ],
    blocks: [
      {
        type: "chapter",
        n: "01",
        label: "The dilemma",
        title: "Authority, without the 20-hour week.",
        body: [
          "Every early-stage founder hits the same wall. The market needs to hear from you — your thinking, your standards, your reasons. But every hour spent inventing content is an hour away from the business that content is supposed to describe.",
          "BKM was moving from 0 to 10k. The obvious move was to hire a big, expensive marketing agency. We did the opposite.",
        ],
      },
      { type: "statement", text: "The answer wasn't a bigger team. It was a strict, 30-minute operational rhythm." },
      {
        type: "steps",
        label: "The system",
        title: "Two tracks. Thirty minutes each. One bridge.",
        items: [
          { k: "Track A", t: "Operational Sprints", b: "Thirty minutes on the stack, the automated pipelines and the system architecture. Nothing else enters the room." },
          { k: "Track B", t: "Content Extraction Sprints", b: "Thirty minutes of the founder talking — captured, then run through a strict dramaturgical framework. No brainstorming." },
          { k: "Bridge", t: "The Alignment Bridge", b: "Where A and B fuse: the operational truth becomes line-by-line content blueprints the team can execute without guessing." },
        ],
      },
      {
        type: "chapter",
        n: "02",
        label: "The insight",
        title: "Founder-led marketing only works when it is systematic.",
        body: [
          "Raw founder genius is the most valuable material a young company has — and the most wasted. Captured in a fixed rhythm and filtered instantly into operational proof, it compounds.",
          "You don't need a massive team. You need a bulletproof flow.",
        ],
      },
      {
        type: "quote",
        text: "The 30-minute BKM flow completely stripped the noise from my messaging. It brought the exact discipline of deep freediving straight into our content production.",
        who: "Li Karlsén",
        role: "Co-founder, BKM",
      },
    ],
  },

  "li-karlsen": {
    eyebrow: "Case 02 — Li Karlsén",
    title: "Content doesn't need to be loud. It needs to be precise.",
    sub: "Picture Li Karlsén, co-founder of BKM and elite freediver, descending into absolute silence. In the deep there is no room for wasted energy, rambling thoughts, or hesitation.",
    facts: [
      ["Who", "Li Karlsén"],
      ["Role", "Co-founder, BKM · elite freediver"],
      ["Format", "30-minute extraction sprints"],
      ["Framework", "Hook · Credibility · Core · Outro"],
    ],
    depth: true,
    blocks: [
      {
        type: "chapter",
        n: "01",
        label: "The descent",
        title: "Every movement is deliberate.",
        body: [
          "A freedive is the purest edit there is. One breath, a fixed budget of energy, and a line to follow down and back. Anything that isn't the dive is a cost.",
          "That is exactly the discipline most content lacks. Long brainstorms, endless drafts, ideas that wander — all of it spends the breath before the work begins.",
        ],
      },
      {
        type: "chapter",
        n: "02",
        label: "The translation",
        title: "Thirty minutes. No brainstorming.",
        body: [
          "We brought that operational stillness to Li's content. Dedicated, hyper-focused 30-minute extraction sprints — a single conversation, pointed at her deep expertise.",
          "Everything she said passed straight through a strict dramaturgical framework, shaping raw thought into a finished sequence on the spot.",
        ],
      },
      {
        type: "steps",
        label: "The dramaturgy",
        title: "Four beats. Every piece.",
        items: [
          { k: "01", t: "Hook", b: "The first line earns the second. One idea, stated with no warm-up." },
          { k: "02", t: "Credibility", b: "Why this voice, on this subject. Proof before opinion." },
          { k: "03", t: "Core", b: "The single thing the viewer leaves with — nothing that competes with it." },
          { k: "04", t: "Outro", b: "Land it, then stop. The ending is the next step, not a summary." },
        ],
      },
      { type: "statement", text: "It doesn't need to be loud to be powerful. It just needs to be precise." },
      {
        type: "quote",
        text: "The 30-minute BKM flow completely stripped the noise from my messaging. It brought the exact discipline of deep freediving straight into our content production.",
        who: "Li Karlsén",
        role: "Co-founder, BKM",
      },
    ],
  },

  stiga: {
    eyebrow: "Case 03 — STIGA Table Tennis",
    title: "A legacy global brand, growing on every channel.",
    sub: "This methodology isn't just for agile startups. Inside a global sports brand with decades of history, the same engine turned corporate systems and technical depth into public assets — and every metric moved.",
    facts: [
      ["Client", "STIGA Table Tennis"],
      ["Period", "1 Dec 2024 – 30 Jun 2025"],
      ["Channels", "Facebook · Instagram · TikTok · YouTube"],
      ["Method", "30-minute tactical structures"],
    ],
    heroStat: { v: "28.1M", l: "views across four channels" },
    blocks: [
      {
        type: "chapter",
        n: "01",
        label: "The drag",
        title: "Great work, stuck behind the corporate wall.",
        body: [
          "Legacy brands don't lack substance. They lack speed. Product knowledge, engineering detail and athlete stories sit inside long approval chains and communication models built for a slower world.",
          "We replaced the long meetings with high-frequency, 30-minute tactical structures — and pointed them at what STIGA already does best.",
        ],
      },
      {
        type: "channels",
        label: "The results",
        title: "Growing on all metrics, across every channel.",
        period: "1 Dec 2024 – 30 Jun 2025",
        rows: STIGA_ROWS,
        totals: STIGA_TOTALS,
      },
      {
        type: "chapter",
        n: "02",
        label: "The production core",
        title: "Corporate systems in. Premium public assets out.",
        body: [
          "Massive corporate systems and technical data pipelines were translated into premium public-facing assets — not as a campaign, but as a production line that runs month after month.",
          "Operational drag eliminated. Internal alignment got faster because the communication model itself changed.",
        ],
      },
      { type: "statement", text: "The engine that took a founder from 0 to 10k scales to a global giant. Same rhythm. Bigger machine." },
    ],
  },

  "adam-dawood": {
    eyebrow: "Case 05 — Adam Dawood",
    title: "From zero to signed.",
    sub: "Adam Dawood started from zero — no audience waiting, no label behind him. Today DAWOOD is signed by Sony Sweden.",
    facts: [
      ["Artist", "Adam Dawood · DAWOOD"],
      ["Start", "Zero"],
      ["Outcome", "Signed by Sony Sweden"],
      ["Principle", "The audience comes last"],
    ],
    heroStat: { v: "0 → Signed", l: "Sony Sweden" },
    blocks: [
      {
        type: "chapter",
        n: "01",
        label: "The starting point",
        title: "No audience to aim at.",
        body: [
          "Most advice starts with the target audience. At zero there isn't one — and aiming at an imagined one makes everything sound like everyone else.",
          "So the work didn't start outside. It started with the only question that matters at zero: who is DAWOOD — today?",
        ],
      },
      { type: "statement", text: "The audience comes last. Because you are the audience." },
      {
        type: "chapter",
        n: "02",
        label: "The method",
        title: "Produce the core.",
        body: [
          "The answer to who you are isn't a statement. It's a decision taken every day — and produced, consistently, into the world.",
          "Producing your core is what separates you, and what attracts. The audience doesn't know what it wants before it's there. Neither does a label.",
        ],
      },
      {
        type: "steps",
        label: "The long game",
        title: "Separate what you control from what you don't.",
        items: [
          { k: "Controllable", t: "Consistency", b: "Decide who you are and produce it — every day, whether anyone is watching yet or not." },
          { k: "Uncontrollable", t: "The curve", b: "When it bends isn't yours to choose. It only bends for the ones still producing when it does." },
          { k: "The result", t: "Signed", b: "From zero to a deal with Sony Sweden." },
        ],
      },
      { type: "statement", text: "It's a long-term game. Consistency is the only part you hold." },
    ],
  },
};
