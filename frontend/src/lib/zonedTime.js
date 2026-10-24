// Wall-clock time in a given time zone ↔ an instant, for <input type="datetime-local">.
// The admin types "2026-11-07T19:00" meaning Stockholm time, wherever the
// laptop happens to be.

function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return p;
}

// ISO instant → "YYYY-MM-DDTHH:mm" as the clock reads in `tz`.
export function toZonedInput(iso, tz = "Europe/Stockholm") {
  if (!iso) return "";
  const p = partsIn(new Date(iso), tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// "YYYY-MM-DDTHH:mm" read in `tz` → ISO instant.
export function fromZonedInput(local, tz = "Europe/Stockholm") {
  if (!local) return null;
  const [d, t] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = (t || "00:00").split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, da, h, mi);
  // The zone's offset at that moment, applied twice to land right across DST.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess = asUtc - (shown - guess);
  }
  return new Date(guess).toISOString();
}

// "lördag 7 november, 19:00–23:00"
export function formatEventWhen(startsAt, endsAt, tz = "Europe/Stockholm", { year = false } = {}) {
  if (!startsAt) return "";
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, weekday: "long", day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}) }).format(new Date(startsAt));
  const time = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  return `${day}, ${time(startsAt)}${endsAt ? `–${time(endsAt)}` : ""}`;
}
