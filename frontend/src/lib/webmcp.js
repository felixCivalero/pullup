// WebMCP: the site hands its abilities to an AI assistant running in this
// browser (W3C draft, document.modelContext — older Chrome builds expose it
// as navigator.modelContext). The tools are PullUp's actions (backend
// actions/): the list comes from GET /actions for whoever is signed in here,
// and a call runs as that person through POST /actions/:name. So in the
// browser an assistant can do exactly what the person can — nothing more.
//
// Three tools exist only here, because only a browser can do them: sign in
// (a code that works in this browser alone), finish signing in, sign out.
// Plus current_page: what the person is looking at right now.
//
// Feature-detected: without the API this module is never loaded (main.jsx).
import { supabase } from "./supabase.js";
import { authenticatedFetch } from "./api.js";
import { requestCode, verifyCode } from "./deviceLogin.js";
import { pageContext } from "./pageContext.js";

const modelContext = () => (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext) || null;
export const webMcpSupported = () => !!modelContext();

const listeners = new Set();
let registered = []; // names, for the status line on Agenter
export const registeredTools = () => registered;
export function onToolsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// An action, run as the person signed in here.
async function callAction(name, input, signal) {
  const res = await authenticatedFetch(`/actions/${name}`, {
    method: "POST",
    headers: { "x-pullup-door": "webmcp" },
    body: JSON.stringify(input ?? {}),
    signal,
  });
  const out = await res.json().catch(() => null);
  if (!out?.ok) {
    const e = out?.error || { code: "failed", message: "PullUp didn't answer." };
    throw new Error(`${e.code}: ${e.message}${e.needed != null ? ` (needed ${e.needed}, balance ${e.balance})` : ""}`);
  }
  return out.result;
}

// Something changed on PullUp: open admin pages reload what they show.
const announce = (action) => window.dispatchEvent(new CustomEvent("pullup:changed", { detail: { action } }));

function remoteTool(a) {
  return {
    name: a.name,
    title: a.title,
    description: a.description,
    inputSchema: a.inputSchema,
    annotations: a.annotations,
    execute: async (input, options) => {
      const result = await callAction(a.name, input, options?.signal);
      if (a.effect !== "read") announce(a.name);
      return result;
    },
  };
}

const EMPTY = { type: "object", properties: {}, additionalProperties: false };

function localTools(signedIn) {
  const currentPage = {
    name: "current_page",
    title: "What's on screen",
    description: "The PullUp page the person has open right now: its address, title, and the event it's about (slug for a public event page, id for an event in admin).",
    inputSchema: EMPTY,
    annotations: { readOnlyHint: true },
    execute: async () => ({ path: window.location.pathname, title: document.title, signedIn, ...pageContext() }),
  };
  if (signedIn) {
    return [currentPage, {
      name: "sign_out",
      title: "Sign out",
      description: "Sign the person out of PullUp in this browser.",
      inputSchema: EMPTY,
      annotations: { consequentialHint: false },
      execute: async () => {
        await supabase.auth.signOut();
        return { signedOut: true };
      },
    }];
  }
  return [currentPage, {
    name: "sign_in",
    title: "Sign in (or create an account)",
    description:
      "Start signing the person in to PullUp in this browser: a six-digit code is mailed to their address (the first sign-in creates the account). The code works only in this browser, for 15 minutes. Then ask the person for the code and call sign_in_with_code.",
    inputSchema: { type: "object", properties: { email: { type: "string", format: "email", description: "The person's own email address." } }, required: ["email"], additionalProperties: false },
    annotations: { consequentialHint: true },
    execute: async ({ email }) => {
      const out = await requestCode(email);
      return { codeSentTo: out.email, expiresAt: out.expiresAt, next: "Ask the person for the 6-digit code from the mail, then call sign_in_with_code." };
    },
  }, {
    name: "sign_in_with_code",
    title: "Finish signing in",
    description: "Finish signing in with the six-digit code the person got by mail after sign_in. Only works in the browser that asked for the code.",
    inputSchema: { type: "object", properties: { code: { type: "string", pattern: "^\\d{6}$", description: "The 6 digits from the mail." } }, required: ["code"], additionalProperties: false },
    execute: async ({ code }) => {
      const user = await verifyCode(code);
      return { signedInAs: user?.email };
    },
  }];
}

let controller = null;
let unregisterers = [];

async function register(tools) {
  const mc = modelContext();
  if (!mc) return;
  // Take down the previous set: the draft API unregisters through the signal,
  // older builds through unregisterTool or a returned handle.
  controller?.abort();
  for (const off of unregisterers) {
    try { off(); } catch { /* already gone */ }
  }
  controller = new AbortController();
  unregisterers = [];
  const names = [];
  for (const tool of tools) {
    try {
      const handle = await mc.registerTool(tool, { signal: controller.signal });
      if (handle && typeof handle.unregister === "function") unregisterers.push(() => handle.unregister());
      else if (typeof mc.unregisterTool === "function") unregisterers.push(() => mc.unregisterTool(tool.name));
      names.push(tool.name);
    } catch (err) {
      console.warn(`[webmcp] ${tool.name} not registered:`, err?.message || err);
    }
  }
  registered = names;
  listeners.forEach((fn) => fn(names));
}

let refreshing = null;
async function refresh() {
  const { data } = await supabase.auth.getSession();
  const signedIn = !!data?.session;
  let actions = [];
  try {
    const res = await authenticatedFetch("/actions");
    if (res.ok) actions = (await res.json()).actions || [];
  } catch { /* offline: the browser-only tools still work */ }
  await register([...actions.map(remoteTool), ...localTools(signedIn)]);
}

export function startWebMcp() {
  if (!modelContext()) return;
  const run = () => {
    refreshing = (refreshing || Promise.resolve()).then(refresh).catch((err) => console.warn("[webmcp]", err?.message || err));
  };
  // Signing in or out changes what this person — and so their assistant — may
  // do. (Supabase repeats SIGNED_IN on tab focus: only a new user counts.)
  let userId;
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user?.id || null;
    if (next === userId) return;
    userId = next;
    run();
  });
}
