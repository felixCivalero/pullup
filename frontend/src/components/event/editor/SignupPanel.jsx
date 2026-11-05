import { Field, Toggle } from "./editorUi.jsx";
import { FormBuilder } from "./FormBuilder.jsx";
import { PlaceField } from "./PlaceField.jsx";
import { fromZonedInput, toZonedInput } from "../../../lib/zonedTime.js";

/* 01 Praktiskt — everything asked when the event was made, and nothing that
   is the page's look: the basics (name, time, place, whether they show yet)
   and then sign-up & access: how many can come, what the sign-up asks (FormBuilder:
   guests brought along, phone, Instagram, own questions), and the sign-up
   box on the page — shown or hidden, its heading and button text. */
export function SignupPanel({ draft, update }) {
  const s = draft.signupSettings || {};
  const setS = (patch) => update({ signupSettings: { ...s, ...patch } });
  const tz = draft.timezone || "Europe/Stockholm";
  return (
    <div className="ee-panel">
      <p className="ee-step-head">Grunderna</p>
      <Field label="Namn">
        <input maxLength={160} value={draft.title || ""} placeholder="Eventets namn" onChange={(e) => update({ title: e.target.value })} />
      </Field>
      <Toggle on={draft.titleSettings?.visible !== false} onChange={(v) => update({ titleSettings: { ...(draft.titleSettings || {}), visible: v } })} label="Visa namnet på sidan" />
      <div className="ee-two">
        <Field label="Startar">
          <input type="datetime-local" value={toZonedInput(draft.startsAt, tz)} onChange={(e) => update({ startsAt: e.target.value ? fromZonedInput(e.target.value, tz) : null })} />
        </Field>
        <Field label="Slutar (valfritt)">
          <input type="datetime-local" value={toZonedInput(draft.endsAt, tz)} onChange={(e) => update({ endsAt: e.target.value ? fromZonedInput(e.target.value, tz) : null })} />
        </Field>
      </div>
      <Toggle on={!!draft.hideDate} onChange={(v) => update({ hideDate: v })} label="Avslöja datumet senare" hint={draft.hideDate ? "Datumet ovan används bara för sortering och påminnelser. Sidan visar din ledtråd." : null} />
      {draft.hideDate && (
        <input className="ee-input" maxLength={80} value={draft.dateRevealHint || ""} onChange={(e) => update({ dateRevealHint: e.target.value })} placeholder="t.ex. Datum kommer snart" />
      )}
      <div className="ee-field"><span>Plats</span>
        <PlaceField value={draft} onChange={(p) => update(p)} inputClassName="ee-input" placeholder="Sök adress eller ställe" />
      </div>
      <Toggle on={!!draft.hideLocation} onChange={(v) => update({ hideLocation: v })} label="Avslöja platsen senare" />
      {draft.hideLocation && (
        <input className="ee-input" maxLength={80} value={draft.revealHint || ""} onChange={(e) => update({ revealHint: e.target.value })} placeholder="t.ex. Platsen släpps på fredag" />
      )}
      <p className="ee-step-head">Anmälan</p>
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
