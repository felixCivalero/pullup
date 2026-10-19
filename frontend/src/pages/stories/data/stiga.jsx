/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { ChannelBars, Steps } from "../../../components/agency/story/StoryKit.jsx";
import { STIGA_ROWS } from "../../../components/agency/agencyData.js";

/* STIGA Table Tennis. Facts: Growhouse results report, 1 Dec 2024 –
   30 Jun 2025 (seven months — never "eight"); in-house talents introduced,
   personas and stories built around them. NEVER state a starting follower
   count. Photos: Wikimedia Commons placeholders — no identifiable players. */

const IMG = (f) => `/stories/stiga/${f}.webp`;
const VIEWS = STIGA_ROWS.reduce((a, r) => a + r.views, 0);
const views = (v, done) => (done ? "28.1M" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v));

export default {
  slug: "stiga",
  theme: { surface: "#0F2F73", mid: "#0A2152", deep: "#071636", abyss: "#030A1C", a: "#4F7FE8", ai: "#9DB8FF", b: "#B87A26", glow: "79,127,232" },
  hero: {
    img: IMG("arena"),
    alt: "A table tennis arena, tables lit under a dark roof",
    sub: "A global sports brand with decades of history — and the talent already in the building. How putting its own people at the front moved every metric.",
  },
  chapters: [["surface", "The hall"], ["talent", "The talent"], ["line", "The production line"], ["results", "The results"], ["up", "Seven months"]],
  blocks: [
    {
      type: "scene", img: IMG("heritage"), alt: "An archive photograph of a player training at a table tennis table", pos: "center 35%", section: "ch_start", order: 10,
      chapter: ["01", "The drag", "Great work, stuck behind the corporate wall."],
      cards: [
        { k: "The brand", b: "Decades in table tennis. Product knowledge, engineering detail and athlete stories — all of it already inside the building." },
        { k: "The drag", h: "Built for a slower world.", b: "Long approval chains and communication models made for another era kept the best of it from reaching anyone." },
      ],
    },
    {
      type: "scene", anchor: "talent", img: IMG("rubber"), alt: "Close-up of the rubber on a table tennis bat", pos: "center 40%", section: "ch_talent", order: 20,
      chapter: ["02", "The talent", "The people were already in the building."],
      cards: [
        { k: "The move", b: "We introduced STIGA's in-house talents to the world and built personas and stories around each of them." },
        { k: "Why it works", h: "Fans follow people.", b: "A logo can't be someone you know. A person who lives the sport every day can." },
      ],
    },
    {
      type: "band", anchor: "line", tone: "mid", layout: "split-wide", section: "system", order: 30,
      k: "The production core", h: "Not a campaign. A production line.",
      node: (
        <Steps
          items={[
            ["01", "30-minute tactical sprints", "Long meetings replaced by short, high-frequency structures pointed at what STIGA already does best."],
            ["02", "Corporate systems in", "Technical data and product detail translated into stories people actually watch."],
            ["03", "Premium assets out", "Short-form video and posts in the sport's own voice, month after month, on four channels."],
          ]}
        />
      ),
    },
    { type: "drift", imgs: [IMG("paddles-net"), IMG("net"), IMG("top-down")] },
    {
      type: "band", anchor: "results", tone: "deep", layout: "stack", section: "results", order: 40,
      k: "The results", h: "Growing on every metric, across every channel.",
      node: (
        <ChannelBars
          rows={STIGA_ROWS.map((r) => ({ ...r, label: r.channel }))}
          metrics={[["views", "Views"], ["interactions", "Interactions"], ["followers", "Followers"]]}
          source="Source: channel analytics, 1 Dec 2024 – 30 Jun 2025. Accumulated per channel."
        />
      ),
    },
    {
      type: "count", anchor: "up", img: IMG("paddle-blue"), alt: "A table tennis bat and ball resting on a blue table", section: "result", order: 50,
      n: "05", label: "Seven months", from: 0, to: VIEWS, fmt: views,
      unit: "views across four channels",
      note: "The total for 1 Dec 2024 – 30 Jun 2025 across Facebook, Instagram, TikTok and YouTube.",
    },
    {
      type: "finale", img: IMG("paddle"), alt: "A red table tennis bat and an orange ball on a green table", section: "result_business", order: 51,
      k: "They lived it",
      h: "STIGA didn't run a campaign. It let its own people live the sport in public — and fans came to follow them.",
      facts: [["28.1M", "views"], ["+32,000", "followers"], ["335,000", "interactions"]],
    },
  ],
  credits: [
    ["The Boxen Arena, European Championships Table Tennis 2012", "Robbert Westerhout", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:The_Boxen_Arena,_European_Championships_Table_Tennis_2012_(8106412118).jpg"],
    ["Wereldkampioenschap tafeltennis, training (Anefo)", "Harry Pot", "CC0", "https://commons.wikimedia.org/wiki/File:Wereldkampioenschap_tafeltennis_dame_handelsschool_training_aangetast,_Bestanddeelnr_907-0650.jpg"],
    ["Long pips table tennis rubber on racket", "Awsomaw", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Long_pips_table_tennis_rubber_on_racket.jpg"],
    ["Four table tennis bats and net", "Santeri Viinamäki", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Four_table_tennis_bats_and_net.jpg"],
    ["Table Tennis Net", "Miraz092", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Table_Tennis_Net.jpg"],
    ["Bat n' Ball", "idleformat", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Bat_n%27_Ball.jpg"],
    ["Table Tennis racquet and ball on table — top view", "KeepActive Australia", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Table_Tennis_racquet_and_ball_on_table_-_top_view.jpg"],
    ["Table tennis bat and ball", "Santeri Viinamäki", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Table_tennis_bat_and_ball.jpg"],
  ],
};
