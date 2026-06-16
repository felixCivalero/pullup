// useAuthOrder — gathers the client-side arrival signals and hands them to the
// pure resolveAuthOrder() ranker. This is the only place that touches browser
// globals + Vite env; the ranking itself stays pure and tested (authOrder.js).
import { useMemo } from "react";
import { resolveAuthOrder } from "./authOrder.js";

// Is WhatsApp OTP actually deliverable right now? Honors BOTH gate flags (the
// door's and the wall's) so there is ONE truth: when Meta approves the auth
// template and either flag flips, WhatsApp lights consistently everywhere.
export function whatsappLoginEnabled() {
  return (
    import.meta.env.VITE_WHATSAPP_LOGIN_ENABLED === "true" ||
    import.meta.env.VITE_DOOR_WHATSAPP_OTP === "true"
  );
}

// The channel that brought this arrival in. Freshest signal is the `?src=` the
// links carry (the same acquisition stamp the RSVP path records); a stored value
// covers a later navigation within the session.
function readArrivalChannel() {
  try {
    const p = new URLSearchParams(window.location.search);
    const src = (p.get("src") || p.get("ch") || "").trim().toLowerCase();
    if (src) return src;
    const stored = localStorage.getItem("pullup_arrival_channel");
    return stored ? stored.toLowerCase() : null;
  } catch {
    return null;
  }
}

function readTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Region subtag from the browser locale, e.g. "en-KE" → "KE". A soft pre-auth
// country read (we don't hold a phone number yet) that backstops the timezone.
function readCountry() {
  try {
    const langs =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    for (const l of langs) {
      const m = /[-_]([A-Za-z]{2})\b/.exec(l || "");
      if (m) return m[1].toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Returns { order, primary } adapted to who's arriving. `overrides` lets a
// surface inject what it knows (e.g. a known rail, or forced capabilities).
export function useAuthOrder(overrides = {}) {
  const key = JSON.stringify(overrides);
  return useMemo(() => {
    return resolveAuthOrder({
      arrivalChannel: readArrivalChannel(),
      timezone: readTimezone(),
      country: readCountry(),
      knownRails: [],
      capabilities: { whatsapp: whatsappLoginEnabled(), google: true, email: true },
      ...overrides,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
