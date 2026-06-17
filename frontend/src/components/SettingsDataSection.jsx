// Settings → Power & data → "Import & export". The data-ownership doors,
// moved here from the room masthead: bring your people in from any platform
// (CSV), or take everything PullUp holds for you out as one file.

import { useState } from "react";
import { Upload } from "lucide-react";
import { colors } from "../theme/colors.js";
import { ExportButton, ImportModal } from "./OwnerDataCorner.jsx";

function Row({ title, desc, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>{title}</div>
        <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export function SettingsDataSection() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: colors.text }}>Import &amp; export</h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          Bring your people in from any platform, or take everything PullUp holds for you — one file, yours.
        </p>
      </div>

      <div style={{ background: colors.surface, borderRadius: 14, border: `1px solid ${colors.borderFaint}`, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        <Row
          title="Bring your people"
          desc="Dump a CSV from Eventbrite, Luma, Mailchimp, or a spreadsheet — we read it, you approve the match, your room boots up warm. Nothing overwrites what you already have."
        >
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 999, border: `1px solid ${colors.secondaryBorder}`, background: colors.secondarySoft, color: colors.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <Upload size={15} strokeWidth={2.4} /> Import
          </button>
        </Row>

        <div style={{ borderTop: `1px solid ${colors.borderFaint}` }} />

        <Row
          title="Export your data"
          desc="Download everything PullUp holds for you — people, events, RSVPs, timeline, messages."
        >
          <ExportButton />
        </Row>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
