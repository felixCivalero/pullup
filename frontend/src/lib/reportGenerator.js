/**
 * Generate a print-ready analytics report in a new window.
 * No dependencies — pure HTML/CSS/SVG, triggers browser print dialog.
 */

const EVENT_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#22c55e",
  "#fb923c", "#0ea5e9", "#a855f7", "#f59e0b",
];

function formatRevenue(cents, currency = 'sek') {
  if (!cents && cents !== 0) return 'N/A';
  const amount = cents / 100;
  const sym = currency === 'sek' ? ' kr' : currency === 'eur' ? '€' : currency === 'gbp' ? '£' : '$';
  const prefix = ['eur','gbp','usd'].includes(currency);
  return prefix ? `${sym}${amount.toLocaleString()}` : `${amount.toLocaleString()}${sym}`;
}

export function generateEventReport({ event, data, days, startDate: startDateArg, endDate: endDateArg }) {
  const win = window.open("", "_blank");
  if (!win) return;

  const coverImages = [
    `${window.location.origin}/pullup-brand.png`,
    `${window.location.origin}/pullup-cover-1.png`,
    `${window.location.origin}/pullup-cover-2.png`,
  ];
  const coverImage = coverImages[Math.floor(Math.random() * coverImages.length)];

  const endD = endDateArg || new Date();
  const startD = startDateArg || (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return d; })();
  const periodEnd = endD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const periodStart = startD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const eventTitle = event?.title || "Event";

  // Build chart SVG for the event
  const daily = data.daily || [];
  const sources = data.sources || [];
  const allSources = [...new Set(sources.map(s => s.source))];
  const chartSvg = buildEventChartSvg(daily, allSources);

  // Build source rows
  const sourceRowsHtml = sources.slice(0, 8).map(s => {
    const barColor = getSourceColorStatic(s.source);
    return `<div class="source-row">
      <div class="source-name" style="display:flex;align-items:center;gap:4px;"><div style="width:5px;height:5px;border-radius:1.5px;background:${barColor};flex-shrink:0;"></div>${escHtml(s.source)}</div>
      <div class="source-bar-wrap"><div class="source-bar" style="width:${s.percentage}%;background:${barColor}"></div></div>
      <div class="source-count">${s.count}</div>
      <div class="source-pct">${s.percentage}%</div>
    </div>`;
  }).join("");

  // Campaign cards
  const campaigns = data.campaigns || [];
  const campaignHtml = campaigns.length > 0 ? campaigns.slice(0, 4).map(c => {
    const funnelColors = {
      sent: "rgba(139,92,246,0.7)", opened: "rgba(59,130,246,0.7)",
      clicked: "rgba(251,191,36,0.7)", visited: "rgba(74,222,128,0.7)", rsvps: "rgba(236,72,153,0.7)",
    };
    const stages = [
      { label: "Sent", value: c.sent, color: funnelColors.sent },
      { label: "Opened", value: c.opened, rate: c.openRate, color: funnelColors.opened },
      { label: "Clicked", value: c.clicked, rate: c.clickRate, color: funnelColors.clicked },
      { label: "Visited", value: c.visited, rate: c.visitRate, color: funnelColors.visited },
      { label: "RSVPs", value: c.rsvps, rate: c.conversionRate, color: funnelColors.rsvps },
    ];
    const maxVal = Math.max(...stages.map(s => s.value), 1);
    const bars = stages.map(s => {
      const pct = Math.max(2, (s.value / maxVal) * 100);
      return `<div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;color:rgba(255,255,255,0.45);width:46px;text-align:right;flex-shrink:0;">${s.label}</span>
        <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.03);"><div style="height:100%;width:${pct}%;border-radius:4px;background:${s.color};"></div></div>
        <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.7);min-width:24px;text-align:right;">${s.value}</span>
        ${s.rate !== undefined ? `<span style="font-size:9px;color:rgba(255,255,255,0.3);min-width:30px;text-align:right;">${s.rate}%</span>` : `<span style="min-width:30px;"></span>`}
      </div>`;
    }).join("");
    return `<div style="padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
      <div style="font-size:11px;font-weight:600;color:#fff;margin-bottom:6px;">${escHtml(c.name)}</div>
      <div style="display:flex;flex-direction:column;gap:3px;">${bars}</div>
    </div>`;
  }).join("") : `<div style="font-size:11px;color:rgba(255,255,255,0.25);">No campaigns sent in this period</div>`;

  // Event time
  const eventTime = formatEventTimeReport(event?.starts_at, event?.ends_at);

  // Legend
  const hasVipRsvps = daily.some(d => (d.vipRsvps || 0) > 0);
  const maxDailyRsvps = Math.max(...daily.map(d => d.rsvps || 0), 0);
  const legendHtml = allSources.map(src =>
    `<div style="display:flex;align-items:center;gap:3px;"><div style="width:7px;height:7px;border-radius:1.5px;background:${getSourceColorStatic(src)};"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">${escHtml(src)}</span></div>`
  ).join("") + (maxDailyRsvps > 0 ? `<div style="display:flex;align-items:center;gap:3px;"><div style="width:10px;height:2px;border-radius:1px;background:rgba(74,222,128,0.7);"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">RSVPs</span></div>` : "") + (hasVipRsvps ? `<div style="display:flex;align-items:center;gap:3px;"><div style="width:7px;height:7px;border-radius:50%;background:rgba(251,191,36,0.9);"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">VIP RSVPs</span></div>` : "");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(eventTitle)} — Analytics Report</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #05040a; color: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page {
    width: 297mm; height: 210mm; max-height: 210mm;
    padding: 16mm 24mm 12mm;
    position: relative; overflow: hidden;
    page-break-after: always; page-break-inside: avoid;
  }
  .page:last-child { page-break-after: auto; }
  .page::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.04) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 80%, rgba(139,92,246,0.03) 0%, transparent 50%);
    pointer-events: none;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; position: relative; z-index: 1; }
  .brand-name { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .report-period { font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .footer { position: absolute; bottom: 6mm; left: 24mm; right: 24mm; display: flex; justify-content: space-between; font-size: 9px; color: rgba(255,255,255,0.25); }
  .detail-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
  .source-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
  .source-name { width: 90px; font-size: 10px; color: rgba(255,255,255,0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
  .source-bar-wrap { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.04); }
  .source-bar { height: 100%; border-radius: 3px; min-width: 3px; }
  .source-count { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.7); min-width: 30px; text-align: right; }
  .source-pct { font-size: 9px; color: rgba(255,255,255,0.4); min-width: 36px; text-align: right; }

  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; height: calc(210mm - 28mm); text-align: center; }
  .cover-branding-img { max-width: 480px; width: 75%; height: auto; margin-bottom: 32px; }
  .cover-event { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; margin-bottom: 8px; }
  .cover-time { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 32px; }
  .cover-divider { width: 50px; height: 2px; background: rgba(255,255,255,0.15); margin: 0 auto 32px; }
  .cover-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.5); font-weight: 600; margin-bottom: 6px; }
  .cover-period { font-size: 16px; color: rgba(255,255,255,0.7); font-weight: 500; }
  .cover-pullup { position: absolute; bottom: 10mm; left: 0; right: 0; text-align: center; font-size: 10px; color: rgba(255,255,255,0.2); }

  @media print {
    body { background: #05040a !important; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:100;display:flex;gap:8px;">
  <button id="print-btn" onclick="window.print()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f0f0f0,#c0c0c0,#a8a8a8);color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Loading...</button>
  <button onclick="window.close()" style="padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;font-size:14px;cursor:pointer;">Close</button>
</div>
<script>
(function() {
  var btn = document.getElementById('print-btn');
  btn.disabled = true; btn.style.opacity = '0.5';
  setTimeout(function() { btn.textContent = 'Download PDF'; btn.disabled = false; btn.style.opacity = '1'; }, 1500);
})();
</script>

<!-- Page 1: Cover -->
<div class="page">
  <div class="cover">
    <img class="cover-branding-img" src="${coverImage}" alt="PullUp" onerror="this.style.display='none'" />
    <div class="cover-event">${escHtml(eventTitle)}</div>
    ${eventTime ? `<div class="cover-time">${eventTime}</div>` : ""}
    <div class="cover-divider"></div>
    <div class="cover-label">Analytics Report</div>
    <div class="cover-period">${periodStart} — ${periodEnd}</div>
  </div>
  <div class="cover-pullup">Generated with PullUp</div>
</div>

<!-- Page 2: Overview -->
<div class="page">
  <div class="header">
    <div><div class="brand-name">${escHtml(eventTitle)}</div></div>
    <div><div class="report-period">${periodStart} — ${periodEnd}</div></div>
  </div>

  <div style="display:flex;gap:16px;position:relative;z-index:1;margin-bottom:5mm;">
    <div style="flex:1;min-width:0;">
      ${buildFunnelHtml(data.total_views, data.rsvp_count, data.pulled_up || 0, data.is_paid ? data.revenue : null, data.ticket_currency, data.unique_visitors, data.capacity, false, null, data.dinner_enabled ? (data.dinner || 0) : null, data.dinner_enabled ? (data.dinner_capacity || 0) : null)}
    </div>
    <div style="flex:0 0 auto;min-width:200px;max-width:240px;">
      ${buildDeviceSplitHtml(data.device_split)}
    </div>
  </div>

  <div style="margin-bottom:6mm;position:relative;z-index:1;">
    <div class="detail-section-label">Daily Views by Source & RSVPs — ${days} days</div>
    <div style="border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);padding:8px 10px 4px;">
      ${chartSvg}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:3px;">${legendHtml}</div>
    </div>
  </div>

  <div class="footer">
    <span>${escHtml(eventTitle)} — Report</span>
    <span>Page 2 — Overview</span>
  </div>
</div>

<!-- Page 3: Sources + Campaigns -->
<div class="page">
  <div class="header">
    <div><div class="brand-name">${escHtml(eventTitle)}</div></div>
    <div><div class="report-period">${periodStart} — ${periodEnd}</div></div>
  </div>

  <div style="display:flex;gap:16px;position:relative;z-index:1;">
    <div style="flex:1;min-width:0;">
      ${sources.length > 0 ? `
        <div class="detail-section-label">Traffic Sources</div>
        <div style="margin-bottom:5mm;">${sourceRowsHtml}</div>
      ` : ""}
    </div>

    <div style="flex:1;min-width:0;">
      <div class="detail-section-label">Campaigns</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:5mm;">${campaignHtml}</div>
    </div>
  </div>

  <div class="footer">
    <span>${escHtml(eventTitle)} — Report</span>
    <span>Page 3 — Details</span>
  </div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

function getSourceColorStatic(name) {
  const map = {
    direct: "rgba(255,255,255,0.35)",
    instagram: "rgba(225,48,108,0.75)",
    facebook: "rgba(66,103,178,0.75)",
    twitter: "rgba(29,155,240,0.75)",
    linkedin: "rgba(10,102,194,0.75)",
    pullup: "rgba(192,192,192,0.6)",
    pullup_newsletter: "rgba(251,191,36,0.7)",
    other: "rgba(168,85,247,0.5)",
  };
  if (!name || name.length === 0) return "rgba(168,85,247,0.5)";
  return map[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

function buildEventChartSvg(daily, allSources) {
  if (!daily || daily.length === 0) return "<div style='padding:12px;text-align:center;color:rgba(255,255,255,0.3);font-size:11px;'>No chart data</div>";

  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const maxDailyRsvps = Math.max(...daily.map(d => d.rsvps || 0), 0);
  const W = 800, H = 130;
  const PAD = { top: 8, right: 8, bottom: 20, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const rsvpScale = maxDailyRsvps > 0 ? chartH / maxDailyRsvps : 0;
  const barWidth = Math.max(2, (chartW / daily.length) * 0.65);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid
  [0, 0.5, 1].forEach(f => {
    const y = PAD.top + (1 - f) * chartH;
    const val = Math.round(f * niceMax);
    svg += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + chartW}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />`;
    svg += `<text x="${PAD.left - 4}" y="${y + 3}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="8">${val}</text>`;
  });

  // Stacked bars
  daily.forEach((d, i) => {
    const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW - barWidth / 2;
    let yOffset = 0;
    const bySource = d.bySource || {};
    for (let si = allSources.length - 1; si >= 0; si--) {
      const src = allSources[si];
      const val = bySource[src] || 0;
      if (val === 0) continue;
      const segH = (val / niceMax) * chartH;
      const y = PAD.top + chartH - yOffset - segH;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${segH}" rx="${yOffset === 0 ? 1.5 : 0}" fill="${getSourceColorStatic(src)}" />`;
      yOffset += segH;
    }
  });

  // RSVP line
  if (maxDailyRsvps > 0) {
    let linePath = "";
    daily.forEach((d, i) => {
      const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
      const y = PAD.top + chartH - ((d.rsvps || 0) * rsvpScale);
      linePath += `${i === 0 ? "M" : "L"}${x},${y} `;
    });
    svg += `<path d="${linePath}" fill="none" stroke="rgba(74,222,128,0.7)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />`;
    daily.forEach((d, i) => {
      if (!d.rsvps) return;
      const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
      const y = PAD.top + chartH - (d.rsvps * rsvpScale);
      svg += `<circle cx="${x}" cy="${y}" r="2.5" fill="rgba(74,222,128,0.9)" />`;
    });
  }

  // VIP RSVP golden dots
  daily.forEach((d, i) => {
    if (!d.vipRsvps || d.vipRsvps === 0) return;
    const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
    const y = PAD.top + chartH - (d.vipRsvps / niceMax) * chartH;
    svg += `<circle cx="${x}" cy="${y}" r="5" fill="rgba(251,191,36,0.15)" />`;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="rgba(251,191,36,0.9)" stroke="rgba(251,191,36,0.4)" stroke-width="1" />`;
  });

  // X labels
  const step = Math.max(1, Math.floor(daily.length / 8));
  daily.forEach((d, i) => {
    if (i % step !== 0 && i !== daily.length - 1) return;
    const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
    const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    svg += `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">${label}</text>`;
  });

  svg += "</svg>";
  return svg;
}

export function generateReport({ data, days, startDate: startDateArg, endDate: endDateArg, brandName, managedBy, reportType = "period" }) {
  const topEvents = (data.events || []).filter(e => e.views > 0).slice(0, 10);
  const imageCache = {};

  const coverImages = [
    `${window.location.origin}/pullup-brand.png`,
    `${window.location.origin}/pullup-cover-1.png`,
    `${window.location.origin}/pullup-cover-2.png`,
  ];
  const coverImage = coverImages[Math.floor(Math.random() * coverImages.length)];

  const win = window.open("", "_blank");
  if (!win) return;

  const periodLabel = "Report Period";
  const endD = endDateArg || new Date();
  const startD = startDateArg || (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return d; })();
  const periodEnd = endD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const periodStart = startD.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const chartSvg = buildChartSvg(data, days);
  const hasCampaigns = (data.campaigns || []).length > 0;
  const eventPageOffset = hasCampaigns ? 4 : 3; // campaigns page pushes event pages by 1
  const eventDetailPages = topEvents.map((ev, i) => buildEventDetailPage(ev, i, topEvents.length, brandName, periodStart, periodEnd, eventPageOffset)).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${brandName || "PullUp"} — Report</title>
<style>
  @page {
    size: A4 landscape;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #05040a;
    color: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .page {
    width: 297mm;
    height: 210mm;
    max-height: 210mm;
    padding: 18mm 28mm 14mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-child { page-break-after: auto; }

  /* Subtle gradient overlay */
  .page::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.04) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 80%, rgba(139,92,246,0.03) 0%, transparent 50%);
    pointer-events: none;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12mm;
    position: relative;
    z-index: 1;
  }
  .brand-name {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .managed-by {
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    margin-top: 4px;
  }
  .report-meta {
    text-align: right;
  }
  .report-type {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.5);
    font-weight: 600;
  }
  .report-period {
    font-size: 13px;
    color: rgba(255,255,255,0.65);
    margin-top: 4px;
  }
  .pullup-badge {
    font-size: 10px;
    color: rgba(255,255,255,0.3);
    margin-top: 8px;
    letter-spacing: 0.05em;
  }

  /* Metrics grid */
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 10mm;
    position: relative;
    z-index: 1;
  }
  .metric-card {
    padding: 14px 16px;
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .metric-label {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .metric-value {
    font-size: 24px;
    font-weight: 700;
  }
  .metric-change {
    font-size: 10px;
    font-weight: 600;
    margin-top: 2px;
  }
  .change-up { color: #4ade80; }
  .change-down { color: #f87171; }

  /* Chart */
  .chart-section {
    margin-bottom: 8mm;
    position: relative;
    z-index: 1;
  }
  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: rgba(255,255,255,0.5);
    margin-bottom: 8px;
  }
  .chart-container {
    padding: 14px;
    border-radius: 12px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .chart-container svg { width: 100%; height: auto; display: block; }
  .chart-legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 8px;
    padding: 0 4px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    color: rgba(255,255,255,0.55);
  }
  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* Events table */
  .events-section {
    position: relative;
    z-index: 1;
  }
  .events-table {
    border-radius: 12px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
  }
  .event-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .event-row:last-child { border-bottom: none; }
  .event-rank {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .event-thumb {
    width: 48px;
    height: 32px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: rgba(255,255,255,0.05);
  }
  .event-info { flex: 1; min-width: 0; }
  .event-title {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .event-stats {
    font-size: 10px;
    color: rgba(255,255,255,0.35);
    margin-top: 1px;
  }
  .event-bar-wrap {
    width: 80px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .event-bar {
    height: 100%;
    border-radius: 2px;
    background: rgba(59,130,246,0.6);
  }
  .event-views {
    font-size: 13px;
    font-weight: 700;
    color: rgba(59,130,246,0.8);
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Cover page */
  .page-cover {
    height: 210mm;
  }
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: calc(210mm - 32mm); /* page height minus top+bottom padding */
    text-align: center;
  }
  .cover-branding-img {
    max-width: 520px;
    width: 80%;
    height: auto;
    margin-bottom: 40px;
  }
  .cover-brand {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin-bottom: 12px;
  }
  .cover-managed {
    font-size: 14px;
    color: rgba(255,255,255,0.55);
    margin-bottom: 40px;
  }
  .cover-divider {
    width: 60px;
    height: 2px;
    background: rgba(255,255,255,0.15);
    margin: 0 auto 40px;
  }
  .cover-report-type {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(255,255,255,0.5);
    font-weight: 600;
    margin-bottom: 8px;
  }
  .cover-period {
    font-size: 18px;
    color: rgba(255,255,255,0.75);
    font-weight: 500;
  }
  .cover-pullup {
    position: absolute;
    bottom: 12mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.08em;
  }

  /* Page title */
  .page-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4mm;
    position: relative;
    z-index: 1;
  }

  /* Footer */
  .footer {
    position: absolute;
    bottom: 8mm;
    left: 28mm;
    right: 28mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: rgba(255,255,255,0.25);
  }

  /* Event detail pages */
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    page-break-inside: avoid;
    gap: 8px;
    margin-bottom: 4mm;
  }
  .detail-metric {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .detail-metric-label {
    font-size: 9px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .detail-metric-value {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
  }
  .detail-section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: rgba(255,255,255,0.5);
    margin-bottom: 5px;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }
  .source-name {
    width: 100px;
    font-size: 11px;
    color: rgba(255,255,255,0.75);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .source-bar-wrap {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.04);
  }
  .source-bar {
    height: 100%;
    border-radius: 3px;
    min-width: 3px;
  }
  .source-count {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    min-width: 34px;
    text-align: right;
  }
  .source-pct {
    font-size: 10px;
    color: rgba(255,255,255,0.4);
    min-width: 40px;
    text-align: right;
  }
  .detail-event-title {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 2px;
    color: #fff;
  }
  .detail-event-time {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    margin-bottom: 3mm;
  }

  @media print {
    body { background: #05040a !important; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<!-- Action buttons -->
<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:100;display:flex;gap:8px;">
  <button id="print-btn" onclick="window.print()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f0f0f0,#c0c0c0,#a8a8a8);color:#fff;font-weight:600;font-size:14px;cursor:pointer;">
    Loading...
  </button>
  <button onclick="window.close()" style="padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;font-size:14px;cursor:pointer;">
    Close
  </button>
</div>
<script>
  (function() {
    var btn = document.getElementById('print-btn');
    btn.disabled = true;
    btn.style.opacity = '0.5';
    var imgs = document.querySelectorAll('img.event-thumb');
    var remaining = imgs.length;
    function ready() {
      btn.textContent = 'Download PDF';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
    if (remaining === 0) { ready(); return; }
    function done() {
      remaining--;
      if (remaining <= 0) ready();
    }
    imgs.forEach(function(img) {
      if (img.complete) { done(); return; }
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
    setTimeout(ready, 4000);
  })();
</script>

<!-- Page 1: Cover -->
<div class="page page-cover">
  <div class="cover">
    <img class="cover-branding-img" src="${coverImage}" alt="PullUp" onerror="this.style.display='none'" />
    <div class="cover-brand">${escHtml(brandName)}</div>
    <div class="cover-divider"></div>
    <div class="cover-report-type">${periodLabel}</div>
    <div class="cover-period">${periodStart} — ${periodEnd}</div>
  </div>
  <div class="cover-pullup">Generated with PullUp</div>
</div>

<!-- Page 2: Overview -->
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${escHtml(brandName || "Analytics Report")}</div>
    </div>
    <div class="report-meta">
      <div class="report-period">${periodStart} — ${periodEnd}</div>
    </div>
  </div>

  <div class="page-title">Overview</div>

  <div style="display:flex;gap:16px;position:relative;z-index:1;margin-bottom:5mm;">
    <div style="flex:1;min-width:0;">
      ${buildFunnelHtml(data.period?.currentViews ?? data.total_views, data.total_rsvps ?? 0, data.total_pulled_up ?? 0, data.has_paid_events ? data.total_revenue : null, null, data.period?.currentUnique ?? data.total_unique_visitors, data.total_capacity || null, false, data.has_paid_events ? data.revenue_by_currency : null, data.has_dinner_events ? (data.total_dinner || 0) : null, data.has_dinner_events ? (data.total_dinner_capacity || 0) : null)}
    </div>
    <div style="flex:0 0 auto;min-width:200px;max-width:240px;">
      ${buildDeviceSplitHtml(data.device_split)}
    </div>
  </div>

  <div class="chart-section">
    <div class="section-label">Views — Last ${days} days</div>
    <div class="chart-container">
      ${chartSvg}
    </div>
    ${buildLegendHtml(data.chart?.eventLabels)}
  </div>

  <div class="footer">
    <span>${escHtml(brandName || "")} — Report</span>
    <span>Page 2 — Overview</span>
  </div>
</div>

${buildCampaignsPage(data.campaigns, brandName, periodStart, periodEnd, topEvents.length)}

${eventDetailPages}

</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function changeHtml(value) {
  if (value === null || value === undefined) return "";
  const cls = value > 0 ? "change-up" : value < 0 ? "change-down" : "";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return `<div class="metric-change ${cls}">${arrow} ${Math.abs(value)}% vs previous period</div>`;
}

function formatRevenueByCurrency(byCurrency) {
  if (!byCurrency || typeof byCurrency !== 'object') return 'N/A';
  const entries = Object.entries(byCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return 'N/A';
  return entries.map(([cur, cents]) => formatRevenue(cents, cur)).join(' + ');
}

function buildFunnelHtml(views, rsvps, pulledUp, revenue, currency, uniqueVisitors, capacity, mini, revenueByCurrency, dinner, dinnerCapacity) {
  const steps = [
    { label: "Views", value: views, rate: null, color: "rgba(59,130,246,0.7)" },
    { label: "RSVPs", value: rsvps, cap: capacity > 0 ? capacity : null, rate: views > 0 ? Math.round((rsvps / views) * 1000) / 10 : 0, rateLabel: "of views", color: "rgba(139,92,246,0.7)" },
  ];
  if (dinner !== null && dinner !== undefined) {
    steps.push({ label: "Dinner", value: dinner, cap: dinnerCapacity > 0 ? dinnerCapacity : null, rate: rsvps > 0 ? Math.round((dinner / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "rgba(251,146,60,0.7)" });
  }
  steps.push({ label: "Pulled Up", value: pulledUp, rate: rsvps > 0 ? Math.round((pulledUp / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "rgba(74,222,128,0.7)" });
  if (revenue !== null && revenue !== undefined) {
    const revenueDisplay = revenueByCurrency && Object.keys(revenueByCurrency).length > 0
      ? formatRevenueByCurrency(revenueByCurrency)
      : formatRevenue(revenue, currency);
    steps.push({ label: "Revenue", value: -1, display: revenueDisplay, rawValue: revenue, rate: null, color: "rgba(251,191,36,0.7)" });
  }
  const maxVal = Math.max(views, 1);
  const fs = mini ? "16px" : "20px";
  const lfs = mini ? "9px" : "10px";
  const barH = mini ? "4px" : "6px";
  const gap = mini ? "6px" : "10px";

  const stepsHtml = steps.map((step, i) => {
    const barPct = step.label === "Revenue"
      ? (pulledUp / maxVal) * 100
      : (step.value / maxVal) * 100;
    const capSuffix = step.cap ? `<span style="font-size:${mini ? "11px" : "13px"};font-weight:500;color:rgba(255,255,255,0.25);"> / ${step.cap.toLocaleString()}</span>` : "";
    const displayVal = (step.display || (step.value ?? 0).toLocaleString()) + capSuffix;
    const rateColor = step.rate > (step.label === "Pulled Up" ? 50 : 20) ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.35)";
    const rateHtml = step.rate !== null && step.rate !== undefined
      ? `<span style="font-size:${lfs};font-weight:600;color:${rateColor};">${step.rate}% <span style="font-weight:400;color:rgba(255,255,255,0.25);">${step.rateLabel}</span></span>`
      : "";
    return `<div style="margin-bottom:${i < steps.length - 1 ? gap : "0"};">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px;">
        <div style="display:flex;align-items:baseline;gap:6px;">
          <span style="font-size:${fs};font-weight:700;color:${step.color};">${displayVal}</span>
          <span style="font-size:${lfs};color:rgba(255,255,255,0.4);font-weight:500;">${step.label}</span>
        </div>
        ${rateHtml}
      </div>
      <div style="height:${barH};border-radius:3px;background:rgba(255,255,255,0.04);">
        <div style="height:100%;border-radius:3px;background:${step.color};width:${Math.max(barPct, step.value > 0 || step.rawValue > 0 ? 2 : 0)}%;"></div>
      </div>
    </div>`;
  }).join("");

  let secondaryHtml = "";
  if (!mini && (uniqueVisitors > 0 || (capacity && capacity > 0))) {
    const parts = [];
    if (uniqueVisitors > 0) parts.push(`<span style="font-size:12px;font-weight:700;color:#fff;">${uniqueVisitors.toLocaleString()}</span><span style="font-size:9px;color:rgba(255,255,255,0.35);margin-left:3px;">unique visitors</span>`);
    if (capacity && capacity > 0) parts.push(`<span style="font-size:12px;font-weight:700;color:#fff;">${Math.min(100, Math.round((rsvps / capacity) * 100))}%</span><span style="font-size:9px;color:rgba(255,255,255,0.35);margin-left:3px;">of ${capacity} capacity</span>`);
    secondaryHtml = `<div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">${parts.map(p => `<div>${p}</div>`).join("")}</div>`;
  }

  return `<div style="padding:${mini ? "6px 10px" : "10px 16px"};border-radius:${mini ? "8px" : "12px"};background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);margin-bottom:${mini ? "3mm" : "6mm"};position:relative;z-index:1;">
    ${stepsHtml}
    ${secondaryHtml}
  </div>`;
}

function buildChartSvg(data, days) {
  const stacked = data.chart?.stacked;
  const eventLabels = data.chart?.eventLabels || [];
  const previous = data.chart?.previous;

  if (!stacked || stacked.length === 0) return "<div style='padding:20px;text-align:center;color:rgba(255,255,255,0.3);font-size:12px;'>No chart data</div>";

  const eventIds = eventLabels.map(e => e.id);
  const W = 800;
  const H = 140;
  const PAD = { top: 8, right: 8, bottom: 22, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Max value
  const maxCurrent = Math.max(...stacked.map(d => {
    let t = 0;
    for (const eid of eventIds) t += (d[eid] || 0);
    t += (d._other || 0);
    return t;
  }), 1);
  const maxPrev = previous ? Math.max(...previous.map(d => d.views), 0) : 0;
  const maxVal = Math.max(maxCurrent, maxPrev, 1);
  const niceMax = Math.ceil(maxVal / (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1)) * (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1);

  const yTicks = [0, Math.round(niceMax / 2), niceMax];
  const barWidth = Math.max(2, (chartW / stacked.length) * 0.7);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid + Y labels
  for (const v of yTicks) {
    const y = PAD.top + chartH - (v / niceMax) * chartH;
    svg += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + chartW}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />`;
    svg += `<text x="${PAD.left - 6}" y="${y + 3}" text-anchor="end" fill="rgba(255,255,255,0.45)" font-size="9">${v}</text>`;
  }

  // X labels
  const step = Math.max(1, Math.floor(stacked.length / 7));
  for (let i = 0; i < stacked.length; i++) {
    if (i % step !== 0 && i !== stacked.length - 1) continue;
    const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW;
    const d = new Date(stacked[i].date + "T00:00:00");
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    svg += `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="9">${label}</text>`;
  }

  // Previous period ghost bars
  if (previous) {
    for (let i = 0; i < previous.length; i++) {
      if (previous[i].views === 0) continue;
      const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW - barWidth / 2;
      const barH = (previous[i].views / niceMax) * chartH;
      const y = PAD.top + chartH - barH;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />`;
    }
  }

  // Stacked bars
  for (let i = 0; i < stacked.length; i++) {
    const d = stacked[i];
    const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW - barWidth / 2;
    let yOffset = 0;

    for (let ei = eventIds.length - 1; ei >= 0; ei--) {
      const val = d[eventIds[ei]] || 0;
      if (val === 0) continue;
      const segH = (val / niceMax) * chartH;
      const y = PAD.top + chartH - yOffset - segH;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${segH}" rx="${yOffset === 0 ? 2 : 0}" fill="${EVENT_COLORS[ei % EVENT_COLORS.length]}" />`;
      yOffset += segH;
    }

    if (d._other > 0) {
      const segH = (d._other / niceMax) * chartH;
      const y = PAD.top + chartH - yOffset - segH;
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${segH}" rx="${yOffset === 0 ? 2 : 0}" fill="rgba(255,255,255,0.12)" />`;
    }
  }

  svg += "</svg>";
  return svg;
}

function buildLegendHtml(eventLabels) {
  if (!eventLabels || eventLabels.length <= 1) return "";
  const items = eventLabels.map((ev, i) =>
    `<div class="legend-item"><div class="legend-dot" style="background:${EVENT_COLORS[i % EVENT_COLORS.length]}"></div>${escHtml(ev.title)}</div>`
  ).join("");
  return `<div class="chart-legend">${items}</div>`;
}

function buildDeviceSplitHtml(split) {
  if (!split) return "";
  const total = (split.mobile || 0) + (split.desktop || 0) + (split.unknown || 0);
  if (total === 0) return "";

  const segments = [
    { label: "Mobile", count: split.mobile || 0, color: "rgba(59,130,246,0.7)" },
    { label: "Desktop", count: split.desktop || 0, color: "rgba(139,92,246,0.7)" },
    { label: "Unknown", count: split.unknown || 0, color: "rgba(255,255,255,0.15)" },
  ].filter(s => s.count > 0);

  // SVG donut
  const R = 28, STROKE = 7, CX = 36, CY = 36, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = segments.map(seg => {
    const dash = (seg.count / total) * C;
    const gap = C - dash;
    const o = offset;
    offset += dash;
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${seg.color}" stroke-width="${STROKE}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-o}" stroke-linecap="round" transform="rotate(-90 ${CX} ${CY})" />`;
  }).join("");

  const rows = segments.map(seg => {
    const pct = Math.round((seg.count / total) * 1000) / 10;
    return `<div style="display:flex;align-items:center;gap:6px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${seg.color};flex-shrink:0;"></div>
      <span style="font-size:10px;color:rgba(255,255,255,0.6);min-width:50px;">${seg.label}</span>
      <div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,0.04);"><div style="height:100%;border-radius:2px;background:${seg.color};width:${pct}%;"></div></div>
      <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);min-width:24px;text-align:right;">${seg.count}</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.25);min-width:34px;text-align:right;">${pct}%</span>
    </div>`;
  }).join("");

  return `<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">
    <svg width="72" height="72" viewBox="0 0 72 72" style="flex-shrink:0;">
      ${arcs}
      <text x="${CX}" y="${CY - 3}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">${total}</text>
      <text x="${CX}" y="${CY + 7}" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="6">views</text>
    </svg>
    <div style="display:flex;flex-direction:column;gap:5px;flex:1;">${rows}</div>
  </div>`;
}


const SOURCE_COLORS_REPORT = {
  direct: "rgba(255,255,255,0.4)",
  instagram: "rgba(225,48,108,0.7)",
  facebook: "rgba(66,103,178,0.7)",
  twitter: "rgba(29,155,240,0.7)",
  linkedin: "rgba(10,102,194,0.7)",
  pullup: "rgba(192,192,192,0.7)",
  pullup_newsletter: "rgba(251,191,36,0.7)",
};

function formatEventTimeReport(startsAt, endsAt) {
  if (!startsAt) return "";
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const dateOpts = { day: "numeric", month: "long", year: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", hour12: false };
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toLocaleDateString("en-GB", dateOpts)} · ${start.toLocaleTimeString("en-GB", timeOpts)} – ${end.toLocaleTimeString("en-GB", timeOpts)}`;
  }
  return `${start.toLocaleDateString("en-GB", dateOpts)} ${start.toLocaleTimeString("en-GB", timeOpts)} – ${end.toLocaleDateString("en-GB", dateOpts)} ${end.toLocaleTimeString("en-GB", timeOpts)}`;
}

function buildCampaignsPage(campaigns, brandName, periodStart, periodEnd, totalEvents) {
  if (!campaigns || campaigns.length === 0) return "";

  const funnelColors = {
    sent: "rgba(139,92,246,0.7)",
    opened: "rgba(59,130,246,0.7)",
    clicked: "rgba(251,191,36,0.7)",
    visited: "rgba(74,222,128,0.7)",
    rsvps: "rgba(236,72,153,0.7)",
  };

  const campaignCards = campaigns.slice(0, 6).map(c => {
    const stages = [
      { label: "Sent", value: c.sent, color: funnelColors.sent },
      { label: "Opened", value: c.opened, rate: c.openRate, color: funnelColors.opened },
      { label: "Clicked", value: c.clicked, rate: c.clickRate, color: funnelColors.clicked },
      { label: "Visited", value: c.visited, rate: c.visitRate, color: funnelColors.visited },
      { label: "RSVPs", value: c.rsvps, rate: c.conversionRate, color: funnelColors.rsvps },
    ];
    const maxVal = Math.max(...stages.map(s => s.value), 1);

    const bars = stages.map(s => {
      const pct = Math.max(2, (s.value / maxVal) * 100);
      return `<div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;color:rgba(255,255,255,0.45);width:46px;text-align:right;flex-shrink:0;">${s.label}</span>
        <div style="flex:1;height:10px;border-radius:4px;background:rgba(255,255,255,0.03);">
          <div style="height:100%;width:${pct}%;border-radius:4px;background:${s.color};"></div>
        </div>
        <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.7);min-width:28px;text-align:right;">${s.value}</span>
        ${s.rate !== undefined ? `<span style="font-size:9px;color:rgba(255,255,255,0.3);min-width:34px;text-align:right;">${s.rate}%</span>` : `<span style="min-width:34px;"></span>`}
      </div>`;
    }).join("");

    return `<div style="padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);margin-bottom:10px;">
      <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:8px;">${escHtml(c.name)}</div>
      <div style="display:flex;flex-direction:column;gap:4px;">${bars}</div>
    </div>`;
  }).join("");

  return `
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${escHtml(brandName || "Analytics Report")}</div>
    </div>
    <div class="report-meta">
      <div class="report-period">${periodStart} — ${periodEnd}</div>
    </div>
  </div>

  <div class="page-title">Campaign Performance</div>

  <div style="display:grid;grid-template-columns:repeat(${campaigns.length === 1 ? 1 : 2}, 1fr);gap:12px;">
    ${campaignCards}
  </div>

  ${campaigns.length > 6 ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);text-align:center;margin-top:8px;">+ ${campaigns.length - 6} more campaigns</div>` : ""}

  <div class="footer">
    <span>${escHtml(brandName || "")} — Report</span>
    <span>Page 3 — Campaigns</span>
  </div>
</div>`;
}

function buildEventDetailPage(ev, index, totalEvents, brandName, periodStart, periodEnd, pageOffset = 3) {
  const sources = ev.sources || [];
  const daily = ev.daily || [];
  const pageNum = pageOffset + index;

  // Collect all sources for this event
  const allSources = sources.map(s => s.source);

  function getSourceColorReport(name) {
    const map = {
      direct: "rgba(255,255,255,0.35)",
      instagram: "rgba(225,48,108,0.75)",
      facebook: "rgba(66,103,178,0.75)",
      twitter: "rgba(29,155,240,0.75)",
      linkedin: "rgba(10,102,194,0.75)",
      pullup: "rgba(192,192,192,0.6)",
      pullup_newsletter: "rgba(251,191,36,0.7)",
      other: "rgba(168,85,247,0.5)",
    };
    if (!name || name.length === 0) return "rgba(168,85,247,0.5)";
  return map[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
  }

  // Build stacked source chart SVG
  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const maxDailyRsvps = Math.max(...daily.map(d => d.rsvps), 1);
  const W = 800, H = 120;
  const PAD = { top: 8, right: 8, bottom: 20, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const rsvpScale = maxDailyRsvps > 0 ? chartH / maxDailyRsvps : 0;

  const hasVipRsvps = daily.some(d => (d.vipRsvps || 0) > 0);

  let chartSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">`;

  // Grid
  [0, 0.5, 1].forEach(f => {
    const y = PAD.top + (1 - f) * chartH;
    const val = Math.round(f * niceMax);
    chartSvg += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + chartW}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />`;
    chartSvg += `<text x="${PAD.left - 4}" y="${y + 3}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="8">${val}</text>`;
  });

  // Stacked bars by source
  if (daily.length > 0) {
    const barWidth = Math.max(2, (chartW / daily.length) * 0.65);
    daily.forEach((d, i) => {
      const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW - barWidth / 2;
      let yOffset = 0;
      const bySource = d.bySource || {};

      for (let si = allSources.length - 1; si >= 0; si--) {
        const src = allSources[si];
        const val = bySource[src] || 0;
        if (val === 0) continue;
        const segH = (val / niceMax) * chartH;
        const y = PAD.top + chartH - yOffset - segH;
        chartSvg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${segH}" rx="${yOffset === 0 ? 1.5 : 0}" fill="${getSourceColorReport(src)}" />`;
        yOffset += segH;
      }
    });

    // RSVP line
    if (maxDailyRsvps > 0) {
      let linePath = "";
      daily.forEach((d, i) => {
        const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
        const y = PAD.top + chartH - (d.rsvps * rsvpScale);
        linePath += `${i === 0 ? "M" : "L"}${x},${y} `;
      });
      chartSvg += `<path d="${linePath}" fill="none" stroke="rgba(74,222,128,0.7)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />`;

      // RSVP dots
      daily.forEach((d, i) => {
        if (d.rsvps === 0) return;
        const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
        const y = PAD.top + chartH - (d.rsvps * rsvpScale);
        chartSvg += `<circle cx="${x}" cy="${y}" r="2.5" fill="rgba(74,222,128,0.9)" />`;
      });
    }

    // VIP RSVP golden dots — independent, y = count on views axis
    if (hasVipRsvps) {
      daily.forEach((d, i) => {
        if (!d.vipRsvps || d.vipRsvps === 0) return;
        const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
        const y = PAD.top + chartH - (d.vipRsvps / niceMax) * chartH;
        chartSvg += `<circle cx="${x}" cy="${y}" r="5" fill="rgba(251,191,36,0.15)" />`;
        chartSvg += `<circle cx="${x}" cy="${y}" r="3" fill="rgba(251,191,36,0.9)" stroke="rgba(251,191,36,0.4)" stroke-width="1" />`;
      });
    }

    // X labels
    const step = Math.max(1, Math.floor(daily.length / 8));
    daily.forEach((d, i) => {
      if (i % step !== 0 && i !== daily.length - 1) return;
      const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
      const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      chartSvg += `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">${label}</text>`;
    });
  }
  chartSvg += "</svg>";

  // Legend
  const legendHtml = allSources.map(src =>
    `<div style="display:flex;align-items:center;gap:3px;"><div style="width:7px;height:7px;border-radius:1.5px;background:${getSourceColorReport(src)};"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">${escHtml(src)}</span></div>`
  ).join("") + (maxDailyRsvps > 0 ? `<div style="display:flex;align-items:center;gap:3px;"><div style="width:10px;height:2px;border-radius:1px;background:rgba(74,222,128,0.7);"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">RSVPs</span></div>` : "") + (hasVipRsvps ? `<div style="display:flex;align-items:center;gap:3px;"><div style="width:7px;height:7px;border-radius:50%;background:rgba(251,191,36,0.9);"></div><span style="font-size:8px;color:rgba(255,255,255,0.5);">VIP RSVPs</span></div>` : "");

  // Source summary rows
  const sourceRows = sources.slice(0, 6).map(s => {
    const barColor = getSourceColorReport(s.source);
    return `<div class="source-row">
      <div class="source-name" style="display:flex;align-items:center;gap:4px;"><div style="width:5px;height:5px;border-radius:1.5px;background:${barColor};flex-shrink:0;"></div>${escHtml(s.source)}</div>
      <div class="source-bar-wrap"><div class="source-bar" style="width:${s.percentage}%;background:${barColor}"></div></div>
      <div class="source-count">${s.count}</div>
      <div class="source-pct">${s.percentage}%</div>
    </div>`;
  }).join("");

  // Thumbnail
  const imgSrc = ev.cover_image_url;
  const thumbHtml = imgSrc
    ? `<img src="${escHtml(imgSrc)}" crossorigin="anonymous" style="width:100%;max-height:50mm;object-fit:cover;border-radius:10px;margin-bottom:5mm;" onerror="this.style.display='none'" />`
    : "";

  return `
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${escHtml(brandName || "Analytics Report")}</div>
    </div>
    <div class="report-meta">
      <div class="report-period">${periodStart} — ${periodEnd}</div>
    </div>
  </div>

  <div class="detail-event-title">${escHtml(ev.title)}</div>
  <div class="detail-event-time">${formatEventTimeReport(ev.starts_at, ev.ends_at)}</div>

  <div style="display:flex;gap:16px;position:relative;z-index:1;">
    <div style="flex:1;min-width:0;">
      ${buildFunnelHtml(ev.views, ev.rsvps, ev.pulled_up || 0, ev.is_paid ? ev.revenue : null, ev.ticket_currency, ev.unique_visitors, ev.capacity, true, null, ev.dinner_enabled ? (ev.dinner || 0) : null, ev.dinner_enabled ? (ev.dinner_capacity || 0) : null)}
    </div>
    ${sources.length > 0 ? `
    <div style="flex:1;min-width:0;">
      <div class="detail-section-label">Traffic Sources</div>
      <div style="margin-bottom:3mm;">
        ${sourceRows}
      </div>
    </div>
    ` : ""}
  </div>

  <div class="detail-section-label">Daily Views by Source & RSVPs</div>
  <div style="border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);padding:8px 10px 4px;margin-bottom:3mm;">
    ${chartSvg}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">
      ${legendHtml}
    </div>
  </div>

  <div class="footer">
    <span>${escHtml(brandName || "")} — Report</span>
    <span>Page ${pageNum} — ${escHtml(ev.title)}</span>
  </div>
</div>`;
}
