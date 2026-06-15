import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors.js";
import { DateRangePicker } from "../components/DateRangePicker.jsx";
import { LandingOverview } from "./analytics/LandingOverview.jsx";
import { RoomsOverview } from "./analytics/RoomsOverview.jsx";

// Past-only quick ranges for the analytics date picker — the full calendar UX
// with custom ranges plus the common presets.
function buildLastDays(n) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - n + 1);
  start.setHours(0, 0, 0, 0);
  return [start, end];
}
const ANALYTICS_QUICK_RANGES = [
  { label: "Last 7 days", getRange: () => buildLastDays(7) },
  { label: "Last 14 days", getRange: () => buildLastDays(14) },
  { label: "Last 30 days", getRange: () => buildLastDays(30) },
  { label: "Last 60 days", getRange: () => buildLastDays(60) },
  { label: "Last 90 days", getRange: () => buildLastDays(90) },
];

export function AnalyticsPage() {
  const { loading } = useAuth();

  // Two views: the Landing overview (the front door) and the Rooms overview
  // (are rooms alive). Both are bound to the date range below.
  const [tab, setTab] = useState("landing");

  // Single date range drives every time-bound query on this page. Default:
  // last 30 days. Admin picks via the DateRangePicker at the top.
  const [dateRange, setDateRange] = useState(() => {
    const [s, e] = buildLastDays(30);
    return { startDate: s, endDate: e };
  });

  if (loading) return null;

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        padding: "72px clamp(12px, 3vw, 24px) 60px",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
              Analytics
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: colors.textSubtle }}>
              {tab === "landing"
                ? "The front door — visits, scroll depth and host signups."
                : "Are rooms alive — reach, pulse and afterlife."}
            </p>
          </div>
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
            allowPast
            blockFuture
            quickRanges={ANALYTICS_QUICK_RANGES}
          />
        </div>

        {/* Tab strip */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "landing", label: "Landing" },
            { key: "rooms", label: "Rooms" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "6px 16px",
                borderRadius: "999px",
                border: tab === t.key ? `1px solid ${colors.accentBorder}` : `1px solid transparent`,
                background: tab === t.key ? colors.accentSoft : "transparent",
                color: tab === t.key ? colors.accent : colors.textSubtle,
                fontSize: "13px",
                fontWeight: tab === t.key ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "landing" && <LandingOverview dateRange={dateRange} />}

        {tab === "rooms" && <RoomsOverview dateRange={dateRange} />}
      </div>
    </div>
  );
}
