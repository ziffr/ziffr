import { Bone, Loading } from "@/components/skeleton";

export default function MetricsLoading() {
  return (
    <Loading label="Loading metrics">
      <Bone className="mb-2 h-8 w-40" />
      <Bone className="mb-8 h-5 w-96 max-w-full" />
      <div className="stock rounded-[var(--radius-card)]">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border px-4 py-4 last:border-0">
            <Bone className="h-5 w-44" />
            <Bone className="ml-auto h-5 w-24" />
            <Bone className="hidden h-5 w-28 md:block" />
          </div>
        ))}
      </div>
    </Loading>
  );
}
