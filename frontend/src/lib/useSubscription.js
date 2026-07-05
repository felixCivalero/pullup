// src/lib/useSubscription.js
//
// The Creator tier from the client's side, in one hook:
//   { sub, loading, refresh, startCheckout, openPortal }
//
// sub = GET /host/subscription → { tier, configured, enforced, entitlement,
// plan }. On mount it also finishes a just-returned checkout: the success URL
// carries ?subscribed=1&session_id=cs_… — passing that session id to the GET
// makes the backend sync with Stripe immediately (no webhook wait), then the
// params are stripped so refresh/back doesn't replay. If Stripe is a beat
// behind, we poll briefly rather than leaving the host staring at a paywall
// they just paid through.

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./api.js";

function readCheckoutReturn() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("subscribed")) return null;
    const result = { subscribed: p.get("subscribed") === "1", sessionId: p.get("session_id") || null };
    p.delete("subscribed");
    p.delete("session_id");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    return result;
  } catch {
    return null;
  }
}

// The path Stripe should send the host back to — where they are right now.
export function currentReturnPath() {
  try {
    return window.location.pathname + window.location.search + window.location.hash;
  } catch {
    return "/settings#billing";
  }
}

export function useSubscription() {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const checkoutReturn = useRef(undefined); // undefined = not read yet

  const fetchStatus = useCallback(async (sessionId) => {
    const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    const r = await authenticatedFetch(`/host/subscription${qs}`);
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchStatus();
    if (data) setSub(data);
    return data;
  }, [fetchStatus]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (checkoutReturn.current === undefined) checkoutReturn.current = readCheckoutReturn();
      const ret = checkoutReturn.current;
      let data = await fetchStatus(ret?.subscribed ? ret.sessionId : null);
      // Just paid but Stripe not settled yet? Poll briefly — the sync or the
      // webhook lands within seconds.
      let tries = 0;
      while (alive && ret?.subscribed && data && data.enforced && !data.entitlement?.canHost && tries < 5) {
        await new Promise((r) => setTimeout(r, 2000));
        data = await fetchStatus();
        tries += 1;
      }
      if (alive) {
        if (data) setSub(data);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchStatus]);

  const startCheckout = useCallback(async (returnTo) => {
    const r = await authenticatedFetch("/host/subscription/checkout", {
      method: "POST",
      body: JSON.stringify({ returnTo: returnTo || currentReturnPath() }),
    });
    const b = await r.json().catch(() => ({}));
    if (r.ok && b.url) {
      window.location.assign(b.url);
      return true;
    }
    return false;
  }, []);

  const openPortal = useCallback(async (returnTo) => {
    const r = await authenticatedFetch("/host/subscription/portal", {
      method: "POST",
      body: JSON.stringify({ returnTo: returnTo || currentReturnPath() }),
    });
    const b = await r.json().catch(() => ({}));
    if (r.ok && b.url) {
      window.location.assign(b.url);
      return true;
    }
    return false;
  }, []);

  return { sub, loading, refresh, startCheckout, openPortal };
}
