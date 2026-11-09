import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";
import { STATS_CSS, fmt } from "../../components/admin/statsFormat.js";
import { ACCOUNT_DRAWER_CSS, AccountDrawer } from "../../components/admin/AccountDrawer.jsx";

/* /admin/platform — the owner's view of the event tool (backend
   routes/adminPlatform.js): how many organisers have signed up, how many
   events are out, and every account with its brands, events, sign-ups and
   mail credits; credits can be given to a customer set up by hand. */
export function PlatformPage() {
  return (
    <AdminShell title="Eventverktyget · Plattform">
      <Platform />
    </AdminShell>
  );
}

// The slim event platform went live on 2026-10-19 (same date as the backend).
const RELAUNCH = "2026-10-19";
const kr = (n) => `${Math.round(Number(n || 0)).toLocaleString("sv-SE")} kr`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "–");

function Platform() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [onlyNew, setOnlyNew] = useState(true);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    authenticatedFetch("/admin/platform").then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const give = async (a) => {
    const n = window.prompt(`Hur många utskick ska ${a.email} få?`, "5000");
    if (!n) return;
    const note = window.prompt("Anteckning (t.ex. Nigab, uppstart)", "") || "";
    const res = await authenticatedFetch("/admin/platform/credits", { method: "POST", body: JSON.stringify({ hostId: a.id, count: Number(n), note }) });
    if (!res.ok) { window.alert("Det gick inte."); return; }
    load();
  };

  const t = data?.totals;
  // "Active since the relaunch": new accounts, plus old-app accounts that have
  // signed in since (a returning organiser like Julia at Nigab). Latest
  // activity first, so a returning account isn't buried under its old date.
  const active = (a) => !a.fromOldApp || (a.lastSignIn && a.lastSignIn >= RELAUNCH);
  const touched = (a) => [a.createdAt, a.lastSignIn].filter(Boolean).sort().pop() || "";
  const rows = (data?.accounts || []).filter((a) => !onlyNew || active(a)).sort((a, b) => touched(b).localeCompare(touched(a)));
  return (
    <>
      <style>{EVENT_ADMIN_CSS + STATS_CSS + ACCOUNT_DRAWER_CSS + PF_CSS}</style>
      <div className="ea">
        <div className="ea-head"><div><h1>Eventverktyget</h1><p className="ea-muted">Hur det går för gratisverktyget: sidan, konton, event och utskick.</p></div></div>
        {error && <p className="ea-error">Kunde inte hämta plattformen.</p>}
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {t && (
          <>
            {data.page && (
              <div className="st-tiles">
                <div><span>Besök på /eventverktyg</span><b>{fmt(data.page.visits7)}</b><small>senaste veckan · {fmt(data.page.visits30)} på 30 dagar</small></div>
                <div><span>Klick på Skapa konto</span><b>{fmt(data.page.signupClicks)}</b><small>besök som klickade, 30 dagar</small></div>
                <div><span>Kopierade MCP-adressen</span><b>{fmt(data.page.mcpCopies)}</b><small>besök, 30 dagar</small></div>
              </div>
            )}
            <div className="st-tiles">
              <div><span>Nya konton</span><b>{fmt(t.sinceRelaunch)}</b><small>sedan 19 okt · {fmt(t.new7)} senaste veckan</small></div>
              <div><span>Konton totalt</span><b>{fmt(t.accounts)}</b><small>med den gamla appens</small></div>
              <div><span>Event</span><b>{fmt(t.events)}</b><small>{fmt(t.published)} publicerade</small></div>
              <div><span>Kommande</span><b>{fmt(t.upcoming)}</b><small>publicerade, inte passerade</small></div>
              <div><span>Anmälningar</span><b>{fmt(t.signups)}</b><small>på arrangörernas event</small></div>
            </div>
            {data.billing && (
              <div className="st-tiles">
                <div><span>Att fakturera</span><b>{kr(data.billing.unbilledSek)}</b><small>{fmt(data.billing.unbilledSends)} utskick · {fmt(data.billing.invoiceCustomers)} fakturakunder</small></div>
                <div><span>Öppna fakturor</span><b>{kr(data.billing.openSek)}</b><small>{fmt(data.billing.openInvoices)} st, inkl. moms</small></div>
                <div><span>Betalt via faktura</span><b>{kr(data.billing.paidSek)}</b><small>inkl. moms, totalt</small></div>
                <div><span>Att agera på</span><b>{fmt(data.billing.signals)}</b><small>varningar på kontona</small></div>
              </div>
            )}
            <section className="st-card">
              <div className="st-card-head">
                <h3>Konton</h3>
                <label className="pf-toggle"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Bara aktiva sedan 19 okt</label>
              </div>
              <div className="ea-wrap"><table className="ea-table st-table">
                <thead><tr><th>Konto</th><th>Varumärken</th><th className="num">Event</th><th className="num">Publ.</th><th className="num">Anmälda</th><th className="num">Utskick</th><th>Skapat</th><th>Senast inne</th><th /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={`pf-row${open === a.id ? " is-open" : ""}`} onClick={() => setOpen(a.id)}>
                      <td>
                        <b>{a.email}</b>
                        {a.fromOldApp && <small className="pf-old">gamla appen</small>}
                        {(a.settings?.billing === "invoice" || a.settings?.trusted || a.settings?.hideBranding) && (
                          <small className="pf-perks">{[a.settings.billing === "invoice" && "faktura", a.settings.trusted && "betrodd", a.settings.hideBranding && "egen märkning"].filter(Boolean).join(" · ")}</small>
                        )}
                        {a.signals?.some((x) => x.level !== "info") && <small className={`pf-signal is-${a.signals[0].level}`}>{a.signals[0].text}{a.signals.filter((x) => x.level !== "info").length > 1 ? ` +${a.signals.filter((x) => x.level !== "info").length - 1}` : ""}</small>}
                        {(a.banned || a.limits?.mailBlocked || a.limits?.publishBlocked || a.limits?.maxEvents != null) && (
                          <small className="pf-limited">{[a.banned && "spärrad", a.limits?.mailBlocked && "mejl pausat", a.limits?.publishBlocked && "publicering pausad", a.limits?.maxEvents != null && `max ${a.limits.maxEvents} event`].filter(Boolean).join(" · ")}</small>
                        )}
                      </td>
                      <td>{a.brands.map((b) => (b.under ? `└ ${b.name}` : b.name)).join(", ")}</td>
                      <td className="num">{fmt(a.events)}</td>
                      <td className="num">{fmt(a.published)}</td>
                      <td className="num">{fmt(a.signups)}</td>
                      <td className="num">{a.available == null ? "–" : fmt(a.available)}{a.unbilled > 0 && <small className="pf-old">{fmt(a.unbilled)} att fakturera</small>}</td>
                      <td>{day(a.createdAt)}</td>
                      <td>{day(a.lastSignIn)}</td>
                      <td><button type="button" className="ea-btn" onClick={(e) => { e.stopPropagation(); give(a); }}>Ge utskick</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {!rows.length && <p className="ea-muted st-empty">Inga konton här än.</p>}
            </section>
            {open && <AccountDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
          </>
        )}
      </div>
    </>
  );
}

const PF_CSS = `
  .pf-toggle { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: #3a3935; cursor: pointer; }
  .pf-toggle input { accent-color: #ec178f; }
  .pf-old { display: block; font-size: 11px; color: #8a877f; }
  .pf-limited { display: block; font-size: 11px; color: #b4123f; font-weight: 600; }
  .pf-perks { display: block; font-size: 11px; color: #0a7a3a; font-weight: 600; }
  .pf-signal { display: block; font-size: 11px; font-weight: 600; color: #8a5a00; }
  .pf-signal.is-bad { color: #b4123f; }
  .pf-row { cursor: pointer; }
  .pf-row:hover td, .pf-row.is-open td { background: rgba(236, 23, 143, 0.05); }
`;
