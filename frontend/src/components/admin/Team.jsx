import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setCurrentBrandId } from "../../lib/brand.js";
import { teamCall } from "../../lib/team.js";

/* Working together (backend lib/teams.js). The people on a brand or an event,
   with an invite form for whoever may invite, and the invites waiting for the
   signed-in person. */

const day = (iso) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

// people: [{ key, email, role, you, onRemove? }], invites: [{ id, email, at }]
export function TeamList({ people, invites = [], canManage, onInvite, onCancel, inviteLabel = "Bjud in" }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const out = await onInvite(email.trim());
      setNote({ ok: true, text: out?.mailed === false ? `Inbjudan sparad, men mejlet gick inte iväg. Be ${email.trim()} logga in på pullup.se.` : `Inbjudan skickad till ${email.trim()}.` });
      setEmail("");
    } catch (err) {
      setNote({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tm">
      <style>{CSS}</style>
      {people.length + invites.length > 0 && <ul className="tm-list">
        {people.map((p) => (
          <li key={p.key}>
            <span className="tm-who">
              <b>{p.email || "Okänd"}</b>
              {p.you && <span className="tm-you">du</span>}
            </span>
            <span className="tm-role">{p.role}</span>
            {p.onRemove ? <button type="button" className="tm-x" onClick={p.onRemove}>{p.you ? "Lämna" : "Ta bort"}</button> : <span />}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="is-pending">
            <span className="tm-who"><b>{i.email}</b></span>
            <span className="tm-role">Inbjuden {day(i.at)}</span>
            {canManage ? <button type="button" className="tm-x" onClick={() => onCancel(i.id)}>Ta tillbaka</button> : <span />}
          </li>
        ))}
      </ul>}
      {canManage && (
        <form className="tm-invite" onSubmit={invite}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" maxLength={254} required aria-label="Mejladress" />
          <button type="submit" className="ea-btn is-dark" disabled={busy || !email.trim()}>{busy ? "Skickar…" : inviteLabel}</button>
        </form>
      )}
      {note && <p className={note.ok ? "ea-ok" : "ea-error"}>{note.text}</p>}
    </div>
  );
}


/* Invites waiting for the signed-in address (AdminShell, from /admin/me):
   say yes and land in the brand (or on the event), or no thanks. */
export function PendingInvites({ invites, onAnswered, compact = false }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  if (!invites?.length) return null;

  async function answer(inv, yes) {
    setBusy(inv.id);
    setError("");
    try {
      const out = await teamCall(`/admin/invites/${inv.id}/${yes ? "accept" : "decline"}`);
      await onAnswered?.();
      if (yes) {
        if (out.brandId) setCurrentBrandId(out.brandId);
        navigate(out.eventId ? `/admin/events/${out.eventId}` : "/admin/events");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`pi${compact ? " is-compact" : ""}`}>
      <style>{CSS}</style>
      {invites.map((inv) => (
        <div key={inv.id} className="pi-card">
          <p>
            {inv.from ? <>{inv.from} har bjudit in dig </> : <>Du är inbjuden </>}
            {inv.kind === "event" ? <>som medarrangör på <b>{inv.event}</b> ({inv.brand}).</> : <>till teamet för <b>{inv.brand}</b>.</>}
          </p>
          <div className="pi-actions">
            <button type="button" className="pi-btn" disabled={busy === inv.id} onClick={() => answer(inv, false)}>Nej tack</button>
            <button type="button" className="pi-btn is-dark" disabled={busy === inv.id} onClick={() => answer(inv, true)}>{busy === inv.id ? "…" : "Gå med"}</button>
          </div>
        </div>
      ))}
      {error && <p className="pi-err">{error}</p>}
    </div>
  );
}

const CSS = `
  .tm { display: grid; gap: 12px; max-width: 640px; }
  .tm-list { list-style: none; margin: 0; padding: 0; border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; overflow: hidden; }
  .tm-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 11px 14px; font-size: 14px; }
  .tm-list li + li { border-top: 1px solid rgba(0,0,0,0.06); }
  .tm-list li.is-pending { background: #fafafa; }
  .tm-list li.is-pending b { font-weight: 500; color: #3a3a3e; }
  .tm-who { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tm-who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .tm-you { font-size: 11.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: #f0f0f0; color: #3a3a3e; }
  .tm-role { font-size: 13px; color: #6e6e73; white-space: nowrap; }
  .tm-x { font: inherit; font-size: 13px; font-weight: 600; color: #6e6e73; background: none; border: 0; padding: 4px 0; cursor: pointer; }
  .tm-x:hover { color: #D9480F; }
  .tm-invite { display: flex; gap: 8px; }
  .tm-invite input { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.16); border-radius: 10px; outline: none; }
  .tm-invite input:focus { border-color: #0a0a0a; }
  @media (max-width: 520px) {
    .tm-list li { grid-template-columns: minmax(0, 1fr) auto; }
    .tm-role { grid-column: 1; grid-row: 2; }
    .tm-x { grid-column: 2; grid-row: 1 / span 2; }
  }
  .pi { display: grid; gap: 10px; max-width: 1080px; margin: 0 auto; padding: 16px 16px 0; box-sizing: border-box; }
  .pi.is-compact { padding: 0; max-width: none; }
  .pi-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-radius: 14px; background: #fdf0f7; border: 1px solid rgba(236,23,143,0.25); }
  .pi-card p { margin: 0; font-size: 14.5px; line-height: 1.45; }
  .pi-actions { display: flex; gap: 8px; }
  .pi-btn { font: inherit; font-size: 13.5px; font-weight: 600; padding: 9px 15px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.14); background: #fff; color: #0a0a0a; cursor: pointer; }
  .pi-btn.is-dark { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
  .pi-btn:disabled { opacity: 0.5; cursor: default; }
  .pi-err { margin: 0; font-size: 14px; color: #D9480F; }
`;
