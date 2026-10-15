/* eslint-disable react-refresh/only-export-components -- a story data module, not a component */
import { ReelDesk, Waffle } from "../../../components/agency/story/StoryKit.jsx";
import { REEL_BEATS } from "../../../components/agency/agencyData.js";

/* Li Karlsén — founder of BKM, elite freediver. Facts: one piece of content
   went from 8 hours to 30 minutes; 30-minute extraction sprints; reels in four
   beats (Hook, Credibility, Core, Outro) cut frame by frame (the edit loop is
   illustrative). Photos: Wikimedia Commons placeholders. */

const IMG = (f) => `/stories/li/${f}.jpg`;
const ALL = Array.from({ length: 16 }, (_, i) => i);

export default {
  slug: "li-karlsen",
  theme: { surface: "#0A4B4F", mid: "#06333A", deep: "#03222A", abyss: "#011318", a: "#14A391", ai: "#5FD4C3", b: "#B57A3C", glow: "20,163,145" },
  hero: {
    img: IMG("surface-dark"),
    alt: "Sunlight breaking through the surface, seen from deep below",
    sub: "A founder and elite freediver with more to say than a reel can hold. How one breath became the way she makes content.",
    cue: "Scroll to descend",
  },
  chapters: [["surface", "Surface"], ["sprint", "One breath"], ["edit", "The edit"], ["precise", "Precision"], ["time", "Thirty minutes"]],
  blocks: [
    {
      type: "scene", img: IMG("platform"), alt: "A freediver in silhouette beneath a floating platform", pos: "center 30%", section: "ch_start", order: 10,
      chapter: ["01", "The weight", "More to say than a reel can hold."],
      cards: [
        { k: "The founder", b: "Li Karlsén co-founded BKM and dives at elite level. Deep expertise — and every piece of content took a whole working day." },
        { k: "The cost", h: "Eight hours a piece.", b: "Long brainstorms, endless drafts, ideas that wander. All of it spends the breath before the work begins." },
      ],
    },
    {
      type: "scene", anchor: "sprint", img: IMG("pool-glide"), alt: "A freediver gliding low over the tiles of a pool", pos: "center 50%", section: "ch_sprint", order: 20,
      chapter: ["02", "One breath", "Thirty minutes. No brainstorming."],
      cards: [
        { k: "The sprint", b: "A single, hyper-focused 30-minute conversation pointed at her expertise. Nothing else enters the room." },
        { k: "The framework", h: "Shaped on the spot.", b: "Everything she said passed straight through a strict dramaturgical framework — raw thought into a finished sequence." },
      ],
    },
    {
      type: "band", anchor: "edit", tone: "deep", layout: "stack", section: "figure_edit", order: 30,
      k: "The edit", h: "One reel. Four beats. Frame by frame.",
      body: "Every reel was split into Hook, Credibility, Core and Outro, then taken apart frame by frame. Any frame that spent breath without moving the story was cut.",
      node: <ReelDesk beats={REEL_BEATS} />,
    },
    { type: "drift", imgs: [IMG("deep-pool"), IMG("pool-fins"), IMG("platform")] },
    {
      type: "quote", anchor: "precise", img: IMG("sunburst"), n: "03", label: "Precision", section: "quote", order: 40,
      text: "The 30-minute BKM flow completely stripped the noise from my messaging. It brought the exact discipline of deep freediving straight into our content production.",
      who: "Li Karlsén", role: "Co-founder, BKM",
    },
    { type: "still", line: "It doesn't need to be loud to be powerful.", em: "It needs to be precise.", section: "statement", order: 41 },
    {
      type: "band", anchor: "time", tone: "mid", section: "figure_time", order: 50,
      k: "Per piece of content", h: "Sixteen half-hours became one.",
      body: "Eight hours is sixteen half-hour blocks. Now one piece of content takes one of them. Switch between before and now.",
      node: (
        <Waffle
          cells={16}
          label="Time to make one piece of content"
          states={[
            { label: "Before", lit: ALL, value: "8 h", aria: "Before: sixteen half-hour blocks, eight hours per piece" },
            { label: "Now", lit: [0], value: "30 min", aria: "Now: one half-hour block, thirty minutes per piece" },
          ]}
          legend={[["a", "Time spent on one piece of content"]]}
        />
      ),
    },
    {
      type: "finale", img: IMG("deep-pool"), alt: "Freedivers suspended in a deep, clear pool", section: "result", order: 60,
      k: "She lives it",
      h: "She didn't find a shortcut. She lives the discipline — and the content follows from it.",
      body: "Precision isn't a sprint she runs now and then. It's how she works. One breath, one piece.",
      facts: [["8 h → 30 min", "per piece of content"], ["4 beats", "Hook · Credibility · Core · Outro"], ["30 min", "per sprint"]],
    },
  ],
  credits: [
    ["Soleil à travers un paysage sous-marin de Bretagne (913)", "Olivier Dugornay / Ifremer", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_(Ifremer_00378-48922_-_913).jpg"],
    ["Soleil à travers un paysage sous-marin de Bretagne (905)", "Olivier Dugornay / Ifremer", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:Soleil_%C3%A0_travers_un_paysage_sous-marin_de_Bretagne_(Ifremer_00378-48922_-_905).jpg"],
    ["Freediving Platform", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_Platform_(439544289).jpg"],
    ["Freediving Competition Mandy's Record Swim", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_Competition_Mandy%27s_Record_Swim_(3615916369).jpg"],
    ["Freediving the SETT", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_the_SETT_(3073301475).jpg"],
    ["Freediving Competition Blue Fin", "jayhem", "CC BY 2.0", "https://commons.wikimedia.org/wiki/File:Freediving_Competition_Blue_Fin_(3615465135).jpg"],
  ],
};
