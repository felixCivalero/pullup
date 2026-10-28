import { useEffect, useRef } from "react";

/* Cloudflare Turnstile: a bot check people rarely notice (no puzzles). On the
   forms a script would hammer — sign-in and event sign-up. Off until
   VITE_TURNSTILE_SITE_KEY is set (the backend checks with
   TURNSTILE_SECRET_KEY, lib/abuse.js); then `onToken` gets the token to send
   along, and "" when it expires. */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { loading = null; reject(new Error("turnstile_load_failed")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function Turnstile({ onToken, theme = "auto" }) {
  const box = useRef(null);
  const tokenCb = useRef(onToken);
  useEffect(() => { tokenCb.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined;
    let id = null;
    let alive = true;
    loadScript()
      .then((ts) => {
        if (!alive || !box.current) return;
        id = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          appearance: "interaction-only",
          callback: (t) => tokenCb.current?.(t),
          "expired-callback": () => tokenCb.current?.(""),
          "error-callback": () => tokenCb.current?.(""),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (id != null) window.turnstile?.remove(id);
    };
  }, [theme]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} />;
}
