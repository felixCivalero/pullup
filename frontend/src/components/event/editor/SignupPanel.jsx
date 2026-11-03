import { Field, Toggle } from "./editorUi.jsx";
import { FormBuilder } from "./FormBuilder.jsx";

/* Sign-up & access: how many can come, what the sign-up asks (FormBuilder:
   guests brought along, phone, Instagram, own questions), and the sign-up
   box on the page — shown or hidden, its heading and button text. */
export function SignupPanel({ draft, update }) {
  const s = draft.signupSettings || {};
  const setS = (patch) => update({ signupSettings: { ...s, ...patch } });
  return (
    <div className="ee-panel">
      <FormBuilder form={draft.form} onChange={(form) => update({ form })} capacity={draft.capacity} onCapacity={(capacity) => update({ capacity })} />
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
      <p className="ee-muted">Gästerna fyller alltid i namn och e-post och kan säga ja till inbjudningar. Svaren syns i gästlistan, i exporten och i CRM:et. Gäster som tas med räknas som platser.</p>
    </div>
  );
}
