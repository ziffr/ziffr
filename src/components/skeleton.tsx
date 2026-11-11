import { cn } from "@/lib/utils";

/** A quiet block in the shape of what is loading. Static: no shimmer. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-[var(--radius-input)] bg-[var(--color-paper-3)]", className)} />;
}

export function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
