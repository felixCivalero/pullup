import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { authenticatedFetch } from "../../lib/api.js";
import { setCurrentBrandId } from "../../lib/brand.js";

/* The brand the admin works in, top bar. One login can run several brands
   (an agency, a company with several products): events, guests, CRM and mail
   follow the brand picked here; mail credits are the account's. Pick one,
   rename it, or add another. `onChange` reloads the account (AdminShell). */
export function BrandSwitcher({ brands, current, onChange }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "new" | "rename"
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef(null);
  const active = brands.find((b) => b.id === current) || brands[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  useEffect(() => { if (!open) { setMode(null); setError(""); } }, [open]);

  const pick = (id) => {
    setOpen(false);
    if (id !== active?.id) setCurrentBrandId(id);
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch(mode === "new" ? "/admin/brands" : `/admin/brands/${active.id}`, {
        method: mode === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ name }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || "Det gick inte att spara.");
      await onChange?.();
      if (mode === "new") setCurrentBrandId(out.brand.id);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;
  return (
    <div className="bs" ref={box}>
      <style>{CSS}</style>
      <button type="button" className="bs-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Varumärke">
        <span className="bs-name">{active.name}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="bs-menu" role="menu">
          {mode ? (
            <form onSubmit={save} className="bs-form">
              <label htmlFor="bs-input">{mode === "new" ? "Nytt varumärke" : "Byt namn"}</label>
              <input id="bs-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="Namn" />
              {error && <p className="bs-err">{error}</p>}
              <div className="bs-row">
                <button type="button" className="bs-quiet" onClick={() => setMode(null)}>Avbryt</button>
                <button type="submit" className="bs-go" disabled={busy || !name.trim()}>{busy ? "Sparar…" : "Spara"}</button>
              </div>
            </form>
          ) : (
            <>
              {brands.map((b) => (
                <button key={b.id} type="button" role="menuitemradio" aria-checked={b.id === active.id} className="bs-item" onClick={() => pick(b.id)}>
                  <span>{b.name}</span>
                  {b.id === active.id && <Check size={15} />}
                </button>
              ))}
              <div className="bs-sep" />
              <button type="button" role="menuitem" className="bs-item bs-muted" onClick={() => { setName(active.name); setMode("rename"); }}>
                Byt namn på {active.name}
              </button>
              <button type="button" role="menuitem" className="bs-item bs-muted" onClick={() => { setName(""); setMode("new"); }}>
                <span>Nytt varumärke</span>
                <Plus size={15} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
  .bs { position: relative; flex-shrink: 1; min-width: 0; }
  .ad-bar .bs-btn { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 7px 12px; border-radius: 999px;
    border: 1px solid rgba(0,0,0,0.12); background: #fff; color: #0a0a0a; font-size: 14px; font-weight: 600; }
  .ad-bar .bs-btn:hover { border-color: rgba(0,0,0,0.3); color: #0a0a0a; }
  .bs-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-menu { position: absolute; right: 0; top: calc(100% + 8px); width: 260px; max-width: calc(100vw - 32px); max-height: 70vh; overflow-y: auto;
    background: #fff; border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.12); padding: 6px; z-index: 60; }
  .ad-bar .bs-item { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left;
    padding: 9px 10px; border-radius: 9px; font-size: 14px; color: #0a0a0a; }
  .ad-bar .bs-item:hover { background: rgba(0,0,0,0.05); color: #0a0a0a; }
  .ad-bar .bs-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ad-bar .bs-muted { color: #6e6e73; font-size: 13px; }
  .bs-sep { height: 1px; background: rgba(0,0,0,0.08); margin: 6px 4px; }
  .bs-form { display: grid; gap: 8px; padding: 6px; }
  .bs-form label { font-size: 12px; font-weight: 600; color: #6e6e73; }
  .bs-form input { font: inherit; font-size: 15px; padding: 9px 11px; border: 1px solid rgba(0,0,0,0.16); border-radius: 9px; outline: none; }
  .bs-form input:focus { border-color: #000; }
  .bs-row { display: flex; justify-content: flex-end; gap: 8px; }
  .ad-bar .bs-go { background: #0a0a0a; color: #fff; padding: 8px 14px; border-radius: 999px; font-weight: 600; }
  .ad-bar .bs-go:hover { color: #fff; }
  .ad-bar .bs-go:disabled { opacity: 0.4; }
  .bs-err { margin: 0; font-size: 13px; color: #D9480F; }
  @media (max-width: 520px) { .ad-bar .bs-btn { max-width: 120px; padding: 7px 10px; } }
`;
