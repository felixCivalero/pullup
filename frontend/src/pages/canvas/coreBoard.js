// The Core board — the template every client engagement starts from: the
// Production Core's worksheets, the 3-month trust-period onboarding, and the
// scripts for both 30-minute tracks, laid out as frames + stickies. All of it
// is a starting draft: every card is editable on the board.

const YELLOW = "#FFE873";
const PINK = "#FFB8D1";
const BLUE = "#B8E1FF";
const GREEN = "#C2F2C2";
const WHITE = "#FFFFFF";

let n = 0;
const id = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now().toString(36)}${n++}`);

const frame = (title, x, y, w, h) => ({ id: id(), type: "frame", title, x, y, w, h, z: 0 });
const sticky = (text, color, x, y, w = 240, h = 240) => ({ id: id(), type: "sticky", text, color, x, y, w, h, z: 1 });
const text = (t, size, x, y, w, h) => ({ id: id(), type: "text", text: t, size, x, y, w, h, z: 1 });

// Lay stickies out in a row inside a frame (frame title bar is ~64px tall).
function row(f, cards, { w = 240, h = 240, gap = 28, top = 88 } = {}) {
  return cards.map(([t, color], i) => sticky(t, color, f.x + 32 + i * (w + gap), f.y + top, w, h));
}

const ONBOARDING = [
  ["Week 1 · Kickoff\nDirection + Identity with the whole team. Who holds the brand?", BLUE],
  ["Week 1 · Stack audit (Track A)\nTools, pipelines, who does what. What's manual, what's broken?", BLUE],
  ["Week 2 · First extraction (Track B)\nFounder sprint → first scripts in Hook, Credibility, Core, Outro.", BLUE],
  ["Weeks 2–4 · Instagram, 3 months ahead\nSchedule the next 90 days. Constant growth.", BLUE],
  ["Month 2 · Every channel\nPut existing content to work on TikTok, YouTube and Facebook.", BLUE],
  ["Every day · Alignment\nEveryone answers: who are we today? Weekly 30-minute sprints.", BLUE],
  ["Day 90 · Review\nMeasured and grown. Where do we invest our future time together?", BLUE],
];

const TRACK_A = [
  ["0–5 min · Check-in\nWhat changed in the business since the last sprint?", GREEN],
  ["5–15 · Walk the engine\nWhat's running, what's broken, what's still manual?", GREEN],
  ["15–25 · One change\nThe single system change that matters most this week. Owner + deadline.", GREEN],
  ["25–30 · Bridge\nWhat from this week's work is proof worth showing? Hand it to Track B.", GREEN],
];

const TRACK_B = [
  ["Hook\nThe first line earns the second. One idea, no warm-up.", WHITE],
  ["Credibility\nWhy this voice, on this subject. Proof before opinion.", WHITE],
  ["Core\nThe one thing they leave with — nothing that competes with it.", WHITE],
  ["Outro\nLand it, then stop. The ending is the next step.", WHITE],
];

export function coreBoardTemplate(client) {
  const name = (client || "").trim() || "Client";
  const W = 2440; // full board width
  const items = [];

  items.push(text(`Core board — ${name}`, "l", 0, -200, 1400, 70));
  items.push(
    text("The Production Core · 3-month trust period. Where do we want to go — and who do we need to be to get there?", "s", 0, -112, 1400, 60),
  );

  // Row 1 — the three worksheets
  const fw = (W - 2 * 80) / 3;
  const direction = frame("01 · Direction — Where do we want to go?", 0, 0, fw, 380);
  const identity = frame("02 · Identity — Who are we, today?", fw + 80, 0, fw, 380);
  const daily = frame("03 · Daily alignment — Everyone answers: who are we today?", 2 * (fw + 80), 0, fw, 380);
  items.push(direction, identity, daily);
  items.push(
    ...row(direction, [
      ["In 12 months, we are…", YELLOW],
      ["We want to be known for…", YELLOW],
      ["We'll know we're there when…", YELLOW],
    ], { w: 230, h: 230 }),
    ...row(identity, [
      ["Who are we?", PINK],
      ["Who do we need to be to get there?", PINK],
      ["What do we decide today?", PINK],
    ], { w: 230, h: 230 }),
    ...row(daily, [
      ["Name —\nwho are we today?", WHITE],
      ["Name —\nwho are we today?", WHITE],
      ["Name —\nwho are we today?", WHITE],
    ], { w: 230, h: 230 }),
  );

  // Row 2 — onboarding: the 3-month trust period
  const onboarding = frame("Onboarding — the 3-month trust period", 0, 460, W, 380);
  items.push(onboarding, ...row(onboarding, ONBOARDING, { w: 310, h: 240, gap: 24 }));

  // Row 3 — the two 30-minute tracks
  const half = (W - 80) / 2;
  const trackA = frame("Track A — Operational sprint · 30 min", 0, 920, half, 400);
  const trackB = frame("Track B — Content extraction · 30 min", half + 80, 920, half, 400);
  items.push(trackA, ...row(trackA, TRACK_A, { w: 250, h: 270, gap: 22 }));
  items.push(trackB, ...row(trackB, TRACK_B, { w: 250, h: 270, gap: 22 }));

  // Row 4 — the bridge: this week's posts
  const bridge = frame("The Bridge — this week's posts", 0, 1400, W, 760);
  items.push(bridge);
  items.push(
    sticky("Paste this week's posts here — the proof from Track A, told through Track B. Fill in the stats as they come.", YELLOW, 32, 1488, 300, 220),
  );

  return { items };
}
