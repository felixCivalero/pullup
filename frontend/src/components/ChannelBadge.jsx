/**
 * ChannelBadge — the per-channel identity chip for the RSVP form rows.
 *
 * Each sign-up channel wears its real brand: WhatsApp green, the Instagram
 * gradient, and a calm neutral chip for the always-on essentials (Name, Email).
 * Shared between the editor (CreateEventPage) and the onboarding wizard
 * (CreateWizard) so the two surfaces never drift.
 */

import { User, Mail } from "lucide-react";
import { FaInstagram } from "react-icons/fa";
import { FaWhatsapp } from "react-icons/fa6";
import { colors } from "../theme/colors.js";

// `accent` is the colour the row's active Optional/Required pill adopts, so the
// brand shows up in both the glyph and the chosen toggle. `solid` chips carry a
// filled brand background + white glyph; soft chips (the essentials) sit quietly.
export const CHANNEL_BRAND = {
  name: {
    label: "Name",
    Icon: User,
    bg: colors.borderFaint,
    fg: colors.text,
    solid: false,
    accent: colors.accent,
  },
  email: {
    label: "Email",
    Icon: Mail,
    bg: colors.borderFaint,
    fg: colors.text,
    solid: false,
    accent: colors.accent,
  },
  whatsapp: {
    label: "WhatsApp",
    Icon: FaWhatsapp,
    bg: colors.whatsapp,
    fg: "#ffffff",
    solid: true,
    accent: colors.whatsapp,
  },
  instagram: {
    label: "Instagram",
    Icon: FaInstagram,
    bg: colors.gradientInstagram,
    fg: "#ffffff",
    solid: true,
    accent: colors.gradientInstagram,
  },
};

export function ChannelBadge({ channel, size = 30 }) {
  const b = CHANNEL_BRAND[channel];
  if (!b) return null;
  const Icon = b.Icon;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.round(size * 0.32),
        background: b.bg,
        color: b.fg,
        border: b.solid ? "none" : `1px solid ${colors.border}`,
        boxShadow: b.solid ? "0 1px 2px rgba(10,10,10,0.12)" : "none",
      }}
    >
      <Icon size={Math.round(size * 0.52)} />
    </span>
  );
}
