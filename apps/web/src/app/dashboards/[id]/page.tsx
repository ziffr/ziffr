import { DashboardView } from "@/components/dashboard-view";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  return <DashboardView id={Number((await params).id)} />;
}
