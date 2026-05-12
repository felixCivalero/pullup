// Pure filtering helpers — no supabase dependency. Tested in isolation.

const DAY = 24 * 60 * 60 * 1000;

export function applyHostFilters(candidates, {
  hostAccountState = "any",
  hostEventCount = "any",
  hostAccountAge = "any",
  hostLeadStatuses = [],
  sendMode = "broadcast",
  now = Date.now(),
}) {
  return candidates.filter((c) => {
    if (hostAccountState === "never" && c.last_login_at) return false;
    if (hostAccountState === "inactive30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() < 30 * DAY) return false;
    }
    if (hostAccountState === "recent30d") {
      if (!c.last_login_at) return false;
      if (now - new Date(c.last_login_at).getTime() > 30 * DAY) return false;
    }

    if (hostEventCount === "exactly0") {
      if (c.event_count !== 0) return false;
    } else if (Number(hostEventCount) >= 1) {
      if (c.event_count < Number(hostEventCount)) return false;
    }

    if (c.created_at && hostAccountAge !== "any") {
      const ageDays = (now - new Date(c.created_at).getTime()) / DAY;
      if (hostAccountAge === "lte30d" && ageDays > 30) return false;
      if (hostAccountAge === "30to90d" && (ageDays <= 30 || ageDays > 90)) return false;
      if (hostAccountAge === "gt90d" && ageDays <= 90) return false;
    }

    if (Array.isArray(hostLeadStatuses) && hostLeadStatuses.length > 0) {
      if (!c.lead_status) return false;
      if (!hostLeadStatuses.includes(c.lead_status)) return false;
    }

    if (sendMode !== "internal" && c.marketing_consent === false) return false;

    return true;
  });
}

export function dedupHostsWinning(hosts, contacts) {
  const byEmail = new Map();
  for (const h of hosts) byEmail.set(h.email, { ...h, _source: "host" });
  for (const c of contacts) {
    if (!byEmail.has(c.email)) byEmail.set(c.email, { ...c, _source: "contact" });
  }
  return Array.from(byEmail.values());
}
