/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { Steps } from "../../../components/agency/story/StoryKit.jsx";

/* Adam Dawood (DAWOOD) — a separate person from Adam Flambo. The only hard
   fact: from zero to signed by Sony Music. Method from Felix's notes: the
   audience comes last; produce the core every day; consistency is the part
   you control. Photos: Wikimedia Commons placeholders — objects and rooms,
   never a performer who could be mistaken for him. */

const IMG = (f) => `/stories/dawood/${f}.jpg`;

export default {
  slug: "adam-dawood",
  theme: { surface: "#2A1250", mid: "#1D0C3A", deep: "#140828", abyss: "#0A0414", a: "#9466E8", ai: "#C9AEFF", b: "#B08424", glow: "148,102,232" },
  hero: {
    img: IMG("mic"),
    alt: "A studio condenser microphone in warm light",
    sub: "An artist with a sound, a world and nobody listening yet. How producing who he is — every day — took him from zero to signed.",
  },
  chapters: [["surface", "Zero"], ["core", "The core"], ["long", "The long game"], ["signed", "Signed"]],
  blocks: [
    {
      type: "scene", img: IMG("booth"), alt: "A ribbon microphone alone in a vocal booth", pos: "center 40%", section: "ch_start", order: 10,
      chapter: ["01", "Zero", "No audience to aim at."],
      cards: [
        { k: "The starting point", b: "Most advice starts with the target audience. At zero there isn't one — and aiming at an imagined one makes you sound like everyone else." },
        { k: "The question", h: "Who is DAWOOD — today?", b: "So the work didn't start outside. It started with the only question that matters at zero." },
      ],
    },
    { type: "still", img: IMG("vinyl"), line: "The audience comes last.", em: "Because you are the audience.", section: "statement", order: 15 },
    {
      type: "scene", anchor: "core", img: IMG("studio"), alt: "A recording studio desk under violet light", pos: "center 50%", section: "ch_core", order: 20,
      chapter: ["02", "The core", "Produce the core."],
      cards: [
        { k: "The method", b: "Who you are isn't a statement. It's a decision taken every day — and produced, consistently, into the world." },
        { k: "What we built", h: "Identity first.", b: "The visual language and the story the music tells, built around who he actually is — then rolled out step by step." },
      ],
    },
    {
      type: "band", anchor: "long", tone: "deep", layout: "split-wide", section: "long_game", order: 30,
      k: "The long game", h: "Separate what you control from what you don't.",
      node: (
        <Steps
          items={[
            ["Controllable", "Consistency", "Decide who you are and produce it — every day, whether anyone is watching yet or not."],
            ["Uncontrollable", "The curve", "When it bends isn't yours to choose. It only bends for the ones still producing when it does."],
          ]}
        />
      ),
    },
    { type: "drift", imgs: [IMG("faders"), IMG("keys"), IMG("vinyl")] },
    {
      type: "path", anchor: "signed", img: IMG("arena"), alt: "A festival crowd under violet stage lights", section: "result", order: 40,
      n: "04", label: "Signed", steps: ["Zero", "Identity", "Story", "Rollout", "Sony Music"],
      note: "The path, step by step. The curve isn't yours to choose — the consistency is.",
    },
    {
      type: "finale", img: IMG("faders"), alt: "Mixing desk faders glowing in the dark", section: "result_business", order: 50,
      k: "He lived it",
      h: "He didn't wait to be discovered. He lived the artist he was becoming — and a label heard it.",
      facts: [["0 → Sony", "from zero to signed by Sony Music"], ["Every day", "the core, produced"]],
    },
  ],
  credits: [
    ["Neumann U87 Condenser Microphone — In Your Ear Studios", "Will Fisher", "CC BY-SA 2.0", "https://commons.wikimedia.org/wiki/File:Neumann_U87_Condenser_Microphone_-_Studio_A,_In_Your_Ear_Studios.jpg"],
    ["ShinyBox 46MXC Ribbon Microphone, LowSwing studio", "Marc Wathieu", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:ShinyBox_46MXC_Ribbon_Microphone,_LowSwing_studio,_Berlin,_2011-01-25_22_29_45.jpg"],
    ["Das Vinyl dreht sich", "Sulamith Sallmann", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Das_Vinyl_dreht_sich.jpg"],
    ["Recording studio console for DAW work", "Dayron Villaverde", "CC0", "https://commons.wikimedia.org/wiki/File:Recording_studio_console_for_DAW_work_(2016-03-23_15.01.29_by_DayronV_@pixabay_1290087).jpg"],
    ["Modern Mixing Console", "Dejan Krsmanovic", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Modern_Mixing_Console_(39871848713).jpg"],
    ["Small Bedroom Studio", "Dejan Krsmanovic", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Small_Bedroom_Studio_(46122896244).jpg"],
    ["Beach Please 2022 — crowd, stage lights", "PinkBeachPlanet", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Beach-Please-2022-crowd-stage-lights-night-performance.jpg"],
  ],
};
