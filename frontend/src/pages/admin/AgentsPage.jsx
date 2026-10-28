import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";
import { useAgentChanges } from "../../lib/pageContext.js";

/* /admin/agents — your own AI on PullUp. Whatever you can do here, your
   assistant can do for you, nothing more: connect it once (remote MCP with
   OAuth, or WebMCP right in this browser), see what it did, disconnect it.
   Backend: routes/agents.js, routes/oauth.js, routes/mcp.js. */

// The activity list in Swedish (the actions' own titles are written for the AI).
const DID = {
  about_pullup: "Läste om PullUp", get_event: "Tittade på ett event", rsvp_to_event: "Anmälde någon", request_meeting: "Bad om ett möte",
  whoami: "Kollade kontot", list_my_events: "Listade dina event", get_my_event: "Öppnade ett event", create_event: "Skapade ett event",
  update_event: "Ändrade ett event", publish_event: "Publicerade / avpublicerade", set_event_cover: "Bytte omslagsbild", update_guest: "Ändrade en gäst",
  list_people: "Läste din CRM", preview_mail: "Förhandsgranskade ett utskick", send_mail: "Skickade mejl", list_sent_mail: "Listade utskick",
  get_mail_credits: "Kollade mejlkrediter", buy_mail_credits: "Tog fram en betallänk", site_stats: "Läste statistiken",
  list_brands: "Listade varumärken", create_brand: "Skapade ett varumärke", rename_brand: "Bytte namn på ett varumärke",
  list_team: "Läste teamet", invite_to_brand: "Bjöd in till teamet", remove_from_team: "Tog bort från teamet", list_event_cohosts: "Läste medarrangörerna",
  invite_cohost: "Bjöd in en medarrangör", remove_cohost: "Tog bort en medarrangör", cancel_invite: "Tog tillbaka en inbjudan",
  list_my_invites: "Läste dina inbjudningar", accept_invite: "Tackade ja till en inbjudan", decline_invite: "Tackade nej till en inbjudan",
  sales_pipeline: "Läste säljlistan", list_meeting_requests: "Läste mötesförfrågningar",
};
const fmt = (iso) => (iso ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—");

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ag-copy">
      <code>{value}</code>
      <button
        type="button"
        className="ea-btn"
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopierad" : "Kopiera"}
      </button>
    </div>
  );
}

export function AgentsPage() {
  const [data, setData] = useState(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);
  const browserReady = typeof document !== "undefined" && !!(document.modelContext || navigator.modelContext);

  const load = useCallback(() => {
    authenticatedFetch("/admin/agents")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useAgentChanges(load);

  // How much an assistant can do for this account: the same list it gets.
  useEffect(() => {
    authenticatedFetch("/actions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCount(d.actions.length))
      .catch(() => {});
  }, []);

  async function disconnect(id) {
    setBusy(id);
    const res = await authenticatedFetch(`/admin/agents/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (res?.ok) load();
  }

  return (
    <AdminShell title="Agenter">
      <style>{EVENT_ADMIN_CSS + AGENTS_CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <h1>Agenter</h1>
            <p className="ea-muted">Din egen AI kan göra allt du kan göra här{count ? ` (${count} saker)` : ""}: skapa och publicera event, se gäster, skicka mejl. Inget mer än du.</p>
          </div>
        </div>
        {error && <p className="ea-error">Kunde inte hämta agenterna.</p>}

        <div className="ag-ways">
          <section className="ag-card">
            <h2>Koppla din AI</h2>
            <p className="ea-muted">Lägg till PullUp som connector i Claude, ChatGPT eller någon annan assistent som talar MCP. Du loggar in och godkänner en gång.</p>
            {data && <CopyField value={data.mcpUrl} />}
            <ol className="ag-steps">
              <li><b>Claude:</b> Inställningar → Connectors → Lägg till anpassad connector → klistra in adressen.</li>
              <li><b>ChatGPT och andra:</b> lägg till en MCP-connector med samma adress.</li>
              <li>Säg sedan till exempel: <i>”Lägg upp min releasefest på PullUp den 7 november kl 19.”</i></li>
            </ol>
          </section>
          <section className="ag-card">
            <h2>I webbläsaren</h2>
            <p className="ea-muted">
              Webbläsare med WebMCP ger AI-assistenten i webbläsaren samma verktyg direkt på pullup.se, som du, inloggad här.
            </p>
            <p className={`ag-status${browserReady ? " is-on" : ""}`}>
              <span className="ea-dot" /> {browserReady ? "Den här webbläsaren har WebMCP: verktygen är på." : "Den här webbläsaren har inte WebMCP än (Chrome: chrome://flags → WebMCP)."}
            </p>
          </section>
        </div>

        <h2>Kopplade</h2>
        {!data && !error && <p className="ea-muted">Hämtar…</p>}
        {data && !data.connected.length && <p className="ea-muted">Inga assistenter kopplade än.</p>}
        {data?.connected.length > 0 && (
          <ul className="ag-list">
            {data.connected.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b>
                  <span className="ea-muted">{c.via ? `${c.via} · ` : ""}kopplad {fmt(c.connectedAt)} · senast {fmt(c.lastUsedAt)}</span>
                </span>
                <button type="button" className="ea-btn" disabled={busy === c.id} onClick={() => disconnect(c.id)}>
                  {busy === c.id ? "Kopplar från…" : "Koppla från"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2>Senaste</h2>
        {data && !data.activity.length && <p className="ea-muted">Inget gjort av en assistent än.</p>}
        {data?.activity.length > 0 && (
          <div className="ea-wrap">
            <table className="ea-table">
              <thead><tr><th>När</th><th>Vem</th><th>Vad</th><th className="num">Tid</th></tr></thead>
              <tbody>
                {data.activity.map((a, i) => (
                  <tr key={i}>
                    <td>{fmt(a.at)}</td>
                    <td>{a.assistant}</td>
                    <td>
                      {DID[a.action] || a.action}
                      {!a.ok && <span className="ag-fail" title={a.error || ""}> · gick inte</span>}
                    </td>
                    <td className="num">{a.ms != null ? `${a.ms} ms` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const AGENTS_CSS = `
  .ag-ways { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 760px) { .ag-ways { grid-template-columns: 1fr; } }
  .ag-card { border: 1px solid rgba(0,0,0,0.1); border-radius: 18px; padding: 18px; display: grid; gap: 10px; align-content: start; min-width: 0; }
  .ag-card h2 { margin: 0; }
  .ag-copy { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .ag-copy code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-size: 14px; padding: 9px 12px; border-radius: 10px; background: #f5f5f7; }
  .ag-steps { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; line-height: 1.45; color: #3a3a3e; }
  .ag-status { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6e6e73; }
  .ag-status.is-on { color: #1f7a3a; }
  .ag-status.is-on .ea-dot { background: #1f7a3a; }
  .ag-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .ag-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; }
  .ag-list li > span { display: grid; gap: 2px; min-width: 0; }
  .ag-list .ea-muted { margin: 0; overflow-wrap: anywhere; }
  .ag-fail { color: #D9480F; }
`;
