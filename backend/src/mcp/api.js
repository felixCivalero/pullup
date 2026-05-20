// Loopback HTTP client used by MCP tool handlers.
//
// The MCP server runs in-process with the rest of the backend, but we
// deliberately call the PullUp REST API over localhost rather than
// invoking data.js functions directly. That keeps validation,
// authorization, image-upload handling, slug uniqueness, etc. in ONE
// place (the REST routes) — the MCP can't drift away from the REST
// behavior because it's literally calling the same endpoints.
//
// Overhead: ~0.5ms per call on loopback. Worth it.

const PORT = process.env.PORT || 3001;
const INTERNAL_API_BASE = (
  process.env.PULLUP_INTERNAL_API_BASE || `http://127.0.0.1:${PORT}`
).replace(/\/+$/, "");

const FRONTEND_BASE = (
  process.env.PULLUP_FRONTEND_URL || "https://pullup.se"
).replace(/\/+$/, "");

export function frontendUrl(p = "/") {
  return `${FRONTEND_BASE}${p.startsWith("/") ? "" : "/"}${p}`;
}

// Returns an apiRequest function with the caller's PAT baked in. Each MCP
// tool invocation gets its own bound copy so the credential never leaks
// across requests.
export function makeApi(token) {
  if (!token) throw new Error("makeApi requires a PAT");
  return async function apiRequest(method, path, { body, query } = {}) {
    let url = `${INTERNAL_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    if (query && typeof query === "object") {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    const init = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let resp;
    try {
      resp = await fetch(url, init);
    } catch (err) {
      throw new Error(`Loopback fetch failed (${method} ${path}): ${err.message}`);
    }

    const ctype = resp.headers.get("content-type") || "";
    const isJson = ctype.includes("application/json");
    const raw = await resp.text();
    const parsed = isJson && raw ? safeJsonParse(raw) : raw;

    if (!resp.ok) {
      const detail =
        isJson && parsed && typeof parsed === "object"
          ? parsed.message || parsed.error || JSON.stringify(parsed)
          : raw || `HTTP ${resp.status}`;
      const e = new Error(`PullUp API ${resp.status} ${method} ${path}: ${detail}`);
      e.status = resp.status;
      e.body = parsed;
      throw e;
    }

    return parsed;
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}
