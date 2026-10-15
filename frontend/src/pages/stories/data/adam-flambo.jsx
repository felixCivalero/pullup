/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { Columns } from "../../../components/agency/story/StoryKit.jsx";
import { CASE_TODAY } from "../adamFlamboData.js";

/* Adam Flambo — Stockholm Photo Walks. His own photographs (shared in his
   room with commercial consent), not stock. Numbers: CASE_TODAY, a prod
   snapshot (community = his Room's people count, pulledUnique = unique
   pull-ups, events = published events with pull-ups). Privacy: no
   contributor names anywhere. */

const IMG = (f) => `/stories/${f}`;
const { community, pulledUnique, events, asOf } = CASE_TODAY;
const asOfLabel = new Date(asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default {
  slug: "adam-flambo",
  theme: { surface: "#3B1F12", mid: "#2A160D", deep: "#1C0E08", abyss: "#0E0704", a: "#E0622A", ai: "#FF9C6B", b: "#14A391", glow: "224,98,42" },
  hero: {
    img: IMG("adam-hero.jpg"),
    alt: "Adam Flambo shooting on a Stockholm photo walk",
    pos: "center 25%",
    sub: "A creator with a following online and no way to meet it. Photo walks across Stockholm — and a community that's his.",
  },
  chapters: [["surface", "Online"], ["walks", "The walks"], ["room", "The room"], ["community", "The community"]],
  blocks: [
    {
      type: "scene", img: IMG("photogang.jpg"), alt: "A group with cameras on a Stockholm street", pos: "center 40%", section: "ch_start", order: 10,
      chapter: ["01", "Online", "Followers aren't faces."],
      cards: [
        { k: "The start", b: "Adam had a following online — and no way to meet it." },
        { k: "The move", h: "Out of the feed, onto the street.", b: "Ninety-minute photo walks through Stockholm, one neighbourhood at a time. His events and his community moved onto PullUp, owned by him." },
      ],
    },
    {
      type: "band", anchor: "walks", tone: "mid", layout: "stack", section: "figure_walks", order: 20,
      k: "Every walk", h: "Small on purpose. Every time.",
      body: "People who pulled up, event by event. The walks stayed intimate — and people kept coming back.",
      node: (
        <Columns
          rows={events}
          unit="pulled up"
          aria="People who pulled up at each of Adam's events, in order"
          source={`Pulled up per event, from his PullUp rooms · as of ${asOfLabel}. Tap a column.`}
        />
      ),
    },
    { type: "drift", imgs: [IMG("pathfinder.jpeg"), IMG("softbuildinglight.jpg"), IMG("eveningalley.jpeg")] },
    {
      type: "scene", anchor: "room", img: IMG("window.jpg"), alt: "An open window onto a Stockholm courtyard", pos: "center 50%", section: "ch_room", order: 30,
      chapter: ["02", "The room", "A room that's theirs."],
      cards: [
        { k: "After every walk", b: "The people who came post their own photographs in a private room — credited, and theirs." },
        { k: "Given back", h: "Then it went to print.", b: "Adam turned the room into a printed journal: the community's own photographs, handed back to them." },
      ],
    },
    {
      type: "quote", img: IMG("sthlmneveninglight.jpg"), n: "03", label: "The backbone", section: "quote", order: 35,
      text: "PullUp is the backbone of all of this. It carries everything behind the scenes — so I get to just be out there with a camera and the people.",
      who: "Adam Flambo", role: "Stockholm Photo Walks",
    },
    {
      type: "count", anchor: "community", img: IMG("hollywoodshot.jpg"), alt: "People gathered around a photographer on a sunny Stockholm street", section: "result", order: 40,
      n: "04", label: "The community", from: 0, to: community, fmt: (v) => String(Math.round(v)),
      unit: "people in his community",
      note: `Everyone who RSVP'd to a walk or joined his community on PullUp · as of ${asOfLabel}.`,
    },
    {
      type: "finale", img: IMG("birdinsky.jpg"), alt: "A single bird against a deep blue sky", section: "result_business", order: 50,
      k: "He lived it",
      h: "He didn't build an audience and then meet it. He walked with whoever came — and kept walking.",
      facts: [[String(pulledUnique), "people pulled up"], [String(community), "in his community"], [String(events.length), "events hosted"]],
    },
  ],
  creditNote: "Photographs from Adam Flambo's walks, shared in his room with the photographers' consent.",
};
