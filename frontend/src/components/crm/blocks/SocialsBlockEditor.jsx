import { AlignLeft, AlignCenter, AlignRight, Globe } from "lucide-react";
import { FaInstagram, FaSpotify, FaTiktok, FaSoundcloud, FaYoutube } from "react-icons/fa";
import { colors } from "../../../theme/colors.js";

const DEFAULT_ALIGN = "center";

// Platform catalogue. `key` is the stable identifier we store on each link;
// `label` is the visible text in the rendered email.
const PLATFORMS = [
  { key: "instagram",  label: "Instagram",  icon: FaInstagram,  placeholder: "https://instagram.com/yourhandle" },
  { key: "spotify",    label: "Spotify",    icon: FaSpotify,    placeholder: "https://open.spotify.com/artist/…" },
  { key: "tiktok",     label: "TikTok",     icon: FaTiktok,     placeholder: "https://tiktok.com/@yourhandle" },
  { key: "soundcloud", label: "SoundCloud", icon: FaSoundcloud, placeholder: "https://soundcloud.com/yourhandle" },
  { key: "youtube",    label: "YouTube",    icon: FaYoutube,    placeholder: "https://youtube.com/@yourchannel" },
  { key: "website",    label: "Website",    icon: Globe,        placeholder: "https://yourwebsite.com" },
];

export default function SocialsBlockEditor({ block, onChange }) {
  const align = block.align || DEFAULT_ALIGN;
  // Index existing links by key so the form fields can show current values.
  const byKey = Object.fromEntries((block.links || []).map((l) => [l.key, l]));

  function setUrl(platformKey, label, url) {
    const next = PLATFORMS
      .map((p) => {
        if (p.key === platformKey) {
          return url.trim() ? { key: p.key, label: p.label, url: url.trim() } : null;
        }
        return byKey[p.key] || null;
      })
      .filter(Boolean);
    onChange({ ...block, links: next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {PLATFORMS.map((p) => {
        const Icon = p.icon;
        const current = byKey[p.key]?.url || "";
        return (
          <div key={p.key} style={inputRowStyle}>
            <Icon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
            <input
              type="url"
              value={current}
              onChange={(e) => setUrl(p.key, p.label, e.target.value)}
              placeholder={p.placeholder}
              style={inputStyle}
            />
          </div>
        );
      })}

      <div style={fieldGroupStyle}>
        <div style={fieldLabelStyle}><span>Align</span></div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { v: "left", icon: AlignLeft, label: "Left" },
            { v: "center", icon: AlignCenter, label: "Center" },
            { v: "right", icon: AlignRight, label: "Right" },
          ].map((opt) => {
            const Icon = opt.icon;
            const active = align === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onChange({ ...block, align: opt.v })}
                title={opt.label}
                style={alignBtnStyle(active)}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const inputRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.text,
};

const inputStyle = {
  flex: 1,
  background: "transparent",
  border: "none",
  color: colors.text,
  fontSize: 13,
  outline: "none",
  padding: 0,
};

const fieldGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 8,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
};

const fieldLabelStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: colors.textSubtle,
};

const alignBtnStyle = (active) => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: `1px solid ${active ? colors.accentBorder : colors.border}`,
  background: active ? colors.accentSoft : "#fff",
  color: active ? colors.accent : colors.textMuted,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
