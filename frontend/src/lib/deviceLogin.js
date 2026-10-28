// Sign-in that only works in this browser (backend lib/deviceLogin.js).
// Asking for a code makes a secret that stays here; only its hash goes to the
// server. The code and the link in the mail work only together with the
// secret, so they're useless in any other browser. Used by the login page,
// the /connect page and the WebMCP sign-in tools.
import { supabase } from "./supabase.js";
import { API_BASE } from "./env.js";

const KEY = "pullup.login";

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    return p && p.attempt && p.secret && Date.parse(p.expiresAt) > Date.now() ? p : null;
  } catch {
    return null;
  }
}
const clearPending = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

export const pendingLogin = () => {
  const p = readPending();
  return p ? { email: p.email, expiresAt: p.expiresAt } : null;
};

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(out.message || "Något gick fel. Försök igen.");
    err.code = out.error || "failed";
    throw err;
  }
  return out;
}

// Mail a code to `email`. The account is made on the first sign-in.
export async function requestCode(email, turnstile = "") {
  const secret = randomSecret();
  const out = await post("/auth/login", { email: email.trim().toLowerCase(), device: await sha256(secret), turnstile });
  try {
    localStorage.setItem(KEY, JSON.stringify({ attempt: out.attempt, secret, email: email.trim().toLowerCase(), expiresAt: out.expiresAt }));
  } catch {
    throw new Error("Webbläsaren sparar ingenting (privat läge?). Inloggning kräver det.");
  }
  return { email: email.trim().toLowerCase(), expiresAt: out.expiresAt };
}

async function finish(body) {
  const session = await post("/auth/verify", body);
  clearPending();
  const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new Error("Det gick inte att logga in. Be om en ny kod.");
  return session.user;
}

// The six digits from the mail, typed in this browser.
export async function verifyCode(code) {
  const p = readPending();
  if (!p) {
    const err = new Error("Koden har gått ut eller begärdes i en annan webbläsare. Be om en ny.");
    err.code = "expired";
    throw err;
  }
  return finish({ attempt: p.attempt, secret: p.secret, code: String(code).replace(/\D/g, "") });
}

// The link from the mail (#a=…&l=…), opened in some browser. Only the one
// that asked has the secret.
export function linkFromHash(hash = typeof window === "undefined" ? "" : window.location.hash) {
  const h = new URLSearchParams(String(hash).replace(/^#/, ""));
  return h.get("a") && h.get("l") ? { attempt: h.get("a"), link: h.get("l") } : null;
}

export async function verifyLink({ attempt, link }) {
  const p = readPending();
  if (!p || p.attempt !== attempt) {
    const err = new Error("Länken fungerar bara i webbläsaren där du bad om den. Öppna den där, eller skriv koden från mejlet där.");
    err.code = "other_device";
    throw err;
  }
  return finish({ attempt, secret: p.secret, link });
}
