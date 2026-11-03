import { COVERS } from "./agencyData.js";

/* Real words from real people ONLY: an entry with `quote: null` is a reserved
   slot and never renders. Paste the person's own words in when they send them
   (English here = translation; the Swedish dictionary holds the original).
   `photo` lives in public/landing/people/. */
export const WORDS = [
  {
    who: "Sebastian Ramsay",
    org: "STIGA",
    photo: "/landing/people/sebastian-ramsay.jpg",
    quote: "PullUp gets straight to work, with extremely high integrity and an insanely good work ethic. They know a lot about a lot, everything from building systems to sitting and tinkering with UGC – PullUp sorts it out!",
  },
  {
    who: "Tolga Duran",
    org: "Founder, BKM Health",
    photo: "/landing/people/tolga-duran.jpg",
    lead: "PullUp is a machine.",
    quote: "Everything in marketing. Content, tracking, analytics, e-commerce — they know it by heart.",
  },
  {
    who: "Emma Lerider Harrsson",
    org: "POC",
    photo: "/landing/people/emma-lerider-harrsson.jpg",
    lead: "Everyone should have a PullUp.",
    quote: "If you're weighing hiring someone versus bringing in PullUp, PullUp is 10x the value you actually want. Just sayin'.",
  },
  {
    who: "Li Karlsén",
    org: "BKM Health",
    photo: "/landing/people/li-karlsen.jpg",
    // ⚠️ Felix's draft wording, put back by Felix 2026-10-21 while Li is asked
    // for her own (she has seen it). Replace with her words when they come.
    quote: "Felix sees the whole picture, but he can also go down to the millimetre to be precise and exact. I love that.",
  },
  {
    who: "Adam Flambo",
    org: "Creator",
    photo: COVERS["adam-flambo"],
    quote: "That's how I see you. Besides being super chill guys, you're the ones who set up my studio in a single day while I stood there navel-gazing. That's what you wish clients understood — that you're fucking makers. Action takers.",
  },
];
