// The actions over plain HTTP — the door WebMCP uses: the site registers each
// action with the browser (document.modelContext), and when an assistant in
// the browser calls one, the page posts it here with the person's own session.
//   GET  /actions        what this caller may run, with JSON Schemas
//   POST /actions/:name  run one → { ok: true, result } | { ok: false, error }
import { ACTIONS, actionsFor } from "../actions/index.js";
import { describe, runAction } from "../actions/registry.js";
import { ActionError, statusFor } from "../lib/actionError.js";
import { optionalUser } from "../middleware/requireUser.js";

export function registerActionRoutes(app) {
  app.get("/actions", optionalUser, (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json({ signedIn: !!req.caller, actions: actionsFor(req.caller).map(describe) });
  });

  app.post("/actions/:name", optionalUser, async (req, res) => {
    const door = req.get("x-pullup-door") === "webmcp" ? "webmcp" : "http";
    try {
      const result = await runAction(ACTIONS, String(req.params.name).slice(0, 64), req.body, {
        caller: req.caller,
        door,
        ip: req.ip,
        country: req.get("cf-ipcountry") || null,
        userAgent: req.get("user-agent") || null,
      });
      return res.json({ ok: true, result });
    } catch (err) {
      const e = err instanceof ActionError ? err : new ActionError("failed", "Something went wrong.");
      return res.status(statusFor(e.code)).json({ ok: false, error: { code: e.code, message: e.message, ...e.extra } });
    }
  });
}
