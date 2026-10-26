// Who is calling. Anyone can have an account on PullUp now: an organiser
// signs in (lib/deviceLogin.js) and gets their own events, guests, CRM and
// mail. One account is special — the owner (Felix) is the platform admin:
// he sees every event and has the pages only he uses (sales, projects …).
//
// A caller is the same shape whether it arrived as a person in a browser
// (a Supabase session) or as their assistant (an agent token, routes/mcp.js):
//   { userId, email, isOwner, hostId, via: "session" | "agent", clientId }
// hostId is whose events these are. The owner works on his old host account
// (EVENT_HOST_ID) so his 38 events stay his; everyone else is their own host.
import crypto from "crypto";
import { supabase } from "../supabase.js";
import { isOwnerEmail } from "./requireOwner.js";
import { EVENT_HOST_ID } from "../lib/eventPlatform.js";

export function callerFor(user, extra = {}) {
  const isOwner = isOwnerEmail(user.email);
  return {
    userId: user.id,
    email: (user.email || "").toLowerCase(),
    isOwner,
    hostId: isOwner ? EVENT_HOST_ID : user.id,
    via: "session",
    clientId: null,
    ...extra,
  };
}

// Supabase verifies a session token with a network call. The same token comes
// back on every request of a page, so a verified token is remembered briefly.
const CACHE_MS = 60_000;
const cache = new Map(); // sha256(token) → { user, until }

export async function userFromSessionToken(token) {
  if (!token) return null;
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  if (cache.size > 500) cache.clear();
  cache.set(key, { user: data.user, until: Date.now() + CACHE_MS });
  return data.user;
}

const bearer = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

// The caller for a request with a browser session, or null.
export async function sessionCaller(req) {
  try {
    const user = await userFromSessionToken(bearer(req));
    return user ? callerFor(user) : null;
  } catch {
    return null;
  }
}

// Any signed-in person. Sets req.caller (and req.user, like requireOwner).
export async function requireUser(req, res, next) {
  const caller = await sessionCaller(req);
  if (!caller) return res.status(401).json({ error: "unauthorized" });
  req.caller = caller;
  req.user = { id: caller.userId, email: caller.email };
  return next();
}

// A signed-in person or nobody — for routes that work both ways.
export async function optionalUser(req, res, next) {
  req.caller = await sessionCaller(req);
  return next();
}

// Every organiser gets a profiles row (the old app's host table) the first
// time they sign in, so their events have a host to belong to.
export async function ensureHostProfile(userId, { origin = "web" } = {}) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, signup_origin: origin }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.error("[accounts] profile upsert failed:", error.message);
}
