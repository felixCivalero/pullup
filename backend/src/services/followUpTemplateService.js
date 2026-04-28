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
      if (b.type === "button" && b.url && b.text) {
        const caption = b.caption
          ? `<p class="caption-block" style="text-align:center;font-size:12px;opacity:0.7;margin:6px 0 18px;">${escapeHtml(b.caption)}</p>`
          : "";
        return `<div style="text-align:center;margin:20px 0 0;"><a href="${escapeAttr(b.url)}" style="display:inline-block;padding:12px 24px;background:#d4af37;color:#0c0a12;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(b.text)}</a></div>${caption}`;
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
