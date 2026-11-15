import { viewerId } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { ThemesScreen } from "./screen";

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  // The preview draws the first three Metrics only.
  const data = await getCanvasData(await viewerId(), (visible) => visible.slice(0, 3).map((m) => m.id));
  const current = data.themes.find((t) => t.id === Number(sp.id)) ?? data.themes.find((t) => t.is_default) ?? data.themes[0];
  return (
    <>
      <PageHeader title="Themes" sub="The look of every dashboard and deck: colours, fonts and cards. The team default applies everywhere a dashboard or deck has not picked another." />
      {current ? <ThemesScreen key={`${current.id}-${current.updated_at}`} data={data} current={current} /> : <p className="text-sm text-muted-foreground">No themes yet.</p>}
    </>
  );
}
