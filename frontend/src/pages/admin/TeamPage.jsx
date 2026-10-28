import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminShell } from "./AdminShell.jsx";
import { BrandKicker } from "../../components/admin/ByBrand.jsx";
import { TeamList } from "../../components/admin/Team.jsx";
import { teamApi } from "../../lib/team.js";
import { setCurrentBrandId } from "../../lib/brand.js";
import { EVENT_ADMIN_CSS } from "./eventAdminCss.js";

/* /admin/team — who works in the brand. The head (the account that made the
   brand) invites people by email and removes them; members see the team and
   can leave. A member works in the brand like the head: events, guests, CRM,
   mail on the head's credits. One event only: invite a co-host from the
   event's page instead. */
export function TeamPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    teamApi.brand().then(setTeam).catch(() => setError("Teamet visas för varumärkets team. Du är medarrangör på enskilda event här."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (m) => {
    const text = m.you ? `Lämna ${team.brand.name}? Du kommer inte åt varumärkets event längre.` : `Ta bort ${m.email} från ${team.brand.name}?`;
    if (!window.confirm(text)) return;
    try {
      await teamApi.removeMember(m.userId);
      if (m.you) {
        setCurrentBrandId("");
        window.location.assign("/admin/events");
        return;
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const people = team ? [
    { key: "head", email: team.head.email, role: "Ansvarig", you: team.head.you },
    ...team.members.map((m) => ({
      key: m.userId,
      email: m.email,
      role: `Medlem sedan ${new Date(m.since).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`,
      you: m.you,
      onRemove: team.canManage || m.you ? () => remove(m) : null,
    })),
  ] : [];

  return (
    <AdminShell title="Team">
      <style>{EVENT_ADMIN_CSS + CSS}</style>
      <div className="ea">
        <div className="ea-head">
          <div>
            <BrandKicker />
            <h1>Team</h1>
          </div>
        </div>
        {error && <p className="ea-error">{error}</p>}
        {!team && !error && <p className="ea-muted">Hämtar…</p>}
        {team && (
          <>
            <p className="tp-lead">
              {team.canManage
                ? <>Bjud in de som jobbar med {team.brand.name}. De loggar in med sin egen mejladress och jobbar i varumärket precis som du: event, gäster, CRM och utskick. Utskicken dras från ditt saldo. Du är ansvarig och den enda som bjuder in eller tar bort.</>
                : <>Du är med i teamet för {team.brand.name} och jobbar i varumärket precis som {team.head.email || "den ansvarige"}. Det är den ansvarige som bjuder in och tar bort.</>}
            </p>
            <TeamList
              people={people}
              invites={team.invites}
              canManage={team.canManage}
              onInvite={async (email) => { const out = await teamApi.inviteToBrand(email); load(); return out; }}
              onCancel={async (id) => { await teamApi.cancel(id).catch(() => {}); load(); }}
            />
            <p className="ea-muted tp-hint">
              Behöver någon bara hjälpa till med ett event? Bjud in en medarrangör från eventets sida. <button type="button" className="tp-link" onClick={() => navigate("/admin/events")}>Till eventen</button>
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}

const CSS = `
  .tp-lead { margin: 0 0 18px; max-width: 640px; font-size: 15px; line-height: 1.55; color: #3a3a3e; }
  .tp-hint { margin-top: 18px; max-width: 640px; }
  .tp-link { font: inherit; font-weight: 600; color: #0a0a0a; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
`;
