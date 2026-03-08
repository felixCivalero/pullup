// backend/src/services/emailTemplateService.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEventUrl } from "../utils/urlUtils.js";

/**
 * Format a Date for event cards: "Mon 10 Mar · 19:00"
 */
function formatEventDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${dayName} ${dayNum} ${monthName} · ${hours}:${minutes}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load the Resend email template HTML
 */
function loadEmailTemplate() {
  const templatePath = path.join(
    __dirname,
    "../templates/resendEventTemplate.html"
  );
  try {
    return fs.readFileSync(templatePath, "utf-8");
  } catch (error) {
    console.error("Error loading email template:", error);
    throw new Error("Failed to load email template");
  }
}

/**
 * Render Resend email template with variables
 * @param {Object} params
 * @param {Object} params.event - Event data
 * @param {Object} params.templateContent - { headline, introQuote, introBody, introGreeting, introNote, signoffText, ctaLabel }
 * @param {Object} params.person - Person data (for personalization, optional)
 * @returns {string} HTML email content
 */
export function renderEventEmailTemplate({ event, templateContent, person }) {
  let html = loadEmailTemplate();

  // Generate CTA URL (allow override from templateContent)
  const ctaUrl =
    (templateContent && templateContent.ctaUrl) ||
    (event?.slug ? getEventUrl(event.slug) : "#");
  if (!event?.slug && !templateContent?.ctaUrl) {
    console.warn(
      "[renderEventEmailTemplate] Event slug and custom CTA URL missing, CTA URL will be #"
    );
  } else {
    console.log(
      `[renderEventEmailTemplate] Generated CTA URL: ${ctaUrl} for event: ${
        event?.title || "n/a"
      }`
    );
  }

  // Replace template variables
  const replacements = {
    // Hero image
    "{{{hero_img_url}}}": templateContent.heroImageUrl || event?.imageUrl || "",
    "{{{hero_img_alt}}}":
      templateContent.heroImageAlt || event?.title || "Event",

    // Headline
    "{{{headline_text}}}": templateContent.headline || event?.title || "",

    // Intro sections
    "{{{intro_quote}}}": templateContent.introQuote || "",
    "{{{intro_body}}}": templateContent.introBody || "",
    "{{{intro_greeting}}}": templateContent.introGreeting || "",
    "{{{intro_note}}}": templateContent.introNote || "",

    // Signoff
    "{{{signoff_text}}}": templateContent.signoffText || "",

    // CTA - Use pre-generated URL
    "{{{cta_url}}}": ctaUrl,

    // CTA label (if the template uses it)
    "{{{cta_label}}}": templateContent.ctaLabel || "TO EVENT",

    // Resend unsubscribe URL (Resend will replace this automatically)
    "{{{RESEND_UNSUBSCRIBE_URL}}}": "{{{RESEND_UNSUBSCRIBE_URL}}}",
  };

  // Perform replacements
  for (const [key, value] of Object.entries(replacements)) {
    // Use global replace to handle multiple occurrences
    html = html.split(key).join(value);
  }

  // Clean up empty sections (remove quote/greeting/note/signoff if empty)
  if (!templateContent.introQuote) {
    // Remove the intro-quote paragraph
    html = html.replace(
      /<p\s+class="intro-quote"[^>]*>.*?<\/p>/gs,
      ""
    );
  }

  if (!templateContent.introNote) {
    // Remove the intro-note paragraph
    html = html.replace(
      /<p\s+class="intro-note"[^>]*>.*?<\/p>/gs,
      ""
    );
  }

  if (!templateContent.introGreeting) {
    html = html.replace(
      /<p\s+class="intro-greeting"[^>]*>.*?<\/p>/gs,
      ""
    );
  }

  if (!templateContent.signoffText) {
    html = html.replace(
      /<p\s+class="signoff"[^>]*>.*?<\/p>/gs,
      ""
    );
  }

  return html;
}

/**
 * Load the Weekly Happenings newsletter template HTML
 */
function loadWeeklyHappeningsTemplate() {
  const templatePath = path.join(
    __dirname,
    "../templates/weeklyHappeningsTemplate.html"
  );
  try {
    return fs.readFileSync(templatePath, "utf-8");
  } catch (error) {
    console.error("Error loading weekly happenings template:", error);
    throw new Error("Failed to load weekly happenings template");
  }
}

/**
 * Render Weekly Happenings newsletter template
 * @param {Object} params
 * @param {Array} params.events - Array of event objects with title, starts_at, location, description, url, image_url
 * @param {Object} params.templateContent - { headline, body }
 * @returns {string} HTML email content
 */
export function renderWeeklyHappeningsTemplate({ events, templateContent }) {
  let html = loadWeeklyHappeningsTemplate();

  const headlineText =
    (templateContent && templateContent.headline) || "This Week in Stockholm";
  const introBody = (templateContent && templateContent.body) || "";

  // Build events HTML
  const eventCards = (events || []);
  let eventsHtml = "";

  for (let i = 0; i < eventCards.length; i++) {
    const ev = eventCards[i];
    const isLast = i === eventCards.length - 1;

    const formattedDate = formatEventDate(ev.starts_at);
    const metaLine = [formattedDate, ev.location]
      .filter(Boolean)
      .join(" · ");

    const description = ev.description
      ? ev.description.length > 160
        ? ev.description.slice(0, 160).trimEnd() + "…"
        : ev.description
      : "";

    const eventUrl = ev.url || "#";

    const imageHtml = ev.image_url
      ? `<img
          src="${ev.image_url}"
          alt="${(ev.title || "").replace(/"/g, "&quot;")}"
          width="100%"
          style="display:block;outline:none;border:none;text-decoration:none;width:100%;max-width:100%;border-radius:10px 10px 0 0;object-fit:cover;max-height:280px;" />`
      : "";

    const dividerHtml = isLast
      ? ""
      : `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0 0 0;" />`;

    eventsHtml += `
<table
  width="100%"
  border="0"
  cellpadding="0"
  cellspacing="0"
  role="presentation"
  style="margin-bottom:0;">
  <tbody>
    <tr>
      <td style="padding:16px 0 0 0;">
        <table
          width="100%"
          border="0"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tbody>
            <tr>
              <td>
                ${imageHtml}
                <table
                  width="100%"
                  border="0"
                  cellpadding="0"
                  cellspacing="0"
                  role="presentation">
                  <tbody>
                    <tr>
                      <td style="padding:14px 16px 6px 16px;">
                        <h3 style="margin:0;font-size:1.1em;font-weight:600;color:#ffffff;line-height:1.3;">${ev.title || ""}</h3>
                      </td>
                    </tr>
                    ${metaLine ? `<tr><td style="padding:2px 16px 6px 16px;font-size:0.82em;color:rgba(255,255,255,0.5);">${metaLine}</td></tr>` : ""}
                    ${description ? `<tr><td style="padding:4px 16px 10px 16px;font-size:0.9em;color:rgba(255,255,255,0.75);line-height:1.5;">${description}</td></tr>` : ""}
                    <tr>
                      <td style="padding:8px 16px 16px 16px;">
                        <a
                          href="${eventUrl}"
                          target="_blank"
                          style="display:inline-block;text-decoration:none;padding:8px 20px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#ffffff;font-size:0.82em;font-weight:600;letter-spacing:0.04em;">View event &rarr;</a>${ev.spotify_url ? `
                        <a
                          href="${ev.spotify_url}"
                          target="_blank"
                          style="display:inline-block;text-decoration:none;padding:8px 16px;border-radius:999px;background:rgba(30,215,96,0.15);border:1px solid rgba(30,215,96,0.35);color:#1ed760;font-size:0.82em;font-weight:600;letter-spacing:0.04em;margin-left:8px;vertical-align:middle;">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spotify_icon.svg/232px-Spotify_icon.svg.png" alt="Spotify" width="16" height="16" style="vertical-align:middle;margin-right:4px;border:0;" />Listen</a>` : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        ${dividerHtml}
      </td>
    </tr>
  </tbody>
</table>`;
  }

  // Perform replacements
  const replacements = {
    "{{{headline_text}}}": headlineText,
    "{{{intro_body}}}": introBody,
    "{{{events_html}}}": eventsHtml,
    // Keep Resend unsubscribe placeholder as-is (Resend replaces it)
    "{{{RESEND_UNSUBSCRIBE_URL}}}": "{{{RESEND_UNSUBSCRIBE_URL}}}",
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  return html;
}
