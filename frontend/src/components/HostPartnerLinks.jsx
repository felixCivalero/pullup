import { ShoppingBag, Wrench, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors.js";

// Host-only partner shelf in the event Room — ways to make THIS event bigger.
// Only the host sees it. Links carry the event name as a referral param
// (?ref=pullup&event=…) so partners land with context.
const PARTNERS = [
  {
    key: "zoda",
    label: "Buy Zoda for your event",
    sub: "Drinks delivered to the door",
    href: "https://zoda.com",
    icon: ShoppingBag,
    tint: "#ec178f",
  },
  {
    key: "showlighters",
    label: "Hire gear or experts from Showlighters",
    sub: "Lighting, sound & crew on demand",
    href: "https://showlighters.se",
    icon: Wrench,
    tint: "#0d9488",
  },
];

export function HostPartnerLinks({ event }) {
  return (
    <div style={{ marginBottom: 18, display: "grid", gap: 7 }}>
      {PARTNERS.map((p) => {
        const Icon = p.icon;
        // Carry the event name through so partners land with context.
        const href = event?.title ? `${p.href}?ref=pullup&event=${encodeURIComponent(event.title)}` : p.href;
        return (
          <a
            key={p.key}
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 11, padding: "8px 12px",
              borderRadius: 11, border: `1px solid ${colors.border}`, background: "#fff",
              textDecoration: "none", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: `${p.tint}14`, color: p.tint,
            }}>
              <Icon size={15} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 650, color: colors.text }}>{p.label}</span>
              <span style={{ fontSize: 12, color: colors.textMuted }}>{p.sub}</span>
            </div>
            <ChevronRight size={16} style={{ color: colors.textFaded, flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}
