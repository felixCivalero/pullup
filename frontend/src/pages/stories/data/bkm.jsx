import { Flow, Outcome, Rhythm, Steps } from "../../../components/agency/story/StoryKit.jsx";

/* BKM Health — the whole brand: vision and strategy as one red thread, kept
   moving by 30-minute sprints; every event planned so its community post went
   out the same day; a flow for the ambassadors to tell deep stories.
   Facts: 0 → 10,000+ followers in one year — NEVER "organic", not all of them
   were (Felix 2026-10-21); several million views across channels (words, no
   exact figure); founder Tolga Duran (always the one founder — Felix 2026-10-21); pace up to two edited pieces a week +
   a production day about monthly; sales and subscriptions growing
   exponentially (words only). No freediving and no quote from Li (her wish,
   2026-10-19) — Li's own format has its own story, Week-Li. No photographs on the
   page; the overview card has a stock cover (COVERS), credited below. */

export default {
  slug: "bkm",
  theme: { surface: "#3D2A0E", mid: "#2A1D0A", deep: "#1A1206", abyss: "#0E0A04", a: "#B7832A", ai: "#E8B86A", b: "#2AA3C9", glow: "183,131,42" },
  hero: {
    sub: "Tolga Duran had a vision for BKM and no audience. Together we built one red thread — vision, strategy and a 30-minute rhythm — and the structures that turned every event and every ambassador into content.",
    facts: [["10,000+", "followers in one year"], ["Millions", "of views across channels"], ["30 min", "per sprint"]],
  },
  chapters: [["top", "BKM"], ["thread", "Red thread"], ["sprint", "30 minutes"], ["events", "Events"], ["ambassadors", "Ambassadors"], ["result", "Result"]],
  blocks: [
    {
      type: "band", anchor: "thread", tone: "mid", layout: "split-wide", tight: true, section: "figure_thread", order: 10,
      k: "The foundation", h: "One red thread, before any content.",
      body: "Tolga and I set vision, strategy and what BKM stands for first — so every sprint, every event and every story could be held up against the same line.",
      node: (
        <Steps
          items={[
            ["Vision", "Where BKM is going", "The picture BKM is building towards, said plainly enough that anyone on the team can repeat it."],
            ["Strategy", "How it gets there", "Who BKM is for, what it says and where — the choices that decide what gets made, and what doesn't."],
            ["The red thread", "What ties it together", "One line every post, event and story traces back to. If it doesn't, it doesn't go out."],
          ]}
        />
      ),
    },
    {
      type: "band", anchor: "sprint", tone: "deep", layout: "stack", tight: true, section: "figure_rhythm", order: 20,
      k: "The rhythm", h: "Thirty minutes, on repeat.",
      body: "No long brainstorms. Short, focused 30-minute sprints together, the same every time, kept the thread moving week after week. The pace settled at up to two edited pieces a week, with a production day about once a month.",
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
      type: "band", anchor: "events", tone: "mid", layout: "stack", tight: true, section: "figure_events", order: 30,
      k: "Events", h: "Every event a community post — the same day.",
      body: "We planned every event with the post in mind. Together we set a fixed structure for what to capture and who to feature, so the community post went out the same day, not a week later.",
      node: (
        <Flow
          items={[
            ["Before the event", "Planned for the post", "What to capture, who to feature and what the post should say — settled before the doors open."],
            ["At the event", "Captured by the structure", "Everyone knows the shots and the moments. Nothing depends on someone remembering."],
            ["Same day", "Out to the community", "The post goes out while the event is still fresh — for the people who were there, and the ones who weren't."],
          ]}
        />
      ),
    },
    {
      type: "band", anchor: "ambassadors", tone: "deep", layout: "stack", tight: true, section: "figure_ambassadors", order: 40,
      k: "Ambassadors", h: "Deep stories, told so people stay.",
      body: "BKM's ambassadors had stories worth hearing. Together we set up a flow that helped them tell those stories in depth — and in a way that holds attention. Across channels, they reached several million views.",
      node: (
        <Flow
          items={[
            ["Their story", "What only they can tell", "The experience behind why they stand with BKM — the part no brand copy can write."],
            ["The flow", "A shape to tell it in", "Questions and a structure that turn a long story into one that holds from the first second to the last."],
            ["Across channels", "Several million views", "The stories ran across channels — and together reached several million views."],
          ]}
        />
      ),
    },
    {
      type: "band", anchor: "result", tone: "abyss", layout: "stack", tight: true, section: "result", order: 50,
      k: "The result",
      h: "A brand with a red thread — and 10,000+ people following it within a year.",
      body: "Built side by side, week after week. Sales and subscriptions grew exponentially alongside — the journey was the marketing. Li's own format for BKM, Week-Li, is a story of its own.",
      node: <Outcome link={["Week-Li: BKM's format with Li", "li-karlsen"]} />,
    },
  ],
  creditNote: "The cover photo on the overview card is from Wikimedia Commons, used under the licence below.",
  credits: [
    ["Yoga at Your Park", "Mary O'Neill / NPS", "Public domain", "https://commons.wikimedia.org/wiki/File:Yoga_at_Your_Park_(f7f2960d-c205-496f-bf97-77f884b43779).jpg"],
  ],
};
