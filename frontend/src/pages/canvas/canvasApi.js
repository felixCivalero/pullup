// Board API, in two modes: the owner (logged in, by board id) and anyone on a
// share link (no login, by token). Same shapes either way. The canvas is open:
// boards can be created without an account — their share link is the board.
import { authenticatedFetch, publicFetch } from "../../lib/api.js";

async function json(res) {
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function boardApi({ id, token }) {
  const shared = Boolean(token);
  const base = shared ? `/canvas/shared/${token}` : `/canvas/boards/${id}`;
  const call = shared ? publicFetch : authenticatedFetch;
  return {
    shared,
    load: (since) => call(since == null ? base : `${base}?since=${since}`).then(json),
    save: (body) => call(base, { method: "PUT", body: JSON.stringify(body) }).then(json),
    rotateShare: () => authenticatedFetch(`${base}/share/rotate`, { method: "POST" }).then(json),
  };
}

export const listBoards = () => authenticatedFetch("/canvas/boards").then(json);
export const createBoard = (title, { loggedIn } = {}) =>
  (loggedIn ? authenticatedFetch : publicFetch)("/canvas/boards", { method: "POST", body: JSON.stringify({ title }) }).then(json);

// Boards opened on this device (by share token) — the open canvas has no
// account to list them, so the browser remembers them.
const RECENT_KEY = "pullup.canvas.recent";
export function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export function rememberBoard({ token, title }) {
  if (!token) return;
  try {
    const rest = readRecent().filter((b) => b.token !== token);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ token, title, openedAt: new Date().toISOString() }, ...rest].slice(0, 50)));
  } catch {
    /* storage unavailable — the link still works */
  }
}
export function forgetBoard(token) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((b) => b.token !== token)));
  } catch {
    /* ignore */
  }
}
export const deleteBoard = (id) => authenticatedFetch(`/canvas/boards/${id}`, { method: "DELETE" }).then(json);
export const resolveUrl = (url) => publicFetch(`/canvas/resolve?url=${encodeURIComponent(url)}`).then(json);
