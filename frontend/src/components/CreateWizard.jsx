import { useState, useRef, useEffect } from "react";
import {
  ArrowRight, ArrowLeft, Sparkles, Type, CalendarDays,
  MapPin, Users, Clock, UserPlus, UtensilsCrossed, RefreshCw, X,
} from "lucide-react";
import { LocationAutocomplete } from "./LocationAutocomplete.jsx";
import { LocationMap } from "./LocationMap.jsx";
import { PullupEyes } from "./PullupEyes.jsx";
import { fetchTimezoneForLocation } from "../lib/timezone.js";
import { colors } from "../theme/colors.js";
import { ChannelBadge, CHANNEL_BRAND } from "./ChannelBadge.jsx";

// The guided first-run for a BRAND-NEW event. It fronts the skeleton — name,
// when, where, who-can-join — one focused question at a time, each skippable,
// each writing straight to the editor's own state (local-first, no new save
// plumbing). When it's done it steps aside and reveals the editor, which is now
// free to be purely creative (cover, content, look). Edit + duplicate never see
// this — they go straight to the editor.
//
// It deliberately owns NO data of its own. Everything it touches is a setter
// from CreateEventPage, so the live preview underneath is already populated the
// moment the wizard closes.

// --- date <-> datetime-local helpers (mirror CreateEventPage's, kept local so
// the wizard has no import coupling to the 5k-line editor) -------------------
function isoToLocal(iso) {
  if (!iso) return "";
  // Already a local "YYYY-MM-DDTHH:mm" — pass through.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localToIso(local) {
  if (!local) return "";
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

// A friendly read-back of the chosen moment — "Sat, Jun 14 · 7:00 PM".
function prettyMoment(iso) {
  const local = isoToLocal(iso);
  if (!local) return "";
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

// The editor seeds these as preview placeholders, not real input. Treat them as
// empty so the host starts on a clean field.
const SENTINELS = new Set(["Event Name", "Slakthusområdet"]);
const clean = (v) => (SENTINELS.has((v || "").trim()) ? "" : v || "");

const STEPS = [
  { key: "name", icon: Type, eyebrow: "The basics" },
  { key: "when", icon: CalendarDays, eyebrow: "The basics" },
  { key: "where", icon: MapPin, eyebrow: "The basics" },
  { key: "who", icon: Users, eyebrow: "Sign-up" },
];

// --- small local controls (self-contained — no editor coupling) -------------
function Segmented({ value, onChange, options, accent = colors.accent }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 2, background: colors.background, border: `1px solid ${colors.border}`, borderRadius: 9 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        const isOff = opt.key === "off";
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "inherit",
              background: active ? (isOff ? colors.border : accent) : "transparent",
              color: active ? (isOff ? colors.text : "#fff") : colors.textMuted,
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 44, height: 26, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
        background: checked ? colors.accent : colors.border, position: "relative",
        transition: "background 160ms ease", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 160ms ease",
      }} />
    </button>
  );
}

// −/+ stepper for small bounded counts (e.g. max plus-ones per guest).
function Stepper({ value, onChange, min = 1, max = 5 }) {
  const n = Math.max(min, Math.min(max, parseInt(value, 10) || min));
  const btn = (disabled) => ({
    width: 30, height: 30, borderRadius: 8, border: `1px solid ${colors.border}`,
    background: colors.background, color: disabled ? colors.textFaded : colors.text,
    fontSize: 17, fontWeight: 600, lineHeight: 1, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center",
  });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button type="button" style={btn(n <= min)} disabled={n <= min} onClick={() => onChange(String(n - 1))}>−</button>
      <span style={{ minWidth: 16, textAlign: "center", fontSize: 15, fontWeight: 700, color: colors.text }}>{n}</span>
      <button type="button" style={btn(n >= max)} disabled={n >= max} onClick={() => onChange(String(n + 1))}>+</button>
    </div>
  );
}

function OptionRow({ icon, label, description, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, padding: "12px 14px",
      background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 11,
    }}>
      <span style={{ flexShrink: 0, color: colors.textMuted, display: "inline-flex" }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 1, lineHeight: 1.4 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

// "Reveal later" — hide the real date/place behind a teaser hint until you
// announce it. Mirrors the editor's hideDate / hideLocation controls so a host
// can set the whole logistics intent without leaving the wizard.
function RevealLater({ on, onToggle, label, hint, setHint, placeholder, note }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Toggle checked={on} onChange={onToggle} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.text }}>{label}</span>
      </div>
      {on && (
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={placeholder}
            maxLength={80}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
              color: colors.text, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 9, outline: "none",
            }}
          />
          {note && <div style={{ fontSize: 11.5, color: colors.textFaded, marginTop: 7, lineHeight: 1.45 }}>{note}</div>}
        </div>
      )}
    </div>
  );
}

export function CreateWizard(props) {
  const {
    // identity
    title, setTitle,
    startsAt, setStartsAt, endsAt, setEndsAt,
    hideDate, setHideDate, dateRevealHint, setDateRevealHint,
    location, setLocation, locationLat, locationLng,
    setLocationLat, setLocationLng, setLocationPlaceId, setTimezone,
    hideLocation, setHideLocation, revealHint, setRevealHint,
    // form / access
    collectPhone, setCollectPhone, requirePhone, setRequirePhone,
    collectInstagram, setCollectInstagram, requireInstagram, setRequireInstagram,
    maxAttendees, setMaxAttendees,
    waitlistEnabled, setWaitlistEnabled,
    instantWaitlist, setInstantWaitlist,
    allowPlusOnes, setAllowPlusOnes,
    maxPlusOnesPerGuest, setMaxPlusOnesPerGuest,
    dinnerEnabled, setDinnerEnabled,
    // control
    onDone,
  } = props;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState("fwd");
  const [showEnd, setShowEnd] = useState(!!endsAt);
  const nameRef = useRef(null);

  // Autofocus the name field on first paint — the host should be typing within
  // a heartbeat of landing.
  useEffect(() => {
    if (step === 0) nameRef.current?.focus();
  }, [step]);

  const total = STEPS.length;
  const go = (next) => {
    if (next < 0) return;
    if (next >= total) { onDone(); return; }
    setDir(next > step ? "fwd" : "back");
    setStep(next);
  };

  // 3-state mode <-> (collect, require) for the WhatsApp / Instagram rows.
  const modeOf = (collect, require) => (!collect ? "off" : require ? "required" : "optional");

  // One place to land a chosen location, used by BOTH the search box and the
  // map pin so they stay in lock-step. Mirrors the editor (timezone from pin).
  const applyPlace = async ({ address, lat, lng, placeId }) => {
    if (address != null) setLocation(address);
    setLocationLat?.(lat ?? null);
    setLocationLng?.(lng ?? null);
    setLocationPlaceId?.(placeId || null);
    if (lat != null && lng != null && setTimezone) {
      const tz = await fetchTimezoneForLocation(lat, lng);
      if (tz) setTimezone(tz);
    }
  };

  const cur = STEPS[step];
  const StepIcon = cur.icon;

  // Enter advances on the simple text steps.
  const onEnterNext = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(step + 1); }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 4000,
        background: colors.surface,
        display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <style>{`
        @keyframes wizFwd { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes wizBack { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Top bar — brand mark, progress, and the quiet exit. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <PullupEyes variant="small" style={{ width: 26, height: 22, display: "block" }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.text, letterSpacing: "-0.01em" }}>New event</span>
        </div>
        {/* Segmented progress */}
        <div style={{ flex: 1, display: "flex", gap: 5 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{
              flex: 1, height: 4, borderRadius: 999,
              background: i <= step ? colors.accent : colors.border,
              transition: "background 240ms ease",
            }} />
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
            background: "none", border: "none", cursor: "pointer", color: colors.textMuted,
            fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", padding: "6px 8px",
          }}
          title="Skip the setup — fill these in later"
        >
          Set up later <X size={14} />
        </button>
      </div>

      {/* Center stage — one question, scrollable for the taller last screen. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div
          key={step}
          style={{
            margin: "auto", width: "100%", maxWidth: 560, padding: "24px 22px 40px", boxSizing: "border-box",
            animation: `${dir === "fwd" ? "wizFwd" : "wizBack"} 0.32s cubic-bezier(0.22,1,0.36,1)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.accent, marginBottom: 14 }}>
            <StepIcon size={16} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {cur.eyebrow} · {step + 1} of {total}
            </span>
          </div>

          {/* ---- NAME ---- */}
          {cur.key === "name" && (
            <div>
              <h1 style={titleStyle}>What are you calling it?</h1>
              <p style={subStyle}>A working title is fine — you can rename it any time.</p>
              <input
                ref={nameRef}
                value={clean(title)}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onEnterNext}
                placeholder="Untitled event"
                style={bigInputStyle}
              />
            </div>
          )}

          {/* ---- WHEN ---- */}
          {cur.key === "when" && (
            <div>
              <h1 style={titleStyle}>When is it?</h1>
              <p style={subStyle}>
                {hideDate
                  ? "The date stays hidden — guests see your teaser until you reveal it."
                  : prettyMoment(startsAt) ? `Starts ${prettyMoment(startsAt)}` : "Pick a start — you can move it later."}
              </p>
              <input
                type="datetime-local"
                value={isoToLocal(startsAt)}
                onChange={(e) => setStartsAt(e.target.value ? localToIso(e.target.value) : "")}
                onKeyDown={onEnterNext}
                style={{ ...bigInputStyle, fontSize: 20, maxWidth: 340, opacity: hideDate ? 0.55 : 1 }}
              />
              <div style={{ marginTop: 18 }}>
                {!showEnd ? (
                  <button type="button" onClick={() => setShowEnd(true)} style={ghostLinkStyle}>
                    + Add an end time
                  </button>
                ) : (
                  <div>
                    <div style={smallLabelStyle}>Ends</div>
                    <input
                      type="datetime-local"
                      value={isoToLocal(endsAt)}
                      min={isoToLocal(startsAt) || undefined}
                      onChange={(e) => setEndsAt(e.target.value ? localToIso(e.target.value) : "")}
                      style={{ ...bigInputStyle, fontSize: 18, maxWidth: 340, marginTop: 4, opacity: hideDate ? 0.55 : 1 }}
                    />
                  </div>
                )}
              </div>
              <RevealLater
                on={hideDate}
                onToggle={(next) => {
                  setHideDate(next);
                  // Enabling reveal-later with no date set drops in a private
                  // placeholder (today + 30d) so the event can still publish and
                  // sort/remind — never shown publicly. Mirrors the editor.
                  if (next && !startsAt) {
                    setStartsAt(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
                  }
                }}
                label="Reveal the date later"
                hint={dateRevealHint}
                setHint={setDateRevealHint}
                placeholder="e.g. Date announced soon"
                note="The date above stays a private placeholder for sorting and reminders. Public shares show your hint instead."
              />
            </div>
          )}

          {/* ---- WHERE ---- */}
          {cur.key === "where" && (
            <div>
              <h1 style={titleStyle}>Where's it happening?</h1>
              <p style={subStyle}>
                {hideLocation
                  ? "The place stays hidden — guests see your teaser until you drop it."
                  : "Search a venue or address. You can keep it secret and reveal later."}
              </p>
              <div style={{ opacity: hideLocation ? 0.55 : 1 }}>
                <LocationAutocomplete
                  value={clean(location)}
                  placeholder="Search a place…"
                  onChange={(e) => setLocation(e.target.value)}
                  onLocationSelect={applyPlace}
                  style={bigInputStyle}
                />
              </div>
              <LocationMap
                lat={locationLat}
                lng={locationLng}
                onPick={applyPlace}
                dimmed={hideLocation}
              />
              <RevealLater
                on={hideLocation}
                onToggle={setHideLocation}
                label="Reveal the place later"
                hint={revealHint}
                setHint={setRevealHint}
                placeholder="e.g. Location drops Friday"
              />
            </div>
          )}

          {/* ---- WHO CAN JOIN ---- */}
          {cur.key === "who" && (
            <div>
              <h1 style={titleStyle}>Who can join, and how?</h1>
              <p style={subStyle}>Sensible defaults are set — tweak only what you care about.</p>

              <div style={smallLabelStyle}>What you collect at sign-up</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                {[
                  { label: "Name", channel: "name", fixed: true },
                  { label: "Email", channel: "email", fixed: true },
                  { label: "WhatsApp", channel: "whatsapp", collect: collectPhone, require: requirePhone, set: (c, r) => { setCollectPhone(c); setRequirePhone(r); } },
                  { label: "Instagram", channel: "instagram", collect: collectInstagram, require: requireInstagram, set: (c, r) => { setCollectInstagram(c); setRequireInstagram(r); } },
                ].map((row) => (
                  <div key={row.label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10,
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <ChannelBadge channel={row.channel} size={28} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{row.label}</span>
                    </span>
                    {row.fixed ? (
                      <span style={{ fontSize: 12, color: colors.textMuted }}>Always required</span>
                    ) : (
                      <Segmented
                        value={modeOf(row.collect, row.require)}
                        onChange={(m) => row.set(m !== "off", m === "required")}
                        accent={CHANNEL_BRAND[row.channel]?.accent || colors.accent}
                        options={[
                          { key: "off", label: "Off" },
                          { key: "optional", label: "Optional" },
                          { key: "required", label: "Required" },
                        ]}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div style={{ ...smallLabelStyle, marginTop: 24 }}>How it runs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                <OptionRow
                  icon={<Users size={19} />}
                  label="List capacity"
                  right={
                    <input
                      type="number" min="1" value={maxAttendees}
                      onChange={(e) => setMaxAttendees(e.target.value)}
                      placeholder="Unlimited"
                      style={{
                        width: 110, padding: "7px 11px", borderRadius: 9, border: `1px solid ${colors.border}`,
                        background: "#fff", color: colors.text, fontSize: 15, textAlign: "right", outline: "none", fontFamily: "inherit",
                      }}
                    />
                  }
                />
                {/* Waitlist-when-full only makes sense once there's a cap. */}
                {maxAttendees && (
                  <OptionRow
                    icon={<RefreshCw size={19} />}
                    label="Waitlist when full"
                    description="Keep taking sign-ups past the cap as a waitlist."
                    right={<Toggle checked={waitlistEnabled} onChange={setWaitlistEnabled} />}
                  />
                )}
                <OptionRow
                  icon={<Clock size={19} />}
                  label="Approve who gets in"
                  description="Everyone registers interest; you let people in."
                  right={<Toggle checked={instantWaitlist} onChange={setInstantWaitlist} />}
                />
                <OptionRow
                  icon={<UserPlus size={19} />}
                  label="Allow plus-ones"
                  description="Guests can bring friends on one RSVP."
                  right={<Toggle checked={allowPlusOnes} onChange={setAllowPlusOnes} />}
                />
                {allowPlusOnes && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 10px 47px", marginTop: -3 }}>
                    <span style={{ fontSize: 13, color: colors.textMuted }}>Max friends per guest</span>
                    <Stepper value={maxPlusOnesPerGuest} onChange={setMaxPlusOnesPerGuest} min={1} max={5} />
                  </div>
                )}
                <OptionRow
                  icon={<UtensilsCrossed size={19} />}
                  label="Offer a food serving slot"
                  description="Seated dinner with timed slots — configure in the editor."
                  right={<Toggle checked={dinnerEnabled} onChange={setDinnerEnabled} />}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer nav — Back · Skip · Next. Kept in a centered column so the
          floating Messages pill never sits on the primary action. */}
      <div style={{ borderTop: `1px solid ${colors.border}`, background: colors.background }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
              cursor: step === 0 ? "default" : "pointer", color: step === 0 ? colors.textFaded : colors.textMuted,
              fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", padding: "8px 6px", opacity: step === 0 ? 0 : 1,
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => go(step + 1)}
            style={{
              background: "none", border: "none", cursor: "pointer", color: colors.textMuted,
              fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", padding: "8px 10px",
            }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => go(step + 1)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 20px", borderRadius: 999,
              border: "none", cursor: "pointer", background: colors.accent, color: "#fff",
              fontSize: 14, fontWeight: 700, fontFamily: "inherit", boxShadow: `0 6px 18px ${colors.accentSoftStrong || "rgba(236,23,143,0.25)"}`,
            }}
          >
            {step === total - 1 ? (<><Sparkles size={16} /> Start designing</>) : (<>Next <ArrowRight size={16} /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- shared inline styles ---------------------------------------------------
const titleStyle = {
  fontSize: 30, fontWeight: 800, color: colors.text, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1,
};
const subStyle = {
  fontSize: 15, color: colors.textMuted, margin: "10px 0 24px", lineHeight: 1.5,
};
const bigInputStyle = {
  width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 22, fontWeight: 600,
  fontFamily: "inherit", color: colors.text, background: colors.background,
  border: `1.5px solid ${colors.border}`, borderRadius: 13, outline: "none",
};
const smallLabelStyle = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.textSubtle,
};
const ghostLinkStyle = {
  background: "none", border: "none", cursor: "pointer", color: colors.accent,
  fontSize: 14, fontWeight: 600, fontFamily: "inherit", padding: 0,
};
