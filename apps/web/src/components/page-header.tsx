export function PageHeader({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-xl)] leading-tight [overflow-wrap:anywhere] sm:text-[length:var(--text-2xl)]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[62ch] text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
