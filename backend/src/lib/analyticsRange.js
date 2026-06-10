// Shared date-range parsing for admin analytics endpoints.
// Resolve a query-string date range for any admin-analytics endpoint.
// Accepts either:
//   ?startDate=ISO&endDate=ISO   (preferred — driven by the date picker)
//   ?days=N                       (fallback — legacy callers)
// Falls back to last-30-days if neither is provided. Always returns
// midnight-local-anchored start/end so daily buckets line up cleanly.
function resolveAnalyticsRange(req) {
  let periodStart;
  let periodEnd;
  if (req.query.startDate && req.query.endDate) {
    periodStart = new Date(req.query.startDate);
    periodEnd = new Date(req.query.endDate);
  } else {
    const days = Math.min(
      Math.max(parseInt(req.query.days) || 30, 1),
      365,
    );
    periodEnd = new Date();
    periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days + 1);
  }
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(23, 59, 59, 999);
  const days = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000),
  );
  return { periodStart, periodEnd, days };
}
export { resolveAnalyticsRange };
