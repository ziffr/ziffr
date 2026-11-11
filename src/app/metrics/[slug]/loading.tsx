import { Bone, Loading } from "@/components/skeleton";

export default function MetricLoading() {
  return (
    <Loading label="Loading metric">
      <Bone className="mb-2 h-8 w-56" />
      <Bone className="mb-8 h-5 w-96 max-w-full" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="stock h-24 rounded-[var(--radius-card)]" />)}
      </div>
      <div className="stock h-80 rounded-[var(--radius-card)]" />
    </Loading>
  );
}
