// frontend/src/components/room/roomFixtures.js
//
// Seeded "fake reality" for designing The Room against lived data instead of
// empty states. This is dummy data ONLY — a believable multi-channel cast for
// one dummy event. When the real backend lands, this file is replaced by a
// /events/:id/room endpoint returning the same shape.
//
// The shape encodes the vision (see "The Room" direction, 2026-05-31):
//   * read       — PullUp's plain-language sentence about this person. The
//                   relationship surfaced as a FEELING, never a stage badge.
//   * warmth     — 0..1 backstage signal used for ranking + the subtle heat
//                   dot. The host never sees a number or a column.
//   * needsYou + move — the one suggested next action, if any.
//   * channel + windowOpen — which rail this person is reachable on RIGHT
//                   NOW. IG/WA windows close; email is always reachable.
//   * stage      — backstage only (coming/curious/new/potential/waitlist).
//                   Used to rank + decide what the thread shows; NOT a label.

export const ROOM_EVENT = {
  id: "dummy",
  title: "Sunset Rooftop Sessions — Vol. 4",
  when: "Saturday, 18:00",
  venue: "Soder rooftop (address on RSVP)",
  comingCount: 34,
  capacity: 50,
};

// PullUp's chief-of-staff read of the whole room.
//
// Resolved the brief-vs-cards redundancy: instead of a paragraph that re-lists
// the same people as the cards below, the brief is now a TIGHT note — one calm
// pulse line + the single most time-sensitive thing — followed by a few
// tappable "moves" that jump straight to a person's thread. So the brief stops
// echoing the list and becomes the way INTO it: PullUp points, you go.
//
//   lead   — the room's pulse, calm ink.
//   urgent — the one thing with a closing clock; links to a person.
//   moves  — quick entry points; each opens that person's thread.
export const ROOM_BRIEF = {
  lead: "34 coming, 16 spots left.",
  urgent: {
    personId: "p_sara",
    text: "Sara's WhatsApp window is closing and she's asking about parking — catch her now.",
  },
  moves: [
    { personId: "p_adam", label: "Adam wants a +1", hint: "easy yes" },
    { personId: "p_lina", label: "Lina keeps peeking", hint: "nudge her" },
    { personId: "p_emma", label: "Emma's waitlisted", hint: "a spot opened" },
    { personId: "p_marcus", label: "Marcus would love this", hint: "invite" },
  ],
};

export const ROOM_PEOPLE = [
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
    stage: "coming",
    read: "A regular — came to your last three. Basically family at this point.",
    signals: ["Came to 3 of your events", "Confirmed +1", "Reached on 3 channels"],
    needsYou: true,
    move: "Reply about parking",
    lastMessage: {
      from: "them",
      text: "is there parking nearby or should I take the metro?",
      time: "1h ago",
    },
    // One conversation, three rails. Found you on Instagram, RSVP'd by email,
    // now chatting on WhatsApp — the host sees it as a single thread.
    thread: [
      { from: "them", text: "saw your story — is Vol 4 happening?? 🙌", time: "5 days ago", channel: "instagram" },
      { from: "you", text: "Sara!! yes, this Saturday — sending you the link", time: "5 days ago", channel: "instagram" },
      { from: "system", text: "Sara opened the event page and RSVP'd — confirmed, bringing 1.", time: "3 days ago", channel: "email" },
      { from: "you", text: "So glad you're in again. Bringing someone?", time: "3 days ago", channel: "email" },
      { from: "them", text: "always 🙂 my flatmate this time", time: "2 days ago", channel: "whatsapp" },
      { from: "them", text: "is there parking nearby or should I take the metro?", time: "1h ago", channel: "whatsapp" },
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
    windowNote: "open - 21h left",
    warmth: 0.95,
    stage: "coming",
    read: "Your most loyal — four events running. Tells his friends about you.",
    signals: ["Came to 4 of your events", "Found you on Instagram"],
    needsYou: true,
    move: "Say yes to his +1",
    lastMessage: {
      from: "them",
      text: "can I bring my friend Noah? he's been wanting to come",
      time: "4h ago",
    },
    thread: [
      { from: "them", text: "yooo Vol 4 let's go", time: "1 day ago", channel: "instagram" },
      { from: "you", text: "Adam!! of course, locked you in", time: "1 day ago", channel: "instagram" },
      { from: "them", text: "can I bring my friend Noah? he's been wanting to come", time: "4h ago", channel: "instagram" },
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
    warmth: 0.58,
    stage: "curious",
    read: "Came once, last spring. Keeps opening the page today but hasn't said yes — on the fence.",
    signals: ["Opened the page 3x today", "Came to 1 event"],
    needsYou: true,
    move: "Send a warm nudge",
    lastMessage: {
      from: "system",
      text: "Viewed the event page — 3rd time today",
      time: "20m ago",
    },
    thread: [
      { from: "system", text: "Lina came to Vol. 1 last spring.", time: "1 year ago" },
      { from: "system", text: "Opened Vol. 4 page — 1st visit", time: "2 days ago" },
      { from: "system", text: "Opened the page again — 3rd time today", time: "20m ago" },
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
    windowNote: "open - 6h left",
    warmth: 0.4,
    stage: "new",
    read: "New to you — found you through the comment-to-DM on your reel yesterday.",
    signals: ["Joined via Instagram comment", "First time"],
    needsYou: true,
    move: "Welcome him before the window closes",
    lastMessage: {
      from: "system",
      text: "Got the signup link from your reel, then RSVP'd",
      time: "18h ago",
    },
    thread: [
      { from: "them", text: "link?", time: "18h ago", channel: "instagram" },
      { from: "system", text: "Auto-sent the signup link (comment trigger).", time: "18h ago" },
      { from: "system", text: "Tobias RSVP'd — confirmed.", time: "18h ago" },
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
    warmth: 0.5,
    stage: "coming",
    read: "Was a regular, then went quiet for two events. She's back for this one — worth noticing.",
    signals: ["Came to 2 early events", "Quiet for ~5 months"],
    needsYou: false,
    move: null,
    lastMessage: {
      from: "system",
      text: "Priya RSVP'd — confirmed.",
      time: "Yesterday",
    },
    thread: [
      { from: "system", text: "Priya came to Vol. 1 and Vol. 2.", time: "Last year" },
      { from: "system", text: "Priya RSVP'd for Vol. 4 — confirmed.", time: "Yesterday" },
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
    stage: "potential",
    read: "Not invited yet — but he's in your world and came to two rooftop nights like this. He'd get it.",
    signals: ["In your people", "Matches this event's crowd"],
    needsYou: true,
    move: "Invite him",
    lastMessage: null,
    thread: [
      { from: "system", text: "Marcus is in your people — came to 2 similar events with mutual friends.", time: "--" },
    ],
  },
  {
    id: "p_emma",
    reachable: ["email"],
    name: "Emma Sjo",
    handle: "emma.sjo@hey.com",
    initials: "ES",
    color: "#db2777",
    channel: "email",
    windowOpen: null,
    windowNote: null,
    warmth: 0.62,
    stage: "waitlist",
    read: "On the waitlist and keen — emailed asking if a spot's opened. Two cancellations today, actually.",
    signals: ["On waitlist", "Asked to get in"],
    needsYou: true,
    move: "Offer her a freed spot",
    lastMessage: {
      from: "them",
      text: "any chance a spot opens up? would love to be there",
      time: "5h ago",
    },
    thread: [
      { from: "system", text: "Event full — Emma joined the waitlist.", time: "4 days ago" },
      { from: "them", text: "any chance a spot opens up? would love to be there", time: "5h ago" },
    ],
  },
  {
    id: "p_jonas",
    reachable: ["whatsapp", "email"],
    name: "Jonas Wikstrom",
    handle: "@jonasw",
    initials: "JW",
    color: "#0d9488",
    channel: "whatsapp",
    windowOpen: false,
    windowNote: "closed",
    warmth: 0.7,
    stage: "coming",
    read: "Locked in and paid, bringing two. Reliable — shows up early every time.",
    signals: ["Paid - party of 3", "Came to 2 events"],
    needsYou: false,
    move: null,
    lastMessage: {
      from: "system",
      text: "Payment confirmed — party of 3.",
      time: "2 days ago",
    },
    thread: [
      { from: "system", text: "Jonas RSVP'd + paid — party of 3.", time: "2 days ago" },
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
    windowNote: "open - 11h left",
    warmth: 0.45,
    stage: "curious",
    read: "Mid-conversation in your DMs — curious but hasn't signed up yet. The window's still open.",
    signals: ["DMing now", "Hasn't RSVP'd"],
    needsYou: true,
    move: "Send her the link",
    lastMessage: {
      from: "them",
      text: "is it the same vibe as the last one? loved those photos",
      time: "2h ago",
    },
    thread: [
      { from: "them", text: "heyy is Vol 4 open to anyone?", time: "3h ago", channel: "instagram" },
      { from: "you", text: "hey Nadia! yes — would love to have you", time: "2h ago", channel: "instagram" },
      { from: "them", text: "is it the same vibe as the last one? loved those photos", time: "2h ago", channel: "instagram" },
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
    warmth: 0.25,
    stage: "curious",
    read: "Said no to the last one, but he's looking at this page again. Maybe the timing's better now.",
    signals: ["Declined Vol. 3", "Reopened the page"],
    needsYou: false,
    move: null,
    lastMessage: {
      from: "system",
      text: "Viewed the event page",
      time: "Yesterday",
    },
    thread: [
      { from: "system", text: "David declined Vol. 3.", time: "2 months ago" },
      { from: "system", text: "David opened the Vol. 4 page.", time: "Yesterday" },
    ],
  },
];
