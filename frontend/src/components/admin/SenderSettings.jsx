import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { useCurrentBrand } from "../../lib/brand.js";

/* The brand's mail sender (backend lib/senders.js): its own address on its
   own domain — verified by adding the DNS records shown — or, until then,
   no-reply@pullup.se under the brand's name. And where replies land. Set by
   the brand's owner; a main brand over other brands sends nothing itself. */
export function SenderSettings() {
  const brand = useCurrentBrand();
  const [s, setS] = useState(null);
  const [email, setEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    authenticatedFetch("/admin/sender").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setS(d.sender);
      setEmail(d.sender.email || "");
      setReplyTo(d.sender.replyTo || "");
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!brand || brand.role !== "head" || brand.under?.length || !s) return null;

  const call = async (path, method, body) => {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.message || out.error);
      setS(out.sender);
    } catch (e) {
      setError(e.message || "Det gick inte.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ss">
      <style>{SS_CSS}</style>
      <h2>Mejlavsändare</h2>
      <p className="ea-muted">
        {s.verified
          ? <>Mejl från {brand.name} går ut från <b>{s.email}</b>.</>
          : <>Mejl från {brand.name} går idag ut från <b>no-reply@pullup.se</b> med {brand.name} som avsändarnamn. Med en egen adress på er domän går de ut från den.</>}
      </p>
      <div className="ss-row">
        <label><span>Egen avsändaradress</span>
          <input className="ea-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="t.ex. nyheter@ertvarumarke.se" />
        </label>
        <label><span>Svar går till</span>
          <input className="ea-input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Den som skickar" />
        </label>
        <button type="button" className="ea-btn is-dark" disabled={busy} onClick={() => call("/admin/sender", "PUT", { email, replyTo })}>{busy ? "Sparar…" : "Spara"}</button>
      </div>
      {error && <p className="ea-error">{error}</p>}
      {s.email && !s.verified && (
        <div className="ss-dns">
          <p><b>Lägg in de här DNS-posterna hos er domän</b> (där ni hanterar {s.email.split("@")[1]}, t.ex. Cloudflare, Loopia eller one.com). Det kan ta en stund innan de syns. Tryck sedan Kontrollera.</p>
          {s.records?.length > 0 && (
            <div className="ea-wrap"><table className="ea-table ss-table">
              <thead><tr><th>Typ</th><th>Namn</th><th>Värde</th><th>Prio</th><th>Status</th></tr></thead>
              <tbody>{s.records.map((r, i) => <tr key={i}><td>{r.type}</td><td><code>{r.name}</code></td><td><code>{r.value}</code></td><td>{r.priority ?? "–"}</td><td>{r.status === "verified" ? "OK" : "Väntar"}</td></tr>)}</tbody>
            </table></div>
          )}
          <button type="button" className="ea-btn" disabled={busy} onClick={() => call("/admin/sender/verify", "POST")}>{busy ? "Kontrollerar…" : "Kontrollera"}</button>
        </div>
      )}
    </section>
  );
}

const SS_CSS = `
  .ss { margin-top: 34px; max-width: 760px; }
  .ss b { color: #0a0a0a; }
  .ss-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; margin-top: 12px; }
  .ss-row label { display: grid; gap: 5px; font-size: 12.5px; font-weight: 600; color: #4a4945; }
  .ss-dns { display: grid; gap: 10px; justify-items: start; margin-top: 16px; padding: 14px; border: 1px solid #9b9a95; border-radius: 8px; background: #fff; }
  .ss-dns p { margin: 0; font-size: 14px; line-height: 1.5; color: #3a3a3c; }
  .ss-dns .ea-wrap { width: 100%; }
  .ss-table code { font-size: 11.5px; word-break: break-all; }
  @media (max-width: 680px) { .ss-row { grid-template-columns: 1fr; } }
`;
