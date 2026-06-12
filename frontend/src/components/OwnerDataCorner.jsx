// The data-ownership corner — pinned top-right of the owner's room masthead.
// Two directions of the same door:
//   "All your data"     → GET /host/export, the whole slice as one file (out)
//   "Bring your people" → the universal dump importer (in): any CSV, mapping
//                          previewed and editable, deterministic validation,
//                          idempotent commit, confetti.
import { useRef, useState } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { DatabaseZap, Upload, X } from "lucide-react";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const pill = (fg, border, bg) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 999, cursor: "pointer",
  border: `1px solid ${border}`, background: bg, color: fg,
  fontSize: 12.5, fontWeight: 700, fontFamily: SF,
  transition: "all 0.2s ease", whiteSpace: "nowrap",
});

export function OwnerDataCorner() {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <ExportButton />
      <button onClick={() => setImportOpen(true)} style={pill(colors.secondary, colors.secondaryBorder, "#fff")}
        title="Dump your data from any platform — we'll read it, you approve it, your room boots up warm.">
        <Upload size={14} strokeWidth={2.4} /> Bring your people
      </button>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function ExportButton() {
  const [state, setState] = useState("idle");
  const run = async () => {
    if (state === "working") return;
    setState("working");
    try {
      const res = await authenticatedFetch("/host/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pullup-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  };
  const label = state === "working" ? "Packing…" : state === "done" ? "It's yours" : state === "error" ? "Try again" : "All your data";
  return (
    <button onClick={run} style={{
      ...pill(state === "done" ? "#fff" : colors.accent, colors.accentBorder, state === "done" ? colors.accent : "#fff"),
      boxShadow: colors.accentShadow, opacity: state === "working" ? 0.7 : 1,
    }} title="Download everything PullUp holds for you — people, events, RSVPs, timeline, messages. One file, yours.">
      <DatabaseZap size={14} strokeWidth={2.4} /> {label}
    </button>
  );
}

// ─── The importer ────────────────────────────────────────────────────────

const FIELD_LABELS = {
  "": "— ignore —", email: "Email (required)", name: "Name", phone: "Phone",
  instagram: "Instagram", twitter: "Twitter / X", tiktok: "TikTok",
  linkedin: "LinkedIn", company: "Company", birthday: "Birthday", tags: "Tags",
};

function ImportModal({ onClose }) {
  const [phase, setPhase] = useState("pick"); // pick | previewing | review | committing | done | error
  const [csvText, setCsvText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({}); // column -> field ("" = ignore)
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);

  const pickFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setPhase("previewing");
    try {
      const text = await file.text();
      setCsvText(text);
      const res = await authenticatedFetch("/host/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "couldn't read the file");
      setPreview(json);
      setMapping(Object.fromEntries(json.columns.map((c) => [c, json.mapping[c]?.field || ""])));
      setPhase("review");
    } catch (e) {
      setErrorMsg(e.message);
      setPhase("error");
    }
  };

  const commit = async () => {
    setPhase("committing");
    try {
      const clean = Object.fromEntries(Object.entries(mapping).filter(([, f]) => f));
      const res = await authenticatedFetch("/host/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          mapping: clean,
          source: fileName.replace(/\.[a-z]+$/i, "").slice(0, 60) || "csv",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "import failed");
      setResult(json);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e.message);
      setPhase("error");
    }
  };

  const emailMapped = Object.values(mapping).includes("email");
  const usedFields = Object.values(mapping).filter(Boolean);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(560px, 100%)", maxHeight: "85dvh", overflowY: "auto",
        background: "#fff", borderRadius: 18, padding: "20px 22px",
        boxShadow: "0 24px 80px rgba(10,10,10,0.25)", fontFamily: SF, position: "relative",
      }}>
        {phase === "done" && <Confetti />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: colors.text }}>
            {phase === "done" ? "They're in your world now" : "Bring your people"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: colors.textSubtle, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {phase === "pick" && (
          <>
            <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.55, margin: "6px 0 16px" }}>
              Dump your data from anywhere — Attendium, Eventbrite, Luma, Mailchimp, a spreadsheet.
              Drop the CSV here, check the match, and your room boots up warm. Nothing is written
              until you approve, imported data never overwrites what you already have, and
              re-importing the same file is harmless.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
              style={{
                border: `2px dashed ${colors.secondaryBorder}`, borderRadius: 14,
                padding: "36px 20px", textAlign: "center", cursor: "pointer",
                color: colors.secondary, fontSize: 13.5, fontWeight: 700, background: colors.secondarySoft,
              }}
            >
              <Upload size={22} style={{ display: "block", margin: "0 auto 8px" }} />
              Drop a CSV here, or tap to choose
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
              onChange={(e) => pickFile(e.target.files?.[0])} />
          </>
        )}

        {phase === "previewing" && (
          <p style={{ fontSize: 13, color: colors.textSubtle, padding: "30px 0", textAlign: "center" }}>
            Reading {fileName}…
          </p>
        )}

        {phase === "review" && preview && (
          <>
            <p style={{ fontSize: 12.5, color: colors.textMuted, margin: "4px 0 14px" }}>
              <strong>{fileName}</strong> — {preview.stats.totalRows} rows. Check the match below;
              fix anything we got wrong.
            </p>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
              {preview.columns.map((col, i) => (
                <div key={col} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderTop: i ? `1px solid ${colors.borderFaint}` : "none",
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {col}
                    {preview.mapping[col]?.via === "ai" && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: colors.accent, border: `1px solid ${colors.accentBorder}`, borderRadius: 4, padding: "0 4px" }}>AI</span>
                    )}
                  </span>
                  <select
                    value={mapping[col] || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                    style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, border: `1px solid ${colors.borderStrong}`, background: mapping[col] ? colors.secondarySoft : "#fff", color: colors.text, fontFamily: SF, maxWidth: 170 }}
                  >
                    {Object.entries(FIELD_LABELS).map(([f, label]) => (
                      <option key={f} value={f} disabled={!!f && f !== mapping[col] && usedFields.includes(f)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
              <strong style={{ color: colors.secondary }}>{preview.stats.validPeople}</strong> people ready to land
              {preview.stats.rejected > 0 && (
                <> · <strong style={{ color: colors.danger }}>{preview.stats.rejected}</strong> rows can't
                  (we never guess — first few: {preview.rejects.slice(0, 3).map((r) => `row ${r.row}: ${r.reason}`).join("; ")})</>
              )}
            </div>
            {!emailMapped && (
              <p style={{ fontSize: 12, color: colors.danger, fontWeight: 600 }}>
                Map an email column to continue — email is how people are recognized.
              </p>
            )}
            <button
              onClick={commit}
              disabled={!emailMapped}
              style={{
                ...pill("#fff", colors.accent, emailMapped ? colors.accent : colors.textFaded),
                width: "100%", justifyContent: "center", padding: "12px 14px", fontSize: 14,
                border: "none", cursor: emailMapped ? "pointer" : "not-allowed",
              }}
            >
              Bring {preview.stats.validPeople} people into your world
            </button>
          </>
        )}

        {phase === "committing" && (
          <p style={{ fontSize: 13, color: colors.textSubtle, padding: "30px 0", textAlign: "center" }}>
            Opening the doors…
          </p>
        )}

        {phase === "done" && result && (
          <div style={{ textAlign: "center", padding: "14px 0 6px" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: colors.accent }}>
              {result.created + result.updated}
            </div>
            <p style={{ fontSize: 13.5, color: colors.text, fontWeight: 600, margin: "2px 0 6px" }}>
              people in your world — {result.created} new, {result.updated} enriched
            </p>
            {result.rejected > 0 && (
              <p style={{ fontSize: 11.5, color: colors.textSubtle }}>
                {result.rejected} rows couldn't land (no valid email) — they're listed in the preview, never guessed at.
              </p>
            )}
            <button onClick={onClose} style={{ ...pill(colors.text, colors.borderStrong, colors.surface), marginTop: 10 }}>
              Done
            </button>
          </div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
            <p style={{ fontSize: 13, color: colors.danger, fontWeight: 600 }}>{errorMsg}</p>
            <button onClick={() => { setPhase("pick"); setPreview(null); }} style={{ ...pill(colors.text, colors.borderStrong, colors.surface), marginTop: 8 }}>
              Try another file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// A tiny dependency-free confetti burst for the defection ceremony.
function Confetti() {
  const pieces = Array.from({ length: 56 }, (_, i) => i);
  const colorsArr = [colors.accent, colors.secondary, "#f59e0b", "#3b82f6", "#10b981"];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: 18 }}>
      <style>{`@keyframes pullup-confetti-fall {
        0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(520px) rotate(720deg); opacity: 0; }
      }`}</style>
      {pieces.map((i) => (
        <div key={i} style={{
          position: "absolute", top: -10, left: `${(i * 37) % 100}%`,
          width: 7, height: 11, borderRadius: 2,
          background: colorsArr[i % colorsArr.length],
          animation: `pullup-confetti-fall ${1.8 + (i % 5) * 0.35}s ease-in ${(i % 7) * 0.12}s forwards`,
        }} />
      ))}
    </div>
  );
}
