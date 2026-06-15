// ProductPricePanel — the "price" editor part for kind='product' pages.
//
// Reuses the event ticketPrice/ticketCurrency for the charge (so a product
// purchase flows through the exact paid-RSVP → checkout → settlement path) and
// adds the four composable delivery forms stored in events.fulfillment:
//   download (file in the private bucket) · secret (link/code) ·
//   unlock (protected content) · external (link-out, money handed off).
//
// SECRETS authored here (download path, secret value, unlock body) never reach
// the public page payload — the server strips them and the gated delivery
// endpoint serves them only after the buyer's payment settles.

import { useRef, useState } from "react";
import { Tag, Download, KeyRound, Lock, ExternalLink, Loader2, Check } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { uploadBlobToSignedUrl } from "../lib/imageUtils.js";

const CURRENCIES = ["SEK", "KES", "USD"];

function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// One delivery form's header: icon + title/desc + an on/off toggle.
// `icon` is a rendered node (e.g. <Download size={16} />), passed in by caller.
function FormHeader({ icon, title, desc, checked, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: colors.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{title}</div>
        <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.4, marginTop: 2 }}>{desc}</div>
      </div>
      <label style={{ position: "relative", display: "inline-block", width: 40, height: 22, flexShrink: 0, cursor: "pointer" }}>
        <input type="checkbox" checked={!!checked} onChange={(e) => onToggle(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: 999, transition: "0.2s", background: checked ? colors.accent : "rgba(10,10,10,0.18)" }} />
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "0.2s" }} />
      </label>
    </div>
  );
}

export function ProductPricePanel({
  eventId,
  paymentsV2Live,
  price,
  setPrice,
  currency,
  setCurrency,
  fulfillment,
  setFulfillment,
  ensureDraft,
}) {
  const f = fulfillment || {};
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  // Patch one delivery form, preserving the others.
  function setForm(key, patch) {
    setFulfillment({ ...f, [key]: { ...(f[key] || {}), ...patch } });
  }

  async function handleFile(file) {
    if (!file) return;
    setUploadErr("");
    setUploading(true);
    try {
      // Need a saved draft (and its id) before we can mint an upload URL.
      const id = eventId || (ensureDraft ? await ensureDraft() : null);
      if (!id) {
        setUploadErr("Name your product first, then add the file.");
        return;
      }
      const res = await authenticatedFetch(`/host/events/${id}/product-asset/upload-url`, {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type, filename: file.name }),
      });
      if (!res.ok) throw new Error("Could not start upload");
      const { path, uploadUrl } = await res.json();
      await uploadBlobToSignedUrl({ url: uploadUrl, blob: file, mimeType: file.type });
      setForm("download", {
        enabled: true,
        path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size || null,
      });
    } catch (e) {
      setUploadErr(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const label = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textMuted };
  const input = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}`,
    background: "#fff", color: colors.text, fontSize: 14, boxSizing: "border-box",
  };
  const card = {
    border: `1px solid ${colors.border}`, borderRadius: 14, padding: 16, marginBottom: 12, background: "#fff",
  };

  return (
    <div>
      <div style={{ ...label, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <Tag size={13} /> Price & delivery
      </div>

      {/* Price + currency — reused as the ticket charge */}
      <div style={{ ...card }}>
        <div style={{ ...label, marginBottom: 8 }}>What it costs</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" min="0" step="any" value={price}
            onChange={(e) => setPrice(e.target.value)} placeholder="150"
            style={{ ...input, flex: 1 }}
          />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...input, width: 90, flex: "0 0 auto" }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!paymentsV2Live && (
          <div style={{ fontSize: 12, color: colors.danger, marginTop: 8, lineHeight: 1.4 }}>
            Checkout isn't live in this environment yet — the page saves, but buyers can't pay until payments are switched on.
          </div>
        )}
      </div>

      {/* Delivery forms */}
      <div style={{ ...label, margin: "20px 0 8px" }}>On purchase, the buyer gets</div>

      {/* 1. File download */}
      <div style={card}>
        <FormHeader
          icon={<Download size={16} color={colors.accent} />} title="A file download"
          desc="A PDF, zip, audio or video, served as a time-boxed private link."
          checked={f.download?.enabled} onToggle={(v) => setForm("download", { enabled: v })}
        />
        {f.download?.enabled && (
          <div style={{ marginTop: 12 }}>
            <input ref={fileInputRef} type="file" style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ ...input, width: "auto", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {uploading ? <><Loader2 size={14} className="spin" /> Uploading…</>
                : f.download?.path ? <><Check size={14} color={colors.success} /> Replace file</>
                : <><Download size={14} /> Choose file</>}
            </button>
            {f.download?.filename && !uploading && (
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
                {f.download.filename} {f.download.sizeBytes ? `· ${fmtBytes(f.download.sizeBytes)}` : ""}
              </div>
            )}
            {uploadErr && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>{uploadErr}</div>}
          </div>
        )}
      </div>

      {/* 2. Reveal a link / code */}
      <div style={card}>
        <FormHeader
          icon={<KeyRound size={16} color={colors.accent} />} title="A link or code"
          desc="A Notion/Drive link, Discord invite or license key — hidden until they pay."
          checked={f.secret?.enabled} onToggle={(v) => setForm("secret", { enabled: v })}
        />
        {f.secret?.enabled && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {["link", "code"].map((k) => (
                <button key={k} type="button" onClick={() => setForm("secret", { kind: k })}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                    border: `1px solid ${(f.secret?.kind || "link") === k ? colors.accent : colors.border}`,
                    background: (f.secret?.kind || "link") === k ? "rgba(236,23,143,0.06)" : "#fff",
                    color: (f.secret?.kind || "link") === k ? colors.accent : colors.text }}>
                  {k === "link" ? "Link" : "Code"}
                </button>
              ))}
            </div>
            <input value={f.secret?.value || ""} onChange={(e) => setForm("secret", { value: e.target.value })}
              placeholder={(f.secret?.kind || "link") === "code" ? "ABC-123-XYZ" : "https://…"} style={input} />
          </div>
        )}
      </div>

      {/* 3. Unlock protected content */}
      <div style={card}>
        <FormHeader
          icon={<Lock size={16} color={colors.accent} />} title="Unlocked content"
          desc="A block of text only buyers can read — teased on the page, revealed on purchase."
          checked={f.unlock?.enabled} onToggle={(v) => setForm("unlock", { enabled: v })}
        />
        {f.unlock?.enabled && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={f.unlock?.title || ""} onChange={(e) => setForm("unlock", { title: e.target.value })}
              placeholder="Title (e.g. The full recipe)" style={input} />
            <textarea value={f.unlock?.body || ""} onChange={(e) => setForm("unlock", { body: e.target.value })}
              placeholder="The content buyers unlock…" rows={5} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        )}
      </div>

      {/* 4. External storefront (link-out) */}
      <div style={card}>
        <FormHeader
          icon={<ExternalLink size={16} color={colors.accent} />} title="Sell on your own storefront"
          desc="Hand checkout off to Gumroad, Shopify or your own Stripe. 'Buy now' links out; PullUp logs the intent."
          checked={f.external?.enabled} onToggle={(v) => setForm("external", { enabled: v })}
        />
        {f.external?.enabled && (
          <div style={{ marginTop: 12 }}>
            <input value={f.external?.url || ""} onChange={(e) => setForm("external", { url: e.target.value })}
              placeholder="https://yourstore.gumroad.com/l/…" style={input} />
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8, lineHeight: 1.4 }}>
              When on, buyers go straight to your store — the price and other delivery forms above are skipped.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductPricePanel;
