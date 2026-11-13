// Projekt is Felix's, but a client's own people can work in their project too
// (client_members, mig 165: pitch, strategy, board, timeline). This gate lets
// the owner in everywhere and a member into their projects only:
//   req.projects = { all: true } | { all: false, clientIds: Set }
//   req.plannerHost = whose timeline rows these are (always the owner's: the
//   planner tables are keyed by his user id, members work in the same rows).
import { supabase } from "../supabase.js";
import { sessionCaller } from "./requireUser.js";

export const OWNER_USER_ID = process.env.OWNER_USER_ID || "f3394b03-c5a0-4e8a-b001-8ae2175c85ff";

// The projects an email has been let into (client ids).
export async function memberClientIds(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return [];
  const { data, error } = await supabase.from("client_members").select("client_id").eq("email", e);
  if (error) throw error;
  return (data || []).map((r) => r.client_id);
}

export async function requireProjectAccess(req, res, next) {
  const caller = await sessionCaller(req);
  if (!caller) return res.status(401).json({ error: "unauthorized" });
  req.caller = caller;
  if (caller.isOwner) {
    req.user = { id: caller.userId, email: caller.email };
    req.projects = { all: true };
    req.plannerHost = caller.userId;
    return next();
  }
  try {
    const ids = await memberClientIds(caller.email);
    if (!ids.length) return res.status(403).json({ error: "forbidden" });
    req.user = { id: caller.userId, email: caller.email };
    req.projects = { all: false, clientIds: new Set(ids) };
    req.plannerHost = OWNER_USER_ID;
    return next();
  } catch (err) {
    console.error("[projects] access:", err?.message);
    return res.status(500).json({ error: "failed" });
  }
}

export const canSeeClient = (req, clientId) => !!clientId && (req.projects?.all || req.projects?.clientIds?.has(clientId));
