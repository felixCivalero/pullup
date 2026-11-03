import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { authenticatedFetch } from "../../../lib/api.js";
import { API_BASE } from "../../../lib/env.js";

/* The event's place: type and pick from Google's suggestions (backend
   routes/places.js), and the map appears under it — PullUp's grey with a pink
   pin — with the coordinates read out like an instrument. Typing changes the
   text and lets go of the old pin until a new place is picked. A typed
   address that's never picked still works; it just has no map.
   value: { location, locationLat, locationLng }; onChange gets the same plus placeId. */

const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);
const mapUrl = (lat, lng, wide = false) => `${API_BASE}/places/map.png?lat=${Number(lat).toFixed(5)}&lng=${Number(lng).toFixed(5)}${wide ? "&s=wide" : ""}`;

export function PlaceField({ value, onChange, autoFocus = false, placeholder = "Adress eller ställe", inputClassName = "" }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const [picking, setPicking] = useState(false);
  const session = useRef(newSession());
  const timer = useRef(null);
  const asked = useRef("");
  const box = useRef(null);
  const text = value.location || "";
  const pinned = value.locationLat != null && value.locationLng != null;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const type = (next) => {
    onChange({ location: next, locationLat: null, locationLng: null, placeId: null });
    clearTimeout(timer.current);
    const q = next.trim();
    if (q.length < 2) { setList([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      asked.current = q;
      try {
        const r = await authenticatedFetch(`/admin/places?q=${encodeURIComponent(q)}&session=${session.current}`);
        const d = r.ok ? await r.json() : { places: [] };
        if (asked.current !== q) return;
        setList(d.places || []);
        setAt(-1);
        setOpen((d.places || []).length > 0);
      } catch { /* the field still takes text */ }
    }, 220);
  };

  const pick = async (p) => {
    setOpen(false);
    setPicking(true);
    try {
      const r = await authenticatedFetch(`/admin/places/${encodeURIComponent(p.placeId)}?session=${session.current}`);
      const d = r.ok ? await r.json() : null;
      const place = d?.place;
      onChange(place
        ? { location: place.label, locationLat: place.lat, locationLng: place.lng, placeId: place.placeId }
        : { location: [p.main, p.secondary].filter(Boolean).join(", "), locationLat: null, locationLng: null, placeId: null });
    } finally {
      session.current = newSession();
      setPicking(false);
    }
  };

  const keys = (e) => {
    if (!open || !list.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => (i + 1) % list.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => (i <= 0 ? list.length - 1 : i - 1)); }
    else if (e.key === "Enter" && at >= 0) { e.preventDefault(); e.stopPropagation(); pick(list[at]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="pf" ref={box}>
      <style>{PF_CSS}</style>
      <div className="pf-field">
        <input
          className={inputClassName}
          value={text}
          onChange={(e) => type(e.target.value)}
          onKeyDown={keys}
          onFocus={() => list.length && setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {open && (
          <ul className="pf-list" role="listbox">
            {list.map((p, i) => (
              <li key={p.placeId} role="option" aria-selected={i === at}>
                <button type="button" className={i === at ? "is-at" : ""} onMouseEnter={() => setAt(i)} onClick={() => pick(p)}>
                  <MapPin size={15} />
                  <span><b>{p.main}</b>{p.secondary && <small>{p.secondary}</small>}</span>
                </button>
              </li>
            ))}
            <li className="pf-by">Förslag från Google</li>
          </ul>
        )}
      </div>
      {pinned ? (
        <figure className="pf-map">
          <img src={mapUrl(value.locationLat, value.locationLng)} alt={`Karta: ${text}`} loading="lazy" />
          <figcaption>
            <i className="pf-led" />
            <span>Plats vald</span>
            <code>{Number(value.locationLat).toFixed(5)}, {Number(value.locationLng).toFixed(5)}</code>
            <a href={`https://www.google.com/maps/search/?api=1&query=${value.locationLat},${value.locationLng}`} target="_blank" rel="noopener noreferrer">Öppna i Maps ↗</a>
          </figcaption>
        </figure>
      ) : text.trim().length > 3 && !open ? (
        <p className="pf-hint">{picking ? "Hämtar platsen…" : "Välj ett förslag så får sidan en karta och gästerna en vägbeskrivning."}</p>
      ) : null}
    </div>
  );
}

const PF_CSS = `
  .pf { display: grid; gap: 10px; }
  .pf-field { position: relative; }
  .pf-list { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px); margin: 0; padding: 4px; list-style: none; background: #fff; border: 1px solid #9b9a95; border-radius: 10px; box-shadow: 3px 3px 0 rgba(0,0,0,.08), 0 18px 40px -16px rgba(0,0,0,.3); }
  .pf-list button { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: flex-start; padding: 9px 10px; border-radius: 7px; cursor: pointer; color: #0a0a0a; }
  .pf-list button svg { flex: none; margin-top: 2px; color: #ec178f; }
  .pf-list button.is-at { background: #fdeef6; }
  .pf-list span { display: grid; gap: 1px; min-width: 0; }
  .pf-list b { font-size: 15px; font-weight: 600; }
  .pf-list small { font-size: 12.5px; color: #6e6e73; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pf-by { padding: 6px 10px 4px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #9b9a95; text-align: right; }
  .pf-map { margin: 0; border: 1px solid #9b9a95; border-radius: 10px; overflow: hidden; background: #efeee9; box-shadow: 3px 3px 0 rgba(0,0,0,.07); animation: pf-in .35s ease both; }
  @keyframes pf-in { from { opacity: 0; transform: translateY(4px); } }
  .pf-map img { display: block; width: 100%; aspect-ratio: 560 / 300; object-fit: cover; }
  .pf-map figcaption { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; border-top: 1px solid #9b9a95; background: linear-gradient(180deg, #ecebe6, #d9d8d3); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #3a3935; }
  .pf-map code { font-family: inherit; color: #0a0a0a; font-weight: 700; letter-spacing: .02em; }
  .pf-map a { margin-left: auto; color: #0a0a0a; text-decoration: none; font-weight: 700; }
  .pf-map a:hover { color: #ec178f; }
  .pf-led { width: 6px; height: 6px; border-radius: 50%; background: #ec178f; box-shadow: 0 0 0 1px rgba(0,0,0,.2), 0 0 6px #ec178f; }
  .pf-hint { margin: 0; font-size: 13px; color: #6e6e73; }
`;
