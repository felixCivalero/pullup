// frontend/src/components/room/roomGlobalFixtures.js
//
// Seeded "fake reality" for the GLOBAL Room — the home of PullUp.
//
// The inversion (see north star "The Room IS PullUp", 2026-05-31): the person
// is the atom, events are content that pours touchpoints into each person's
// timeline. So this fixture is PEOPLE-centric and spans MANY events — Sara's
// arc runs Vol.1 → quiet → Vol.4, which only makes sense globally.
//
// Two things drive the screen:
//   * SIGNALS — living nudges that come find the host ("3 new RSVPs, two
//     regulars"), the IG-notification trick. NOT a dashboard. This is what the
//     Room opens with.
//   * PEOPLE — each a single identity stitched across IG/phone/email, carrying
//     a cross-event timeline. Ranked by who-needs-you, then warmth.
//
// `events` powers the event-LENS: the host can drop an event over the global
// Room to focus it ("show my world, focused on Vol. 4") without leaving home.

export const HOST = {
  name: "Maya",
  peopleCount: 214,
  handle: "@maya.hosts",
  avatar: null, // falls back to initials/eyes in the masthead
  role: "Rooftop nights · Stockholm",
};

// The events are content pieces. Each person references the events they've
// touched by id, so the lens can filter the global Room down to one.
export const EVENTS = [
  { id: "vol4", title: "Sunset Rooftop · Vol. 4", when: "This Saturday", status: "live", comingCount: 34, capacity: 50, poster: "linear-gradient(150deg, #ff8a4c 0%, #ec178f 62%, #7b2ff7 120%)" },
  { id: "dinner", title: "Long-table Dinner", when: "In 3 weeks", status: "live", comingCount: 11, capacity: 16, poster: "linear-gradient(150deg, #fbbf24 0%, #f97316 60%, #b91c1c 120%)" },
  { id: "vol3", title: "Sunset Rooftop · Vol. 3", when: "Last month", status: "past", comingCount: 41, capacity: 41, poster: "linear-gradient(150deg, #f9a8d4 0%, #c084fc 70%, #6366f1 120%)" },
  { id: "vol1", title: "Sunset Rooftop · Vol. 1", when: "Last spring", status: "past", comingCount: 22, capacity: 30, poster: "linear-gradient(150deg, #5eead4 0%, #38bdf8 60%, #6366f1 120%)" },
];

// SIGNALS — what just happened, surfaced as living nudges. Each can point at a
// person (opens their thread) or an event (drops the lens). `kind` tints it:
//   urgent  — has a closing clock / needs a human now
//   warm    — a good thing worth savoring (a regular returned, a milestone)
//   plain   — neutral pulse
export const SIGNALS = [
  {
    id: "s1",
    kind: "urgent",
    text: "Sara's asking about parking and her WhatsApp window is closing — catch her now.",
    personId: "p_sara",
    time: "1h ago",
  },
  {
    id: "s2",
    kind: "warm",
    text: "Priya's back after going quiet for two events — she RSVP'd to Vol. 4.",
    personId: "p_priya",
    time: "Yesterday",
  },
  {
    id: "s3",
    kind: "plain",
    text: "3 new RSVPs to Vol. 4 today — two of them regulars.",
    eventId: "vol4",
    time: "Today",
  },
  {
    id: "s4",
    kind: "urgent",
    text: "Emma's waitlisted and keen — and two spots opened on Vol. 4 today.",
    personId: "p_emma",
    time: "5h ago",
  },
  {
    id: "s5",
    kind: "warm",
    text: "Tobias found you through your reel and came to his first event — say hi while his DM's open.",
    personId: "p_tobias",
    time: "18h ago",
  },
];

// PEOPLE — one identity each, cross-event. `events` lists every event they've
// touched (for the lens). `relationship` is the global feeling ("a regular",
// "new to your world", "drifting") — the read across ALL time, not one event.
export const PEOPLE = [
  {
    id: "p_sara",
    reachable: ["instagram", "email", "whatsapp"],
    name: "Sara Lindqvist",
    handle: "@saralind",
    initials: "SL",
    color: "#ec4899",
    channel: "whatsapp",
    windowOpen: true,
    windowNote: "open",
    warmth: 0.92,
    relationship: "A regular — three events and counting. Basically family.",
    events: ["vol1", "vol3", "vol4"],
    signals: ["Came to 3 events", "Confirmed +1 for Vol. 4", "Reached on 3 channels"],
    needsYou: true,
    move: "Reply about parking",
    lastMessage: { from: "them", text: "is there parking nearby or should I take the metro?", time: "1h ago" },
    thread: [
      { from: "them", text: "saw your story — is Vol 4 happening?? 🙌", time: "5 days ago", channel: "instagram" },
      { from: "you", text: "Sara!! yes, this Saturday — sending you the link", time: "5 days ago", channel: "instagram" },
      { from: "system", text: "RSVP'd to Vol. 4 — confirmed, bringing 1.", time: "3 days ago", channel: "email" },
      { from: "you", text: "So glad you're in again. Bringing someone?", time: "3 days ago", channel: "email" },
      { from: "them", text: "always 🙂 my flatmate this time", time: "2 days ago", channel: "whatsapp" },
      { from: "them", text: "is there parking nearby or should I take the metro?", time: "1h ago", channel: "whatsapp" },
    ],
  },
  {
    id: "p_priya",
    reachable: ["whatsapp", "email"],
    name: "Priya Raman",
    handle: "@priya.r",
    initials: "PR",
    color: "#d97706",
    channel: "whatsapp",
    windowOpen: false,
    windowNote: "closed",
    warmth: 0.6,
    relationship: "Was a regular early on, drifted for two events — just came back.",
    events: ["vol1", "vol3", "vol4"],
    signals: ["Came to 2 early events", "Quiet ~5 months", "Just returned"],
    needsYou: true,
    move: "Welcome her back",
    lastMessage: { from: "system", text: "RSVP'd to Vol. 4 — confirmed.", time: "Yesterday" },
    thread: [
      { from: "system", text: "Came to Vol. 1 and Vol. 3.", time: "Last year", channel: "email" },
      { from: "system", text: "Went quiet — no RSVP to the last two.", time: "5 months ago", channel: "email" },
      { from: "system", text: "RSVP'd to Vol. 4 — confirmed.", time: "Yesterday", channel: "whatsapp" },
    ],
  },
  {
    id: "p_adam",
    reachable: ["instagram", "email"],
    name: "Adam Berg",
    handle: "@adamberg",
    initials: "AB",
    color: "#8b5cf6",
    channel: "instagram",
    windowOpen: true,
    windowNote: "open · 21h left",
    warmth: 0.95,
    relationship: "Your most loyal — four events running. Brings friends.",
    events: ["vol1", "vol3", "vol4", "dinner"],
    signals: ["Came to 4 events", "Found you on Instagram", "Brings +1s"],
    needsYou: true,
    move: "Say yes to his +1",
    lastMessage: { from: "them", text: "can I bring my friend Noah? he's been wanting to come", time: "4h ago" },
    thread: [
      { from: "them", text: "yooo Vol 4 let's go", time: "1 day ago", channel: "instagram" },
      { from: "you", text: "Adam!! of course, locked you in", time: "1 day ago", channel: "instagram" },
      { from: "them", text: "can I bring my friend Noah? he's been wanting to come", time: "4h ago", channel: "instagram" },
    ],
  },
  {
    id: "p_emma",
    reachable: ["email"],
    name: "Emma Sjö",
    handle: "emma.sjo@hey.com",
    initials: "ES",
    color: "#db2777",
    channel: "email",
    windowOpen: null,
    windowNote: null,
    warmth: 0.62,
    relationship: "Keen newcomer — waitlisted for Vol. 4, hasn't made it in yet.",
    events: ["vol4"],
    signals: ["On the waitlist", "Asked to get in"],
    needsYou: true,
    move: "Offer her a freed spot",
    lastMessage: { from: "them", text: "any chance a spot opens up? would love to be there", time: "5h ago" },
    thread: [
      { from: "system", text: "Vol. 4 full — joined the waitlist.", time: "4 days ago", channel: "email" },
      { from: "them", text: "any chance a spot opens up? would love to be there", time: "5h ago", channel: "email" },
    ],
  },
  {
    id: "p_tobias",
    reachable: ["instagram", "email"],
    name: "Tobias Hane",
    handle: "@tobiashane",
    initials: "TH",
    color: "#16a34a",
    channel: "instagram",
    windowOpen: true,
    windowNote: "open · 6h left",
    warmth: 0.4,
    relationship: "New to your world — found you through a reel yesterday.",
    events: ["vol4"],
    signals: ["Joined via Instagram comment", "First event"],
    needsYou: true,
    move: "Welcome him before the window closes",
    lastMessage: { from: "system", text: "Got the signup link from your reel, then RSVP'd", time: "18h ago" },
    thread: [
      { from: "them", text: "link?", time: "18h ago", channel: "instagram" },
      { from: "system", text: "Auto-sent the signup link (comment trigger).", time: "18h ago" },
      { from: "system", text: "RSVP'd to Vol. 4 — confirmed.", time: "18h ago", channel: "email" },
    ],
  },
  {
    id: "p_lina",
    reachable: ["email"],
    name: "Lina Okafor",
    handle: "lina.okafor@gmail.com",
    initials: "LO",
    color: "#0891b2",
    channel: "email",
    windowOpen: null,
    windowNote: null,
    warmth: 0.5,
    relationship: "Came once a year ago — circling Vol. 4 but hasn't committed.",
    events: ["vol1"],
    signals: ["Opened the page 3× today", "Came to 1 event"],
    needsYou: true,
    move: "Send a warm nudge",
    lastMessage: { from: "system", text: "Viewed the Vol. 4 page — 3rd time today", time: "20m ago" },
    thread: [
      { from: "system", text: "Came to Vol. 1 last spring.", time: "1 year ago", channel: "email" },
      { from: "system", text: "Opened the Vol. 4 page — 1st visit.", time: "2 days ago", channel: "email" },
      { from: "system", text: "Opened the page again — 3rd time today.", time: "20m ago", channel: "email" },
    ],
  },
  {
    id: "p_jonas",
    reachable: ["whatsapp", "email"],
    name: "Jonas Wikström",
    handle: "@jonasw",
    initials: "JW",
    color: "#0d9488",
    channel: "whatsapp",
    windowOpen: false,
    windowNote: "closed",
    warmth: 0.72,
    relationship: "Reliable regular — paid, brings a small crew, shows up early.",
    events: ["vol3", "vol4"],
    signals: ["Paid · party of 3", "Came to 2 events"],
    needsYou: false,
    move: null,
    lastMessage: { from: "system", text: "Payment confirmed for Vol. 4 — party of 3.", time: "2 days ago" },
    thread: [
      { from: "system", text: "Came to Vol. 3.", time: "Last month", channel: "email" },
      { from: "system", text: "RSVP'd + paid for Vol. 4 — party of 3.", time: "2 days ago", channel: "whatsapp" },
    ],
  },
  {
    id: "p_nadia",
    reachable: ["instagram", "email"],
    name: "Nadia Costa",
    handle: "@nadiacosta",
    initials: "NC",
    color: "#e11d48",
    channel: "instagram",
    windowOpen: true,
    windowNote: "open · 11h left",
    warmth: 0.45,
    relationship: "Curious — mid-conversation in your DMs, hasn't signed up yet.",
    events: [],
    signals: ["DMing now", "Hasn't RSVP'd"],
    needsYou: true,
    move: "Send her the link",
    lastMessage: { from: "them", text: "is it the same vibe as the last one? loved those photos", time: "2h ago" },
    thread: [
      { from: "them", text: "heyy is Vol 4 open to anyone?", time: "3h ago", channel: "instagram" },
      { from: "you", text: "hey Nadia! yes — would love to have you", time: "2h ago", channel: "instagram" },
      { from: "them", text: "is it the same vibe as the last one? loved those photos", time: "2h ago", channel: "instagram" },
    ],
  },
  {
    id: "p_marcus",
    reachable: ["instagram"],
    name: "Marcus Ek",
    handle: "@marcusek",
    initials: "ME",
    color: "#6366f1",
    channel: "instagram",
    windowOpen: false,
    windowNote: "not contacted",
    warmth: 0.3,
    relationship: "Not yet invited — in your world, came to two nights like this with mutual friends.",
    events: [],
    signals: ["In your people", "Matches the Vol. 4 crowd"],
    needsYou: false,
    move: "Invite him",
    suggestion: true, // surfaced as a "you could invite" — a stranger, handle gently
    lastMessage: null,
    thread: [
      { from: "system", text: "In your people via mutual friends — came to 2 similar nights.", time: "—" },
    ],
  },
  {
    id: "p_david",
    reachable: ["email"],
    name: "David Holm",
    handle: "@davidholm",
    initials: "DH",
    color: "#7c3aed",
    channel: "email",
    windowOpen: null,
    windowNote: null,
    warmth: 0.28,
    relationship: "Drifting — said no to Vol. 3, but he reopened the Vol. 4 page.",
    events: ["vol1"],
    signals: ["Declined Vol. 3", "Reopened the page"],
    needsYou: false,
    move: null,
    lastMessage: { from: "system", text: "Viewed the Vol. 4 page.", time: "Yesterday" },
    thread: [
      { from: "system", text: "Came to Vol. 1.", time: "Over a year ago", channel: "email" },
      { from: "system", text: "Declined Vol. 3.", time: "2 months ago", channel: "email" },
      { from: "system", text: "Opened the Vol. 4 page.", time: "Yesterday", channel: "email" },
    ],
  },
];
