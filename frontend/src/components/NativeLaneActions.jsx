// frontend/src/components/NativeLaneActions.jsx
//
// Per-person quick-action affordances that hand off to native handlers:
//   Call         tel:+E164          — the "wait, where are you?" gesture
//   WhatsApp     wa.me/E164         — host's own thread (off-platform, intimate)
//   Email        mailto:address     — the classic fallback
//
// Designed for the LIGHT dashboard zone (white canvas, near-black ink,
// pink-accent hover). Reused across CRM person rows, event guest list,
// and anywhere a contact is exposed.
//
// Philosophy: PullUp doesn't try to intercept these. We surface the
// affordance and step back — the conversation happens in WhatsApp / phone
// / mail, and if the host wants to record what was said, they add a note.

import { Phone, Mail } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { colors } from "../theme/colors.js";

const E164_RE = /^\+[1-9][0-9]{6,14}$/;

function resolvePhone(person) {
  // Prefer the verified E.164. Fall back to legacy free-form `phone`,
  // attempting a loose normalization so wa.me still works for old imports.
  const e164 = person?.phone_e164;
  if (e164 && E164_RE.test(e164)) return e164;
  const raw = person?.phone;
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+") && digits.length >= 8) return digits;
  if (digits.length >= 8) return `+${digits}`;
  return null;
}

function digitsOnly(e164) {
  return (e164 || "").replace(/[^\d]/g, "");
}

function ActionPill({ href, title, label, icon, onClick }) {
  return (
    <a
      href={href}
      title={title}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        // Stop propagation so opening WhatsApp doesn't trigger
        // expand/select behavior on the parent row.
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        color: colors.text,
        fontSize: "12px",
        fontWeight: 500,
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.accentSoft;
        e.currentTarget.style.borderColor = colors.accentBorder;
        e.currentTarget.style.color = colors.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.surface;
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.color = colors.text;
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

/**
 * @param {object}  props
 * @param {object}  props.person     — { phone_e164, phone, email }
 * @param {boolean} [props.compact]  — drop labels, icons only
 * @param {string}  [props.waPrefill]— prefilled text for the wa.me link
 */
export function NativeLaneActions({ person, compact = false, waPrefill }) {
  const phone = resolvePhone(person);
  const email = person?.email && !String(person.email).endsWith("@anonymized.invalid")
    ? person.email
    : null;

  // If we have neither, render nothing — no empty strip.
  if (!phone && !email) return null;

  const waUrl = phone
    ? `https://wa.me/${digitsOnly(phone)}${waPrefill ? `?text=${encodeURIComponent(waPrefill)}` : ""}`
    : null;

  const iconSize = compact ? 13 : 14;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        marginTop: compact ? "4px" : "6px",
      }}
    >
      {phone && (
        <>
          <ActionPill
            href={`tel:${phone}`}
            title={`Call ${phone}`}
            label={compact ? null : "Call"}
            icon={<Phone size={iconSize} />}
          />
          <ActionPill
            href={waUrl}
            title={`Open WhatsApp chat with ${phone}`}
            label={compact ? null : "WhatsApp"}
            icon={<FaWhatsapp size={iconSize + 1} />}
          />
        </>
      )}
      {email && (
        <ActionPill
          href={`mailto:${email}`}
          title={`Email ${email}`}
          label={compact ? null : "Email"}
          icon={<Mail size={iconSize} />}
        />
      )}
    </div>
  );
}

export default NativeLaneActions;
