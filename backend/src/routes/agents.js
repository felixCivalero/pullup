// "Agenter" in admin: the assistants a person has let in, what they did, and
// the way to throw one out.
//   GET    /admin/agents      connected assistants + recent activity + how to connect
//   DELETE /admin/agents/:id  disconnect one (its tokens stop working at once)
import { requireUser } from "../middleware/requireUser.js";
import { supabase } from "../supabase.js";
import { MCP_URL, PUBLIC_MCP_URL } from "../agents/config.js";

const hostOf = (uri) => {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.protocol === "http:" ? u.host : u.protocol.replace(/:$/, "");
  } catch {
    return "";
  }
};

export function registerAgentRoutes(app) {
  app.get("/admin/agents", requireUser, async (req, res) => {
    try {
      const [grants, calls] = await Promise.all([
        supabase.from("agent_grants")
          .select("id, client_id, created_at, last_used_at, refresh_expires_at, agent_clients(metadata)")
          .eq("user_id", req.caller.userId)
          .is("revoked_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("agent_calls")
          .select("at, door, action, ok, ms, error, client_id")
          .eq("user_id", req.caller.userId)
          .order("at", { ascending: false })
          .limit(50),
      ]);
      if (grants.error) throw grants.error;
      if (calls.error) throw calls.error;
      const now = Date.now();
      const names = new Map();
      const connected = (grants.data || [])
        .filter((g) => !g.refresh_expires_at || new Date(g.refresh_expires_at).getTime() > now)
        .map((g) => {
          const meta = g.agent_clients?.metadata || {};
          const name = meta.client_name || "Okänd assistent";
          names.set(g.client_id, name);
          return { id: g.id, name, via: hostOf(meta.redirect_uris?.[0]), connectedAt: g.created_at, lastUsedAt: g.last_used_at };
        });
      // Disconnected assistants keep their name in the activity list.
      const unknown = [...new Set((calls.data || []).map((c) => c.client_id).filter((id) => id && !names.has(id)))];
      if (unknown.length) {
        const { data: clients } = await supabase.from("agent_clients").select("client_id, metadata").in("client_id", unknown);
        for (const c of clients || []) names.set(c.client_id, c.metadata?.client_name || "Okänd assistent");
      }
      return res.json({
        mcpUrl: MCP_URL,
        publicMcpUrl: PUBLIC_MCP_URL,
        connected,
        activity: (calls.data || []).map((c) => ({ ...c, assistant: c.door === "webmcp" ? "Assistent i webbläsaren" : `${names.get(c.client_id) || "Assistent"} (MCP)` })),
      });
    } catch (err) {
      console.error("[agents] list:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  app.delete("/admin/agents/:id", requireUser, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "not_found" });
    const { data, error } = await supabase
      .from("agent_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", String(req.params.id).slice(0, 64))
      .eq("user_id", req.caller.userId)
      .is("revoked_at", null)
      .select("id");
    if (error) return res.status(500).json({ error: "failed" });
    if (!data?.length) return res.status(404).json({ error: "not_found" });
    return res.json({ ok: true });
  });
}
