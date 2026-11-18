// Claude and other AI assistants on the Connectors page (spec 0021, ticket 7; GLOSSARY: MCP Server, Access Key): how
// to connect one with an Access Key of your own, filled in with this Installation's address. It shows no key: the
// person makes one on the Access Keys page and pastes it in place of zk_..., so nothing secret is on this page.
import Link from "next/link";
import { Bot } from "lucide-react";

/** The two ways to add the MCP Server, for this Ziffr's address. */
export function McpPanel({ siteUrl }: { siteUrl: string }) {
  const claudeCode = `claude mcp add ziffr --env ZIFFR_URL=${siteUrl} --env ZIFFR_ACCESS_KEY=zk_... -- npx -y @ziffr/mcp`;
  const desktop = JSON.stringify({ mcpServers: { ziffr: { command: "npx", args: ["-y", "@ziffr/mcp"], env: { ZIFFR_URL: siteUrl, ZIFFR_ACCESS_KEY: "zk_..." } } } }, null, 2);
  return (
    <section aria-labelledby="mcp-h" className="stock mb-12 rounded-[var(--radius-card)] p-4 text-sm">
      <h2 id="mcp-h" className="flex items-center gap-2 text-[length:var(--text-lg)]"><Bot aria-hidden className="size-4" /> Claude and other AI assistants</h2>
      <p className="mt-2 text-muted-foreground">
        An assistant reads your Metrics, records values and starts Metrics through the MCP Server, which runs on your own computer and sees no more than its key.
      </p>
      <ol className="mt-3 list-decimal space-y-3 pl-5">
        <li>Make an Access Key on the <Link href="/settings/keys" className="underline">Access Keys</Link> page. Give it only what the assistant should do.</li>
        <li>
          <span>Claude Code: run this, with your key in place of <code>zk_...</code>.</span>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-input)] bg-muted p-2 text-xs"><code>{claudeCode}</code></pre>
        </li>
        <li>
          <span>Claude Desktop: Settings, Developer, Edit Config, and add this to <code>claude_desktop_config.json</code>.</span>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-input)] bg-muted p-2 text-xs"><code>{desktop}</code></pre>
        </li>
        <li>Ask it, for example, “What were sign-ups last week?” or “Record 42 orders for this month.”</li>
      </ol>
    </section>
  );
}
