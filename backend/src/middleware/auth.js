// backend/src/middleware/auth.js
// Authentication middleware for Express

import { supabase } from "../supabase.js";
import { getUserProfile } from "../data.js";

/**
 * Middleware to verify Supabase JWT token and attach user to request
 * Sets req.user = { id, email, ... } if authenticated
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

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid token" });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      ...user.user_metadata,
    };

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
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email,
          ...user.user_metadata,
        };
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
