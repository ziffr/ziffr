#!/usr/bin/env node
// The `ziffr-mcp` command (spec 0002, ticket #52): runs the MCP server over stdio for a local assistant, with
// ZIFFR_URL and ZIFFR_ACCESS_KEY from the assistant's settings. Nothing is written to stdout but the protocol.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnvironment, createServer } from "./server.js";

try {
  await createServer(clientFromEnvironment()).connect(new StdioServerTransport());
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
