// Shared admin-analytics chart primitives, extracted from the AnalyticsPage
// monolith so new analytics surfaces (LandingOverview first) reuse the same
// hand-rolled SVG language instead of growing the page file. Pure moves —
// nothing here changed behavior.
import { useState } from "react";
import { colors } from "../../theme/colors.js";
import { TrendingUp, TrendingDown, Minus, Monitor, Smartphone } from "lucide-react";


export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em",
      fontWeight: 600, color: colors.textSubtle, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

export function StatPill({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: "16px", fontWeight: 600, color: color || colors.text }}>
        {value}
      </span>
      <span style={{ fontSize: "11px", color: colors.textFaded }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: "11px", color: color || colors.textFaded, fontWeight: 500 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function RateBar({ label, rate, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "11px", color: colors.textSubtle }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color }}>{rate}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: colors.borderFaint }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: color,
          width: `${Math.min(rate, 100)}%`,
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

export function ChangeIndicator({ value }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? colors.success : isDown ? colors.danger : colors.textFaded;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "11px", fontWeight: 600, color }}>
      <Icon size={12} />
      {Math.abs(value)}%
    </span>
  );
}

export const LANDING_SOURCE_COLORS = {
  direct: "rgba(10,10,10,0.45)",
  instagram: "rgba(225,48,108,0.85)",
  facebook: "rgba(66,103,178,0.85)",
  twitter: "rgba(29,155,240,0.85)",
  linkedin: "rgba(10,102,194,0.85)",
  google: "rgba(66,133,244,0.85)",
  pullup: "rgba(10,10,10,0.35)",
  other: "rgba(168,85,247,0.7)",
};

export function getLandingSourceColor(name) {
  return LANDING_SOURCE_COLORS[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

export function DeviceDonut({ mobile, desktop }) {
  const total = mobile + desktop;
  if (total === 0) return null;
  const mobileP = mobile / total;
  const r = 20, stroke = 5, cx = 28, cy = 28;
  const circ = 2 * Math.PI * r;
  const mobileArc = mobileP * circ;
  const desktopArc = (1 - mobileP) * circ;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        {/* Desktop arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={colors.accent} strokeWidth={stroke}
          strokeDasharray={`${desktopArc} ${circ}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Mobile arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={colors.secondary} strokeWidth={stroke}
          strokeDasharray={`${mobileArc} ${circ}`}
          strokeDashoffset={-desktopArc}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "11px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: colors.textMuted }}>
          <Smartphone size={11} style={{ color: colors.secondary }} />
          {mobile} <span style={{ color: colors.textFaded }}>({Math.round(mobileP * 100)}%)</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: colors.textMuted }}>
          <Monitor size={11} style={{ color: colors.accent }} />
          {desktop} <span style={{ color: colors.textFaded }}>({Math.round((1 - mobileP) * 100)}%)</span>
        </span>
      </div>
    </div>
  );
}

export function LandingDailyChart({ daily, allSources, lineOverlay, colorFor = getLandingSourceColor }) {
  const [hoverDay, setHoverDay] = useState(null);

  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const step = Math.max(1, Math.floor(daily.length / 7));
  const xLabels = daily.map((_, i) => i).filter(i => i % step === 0 || i === daily.length - 1);

  // Right-axis scale for the optional line overlay (e.g. daily signups).
  // Independent of the bar scale so a line of small numbers stays visible
  // even when the views axis is large.
  const lineByDate = lineOverlay?.byDate || null;
  const lineValues = lineByDate
    ? daily.map((d) => Number(lineByDate[d.date] || 0))
    : [];
  const maxLine = lineByDate ? Math.max(1, ...lineValues) : 1;

  const W = 720, H = 160;
  const PAD = { top: 10, right: lineOverlay ? 36 : 8, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const barWidth = Math.max(3, (chartW / daily.length) * 0.7);

  const linePoints = lineByDate
    ? daily
        .map((d, i) => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
          const v = Number(lineByDate[d.date] || 0);
          const y = PAD.top + chartH - (v / maxLine) * chartH;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  return (
    <div style={{
      borderRadius: 14, background: "#fff",
      border: `1px solid ${colors.border}`,
      padding: "14px 12px 8px", position: "relative",
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverDay(null)}
      >
        {/* Grid */}
        {[0, 0.5, 1].map(f => {
          const y = PAD.top + chartH - f * chartH;
          const val = Math.round(f * niceMax);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="rgba(10,10,10,0.07)" strokeDasharray="4,4" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fill="rgba(10,10,10,0.35)" fontSize="10">{val}</text>
              {lineOverlay && (
                <text
                  x={PAD.left + chartW + 6}
                  y={y + 3}
                  textAnchor="start"
                  fill={lineOverlay.color}
                  opacity={0.8}
                  fontSize="10"
                >
                  {Math.round(maxLine * f)}
                </text>
              )}
            </g>
          );
        })}

        {/* Stacked bars */}
        {daily.map((d, i) => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW - barWidth / 2;
          let yOffset = 0;
          const bySource = d.bySource || {};
          const segments = [];
          for (let si = allSources.length - 1; si >= 0; si--) {
            const src = allSources[si];
            const val = bySource[src] || 0;
            if (val === 0) continue;
            const segH = (val / niceMax) * chartH;
            const y = PAD.top + chartH - yOffset - segH;
            segments.push(
              <rect key={`${i}-${src}`} x={x} y={y} width={barWidth} height={segH}
                rx={yOffset === 0 ? 2 : 0} fill={colorFor(src)} />
            );
            yOffset += segH;
          }
          return (
            <g key={i} onMouseEnter={() => setHoverDay(i)}>
              <rect x={PAD.left + (i / (daily.length - 1 || 1)) * chartW - chartW / daily.length / 2}
                y={PAD.top} width={chartW / daily.length} height={chartH}
                fill="transparent" style={{ cursor: "crosshair" }} />
              {segments}
            </g>
          );
        })}

        {/* Optional line overlay (e.g. daily signups). Drawn after bars so
            it sits on top, with its own scale on the right axis. */}
        {lineOverlay && linePoints && (
          <>
            <polyline
              points={linePoints}
              fill="none"
              stroke={lineOverlay.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {daily.map((d, i) => {
              const v = Number(lineByDate[d.date] || 0);
              const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
              const y = PAD.top + chartH - (v / maxLine) * chartH;
              return (
                <circle
                  key={`lp-${d.date}`}
                  cx={x}
                  cy={y}
                  r={1.6}
                  fill={lineOverlay.color}
                  opacity={0.85}
                />
              );
            })}
          </>
        )}

        {/* Hover line */}
        {hoverDay !== null && (
          <line
            x1={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y1={PAD.top}
            x2={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y2={PAD.top + chartH}
            stroke="rgba(10,10,10,0.12)" strokeWidth="1"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map(i => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
          const label = new Date(daily[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return <text key={i} x={x} y={H - 4} textAnchor="middle" fill="rgba(10,10,10,0.35)" fontSize="10">{label}</text>;
        })}
      </svg>

      {/* Tooltip */}
      {hoverDay !== null && daily[hoverDay] && (
        <div style={{
          position: "absolute",
          left: `${((PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW) / W) * 100}%`,
          top: 12,
          transform: `translateX(${hoverDay > daily.length * 0.65 ? "calc(-100% - 10px)" : "10px"})`,
          background: "#fff", border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: "8px 12px", fontSize: "12px", color: colors.text,
          lineHeight: 1.6, boxShadow: "0 4px 16px rgba(10,10,10,0.10)", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {new Date(daily[hoverDay].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
          <div style={{ color: colors.textMuted }}>{daily[hoverDay].views} unique visitors</div>
          {lineOverlay && (
            <div
              style={{
                color: lineOverlay.color,
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 2,
                  background: lineOverlay.color,
                  flexShrink: 0,
                }}
              />
              <span>
                {lineOverlay.label}:{" "}
                {Number(lineByDate[daily[hoverDay].date] || 0)}
              </span>
            </div>
          )}
          {Object.entries(daily[hoverDay].bySource || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: 1, background: colorFor(src), flexShrink: 0 }} />
              <span style={{ color: colors.textSubtle }}>{src}: {count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {(allSources.length > 0 || lineOverlay) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingLeft: PAD.left }}>
          {allSources.map(src => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", color: colors.textSubtle }}>
              <div style={{ width: 7, height: 7, borderRadius: 1.5, background: colorFor(src) }} />
              {src}
            </div>
          ))}
          {lineOverlay && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", color: colors.textMuted }}>
              <div style={{ width: 14, height: 2, background: lineOverlay.color }} />
              {lineOverlay.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
