// Case page long reads. Title, number and the four-step spine live in the
// registry (components/agency/agencyData.js CASES); this file holds the
// sub-line, the facts (unnumbered pages only) and the blocks. Every claim traces to the agency blueprint or, for STIGA,
// to the Growhouse results report (1 Dec 2024 – 30 Jun 2025); Adam Dawood:
// Felix's brief (zero → signed by Sony Music; identity, story, rollout, growth) + his 'audience comes last' notes. No invented
// numbers: a case without hard data stays typographic until data arrives.
//
// Block types rendered by CasePage:
//   chapter   { n, label, title, body: [] }
//   statement { text }                       full-bleed line on black
//   steps     { label, title, items: [{ k, t, b }] }
//   quote     { text, who, role }
//   channels  { label, title, period, rows, totals }   STIGA breakdown
//   image     { src, alt, caption }          rendered only when src is set
//   reel      { label, title, body, beats: [{ t, line, frames, cut: [] }] }
//             animated edit: raw take reviewed frame by frame → cuts collapse → final cut plays

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
    sub: "When BKM was moving from 0 to 10k, the founders faced the ultimate dilemma: how to scale market authority without spending 20 hours a week trapped in creative loops.",
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
      {
        type: "reel",
        label: "The edit",
        title: "One reel. Four pieces. Frame by frame.",
        body: "Every reel was split into its four beats and taken apart frame by frame. Any frame that spent breath without moving the story was cut, until each piece did exactly one job — and the reel ran clean from the first line to the last.",
        beats: [
          { t: "Hook", line: "The first line earns the second.", frames: 4, cut: [3] },
          { t: "Credibility", line: "Proof before opinion.", frames: 6, cut: [1, 4] },
          { t: "Core", line: "The one thing you leave with.", frames: 10, cut: [2, 5, 8] },
          { t: "Outro", line: "Land it. Then stop.", frames: 5, cut: [2, 4] },
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
    sub: "A global sports brand with decades of history — and about 50 followers on Instagram. The people and the play were already there. We put them at the centre, in the sport's own voice, and every metric moved.",
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
    sub: "An artist with a sound, a world and nobody watching yet. We built the identity around who he actually is — from the visual language to the story the music tells — and grew it step by step. From zero to signed by Sony Music.",
    heroStat: { v: "0 → Signed", l: "Sony Music" },
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
          { k: "The result", t: "Signed", b: "From zero to a deal with Sony Music." },
        ],
      },
      { type: "statement", text: "It's a long-term game. Consistency is the only part you hold." },
    ],
  },

  kaijas: {
    sub: "Before we did this for anyone else, we did it for ourselves. We took an empty room in Stockholm and built a live-music venue — the brand, the programme, the people, and the systems to run it.",
    heroStat: { v: "4 nights", l: "of live music, every week" },
    blocks: [
      {
        type: "chapter",
        n: "01",
        label: "The starting point",
        title: "An empty room.",
        body: [
          "No name on the door, no programme, no guests. Everything a venue is had to be decided — and then produced, week after week.",
          "It is the same work we now do for brands and creators: find who you are, say it clearly, and live it in public until people can feel it.",
        ],
      },
      {
        type: "steps",
        label: "What we built",
        title: "The whole venue, in-house.",
        items: [
          { k: "01", t: "The brand", b: "A name, a look and a voice for a live-music salon in Stockholm." },
          { k: "02", t: "The programme", b: "Live music four nights a week." },
          { k: "03", t: "The people", b: "The room is the musicians, the staff and the guests who come back." },
          { k: "04", t: "The systems", b: "Our own booking system and operations dashboard, built in-house." },
        ],
      },
      { type: "statement", text: "Instagram became the front door. Guests found us there — and booked." },
      {
        type: "chapter",
        n: "02",
        label: "Why it matters to you",
        title: "We use it on ourselves first.",
        body: [
          "Every method on this site ran here before it ran for a client. 10,000+ people follow Kaijas on Instagram — the front door to the room.",
        ],
      },
    ],
  },
};
