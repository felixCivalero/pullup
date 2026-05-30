// frontend/src/components/SettingsBrandSection.jsx
//
// The host's brand editor — five tokens that travel with every guest-
// facing surface (event page, email confirms, WhatsApp signature/voice).
// Sits in the light dashboard zone of Settings, between Profile and
// WhatsApp.
//
// Layout:
//   1. Five starter palette swatches (one-click load all five tokens)
//   2. Four input rows: Primary / Background / Text / Font
//   3. Logo upload row (single field, optional)
//   4. Two live mini-previews side-by-side (event page + email)
//   5. Save button (only enabled when dirty)
//
// The live preview is the whole point — host sees their event page and
// their email update token-by-token as they tweak.

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Paintbrush, Type, Image as ImageIcon, Check } from "lucide-react";
import { colors } from "../theme/colors.js";
import {
  FONTS,
  PALETTES,
  resolveBrand,
  loadBrandFont,
  softColor,
  pickTextColor,
} from "../lib/brand.js";

const cardStyle = {
  padding: "14px 16px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "12px",
};

const inputBoxStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.background,
  color: colors.text,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function ColorRow({ label, value, onChange, allowAuto = false, isAuto = false, onAutoToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
      <div style={{ flex: "0 0 92px", fontSize: 13, fontWeight: 600, color: colors.text }}>
        {label}
      </div>
      <div style={{ position: "relative", flex: "0 0 44px", height: 36 }}>
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: isAuto ? 0.4 : 1,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            borderRadius: 8,
          }}
          aria-label={`${label} color picker`}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: isAuto ? colors.surfaceMuted : (value || "#fff"),
            pointerEvents: "none",
          }}
        />
      </div>
      <input
        type="text"
        value={isAuto ? "auto" : (value || "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex"
        disabled={isAuto}
        style={{
          ...inputBoxStyle,
          flex: 1,
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          fontSize: 13,
          opacity: isAuto ? 0.5 : 1,
        }}
      />
      {allowAuto && (
        <button
          type="button"
          onClick={onAutoToggle}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: `1px solid ${isAuto ? colors.accentBorder : colors.border}`,
            background: isAuto ? colors.accentSoft : colors.background,
            color: isAuto ? colors.accent : colors.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          Auto
        </button>
      )}
    </div>
  );
}

function PaletteSwatch({ palette, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(palette)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "10px 12px",
        gap: 8,
        borderRadius: 12,
        border: `1px solid ${active ? colors.accentBorder : colors.border}`,
        background: active ? colors.accentSoft : colors.background,
        cursor: "pointer",
        textAlign: "left",
        minWidth: 0,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <div style={{ display: "flex", gap: 4, height: 16 }}>
        <div style={{ flex: 1, background: palette.background, borderRadius: 4, border: `1px solid ${colors.borderFaint}` }} />
        <div style={{ flex: 1, background: palette.primaryColor, borderRadius: 4 }} />
        <div style={{ flex: 1, background: palette.textColor, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
        {palette.name}
      </div>
    </button>
  );
}

// ── Live mini-previews ───────────────────────────────────────────────

function EventPagePreview({ brand }) {
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        background: brand.background,
        color: brand.textColor,
        fontFamily: brand.fontCss,
        padding: "16px 18px",
        boxShadow: "0 2px 12px rgba(10,10,10,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6, marginBottom: 14 }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" style={{ height: 16, maxWidth: 60, objectFit: "contain" }} />
        ) : (
          <div style={{ width: 20, height: 6, background: brand.textColor, opacity: 0.4, borderRadius: 2 }} />
        )}
        <span>EVENT PAGE</span>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.15,
          marginBottom: 4,
          color: brand.textColor,
        }}
      >
        Sundowner Sessions #04
      </div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 14 }}>
        Saturday at 19:00 · Skansenbron
      </div>
      <button
        type="button"
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: "none",
          background: brand.primaryColor,
          color: brand.inkOnPrimary,
          fontSize: 13,
          fontWeight: 700,
          cursor: "default",
          fontFamily: brand.fontCss,
        }}
      >
        RSVP
      </button>
      <div style={{ fontSize: 11, opacity: 0.45, marginTop: 12 }}>
        Going · Mia, Adam, +18 others
      </div>
    </div>
  );
}

function EmailPreview({ brand }) {
  // Email canvas defaults to brand background but clamps to legible
  // contrast on the previewed content. Header bar uses primary color.
  const headerInk = brand.inkOnPrimary;
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        background: brand.background,
        color: brand.textColor,
        fontFamily: brand.fontCss,
        boxShadow: "0 2px 12px rgba(10,10,10,0.06)",
      }}
    >
      <div
        style={{
          background: brand.primaryColor,
          color: headerInk,
          padding: "10px 16px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{brand.logoUrl ? "" : "PullUp"}</span>
        <span style={{ opacity: 0.75, fontSize: 10 }}>EMAIL</span>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: brand.textColor }}>
          Hey Adam — you're confirmed
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, marginBottom: 12 }}>
          Sundowner Sessions #04 on Saturday at 19:00, Skansenbron. Looking forward to it 👋
        </div>
        <button
          type="button"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: brand.primaryColor,
            color: brand.inkOnPrimary,
            fontSize: 12,
            fontWeight: 700,
            cursor: "default",
            fontFamily: brand.fontCss,
          }}
        >
          Open event
        </button>
      </div>
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────

export function SettingsBrandSection({ user, setUser, onSave, showToast }) {
  // Working state (uncommitted edits). null means "not set, use auto / default."
  const [primary, setPrimary]       = useState(user?.brand_primary_color || null);
  const [background, setBackground] = useState(user?.brand_background || null);
  const [text, setText]             = useState(user?.brand_text_color || null);
  const [font, setFont]             = useState(user?.brand_font_family || "Inter");
  const [logoUrl, setLogoUrl]       = useState(user?.brand_logo_url || null);
  const [saving, setSaving]         = useState(false);

  const draft = useMemo(
    () => ({
      primaryColor: primary,
      background,
      textColor: text,
      fontFamily: font,
      logoUrl,
    }),
    [primary, background, text, font, logoUrl],
  );
  const resolved = useMemo(() => resolveBrand(draft), [draft]);

  // Lazy-load whichever font the host is previewing so the mini-previews
  // render in the real face, not a fallback.
  useEffect(() => {
    loadBrandFont(resolved);
  }, [resolved]);

  const initial = useMemo(
    () => ({
      primary:    user?.brand_primary_color || null,
      background: user?.brand_background || null,
      text:       user?.brand_text_color || null,
      font:       user?.brand_font_family || "Inter",
      logoUrl:    user?.brand_logo_url || null,
    }),
    [user],
  );
  const dirty =
    primary !== initial.primary ||
    background !== initial.background ||
    text !== initial.text ||
    font !== initial.font ||
    logoUrl !== initial.logoUrl;

  const applyPalette = (palette) => {
    setPrimary(palette.primaryColor);
    setBackground(palette.background);
    setText(palette.textColor);
    setFont(palette.fontFamily);
  };

  const isAutoText = !text;

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const ok = await onSave({
        brand_primary_color: primary || null,
        brand_background:    background || null,
        brand_text_color:    text || null,
        brand_font_family:   font || null,
        brand_logo_url:      logoUrl || null,
      });
      if (ok) {
        setUser?.((prev) =>
          prev
            ? {
                ...prev,
                brand_primary_color: primary,
                brand_background: background,
                brand_text_color: text,
                brand_font_family: font,
                brand_logo_url: logoUrl,
              }
            : prev,
        );
        showToast?.("Brand saved — it now travels with every event", "success");
      }
    } catch (err) {
      showToast?.(err?.message || "Could not save brand", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 4,
            color: colors.text,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Paintbrush size={18} color={colors.accent} />
          Brand
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          One palette that travels with you. Your event pages, your email
          confirmations, and the cover image on every WhatsApp — all from a
          single place. PullUp's chrome stays neutral so yours can land.
        </p>
      </div>

      {/* Starter palettes */}
      <div style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: colors.textSubtle,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Sparkles size={13} color={colors.accent} />
          Starter palettes
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
          }}
        >
          {PALETTES.map((p) => (
            <PaletteSwatch
              key={p.name}
              palette={p}
              active={
                primary === p.primaryColor &&
                background === p.background &&
                text === p.textColor &&
                font === p.fontFamily
              }
              onClick={applyPalette}
            />
          ))}
        </div>
      </div>

      {/* Color + font editor */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <ColorRow
          label="Primary"
          value={primary}
          onChange={(v) => setPrimary(v || null)}
        />
        <ColorRow
          label="Background"
          value={background}
          onChange={(v) => setBackground(v || null)}
        />
        <ColorRow
          label="Text"
          value={text || resolved.textColor}
          onChange={(v) => setText(v || null)}
          allowAuto
          isAuto={isAutoText}
          onAutoToggle={() => setText(isAutoText ? resolved.textColor : null)}
        />

        {/* Font row */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
          <div style={{ flex: "0 0 92px", fontSize: 13, fontWeight: 600, color: colors.text }}>
            <Type size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Font
          </div>
          <select
            value={font || "Inter"}
            onChange={(e) => setFont(e.target.value)}
            style={{ ...inputBoxStyle, flex: 1, cursor: "pointer" }}
          >
            {FONTS.map((f) => (
              <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>
                {f.name} · {f.category}
              </option>
            ))}
          </select>
        </div>

        {/* Logo URL row — accepts a public URL for now; upload UI later. */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
          <div style={{ flex: "0 0 92px", fontSize: 13, fontWeight: 600, color: colors.text }}>
            <ImageIcon size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Logo
          </div>
          <input
            type="url"
            value={logoUrl || ""}
            onChange={(e) => setLogoUrl(e.target.value || null)}
            placeholder="https://… (public URL, optional)"
            style={{ ...inputBoxStyle, flex: 1, fontSize: 13 }}
          />
        </div>
      </div>

      {/* Live previews */}
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: colors.textSubtle,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Live preview
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <EventPagePreview brand={resolved} />
          <EmailPreview brand={resolved} />
        </div>
      </div>

      {/* Save */}
      {dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "11px 24px",
              borderRadius: 999,
              border: "none",
              background: colors.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
              boxShadow: colors.accentShadow,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {saving ? "Saving…" : (
              <>
                <Check size={14} />
                Save brand
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default SettingsBrandSection;
