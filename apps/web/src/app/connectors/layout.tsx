// Workspace → Connectors (spec 0021, #532; GLOSSARY: Connector, Outbox): one title, five tabs, each its own page.
import { PageHeader } from "@/components/page-header";
import { ConnectorsTabs } from "./tabs";

export default function ConnectorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      <ConnectorsTabs />
      {children}
    </>
  );
}
