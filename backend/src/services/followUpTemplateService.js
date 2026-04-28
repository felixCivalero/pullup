export function renderFollowUpEmailTemplate({ templateContent /*, person, event, baseUrl */ }) {
  const blocks = templateContent.blocks || [];
  const body = blocks
    .map((b) => {
      if (b.type === "text" && b.style === "heading") {
        return `<h2 style="font-size:22px;font-weight:700;margin:16px 0 8px;">${escapeHtml(b.text || "")}</h2>`;
      }
      if (b.type === "text" && b.style === "paragraph") {
        return `<p>${escapeHtml(b.text || "")}</p>`;
      }
      if (b.type === "image" && b.url) {
        return `<img src="${escapeAttr(b.url)}" alt="${escapeAttr(b.alt || "")}" style="display:block;width:100%;max-width:600px;height:auto;margin:16px auto;border-radius:8px;" />`;
      }
      return "";
    })
    .join("");
  return `<html><body>${body}</body></html>`;
}

function escapeAttr(s) { return escapeHtml(s); }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
