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
      ...user.user_metadata,
    };
    req.authType = authType;

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
          ...resolved.user.user_metadata,
        };
        req.authType = resolved.authType;
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
        const profile = await getUserProfile(req.user.id);
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
