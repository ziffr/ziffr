import Link from "next/link";
import { Plus, Sigma } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Sparkline } from "@/views/sparkline";
import { getAllSeries, getProfileMap } from "@/lib/data";
import { formatValue, health, PERIOD_LABEL, periodLabel, SOURCE_LABEL, targetText } from "@/lib/format";

export default async function MetricsPage() {
  const [{ metrics, series }, people] = await Promise.all([getAllSeries(), getProfileMap()]);
  return (
    <>
      <PageHeader title="Metrics" sub="Every number Ziffr keeps, each one described before it can receive values.">
        <Link href="/metrics/new" className={buttonVariants()}>
          <Plus /> New metric
        </Link>
      </PageHeader>
      <div className="overflow-hidden rounded-xl border bg-background">
        {metrics.map((m) => {
          const pts = series[m.slug] ?? [];
          const last = pts[pts.length - 1];
          const tone = health(m, last?.value);
          return (
            <Link key={m.id} href={`/metrics/${m.slug}`} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b px-4 py-3 last:border-0 hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {m.name}
                  {m.formula && <Badge variant="secondary"><Sigma /> Derived</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {PERIOD_LABEL[m.period]} · {m.formula ? "computed" : m.sources.map((s) => SOURCE_LABEL[s]).join(", ")} · target {targetText(m)}
                </div>
              </div>
              <div className="hidden md:block">{pts.length > 1 && <Sparkline points={pts.slice(-30)} height={32} tone={tone} />}</div>
              <div className="text-right md:text-left">
                <div className={tone === "bad" ? "font-semibold text-destructive" : "font-semibold"}>{last ? formatValue(m, last.value) : "No values yet"}</div>
                <div className="text-xs text-muted-foreground">{last ? periodLabel(last.period, m.period) : "Waiting for the first Observation"}</div>
              </div>
              <div className="hidden text-sm md:block"><Person p={people[m.owner_id]} /></div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
