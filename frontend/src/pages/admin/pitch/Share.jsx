import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/api.js";

/* Share a pitch with a link (routes/adminPitch.js, migs 160-161): pick how
   long it stays open, the link is copied, the open links show their views and
   can be closed. Used on the Pitch cards and in a project's Pitch view. */
const SHARE_DAYS = [[1, "1 dag"], [7, "7 dagar"], [30, "30 dagar"]];
// The link to send: /share/p/ gives link previews the pitch's own card and
// sends people on to /s/<token> (routes/adminPitch.js).
const shareUrl = (token) => `${window.location.origin}/share/p/${token}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

// Make a link, copy it, see who opened it, close it.
export function Share({ pitch }) {
  const [links, setLinks] = useState([]);
  const onChange = useCallback(() => authenticatedFetch("/admin/pitch-links").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLinks(d.links.filter((l) => l.slug === pitch.slug))).catch(() => {}), [pitch.slug]);
  useEffect(() => { onChange(); }, [onChange]);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [now] = useState(() => Date.now()); // when the page opened; good enough for "still open"
  const open = links.filter((l) => !l.revokedAt && new Date(l.expiresAt).getTime() > now);

  const copy = async (token) => {
    try { await navigator.clipboard.writeText(shareUrl(token)); } catch { /* the link is on screen anyway */ }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
  };
  const create = async () => {
    setBusy(true);
    const r = await authenticatedFetch("/admin/pitch-links", { method: "POST", body: JSON.stringify({ slug: pitch.slug, prospectId: pitch.prospectId, days, share: pitch.share }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return;
    const link = await r.json();
    await onChange();
    copy(link.token);
  };
  const close = async (token) => {
    await authenticatedFetch(`/admin/pitch-links/${token}`, { method: "DELETE" }).catch(() => null);
    onChange();
  };

  return (
    <div className="pl-share">
      <div className="pl-share-new">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Hur länge länken är öppen">
          {SHARE_DAYS.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
        </select>
        <button type="button" onClick={create} disabled={busy}>{busy ? "Skapar…" : "Dela länk"}</button>
      </div>
      {open.map((l) => (
        <div key={l.token} className="pl-share-link">
          <code title={shareUrl(l.token)}>/share/p/{l.token.slice(0, 6)}…</code>
          <small>till {shortDate(l.expiresAt)} · {l.views} {l.views === 1 ? "visning" : "visningar"}</small>
          <button type="button" onClick={() => copy(l.token)}>{copied === l.token ? "Kopierad" : "Kopiera"}</button>
          <button type="button" className="pl-close" onClick={() => close(l.token)}>Stäng</button>
        </div>
      ))}
    </div>
  );
}


export const SHARE_CSS = `
  .pl-share { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #b7b6b1; }
  .pl-share-new { display: flex; gap: 6px; }
  .pl-share select, .pl-share button { font: 700 11px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .05em; text-transform: uppercase; border: 1px solid #7d7c77; border-radius: 5px; background: linear-gradient(180deg, #fbfaf7, #dddcd7); padding: 6px 8px; color: #111; cursor: pointer; }
  .pl-share-new button { background: #ec178f; border-color: #b80f6d; color: #fff; }
  .pl-share button:disabled { opacity: .6; cursor: default; }
  .pl-share-link { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .pl-share-link code { font: 12px ui-monospace, "SF Mono", Menlo, monospace; color: #3a3935; }
  .pl-share-link small { flex: 1; color: #6e6e73; font-size: 12px; }
  .pl-share-link button { padding: 3px 6px; font-size: 10px; }
  .pl-share-link .pl-close { color: #a3122b; }
`;
