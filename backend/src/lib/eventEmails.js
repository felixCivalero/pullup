// The two mails the event platform sends: the confirmation after a sign-up
// (with add-to-calendar) and a message to a list. Plain, readable, no images
// that need loading to make sense. Pure — returns { subject, html, text }.
import { formatWhen } from "./eventPlatform.js";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (inner, footer = "") => `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 22px;">
    ${inner}
    <p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a8a8e;">${footer || "Skickat via PullUp"}</p>
  </div>
</body></html>`;

const button = (href, label, dark = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${dark ? "background:#0a0a0a;color:#ffffff;" : "background:#ffffff;color:#0a0a0a;border:1px solid #d4d4d8;"}">${esc(label)}</a>`;

export function confirmationEmail({ event, name, status, eventUrl, googleUrl, icsUrl, imageUrl }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const when = formatWhen(event);
  const waitlist = status === "waitlist";
  const subject = waitlist ? `Du står på väntelistan: ${event.title}` : `Du är anmäld: ${event.title}`;
  const lead = waitlist
    ? "Eventet är fullt just nu, så du står på väntelistan. Du får ett mejl om en plats blir ledig."
    : "Du är anmäld. Lägg in det i kalendern så att det inte glöms bort.";
  const html = shell(`
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="" width="516" style="display:block;width:100%;max-width:516px;height:auto;border-radius:14px;margin:0 0 24px;">` : ""}
    <p style="margin:0 0 6px;font-size:14px;color:#6e6e73;">${first ? `Hej ${esc(first)}!` : "Hej!"}</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;">${esc(event.title)}</h1>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.5;"><b>${esc(when)}</b></p>
    ${event.location ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;">${esc(event.location)}</p>` : '<div style="height:14px"></div>'}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3a3e;">${lead}</p>
    ${waitlist ? "" : `${button(googleUrl, "Google Kalender")}${button(icsUrl, "Apple / Outlook (.ics)", false)}`}
    <p style="margin:18px 0 0;font-size:14px;"><a href="${esc(eventUrl)}" style="color:#0a0a0a;">Se eventet</a></p>
  `);
  const text = [
    first ? `Hej ${first}!` : "Hej!",
    "",
    event.title,
    when,
    event.location || "",
    "",
    lead,
    "",
    ...(waitlist ? [] : [`Google Kalender: ${googleUrl}`, `Apple / Outlook: ${icsUrl}`]),
    `Se eventet: ${eventUrl}`,
  ].join("\n");
  return { subject, html, text };
}

// A message to a list: the body is plain text from the admin (blank lines =
// paragraphs, bare links become links). Always carries the unsubscribe link.
export function broadcastEmail({ subject, body, unsubscribeUrl, event = null, eventUrl = null }) {
  const paras = String(body || "").trim().split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${esc(p)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0a0a0a;">$1</a>')
      .replace(/\n/g, "<br>")}</p>`,
  ).join("");
  const eventBox = event && eventUrl
    ? `<div style="margin:22px 0 0;padding:16px;border:1px solid #eeeeee;border-radius:14px;">
         <p style="margin:0 0 4px;font-size:15px;font-weight:700;">${esc(event.title)}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#6e6e73;">${esc(formatWhen(event))}${event.location ? ` · ${esc(event.location)}` : ""}</p>
         ${button(eventUrl, "Se eventet")}
       </div>`
    : "";
  const footer = `Du får det här för att du anmält dig till ett event via PullUp. <a href="${esc(unsubscribeUrl)}" style="color:#8a8a8e;">Avregistrera dig</a>.`;
  const html = shell(paras + eventBox, footer);
  const text = [
    String(body || "").trim(),
    ...(event && eventUrl ? ["", `${event.title} · ${formatWhen(event)}`, eventUrl] : []),
    "",
    `Avregistrera dig: ${unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}
