import { DashboardView } from "@/components/dashboard-view";

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  return <DashboardView id={Number((await params).id)} view={(await searchParams).view} />;
}
