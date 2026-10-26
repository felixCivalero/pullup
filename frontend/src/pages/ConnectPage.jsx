import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useSession } from "../lib/owner.js";
import { authenticatedFetch } from "../lib/api.js";
import { API_BASE } from "../lib/env.js";
import { LOGIN_CSS, LoginForm } from "./LoginPage.jsx";

/* /connect?request=… — an assistant (Claude, ChatGPT, …) asks to act for you
   on PullUp. You sign in here if needed, see which assistant and where it
   sends you back, and say yes or no. Yes gives it exactly your rights; you
   can disconnect it under Agenter. Backend: routes/oauth.js. */
export function ConnectPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const id = params.get("request") || "";
  const [request, setRequest] = useState(undefined); // undefined = loading, null = gone
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const prev = document.title;
    document.title = "Koppla en assistent — PullUp";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/oauth/requests/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setRequest(d?.request || null))
      .catch(() => alive && setRequest(null));
    return () => { alive = false; };
  }, [id]);

  async function decide(approve) {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch(`/oauth/requests/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ approve }) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 410) return setRequest(null);
      if (!res.ok || !out.redirectTo) throw new Error();
      window.location.assign(out.redirectTo);
    } catch {
      setError("Det gick inte. Försök igen.");
      setBusy(false);
    }
  }

  const name = request?.client?.name || "En assistent";
  return (
    <main className="lg">
      <style>{LOGIN_CSS + CONNECT_CSS}</style>
      {request === undefined || session === undefined ? (
        <p className="lg-sub">Laddar…</p>
      ) : request === null ? (
        <div className="cn">
          <h1>Länken har gått ut</h1>
          <p className="lg-sub">Förfrågan är redan besvarad eller för gammal. Be assistenten att koppla till PullUp igen.</p>
        </div>
      ) : !session ? (
        <LoginForm onDone={() => {}} title={`Koppla ${name}`} subtitle="Logga in på PullUp först. Har du inget konto skapas det nu." />
      ) : (
        <div className="cn">
          <p className="cn-kicker">Koppla en assistent</p>
          <h1>{name} vill använda ditt PullUp-konto</h1>
          <p className="lg-sub">
            Den kan göra allt du kan göra här: skapa och publicera event, se dina gäster och din CRM, och skicka mejl till dem
            (det kostar mejlkrediter). Inget mer än du själv kan.
          </p>
          <dl className="cn-facts">
            <div><dt>Konto</dt><dd>{session.user?.email}</dd></div>
            {request.redirectHost && <div><dt>Skickar dig tillbaka till</dt><dd>{request.redirectHost}</dd></div>}
          </dl>
          <div className="cn-actions">
            <button type="button" className="cn-yes" disabled={busy} onClick={() => decide(true)}>{busy ? "Kopplar…" : "Tillåt"}</button>
            <button type="button" className="cn-no" disabled={busy} onClick={() => decide(false)}>Neka</button>
          </div>
          {error && <p className="lg-err">{error}</p>}
          <p className="cn-foot">
            Du kan koppla från den när som helst under Agenter.{" "}
            <button type="button" className="lg-back" onClick={() => supabase.auth.signOut()}>Byt konto</button>
          </p>
        </div>
      )}
    </main>
  );
}

const CONNECT_CSS = `
  .cn { width: min(420px, 100%); display: grid; gap: 14px; }
  .cn h1 { margin: 0; font-size: 26px; line-height: 1.15; font-weight: 700; letter-spacing: -0.03em; }
  .cn .lg-sub { margin: 0; }
  .cn-kicker { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #ec178f; }
  .cn-facts { margin: 4px 0; display: grid; gap: 8px; padding: 14px 16px; border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; }
  .cn-facts div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .cn-facts dt { color: #6e6e73; }
  .cn-facts dd { margin: 0; font-weight: 600; text-align: right; word-break: break-all; }
  .cn-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cn-actions button { font: inherit; font-size: 15px; font-weight: 600; padding: 13px 16px; border-radius: 999px; cursor: pointer; }
  .cn-yes { border: 0; background: #000; color: #fff; }
  .cn-no { border: 1px solid rgba(0,0,0,0.16); background: #fff; color: #0a0a0a; }
  .cn-actions button:disabled { opacity: 0.5; cursor: default; }
  .cn-foot { margin: 0; font-size: 13px; color: #6e6e73; }
  .cn-foot .lg-back { font-size: 13px; text-decoration: underline; }
`;
