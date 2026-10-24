// "Add to calendar" for an event: an .ics file (Apple Calendar, Outlook,
// anything) and a Google Calendar link. Pure, so it's tested without I/O.

const DEFAULT_HOURS = 3; // an event without an end time

export function eventEnd(ev) {
  if (ev.ends_at) return new Date(ev.ends_at);
  return new Date(new Date(ev.starts_at).getTime() + DEFAULT_HOURS * 3600000);
}

// 20261107T180000Z
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// RFC 5545 text: escape \ ; , and newlines.
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets fold onto continuation lines starting with a space.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = "";
      size = 0;
    }
    chunk += ch;
    size += n;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

export function icsFor(ev, { url = "", now = new Date() } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PullUp//Events//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@pullup.se`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(new Date(ev.starts_at))}`,
    `DTEND:${utcStamp(eventEnd(ev))}`,
    `SUMMARY:${icsText(ev.title)}`,
    ...(ev.location ? [`LOCATION:${icsText(ev.location)}`] : []),
    `DESCRIPTION:${icsText([ev.text, url].filter(Boolean).join("\n\n"))}`,
    ...(url ? [`URL:${url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(ev, { url = "" } = {}) {
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title || "",
    dates: `${utcStamp(new Date(ev.starts_at))}/${utcStamp(eventEnd(ev))}`,
    details: [ev.text ? ev.text.slice(0, 900) : "", url].filter(Boolean).join("\n\n"),
    location: ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${qs}`;
}
