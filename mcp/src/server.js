#!/usr/bin/env node
// PullUp MCP server.
//
// Stdio transport — runs as a child process of the host's Claude client
// (Claude Desktop, Claude Code, etc.) and communicates over stdin/stdout
// per the MCP spec.
//
// Tools are defined in ./tools.js. This file is just wiring.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { tools, wrapHandler } from "./tools.js";

async function main() {
  const server = new McpServer({
    name: "pullup",
    version: "0.1.0",
  }, {
    capabilities: { tools: {} },
  });

  for (const t of tools) {
    server.registerTool(t.name, {
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
    }, wrapHandler(t.handler));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive; no further work here.
}

main().catch((err) => {
  // stderr because stdout is the MCP protocol channel.
  console.error("PullUp MCP server failed to start:", err?.stack || err?.message || err);
  process.exit(1);
});
