// Shared bits for the event editor's panels: a toggle and a labelled field
// (their look is in editorStyles.js).

export function Toggle({ on, onChange, label, hint = null }) {
  return (
    <div className="ee-toggle">
      <button type="button" role="switch" aria-checked={on} className={on ? "is-on" : ""} onClick={() => onChange(!on)}>
        <i />
      </button>
      <span>{label}{hint && <small>{hint}</small>}</span>
    </div>
  );
}

export function Field({ label, children, hint = null }) {
  return (
    <label className="ee-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
