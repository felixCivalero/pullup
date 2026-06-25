// Communication tokens — the live-detail chips a host drops into an event
// message (sign-up info / reminder / post-event). Mirrors the backend list in
// backend/src/services/eventComms.js (TOKENS / STEP_TOKENS) — keep in sync.
//
// A token is plain text like "{time}" inside the stored body; in the editor it
// renders as an inline chip showing this event's real detail, and at send time
// the backend resolves it to the real value. This file owns the body<->editor
// round-trip (bodyToHtml / serializeDom) so it can be unit-tested without a DOM.

export const TOKENS = {
  event: { token: "{event name}", label: "Event name" },
  time: { token: "{time}", label: "Date & time" },
  location: { token: "{location}", label: "Location" },
  coordinates: { token: "{coordinates}", label: "Coordinates" },
  room: { token: "{room link}", label: "Room link" },
  upload: { token: "{upload link}", label: "Upload link" },
};

// Which tokens are offered per step (the "Add" buttons in the composer).
export const STEP_TOKENS = {
  signup: ["event", "time", "location", "coordinates", "room"],
  reminder: ["event", "time", "location", "coordinates"],
  postEvent: ["event", "upload"],
};

const TOKEN_RE = /\{(event name|time|location|coordinates|room link|upload link)\}/g;

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// What a chip DISPLAYS — this event's real detail (so the box shows what goes
// out). Link tokens have no value yet (signed per-recipient), so they show a
// friendly label. Empty details show the field name as a soft placeholder.
export function chipText(tokenStr, sample = {}) {
  switch (tokenStr) {
    case "{event name}": return sample.eventName || "event name";
    case "{time}": return sample.time || "date & time";
    case "{location}": return sample.location || "location";
    case "{coordinates}": return sample.coordinates || "coordinates";
    case "{room link}": return "🔗 room link";
    case "{upload link}": return "📷 upload link";
    default: return tokenStr;
  }
}

// Body string → editor HTML: text escaped, newlines → <br> (so the editor's
// pre-wrap shows the exact line breaks the message will have), tokens → chip
// spans displaying the real detail.
export function bodyToHtml(body, sample = {}, chipCss = "") {
  const s = String(body || "");
  let html = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  const text = (t) => escapeHtml(t).replace(/\n/g, "<br>");
  while ((m = TOKEN_RE.exec(s))) {
    html += text(s.slice(last, m.index));
    html += `<span contenteditable="false" data-token="${m[0]}" style="${chipCss}">${escapeHtml(chipText(m[0], sample))}</span>`;
    last = m.index + m[0].length;
  }
  html += text(s.slice(last));
  return html;
}

// Editor DOM → body string. Chips → their {token}; <br> and block boundaries
// (DIV/P, whatever the browser produced on Enter) → "\n"; text verbatim. This
// is the half that has to be bullet-proof, since Enter behaviour differs across
// browsers — so it normalises ALL of {text node "\n", <br>, <div>/<p> wrapper}
// down to "\n". Unit-tested in commsTokens.test.mjs.
export function serializeDom(node) {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      out += n.nodeValue;
    } else if (n.nodeType === 1) {
      if (n.dataset && n.dataset.token) out += n.dataset.token;
      else if (n.tagName === "BR") out += "\n";
      else if (n.tagName === "DIV" || n.tagName === "P") {
        if (out && !out.endsWith("\n")) out += "\n";
        out += serializeDom(n);
      } else out += serializeDom(n);
    }
  });
  // Browsers emit non-breaking spaces inside contentEditable; fold them back.
  return out.replace(/\u00A0/g, " ");
}
