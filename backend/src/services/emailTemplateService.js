// backend/src/services/emailTemplateService.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEventUrl } from "../utils/urlUtils.js";

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

  // Generate CTA URL
  const ctaUrl = event?.slug ? getEventUrl(event.slug) : "#";
  if (!event?.slug) {
    console.warn("[renderEventEmailTemplate] Event slug missing, CTA URL will be #");
  } else {
    console.log(`[renderEventEmailTemplate] Generated CTA URL: ${ctaUrl} for event: ${event.title}`);
  }

  // Replace template variables
  const replacements = {
    // Hero image
    "{{{hero_img_url}}}": event?.imageUrl || "",
    "{{{hero_img_alt}}}": event?.title || "Event",

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

    // Resend unsubscribe URL (Resend will replace this automatically)
    "{{{RESEND_UNSUBSCRIBE_URL}}}": "{{{RESEND_UNSUBSCRIBE_URL}}}",
  };

  // Perform replacements
  for (const [key, value] of Object.entries(replacements)) {
    // Use global replace to handle multiple occurrences
    html = html.split(key).join(value);
  }

  // Clean up empty sections (remove quote/note if empty)
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

  return html;
}

