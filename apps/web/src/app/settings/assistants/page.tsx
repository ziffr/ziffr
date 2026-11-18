// Connected assistants in a person's own settings (spec 0023, GLOSSARY: Access Key, MCP Server): every assistant
// they connected by its address, such as Claude.ai, in all their workspaces, with Disconnect. Owners also see and end
// the workspace's connections on its Access Keys page.
import { listMyConnections } from "@ziffr/core/assistant-connections";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { mcpUrl, remoteMcpEnabled } from "@/lib/remote-mcp";
import { PageHeader } from "@/components/page-header";
import { Connections } from "./connections";

export default async function AssistantsPage() {
  if (await isDemo()) {
    return (
      <>
        <PageHeader title="Connected assistants" />
        <p className="text-sm text-muted-foreground">The demo has no connected assistants: they connect only to your own workspaces.</p>
      </>
    );
  }
  const connections = await listMyConnections(await currentActor());
  return (
    <>
      <PageHeader title="Connected assistants" />
      <Connections connections={connections} address={remoteMcpEnabled() ? mcpUrl() : null} />
    </>
  );
}
