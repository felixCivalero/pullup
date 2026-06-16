// backend/src/middleware/auth.js
// Authentication middleware for Express

import { supabase } from "../supabase.js";
import { getUserProfile, findUserIdByPatToken, isPatToken } from "../data.js";

// Resolve a bearer token to a user record. Returns null on any failure so
// callers can produce a single, opaque 401.
//
// Two token types share this code path:
//   1. `pup_*` Personal Access Tokens — minted by users for the MCP / CLI.
//      Looked up by SHA-256 hash; user record is hydrated via the admin API.
//   2. Supabase JWTs — short-lived browser-session tokens.
//
// req.authType records which branch succeeded ("pat" or "jwt") so routes
// that should not be callable from a PAT (e.g. minting more PATs) can
// reject them without duplicating logic.
async function resolveBearer(token) {
  if (!token) return null;

  if (isPatToken(token)) {
    const userId = await findUserIdByPatToken(token);
    if (!userId) return null;
    // PATs only carry a user id. Pull email/metadata via the admin API so
    // downstream code sees the same `req.user` shape as the JWT path.
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return { user: data.user, authType: "pat" };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { user: data.user, authType: "jwt" };
}

// Header a superuser sends to operate the platform AS another host. Carries the
// TARGET's auth user id (= profiles.id). Distinct from the person-scoped
// `x-pullup-view-as` room-preview header so the two never collide.
const ACT_AS_HEADER = "x-pullup-act-as";

// Admin "Act as" — full session-swap impersonation. If the REAL session is an
// admin and an `x-pullup-act-as: <userId>` header is present, we swap req.user
// to that host for the rest of the request, preserving the real admin as
// req.realUser and flagging req.impersonating. Because every host route scopes
// off req.user.id, this makes the WHOLE host experience (events, room, CRM,
// comms, analytics) resolve as the target — zero per-route changes.
//
// SECURITY: admin status is re-verified server-side on the REAL user every
// request. A forged header from a non-admin is silently ignored — it can never
// be turned into access. The swapped (impersonated) identity is never treated
// as admin (requireAdmin below authorises on req.realUser), so impersonating a
// host can't escalate. No header ⇒ this returns before any await, so normal
// traffic is completely untouched.
async function applyActAs(req) {
  const targetId = (req.headers?.[ACT_AS_HEADER] || "").toString().trim();
  if (!targetId || !req.user?.id) return;
  if (targetId === req.user.id) return; // acting as self = no-op

  let profile;
  try {
    profile = await getUserProfile(req.user.id);
  } catch {
    return; // can't confirm admin ⇒ don't swap
  }
  if (!profile?.isAdmin) return;

  const { data, error } = await supabase.auth.admin.getUserById(targetId);
  if (error || !data?.user) return; // unknown target ⇒ stay yourself
  const u = data.user;

  req.realUser = req.user;
  req.user = {
    id: u.id,
    email: u.email,
    phone: u.phone || null,
    ...u.user_metadata,
  };
  req.impersonating = true;
}

/**
 * Middleware to verify Supabase JWT token (or `pup_` PAT) and attach user to request
 * Sets req.user = { id, email, ... } if authenticated
 * Sets req.authType = "jwt" | "pat"
 * Returns 401 if not authenticated
 */
export async function requireAuth(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const resolved = await resolveBearer(token);

    if (!resolved) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid token" });
    }

    const { user, authType } = resolved;

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      phone: user.phone || null,
      ...user.user_metadata,
    };
    req.authType = authType;

    // Admin "Act as": swap identity if a verified admin is impersonating a host.
    await applyActAs(req);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Authentication failed" });
  }
}

/**
 * Optional auth middleware - attaches user if token is present, but doesn't require it
 * Useful for routes that work with or without auth
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const resolved = await resolveBearer(token);
      if (resolved) {
        req.user = {
          id: resolved.user.id,
          email: resolved.user.email,
          phone: resolved.user.phone || null,
          ...resolved.user.user_metadata,
        };
        req.authType = resolved.authType;
        // Honour admin Act-as on optional-auth routes too (e.g. the public room
        // resolves as the impersonated host), same server-side admin gate.
        await applyActAs(req);
      }
    }
    next();
  } catch (error) {
    // Continue without auth if error
    next();
  }
}

/**
 * Middleware to require that the authenticated user is an admin.
 * Uses profiles.is_admin flag for authorization.
 */
export async function requireAdmin(req, res, next) {
  try {
    // First ensure the user is authenticated
    await requireAuth(req, res, async () => {
      try {
        // Authorise on the REAL user. requireAuth may have swapped req.user to a
        // host via Act-as; admin rights belong to req.realUser. This also keeps
        // admin surfaces (incl. ending impersonation) reachable while acting as
        // someone, and stops an impersonated host identity from being treated
        // as admin.
        const adminId = req.realUser?.id || req.user.id;
        const profile = await getUserProfile(adminId);
        if (!profile?.isAdmin) {
          return res.status(403).json({
            error: "forbidden",
            message: "Admin access required",
          });
        }

        // Attach profile for downstream handlers if needed
        req.profile = profile;
        next();
      } catch (error) {
        console.error("requireAdmin error loading profile:", error);
        return res.status(500).json({
          error: "server_error",
          message: "Failed to verify admin access",
        });
      }
    });
  } catch (error) {
    console.error("requireAdmin middleware error:", error);
    return res.status(500).json({
      error: "server_error",
      message: "Failed to verify admin access",
    });
  }
}
