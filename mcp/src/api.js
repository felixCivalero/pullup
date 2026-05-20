// HTTP client for the PullUp backend. Reads PULLUP_API_BASE_URL +
// PULLUP_API_TOKEN from the environment so the MCP can be reconfigured
// without code changes.

const DEFAULT_BASE = "https://pullup.se";

export function getConfig() {
  const baseUrl = (process.env.PULLUP_API_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const token = process.env.PULLUP_API_TOKEN || "";
  if (!token) {
    throw new Error(
      "PULLUP_API_TOKEN is not set. Run `pullup-mcp issue-token` on the host machine to mint one, then add it to your Claude MCP config."
    );
  }
  return { baseUrl, token };
}

function joinPath(base, path) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}

// Tiny fetch wrapper that:
//   - Adds Bearer auth
//   - Sets JSON content-type when there's a body
//   - Parses JSON when the response is JSON (falls back to text)
//   - Throws a structured error on non-2xx so tool handlers can surface a
//     useful message to Claude.
export async function apiRequest(method, path, { body, headers = {}, query } = {}) {
  const { baseUrl, token } = getConfig();

  let url = joinPath(baseUrl, path);
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
      ...headers,
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
    throw new Error(`Network error contacting ${baseUrl}: ${err.message}`);
  }

  const ctype = resp.headers.get("content-type") || "";
  const isJson = ctype.includes("application/json");
  const raw = await resp.text();
  const parsed = isJson && raw ? safeJsonParse(raw) : raw;

  if (!resp.ok) {
    const detail = isJson && parsed && typeof parsed === "object"
      ? parsed.message || parsed.error || JSON.stringify(parsed)
      : raw || `HTTP ${resp.status}`;
    const e = new Error(`PullUp API ${resp.status} ${method} ${path}: ${detail}`);
    e.status = resp.status;
    e.body = parsed;
    throw e;
  }

  return parsed;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

// Helper: build the canonical preview URL given a slug. Defaults to the
// production frontend; if a custom base is set (e.g. http://localhost:5173
// during dev), the preview URL is derived from PULLUP_FRONTEND_URL instead.
export function frontendUrl(path = "/") {
  const base = (process.env.PULLUP_FRONTEND_URL || DEFAULT_BASE).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
