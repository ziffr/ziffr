import { cn } from "@/lib/utils";
export function PageHeader({ title, sub, children, besideTitle }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; /** Only one small button (a ⋯ menu): on a phone it stays beside the title instead of taking a row of its own. */ besideTitle?: boolean }) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5", besideTitle && "max-sm:flex-nowrap max-sm:items-start")}>
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-xl)] leading-tight [overflow-wrap:anywhere] sm:text-[length:var(--text-2xl)]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[62ch] text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
