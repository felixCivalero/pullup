// The logged-in side of the site belongs to one person. Every /admin route
// sits behind this: a valid Supabase session whose email is the owner's.
// Anything else is a 401/403 — there are no other accounts.
import { supabase } from "../supabase.js";
import { normalizeEmail } from "../lib/emailAddress.js";

export const OWNER_EMAIL = normalizeEmail(process.env.OWNER_EMAIL || "felix@pullup.se");

export const isOwnerEmail = (email) => !!email && normalizeEmail(email) === OWNER_EMAIL;

export async function requireOwner(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "unauthorized" });
    if (!isOwnerEmail(data.user.email)) return res.status(403).json({ error: "forbidden" });
    req.user = data.user;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}
