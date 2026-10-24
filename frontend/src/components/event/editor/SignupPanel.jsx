import { Field, Toggle } from "./editorUi.jsx";

/* Sign-up & access: how many can come, and the sign-up box on the page —
   shown or hidden, its heading and button text. Guests always give name and
   email; the confirmation mail and add-to-calendar follow. */
export function SignupPanel({ draft, update }) {
  const s = draft.signupSettings || {};
  const setS = (patch) => update({ signupSettings: { ...s, ...patch } });
  return (
    <div className="ee-panel">
      <Field label="Max antal" hint="Tomt = obegränsat. När det är fullt hamnar nya anmälningar på väntelistan.">
        <input type="number" min="1" value={draft.capacity ?? ""} placeholder="Obegränsat" onChange={(e) => update({ capacity: e.target.value === "" ? null : Number(e.target.value) })} />
      </Field>
      <Toggle on={!s.hidden} onChange={(v) => setS({ hidden: !v })} label="Visa anmälan på sidan" hint={s.hidden ? "Ingen kan anmäla sig via sidan just nu." : null} />
      {!s.hidden && (
        <>
          <Field label="Rubrik i anmälan" hint="Tomt = Free entry.">
            <input maxLength={80} value={s.label || ""} placeholder="Free entry" onChange={(e) => setS({ label: e.target.value })} />
          </Field>
          <Field label="Knapptext" hint="Tomt = Register / Anmäl mig.">
            <input maxLength={40} value={s.cta || ""} placeholder="Anmäl mig" onChange={(e) => setS({ cta: e.target.value })} />
          </Field>
        </>
      )}
      <p className="ee-muted">Gästerna fyller i namn och e-post och kan säga ja till inbjudningar. De får en bekräftelse med kalenderlänkar och hamnar i CRM:et.</p>
    </div>
  );
}
