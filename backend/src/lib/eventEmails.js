// The two mails the event platform sends: the confirmation after a sign-up
// (with add-to-calendar) and a message to a list. Plain, readable, no images
// that need loading to make sense. Pure — returns { subject, html, text }.
import { formatWhen } from "./eventPlatform.js";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Every guest who gets a confirmation sees where free event pages come from.
const MADE_WITH = 'Skickat via <a href="https://pullup.se/pullup" style="color:#8a8a8e;">PullUp</a> – gratis eventsidor med anmälan.';

const shell = (inner, footer = "") => `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 22px;">
    ${inner}
    <p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a8a8e;">${footer || MADE_WITH}</p>
  </div>
</body></html>`;

const button = (href, label, dark = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${dark ? "background:#0a0a0a;color:#ffffff;" : "background:#ffffff;color:#0a0a0a;border:1px solid #d4d4d8;"}">${esc(label)}</a>`;

const CONFIRM = {
  sv: {
    waitSubject: (t) => `Du står på väntelistan: ${t}`, subject: (t) => `Du är anmäld: ${t}`,
    waitLead: "Eventet är fullt just nu, så du står på väntelistan. Du får ett mejl om en plats blir ledig.",
    lead: "Du är anmäld. Lägg in det i kalendern så att det inte glöms bort.",
    hi: (n) => (n ? `Hej ${n}!` : "Hej!"), google: "Google Kalender", see: "Se eventet",
    made: MADE_WITH, madeText: "Skickat via PullUp – gratis eventsidor med anmälan: https://pullup.se/pullup", locale: "sv-SE",
  },
  en: {
    waitSubject: (t) => `You're on the waitlist: ${t}`, subject: (t) => `You're signed up: ${t}`,
    waitLead: "The event is full right now, so you're on the waitlist. You'll get an email if a spot opens up.",
    lead: "You're signed up. Add it to your calendar so you don't forget.",
    hi: (n) => (n ? `Hi ${n}!` : "Hi!"), google: "Google Calendar", see: "See the event",
    made: 'Sent via <a href="https://pullup.se/pullup" style="color:#8a8a8e;">PullUp</a> – free event pages with sign-up.',
    madeText: "Sent via PullUp – free event pages with sign-up: https://pullup.se/pullup", locale: "en-GB",
  },
};

// lang: the guest's language on the event page (sv, else English).
export function confirmationEmail({ event, name, status, eventUrl, googleUrl, icsUrl, imageUrl, lang = "sv" }) {
  const L = CONFIRM[lang === "en" ? "en" : "sv"];
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const when = formatWhen(event, L.locale);
  const waitlist = status === "waitlist";
  const subject = waitlist ? L.waitSubject(event.title) : L.subject(event.title);
  const lead = waitlist ? L.waitLead : L.lead;
  const html = shell(`
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="" width="516" style="display:block;width:100%;max-width:516px;height:auto;border-radius:14px;margin:0 0 24px;">` : ""}
    <p style="margin:0 0 6px;font-size:14px;color:#6e6e73;">${esc(L.hi(first))}</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;">${esc(event.title)}</h1>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.5;"><b>${esc(when)}</b></p>
    ${event.location ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;">${esc(event.location)}</p>` : '<div style="height:14px"></div>'}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3a3e;">${lead}</p>
    ${waitlist ? "" : `${button(googleUrl, L.google)}${button(icsUrl, "Apple / Outlook (.ics)", false)}`}
    <p style="margin:18px 0 0;font-size:14px;"><a href="${esc(eventUrl)}" style="color:#0a0a0a;">${L.see}</a></p>
  `, L.made);
  const text = [
    L.hi(first),
    "",
    event.title,
    when,
    event.location || "",
    "",
    lead,
    "",
    ...(waitlist ? [] : [`${L.google}: ${googleUrl}`, `Apple / Outlook: ${icsUrl}`]),
    `${L.see}: ${eventUrl}`,
    "",
    L.madeText,
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
  const footer = `You get this because you signed up to an event via PullUp. <a href="${esc(unsubscribeUrl)}" style="color:#8a8a8e;">Unsubscribe</a>.`;
  const html = shell(paras + eventBox, footer);
  const text = [
    String(body || "").trim(),
    ...(event && eventUrl ? ["", `${event.title} · ${formatWhen(event)}`, eventUrl] : []),
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}

// An invite to work in a brand, or to co-host one event (lib/teams.js). The
// link goes to sign-in; signing in with this address shows the invite.
export function teamInviteEmail({ inviter, brand, event, loginUrl }) {
  const what = event ? `eventet ${event} för ${brand}` : brand;
  const subject = event ? `Du är inbjuden som medarrangör: ${event}` : `Du är inbjuden till ${brand} på PullUp`;
  const lead = event
    ? `${inviter} har bjudit in dig som medarrangör på ${what}. Du kan redigera eventet och sköta gästlistan.`
    : `${inviter} har bjudit in dig till teamet för ${brand}. Du får jobba med varumärkets event, gäster, CRM och utskick.`;
  const html = shell(`
    <p style="margin:0 0 6px;font-size:14px;color:#6e6e73;">Hej!</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;">${esc(event || brand)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3a3e;">${esc(lead)}</p>
    ${button(loginUrl, "Logga in och gå med")}
    <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6e6e73;">Logga in med den här mejladressen. Ingen inloggning med lösenord, du får en länk. Inbjudan gäller i 30 dagar. Väntade du dig inte det här kan du strunta i mejlet.</p>
  `, "Skickat via PullUp.");
  const text = [
    "Hej!",
    "",
    lead,
    "",
    `Logga in och gå med: ${loginUrl}`,
    "",
    "Logga in med den här mejladressen. Inbjudan gäller i 30 dagar. Väntade du dig inte det här kan du strunta i mejlet.",
  ].join("\n");
  return { subject, html, text };
}
