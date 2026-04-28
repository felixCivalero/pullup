export function renderFollowUpEmailTemplate({ templateContent /*, person, event, baseUrl */ }) {
  const blocks = templateContent.blocks || [];
  const body = blocks
    .map((b) => {
      if (b.type === "text" && b.style === "paragraph") {
        return `<p>${escapeHtml(b.text || "")}</p>`;
      }
      return "";
    })
    .join("");
  return `<html><body>${body}</body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
