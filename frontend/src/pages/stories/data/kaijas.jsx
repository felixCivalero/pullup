/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { Steps, Waffle } from "../../../components/agency/story/StoryKit.jsx";

/* Kaijas Musiksalong — our own venue. Facts: an empty room in Stockholm;
   live music four nights a week; our own booking system + ops dashboard;
   Instagram as the front door, 10,000+ followers; booked three months in
   advance. Photos: Wikimedia Commons placeholders (no named musicians). */

const IMG = (f) => `/stories/kaijas/${f}.webp`;
const tenK = (v, done) => (done || v >= 9999 ? "10,000+" : (Math.round(v / 50) * 50).toLocaleString("en-US"));

export default {
  slug: "kaijas",
  theme: { surface: "#3A0F22", mid: "#2A0A18", deep: "#1C0610", abyss: "#0E0308", a: "#D9468A", ai: "#FF93C4", b: "#B08230", glow: "217,70,138" },
  hero: {
    img: IMG("stortorget"),
    alt: "Stortorget in Gamla stan, Stockholm, at night",
    pos: "center 60%",
    sub: "Before we did this for anyone else, we did it for ourselves. An empty room in Stockholm, built around the people behind it.",
  },
  chapters: [["surface", "Stockholm"], ["built", "What we built"], ["people", "The people"], ["ahead", "The front door"]],
  blocks: [
    {
      type: "scene", img: IMG("empty-room"), alt: "An empty bar room, lamps on, nobody there yet", pos: "center 50%", section: "ch_start", order: 10,
      chapter: ["01", "The room", "An empty room."],
      cards: [
        { k: "The starting point", b: "No name on the door, no programme, no guests. Everything a venue is had to be decided — and then produced, week after week." },
        { k: "The same work", h: "Find who you are. Live it in public.", b: "It's what we now do for brands and creators: say it clearly, and live it until people can feel it." },
      ],
    },
    {
      type: "band", anchor: "built", tone: "mid", layout: "split-wide", section: "built", order: 20,
      k: "What we built", h: "The whole venue, in-house.",
      node: (
        <Steps
          items={[
            ["01", "The brand", "A name, a look and a voice for a live-music salon in Stockholm."],
            ["02", "The programme", "Live music four nights a week."],
            ["03", "The people", "The core of it all. The musicians, the staff and the guests who come back."],
            ["04", "The systems", "Our own booking system and operations dashboard, built in-house."],
          ]}
        />
      ),
    },
    {
      type: "band", tone: "deep", section: "figure_week", order: 25,
      k: "The rhythm", h: "Four nights a week.",
      body: "Live music four nights out of seven. Not a launch, not an event — the rhythm the room lives by.",
      node: (
        <Waffle
          cells={7}
          cols={7}
          label="Four of seven nights with live music"
          states={[{ label: "A week", lit: [0, 1, 2, 3], value: "4 of 7 nights" }]}
          legend={[["a", "Nights with live music"], ["off", "Nights off"]]}
        />
      ),
    },
    {
      type: "scene", anchor: "people", img: IMG("piano-red"), alt: "A piano in a dim bar, lit red", pos: "center 50%", section: "ch_people", order: 30,
      chapter: ["02", "The people", "The people are the reason."],
      cards: [
        { k: "The core", b: "The musicians, the staff and the guests who come back made it an experience you couldn't get anywhere else." },
        { k: "The front door", h: "Instagram, then the room.", b: "Guests found Kaijas on Instagram — and booked through our own system behind it." },
      ],
    },
    { type: "drift", imgs: [IMG("alley"), IMG("keys"), IMG("piano-wood")] },
    {
      type: "count", anchor: "ahead", img: IMG("crowd"), alt: "A crowd with hands raised under red stage light", section: "result", order: 40,
      n: "03", label: "The front door", from: 0, to: 10000, fmt: tenK,
      unit: "people following Kaijas on Instagram",
      note: "The door every booking walks through.",
    },
    {
      type: "finale", img: IMG("alley"), alt: "A narrow lamp-lit lane in Gamla stan at night", pos: "center 60%", section: "result_business", order: 50,
      k: "We lived it",
      h: "We didn't wait for a full room to act like a venue. We lived it four nights a week — until it was booked three months ahead.",
      facts: [["3 months", "booked in advance"], ["4 nights", "of live music a week"], ["10,000+", "Instagram followers"]],
    },
  ],
  credits: [
    ["Gamla Stan, Stockholm — panoramio (175)", "bynyalcin", "CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Gamla_Stan,_S%C3%B6dermalm,_Stockholm,_Sweden_-_panoramio_(175).jpg"],
    ["Gamla Stan, Stockholm — panoramio (168)", "bynyalcin", "CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Gamla_Stan,_S%C3%B6dermalm,_Stockholm,_Sweden_-_panoramio_(168).jpg"],
    ["Blå bar", "Benyamin Farnam", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Bl%C3%A5_bar.jpg"],
    ["Piano en el bar American Legion", "Deliriv", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Piano_en_el_bar_American_Legion.jpg"],
    ["Close-up of a keyboardist's hands under stage lights", "PattayaPatrol", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:DFC_5598_Close-up_of_a_keyboardists_hands_playing_a_synthesizer_under_colorful_stage_lights_during_a_live_performance_in_Pattaya.jpg"],
    ["Piano keys close up", "Puikstekend", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Piano_keys_close_up.jpg"],
    ["Put your hands in the air", "Arkady Lifshits", "CC0", "https://commons.wikimedia.org/wiki/File:Put_your_hands_in_the_air_(Unsplash).jpg"],
  ],
};
