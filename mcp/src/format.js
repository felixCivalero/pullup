// Response formatting for tool results. Everything Claude sees from a tool
// is one block of text — so the formatting here is what shapes the "feel"
// of the experience for the user.
//
// Single-event mutations (create/update/publish) get the prominent banner
// block; queries (list/count) get a compact summary.

export function eventBanner({
  title,
  status,
  previewUrl,
  shareUrl,
  rsvpsUrl,
  note,
}) {
  const statusLine = status === "DRAFT"
    ? "Event created (DRAFT — only you can see it)"
    : status === "PUBLISHED"
    ? "LIVE"
    : status;

  const lines = [
    "─────────────────────────────────────",
    `  ${statusLine}${title ? ` — ${title}` : ""}`,
    "",
    `  → Preview:   ${previewUrl}`,
  ];
  if (shareUrl && shareUrl !== previewUrl) lines.push(`  → Share:     ${shareUrl}`);
  if (rsvpsUrl) lines.push(`  → RSVPs:     ${rsvpsUrl}`);
  if (note) {
    lines.push("");
    lines.push(`  ${note}`);
  }
  lines.push("─────────────────────────────────────");
  return lines.join("\n");
}

export function toolResultText(text) {
  return {
    content: [{ type: "text", text }],
  };
}

export function toolError(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
