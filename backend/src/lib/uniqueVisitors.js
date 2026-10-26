// Unique visitors for Statistik. Only visitors who switched on the stats
// cookie carry a kept id (frontend lib/consent.js): on their events
// visitor_id differs from session_id (the per-page-load visit). Everyone else
// has visitor_id === session_id and is never counted as unique.
//
// Pure, no database: rows in, numbers out.

// rows: [{ visitor_id, session_id, occurred_at, event_name, props }]
// dayKeys: the chart's days in order (YYYY-MM-DD, Stockholm); dayKey: iso → key.
// Returns per day the NEW unique visitors and the running total of everyone
// counted so far (including before the first day shown), plus the answers to
// the cookie question in the period.
export function uniqueVisitors(rows, dayKeys, dayKey) {
  const firstSeen = new Map(); // visitor → earliest day key
  let yes = 0;
  let no = 0;
  const first = dayKeys[0];
  for (const r of rows) {
    const day = dayKey(r.occurred_at);
    if (r.event_name === "consent" && day >= first) {
      if (r.props?.on) yes += 1;
      else no += 1;
    }
    if (!r.visitor_id || r.visitor_id === r.session_id) continue;
    const seen = firstSeen.get(r.visitor_id);
    if (!seen || day < seen) firstSeen.set(r.visitor_id, day);
  }

  const newByDay = new Map(dayKeys.map((d) => [d, 0]));
  let before = 0;
  for (const day of firstSeen.values()) {
    if (day < first) before += 1;
    else if (newByDay.has(day)) newByDay.set(day, newByDay.get(day) + 1);
  }
  let total = before;
  const series = dayKeys.map((d) => {
    total += newByDay.get(d);
    return { date: d, newUniques: newByDay.get(d), uniquesTotal: total };
  });
  return { series, total, inPeriod: total - before, consent: { yes, no } };
}
