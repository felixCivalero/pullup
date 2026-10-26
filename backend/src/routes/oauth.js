// OAuth for assistants (see agents/oauthProvider.js):
//   GET  /.well-known/oauth-authorization-server   RFC 8414 metadata
//   GET  /.well-known/oauth-protected-resource[/mcp] RFC 9728: who guards /mcp
//   POST /oauth/register     an assistant registers itself (RFC 7591)
//   GET  /oauth/authorize    → pullup.se/connect, where the person approves
//   POST /oauth/token        code → tokens; refresh → new tokens
//   POST /oauth/revoke       an assistant gives a token back
// The consent page's API (pullup.se/api/oauth/requests/…):
//   GET  /oauth/requests/:id           which assistant is asking
//   POST /oauth/requests/:id/decision  { approve } → where the browser goes next
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { requireUser } from "../middleware/requireUser.js";
import { approveRequest, denyRequest, describeRequest, provider } from "../agents/oauthProvider.js";
import { ISSUER, MCP_URL, SCOPE } from "../agents/config.js";
import { getFrontendUrl } from "../lib/urls.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const authServerMetadata = () => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  registration_endpoint: `${ISSUER}/oauth/register`,
  revocation_endpoint: `${ISSUER}/oauth/revoke`,
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  scopes_supported: [SCOPE],
  service_documentation: `${getFrontendUrl()}/llms.txt`,
});

export const protectedResourceMetadata = () => ({
  resource: MCP_URL,
  authorization_servers: [ISSUER],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ["header"],
  resource_name: "PullUp",
  resource_documentation: `${getFrontendUrl()}/llms.txt`,
});

export function registerOauthRoutes(app) {
  const asMeta = (req, res) => res.set("Cache-Control", "public, max-age=3600").json(authServerMetadata());
  const prMeta = (req, res) => res.set("Cache-Control", "public, max-age=3600").json(protectedResourceMetadata());
  app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], asMeta);
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], prMeta);

  app.use("/oauth/register", clientRegistrationHandler({ clientsStore: provider.clientsStore, rateLimit: { windowMs: 60 * 60 * 1000, max: 30 } }));
  app.use("/oauth/authorize", authorizationHandler({ provider }));
  app.use("/oauth/token", tokenHandler({ provider }));
  app.use("/oauth/revoke", revocationHandler({ provider }));

  app.get("/oauth/requests/:id", async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: "not_found" });
    const request = await describeRequest(req.params.id).catch(() => null);
    if (!request) return res.status(404).json({ error: "not_found" });
    return res.json({ request });
  });

  app.post("/oauth/requests/:id/decision", requireUser, async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: "not_found" });
      const redirectTo = req.body?.approve === true
        ? await approveRequest(req.params.id, req.caller.userId)
        : await denyRequest(req.params.id);
      if (!redirectTo) return res.status(410).json({ error: "expired" });
      return res.json({ redirectTo });
    } catch (err) {
      console.error("[oauth] decision:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
