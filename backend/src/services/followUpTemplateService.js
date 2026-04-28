export function renderFollowUpEmailTemplate({ templateContent, person /*, event, baseUrl */ }) {
  const blocks = Array.isArray(templateContent.blocks) ? templateContent.blocks : [];
  const firstName = person?.first_name?.trim();
  const greeting = `<p style="margin:0 0 12px;">Hi ${firstName ? escapeHtml(firstName) : "there"},</p>`;

  const body = blocks.map(renderBlock).filter(Boolean).join("");

  const signoffHtml = templateContent.signoff
    ? `<p style="margin:24px 0 0;">${escapeHtml(templateContent.signoff).replace(/\n/g, "<br>")}</p>`
    : "";

  const previewText = templateContent.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(templateContent.previewText)}</div>`
    : "";

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0c0a12;color:#fff;padding:24px;">${previewText}<div style="max-width:600px;margin:0 auto;">${greeting}${body}${signoffHtml}</div></body></html>`;
}

function renderBlock(b) {
  if (!b || typeof b !== "object") return "";
  if (b.type === "text" && b.style === "heading") {
    return `<h2 style="font-size:22px;font-weight:700;margin:16px 0 8px;">${escapeHtml(b.text || "")}</h2>`;
  }
  if (b.type === "text" && b.style === "paragraph") {
    return `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(b.text || "").replace(/\n/g, "<br>")}</p>`;
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
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) { return escapeHtml(s); }
