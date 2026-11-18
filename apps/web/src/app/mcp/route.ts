// /mcp (spec 0023, GLOSSARY: MCP Server): the remote MCP Server, for assistants that connect by address, such as
// Claude.ai. POST carries MCP messages; GET and DELETE answer 405, as a stateless server may. Off unless
// ZIFFR_REMOTE_MCP allows it (lib/remote-mcp.ts), and never with a session cookie: only the bearer credential counts.
import { handleMcp } from "@/lib/remote-mcp";

// Answers depend on the credential in each request: never prerendered or cached.
export const dynamic = "force-dynamic";

/** Every method goes to the one handler, which checks the setting, the origin and the credential first. */
export { handleMcp as POST, handleMcp as GET, handleMcp as DELETE };
