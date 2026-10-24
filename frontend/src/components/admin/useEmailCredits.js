import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";

/* Paid sends (backend lib/emailCredits.js): the host's balance and the packs,
   a Stripe Checkout per purchase and, back from Checkout
   (?credits=paid&session_id=…), the purchase credited and the URL cleared.
   The UI is EmailCredits.jsx. */
export function useEmailCredits() {
  const [state, setState] = useState({ balance: null, packs: [] });
  const [paid, setPaid] = useState(null); // { added, balance } after a purchase
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && alive && setState({ balance: d.balance, packs: d.packs || [] }))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const flag = searchParams.get("credits");
    if (!flag) return;
    const sessionId = searchParams.get("session_id");
    const next = new URLSearchParams(searchParams);
    next.delete("credits");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
    if (flag !== "paid" || !sessionId) return;
    authenticatedFetch("/admin/credits/confirm", { method: "POST", body: JSON.stringify({ sessionId }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setState((s) => ({ ...s, balance: d.balance }));
        if (d.paid) setPaid({ balance: d.balance });
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = useCallback(async (pack) => {
    const returnPath = `${window.location.pathname}${window.location.search}`;
    const res = await authenticatedFetch("/admin/credits/checkout", { method: "POST", body: JSON.stringify({ pack, returnPath }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) throw new Error("checkout_failed");
    window.location.assign(d.url);
  }, []);

  return { ...state, buy, paid, clearPaid: () => setPaid(null), setBalance: (balance) => setState((s) => ({ ...s, balance })) };
}
