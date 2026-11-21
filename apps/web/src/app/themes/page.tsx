import { viewerId } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { standardTheme } from "@ziffr/core/standard-themes";
import { ThemesScreen } from "./screen";

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ id?: string; standard?: string }> }) {
  const sp = await searchParams;
  // The preview draws the first three Metrics only.
  const data = await getCanvasData(await viewerId(), (visible) => visible.slice(0, 3).map((m) => m.id));
  // A standard Theme is looked at before it is added: it is drawn from Ziffr's own list, never from a row.
  const std = standardTheme(sp.standard);
  const current = std
    ? { id: 0, owner_id: "", name: std.name, tokens: std.tokens, slides: std.slides, is_default: false, updated_at: "" }
    : data.themes.find((t) => t.id === Number(sp.id)) ?? data.themes.find((t) => t.is_default) ?? data.themes[0];
  return (
    <>
      <PageHeader title="Themes" sub="The look of every dashboard and deck: colours, fonts and cards. The team default applies everywhere a dashboard or deck has not picked another." />
      {current ? <ThemesScreen key={`${std?.key ?? current.id}-${current.updated_at}`} data={data} current={current} standardKey={std?.key ?? null} /> : <p className="text-sm text-muted-foreground">No themes yet.</p>}
    </>
  );
}
