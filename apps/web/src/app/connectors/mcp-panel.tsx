// Claude and other AI assistants on the Connectors page (spec 0021, ticket 7; spec 0023; GLOSSARY: MCP Server, Access
// Key): how to connect one, filled in with this Installation's address. Assistants on the web, such as Claude.ai,
// connect to the remote MCP Server's address and sign in on Ziffr's consent screen; assistants on the person's
// computer use an Access Key they make on the Access Keys page and paste in place of zk_..., so nothing secret is
// on this page.
import Link from "next/link";
import { Bot } from "lucide-react";

/** The ways to add the MCP Server, for this Ziffr's address; `remote` is /mcp's address when this Ziffr serves it. */
export function McpPanel({ siteUrl, remote }: { siteUrl: string; remote: string | null }) {
  const claudeCode = `claude mcp add ziffr --env ZIFFR_URL=${siteUrl} --env ZIFFR_ACCESS_KEY=zk_... -- npx -y @ziffr/mcp`;
  const desktop = JSON.stringify({ mcpServers: { ziffr: { command: "npx", args: ["-y", "@ziffr/mcp"], env: { ZIFFR_URL: siteUrl, ZIFFR_ACCESS_KEY: "zk_..." } } } }, null, 2);
  return (
    <section aria-labelledby="mcp-h" className="stock mb-12 rounded-[var(--radius-card)] p-4 text-sm">
      <h2 id="mcp-h" className="flex items-center gap-2 text-[length:var(--text-lg)]"><Bot aria-hidden className="size-4" /> Claude and other AI assistants</h2>
      <p className="mt-2 text-muted-foreground">
        An assistant reads your Metrics, records values, starts Metrics and builds dashboards through Ziffr&apos;s MCP Server. It sees no more than you do, and does only what you allow.
      </p>
      {remote && (
        <>
          <h3 className="mt-4 font-medium">Claude.ai and other assistants on the web</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>
              <span>In Claude, open Settings, Connectors, and add a custom connector with this address:</span>
              <pre className="mt-1 overflow-x-auto rounded-[var(--radius-input)] bg-muted p-2 text-xs"><code>{remote}</code></pre>
            </li>
            <li>Press Connect. Ziffr opens: sign in, pick the workspace and what the assistant may do, and confirm.</li>
            <li>See and disconnect it under <Link href="/settings/assistants" className="underline">Connected assistants</Link>.</li>
          </ol>
        </>
      )}
      <h3 className="mt-4 font-medium">Claude Code and Claude Desktop, with an Access Key</h3>
      <ol className="mt-2 list-decimal space-y-3 pl-5">
        <li>Make an Access Key on the <Link href="/settings/keys" className="underline">Access Keys</Link> page. Give it only what the assistant should do.</li>
        <li>
          <span>Claude Code: run this, with your key in place of <code>zk_...</code>.</span>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-input)] bg-muted p-2 text-xs"><code>{claudeCode}</code></pre>
        </li>
        <li>
          <span>Claude Desktop: Settings, Developer, Edit Config, and add this to <code>claude_desktop_config.json</code>.</span>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-input)] bg-muted p-2 text-xs"><code>{desktop}</code></pre>
        </li>
      </ol>
      <p className="mt-3 text-muted-foreground">Then ask it, for example, “What were sign-ups last week?” or “Record 42 orders for this month.”</p>
    </section>
  );
}
