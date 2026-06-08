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
              display: "flex", alignItems: "center", gap: 11, padding: "10px 12px",
              borderRadius: 12, border: `1px solid ${p.tint}33`,
              background: `linear-gradient(135deg, ${p.tint}16 0%, ${p.tint}08 100%)`,
              textDecoration: "none", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#fff", border: `1px solid ${p.tint}40`, color: p.tint,
            }}>
              <Icon size={15} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: p.tint }}>{p.label}</span>
              <span style={{ fontSize: 12, color: colors.textMuted }}>{p.sub}</span>
            </div>
            <ChevronRight size={16} style={{ color: `${p.tint}99`, flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}
