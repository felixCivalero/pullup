// The sales sheet → what the /admin/sales page shows. Pure: rows in, summary
// out, so it can be tested without Google. Columns are found by their header
// text, so moving a column in the sheet doesn't break anything; renaming one
// does.

export const STAGES = ["Not contacted", "Emailed", "Followed up", "Replied", "Meeting booked", "Proposal sent", "Won", "Lost", "Not a fit"];
const CLOSED = new Set(["Won", "Lost", "Not a fit"]);
const ANSWERED = new Set(["Replied", "Meeting booked", "Proposal sent", "Won"]);
const MET = new Set(["Meeting booked", "Proposal sent", "Won"]);

export const FOLLOW_UP_AFTER_DAYS = 5;
export const QUEUE_SIZE = 10;

// "2026-10-21", "2026-10-21 09:00" or a Sheets serial number → "2026-10-21".
export function toDay(v) {
  if (typeof v === "number" && v > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? "").trim());
  return m ? m[1] : null;
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const stockholmToday = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

// Header row + data rows → objects keyed by header. Blank rows are dropped.
export function rowsToObjects(values) {
  const [header = [], ...rows] = values;
  const keys = header.map((h) => String(h).trim());
  return rows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

// The goal block on the Overview tab: a label in column A, its value in B.
export function readGoal(overviewRows) {
  const byLabel = new Map(overviewRows.map((r) => [String(r[0] ?? "").trim(), r[1]]));
  const start = toDay(byLabel.get("Start date"));
  const end = toDay(byLabel.get("End date"));
  const perDay = Number(byLabel.get("Emails per day")) || 0;
  return start && end && perDay > 0 ? { start, end, perDay } : null;
}

const text = (v) => String(v ?? "").trim();

// Priority 0 = hand-picked, goes first; blank or junk sorts last.
const priorityOf = (v) => (text(v) === "" || Number.isNaN(Number(v)) ? 9 : Number(v));

function prospectOf(o) {
  return {
    id: text(o.ID),
    priority: priorityOf(o.Priority),
    company: text(o.Company),
    person: text(o["Person(s)"]),
    sector: text(o.Sector),
    location: text(o.Location),
    why: text(o["Why PullUp"]),
    email: text(o.Email),
    emailType: text(o["Email type"]),
    stage: STAGES.includes(text(o.Stage)) ? text(o.Stage) : "Not contacted",
    dateSent: toDay(o["Date sent"]),
    lastContact: toDay(o["Last contact"]),
    nextStep: text(o["Next step"]),
    nextStepDate: toDay(o["Next step date"]),
    value: Number(o["Value (SEK/mo)"]) || 0,
    deadline: toDay(o.Deadline), // a job ad's last day: reach them before they hire
    source: text(o.List),
  };
}

export function summarizeSales({ prospectRows, logRows = [], overviewRows = [], today }) {
  const prospects = rowsToObjects(prospectRows).map(prospectOf).filter((p) => p.company);
  const goal = readGoal(overviewRows);

  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const p of prospects) stageCounts[p.stage] += 1;

  const sentByDay = new Map();
  for (const p of prospects) if (p.dateSent) sentByDay.set(p.dateSent, (sentByDay.get(p.dateSent) || 0) + 1);

  const contacted = prospects.filter((p) => p.dateSent || p.stage !== "Not contacted");
  const answered = contacted.filter((p) => ANSWERED.has(p.stage)).length;
  const met = contacted.filter((p) => MET.has(p.stage)).length;

  let plan = null;
  if (goal) {
    const days = daysBetween(goal.start, goal.end) + 1;
    const series = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(goal.start, i);
      series.push({ date, sent: sentByDay.get(date) || 0, future: date > today });
    }
    const sent = series.reduce((n, d) => n + d.sent, 0);
    const elapsed = today < goal.start ? 0 : Math.min(days, daysBetween(goal.start, today) + 1);
    const daysLeft = today > goal.end ? 0 : days - (today < goal.start ? 0 : elapsed - 1); // today counts as left
    const target = days * goal.perDay;
    // Today is still in progress: it only counts toward the pace once it's
    // over, or as far as it's already been done.
    const inPlanToday = today >= goal.start && today <= goal.end;
    const expected = (inPlanToday ? elapsed - 1 : elapsed) * goal.perDay
      + (inPlanToday ? Math.min(goal.perDay, sentByDay.get(today) || 0) : 0);
    plan = {
      ...goal,
      days,
      target,
      sent,
      expected,
      delta: sent - expected,
      daysLeft,
      neededPerDay: daysLeft > 0 ? Math.ceil(Math.max(0, target - sent + (sentByDay.get(today) || 0)) / daysLeft) : 0,
      series,
    };
  }

  const reachable = (p) => p.email.includes("@");
  // Untouched prospects still worth a first email. A job ad that closed
  // before we wrote is gone: they've hired.
  const open = (p) => p.stage === "Not contacted" && !p.dateSent && !(p.deadline && p.deadline < today);
  // Priority first (0 = hand-picked or hiring now), then the closest
  // deadline, then sheet order.
  const byUrgency = (a, b) => a.p.priority - b.p.priority
    || (a.p.deadline || "9999").localeCompare(b.p.deadline || "9999")
    || a.row - b.row;
  const ranked = prospects.map((p, row) => ({ p, row })).filter(({ p }) => open(p)).sort(byUrgency);
  const queue = ranked.filter(({ p }) => reachable(p)).slice(0, goal?.perDay || QUEUE_SIZE).map(({ p }) => p);
  // Hiring now but no address yet: find the founder/CEO before the deadline.
  const needsEmail = ranked.filter(({ p }) => !reachable(p) && p.deadline).slice(0, QUEUE_SIZE).map(({ p }) => p);
  const expired = prospects.filter((p) => p.stage === "Not contacted" && !p.dateSent && p.deadline && p.deadline < today).length;

  const followUpBy = addDays(today, -FOLLOW_UP_AFTER_DAYS);
  const followUps = prospects
    .filter((p) => p.stage === "Emailed" && (p.lastContact || p.dateSent) && (p.lastContact || p.dateSent) <= followUpBy)
    .sort((a, b) => (a.lastContact || a.dateSent).localeCompare(b.lastContact || b.dateSent));

  const toAnswer = prospects.filter((p) => p.stage === "Replied");

  const due = prospects
    .filter((p) => p.nextStepDate && p.nextStepDate <= today && !CLOSED.has(p.stage))
    .sort((a, b) => a.nextStepDate.localeCompare(b.nextStepDate))
    .map((p) => ({ ...p, overdue: p.nextStepDate < today }));

  const companyById = new Map(prospects.map((p) => [p.id, p.company]));
  const log = rowsToObjects(logRows)
    .map((o) => ({ date: toDay(o.Date), id: text(o.ID), company: companyById.get(text(o.ID)) || text(o.Company), type: text(o.Type), summary: text(o.Summary) }))
    .filter((e) => e.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  const sum = (stage) => prospects.filter((p) => p.stage === stage).reduce((n, p) => n + p.value, 0);

  return {
    today,
    sentToday: sentByDay.get(today) || 0,
    plan,
    totals: {
      prospects: prospects.length,
      reachable: prospects.filter(reachable).length,
      notContactedReachable: prospects.filter((p) => open(p) && reachable(p)).length,
      hiringOpen: prospects.filter((p) => open(p) && p.deadline).length,
      expired,
      contacted: contacted.length,
      answered,
      met,
      won: stageCounts.Won,
      proposalValue: sum("Proposal sent"),
      wonValue: sum("Won"),
    },
    stages: STAGES.map((stage) => ({ stage, count: stageCounts[stage] })),
    queue,
    needsEmail,
    toAnswer,
    followUps,
    due,
    log,
  };
}
