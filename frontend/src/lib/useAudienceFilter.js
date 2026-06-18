import { useMemo, useState } from "react";

// The audience builder, shared verbatim by the Messages dock and the Room's
// "Your people" view so the two filter the SAME way from the SAME /host/room
// payload. Logic lives here; each surface renders its own (dark dock / light
// page) chrome on top. Stackable filters: ANDed across dimensions, OR within.

// The People lens — a single relationship/status edge per person.
export const PEOPLE_LENSES = [
  ["all", "Everyone"],
  ["community", "Community"],
  ["guests", "Event guests"],
  ["tickets", "Ticket buyers"],  // paid for an event ticket
  ["products", "Product buyers"], // bought a product page
  ["pulledup", "Pulled up"],     // actually showed up to an event
];
export const ATTENDANCE = [["all", "All"], ["going", "Going"], ["waitlist", "Waitlist"], ["pulledup", "Pulled up"]];
export const CHANNEL_KEYS = ["whatsapp", "instagram", "email"];
export const CHANNEL_LABELS = { whatsapp: "WhatsApp", instagram: "Instagram", email: "Email" };
const CHANNEL_LABEL = CHANNEL_LABELS;

// The rails a person is reachable on (server-enumerated; preferred-channel floor).
function reachOf(p) { return p?.reachable?.length ? p.reachable : [p?.channel || "email"]; }
function searchHay(p) {
  return [p.name, p.email, p.phone || p.phone_e164, p.instagram, p.relationship]
    .filter(Boolean).join(" ").toLowerCase();
}

export function useAudienceFilter(people = [], events = []) {
  const [channels, setChannels] = useState([]);     // [] = any
  const [eventIds, setEventIds] = useState([]);      // [] = any
  const [attendance, setAttendance] = useState("all"); // all | going | waitlist
  const [segment, setSegment] = useState("all");     // PEOPLE_LENSES key
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    let ps = [...(people || [])];
    if (channels.length) ps = ps.filter((p) => reachOf(p).some((c) => channels.includes(c)));
    if (segment === "community") ps = ps.filter((p) => p.isCommunityMember);
    else if (segment === "guests") ps = ps.filter((p) => p.hasEventRsvp);
    else if (segment === "tickets") ps = ps.filter((p) => p.hasTicket);
    else if (segment === "products") ps = ps.filter((p) => p.hasPurchased);
    else if (segment === "pulledup") ps = ps.filter((p) => p.pulledUp);
    if (eventIds.length) ps = ps.filter((p) => eventIds.some((eid) => {
      const st = (p.eventStatus || {})[eid]; // "going" | "waitlist" | "attended"
      if (!st) return false;
      // A clean partition so the states don't overlap: Going = confirmed but no
      // pull-up recorded, Waitlist = still waiting, Pulled up = actually showed.
      if (attendance === "going") return st === "going";
      if (attendance === "waitlist") return st === "waitlist";
      if (attendance === "pulledup") return st === "attended";
      return true; // all
    }));
    const s = q.trim().toLowerCase();
    if (s) ps = ps.filter((p) => searchHay(p).includes(s));
    return ps;
  }, [people, channels, segment, eventIds, attendance, q]);

  const activeCount = (channels.length ? 1 : 0) + (eventIds.length ? 1 : 0)
    + (segment !== "all" ? 1 : 0) + (eventIds.length && attendance !== "all" ? 1 : 0);

  const summary = useMemo(() => {
    const parts = [];
    if (eventIds.length) {
      const titles = eventIds.map((id) => (events || []).find((e) => e.id === id)?.title).filter(Boolean);
      parts.push(titles.length <= 2 ? titles.join(" + ") : `${titles.length} events`);
      const attLabel = Object.fromEntries(ATTENDANCE)[attendance];
      if (attendance !== "all" && attLabel) parts.push(attLabel);
    }
    const segLabel = Object.fromEntries(PEOPLE_LENSES)[segment];
    if (segment !== "all" && segLabel) parts.push(segLabel);
    if (channels.length) parts.push(channels.map((c) => CHANNEL_LABEL[c] || c).join(" / "));
    return parts;
  }, [eventIds, attendance, segment, channels, events]);

  return {
    channels, eventIds, attendance, segment, q,
    setAttendance, setSegment, setQ,
    toggleChannel: (c) => setChannels((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c])),
    clearChannels: () => setChannels([]),
    toggleEvent: (id) => setEventIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    clearEvents: () => setEventIds([]),
    clear: () => { setChannels([]); setEventIds([]); setAttendance("all"); setSegment("all"); },
    list, activeCount, summary,
  };
}
