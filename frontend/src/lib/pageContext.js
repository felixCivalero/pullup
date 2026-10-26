// What the open page is about, for an assistant in the browser (WebMCP's
// current_page tool, lib/webmcp.js). An event page sets its slug, an admin
// event page its id. Tiny on purpose: pages import it without pulling in
// the WebMCP code.
import { useEffect } from "react";

let context = {};
export const pageContext = () => context;

export function usePageContext(next) {
  const key = JSON.stringify(next || {});
  useEffect(() => {
    context = JSON.parse(key);
    return () => { context = {}; };
  }, [key]);
}

// Admin pages reload when an assistant changed something (lib/webmcp.js
// fires "pullup:changed" after every action that writes).
export function useAgentChanges(reload) {
  useEffect(() => {
    window.addEventListener("pullup:changed", reload);
    return () => window.removeEventListener("pullup:changed", reload);
  }, [reload]);
}
