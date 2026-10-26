// "2026-11-07T19:00" in Stockholm → the UTC instant. People (and their
// assistants) say times the way a clock on the wall shows them; a time with
// its own offset ("…+01:00" or "…Z") is already an instant and is kept.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// Minutes the zone is ahead of UTC at that instant.
function offsetMinutes(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utcMs) / 60000;
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// → ISO string in UTC, or null when the input isn't a date/time.
export function toUtcIso(value, timeZone = "Europe/Stockholm") {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  if (HAS_OFFSET.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const m = LOCAL.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", sec = "00"] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
  if (Number.isNaN(wall)) return null;
  // Guess with the offset at the wall time, then correct once (DST edges).
  let utc = wall - offsetMinutes(wall, timeZone) * 60000;
  utc = wall - offsetMinutes(utc, timeZone) * 60000;
  return new Date(utc).toISOString();
}
