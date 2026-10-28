// The brand the admin works in. One login can run several brands; every API
// call says which one (header X-PullUp-Brand, lib/api.js) and the server only
// honours it when it's one of the account's own (backend lib/brands.js).
// The choice is a per-browser convenience, so it lives in localStorage — and
// everything works without it (the server then picks the first brand).
import { createContext, useContext, useEffect, useState } from "react";

const KEY = "pullup.brand";
const EVENT = "pullup:brand";

export function currentBrandId() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setCurrentBrandId(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: the server falls back to the first brand */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id || "" }));
}

// The brand the page is drawn for, { id, name } (null for an account with no
// brand yet). AdminShell provides it; pages show it so nobody wonders which
// brand they're working in.
export const BrandContext = createContext(null);
export const useCurrentBrand = () => useContext(BrandContext);

// When a page opens an event of another of the account's brands, the admin
// moves to that brand: what's on screen and what the page works in agree.
export function followBrand(brandId) {
  if (brandId && brandId !== currentBrandId()) setCurrentBrandId(brandId);
}

// The id, kept live across the page when the switcher changes it.
export function useBrandId() {
  const [id, setId] = useState(currentBrandId);
  useEffect(() => {
    const on = (e) => setId(e.detail || "");
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return id;
}
