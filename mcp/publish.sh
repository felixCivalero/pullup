#!/usr/bin/env bash
# Publish PullUp to the official MCP Registry (registry.modelcontextprotocol.io).
#
# The server itself lives in the backend: https://mcp.pullup.se (OAuth) and
# https://pullup.se/api/mcp/public (no account) — backend/src/routes/mcp.js,
# tools = backend/src/actions/. server.json here is the registry entry.
#
# The namespace se.pullup is proven with a key: the public half is served at
# https://pullup.se/.well-known/mcp-registry-auth (frontend/public), the
# private half stays outside the repo: ~/.config/pullup/mcp-registry-key.pem.
# New version: bump "version" in server.json, then run this.
set -euo pipefail
cd "$(dirname "$0")"
OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl
KEY="${MCP_REGISTRY_KEY:-$HOME/.config/pullup/mcp-registry-key.pem}"
PRIVATE_KEY="$("$OPENSSL" pkey -in "$KEY" -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain pullup.se --private-key "$PRIVATE_KEY"
mcp-publisher publish
