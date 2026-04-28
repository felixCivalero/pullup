import { Users, Mail } from "lucide-react";

const ITEMS = [
  { id: "segment", label: "Segment", icon: Users },
  { id: "email", label: "Email", icon: Mail },
];

export default function ComposerSidebar({ activeSection, onSelect }) {
  return (
    <nav
      aria-label="Composer sections"
      style={{
        width: "220px",
        flex: "0 0 220px",
        padding: "16px 12px",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid transparent",
              background: active ? "rgba(255,255,255,0.06)" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.7)",
              fontSize: "14px",
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
