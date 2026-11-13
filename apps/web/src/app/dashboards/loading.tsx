import { Bone, Loading } from "@/components/skeleton";

export default function DashboardsLoading() {
  return (
    <Loading label="Loading dashboard">
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Bone className="hidden h-96 lg:block" />
        <div>
          <Bone className="mb-4 h-9 w-56" />
          <Bone className="mb-5 h-7 w-72" />
          <div className="desk grid grid-cols-1 gap-4 rounded-[var(--radius-card)] p-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="stock h-40 rounded-[var(--radius-card)]" />)}
            <div className="stock h-56 rounded-[var(--radius-card)] sm:col-span-2" />
            <div className="stock h-56 rounded-[var(--radius-card)] sm:col-span-2" />
          </div>
        </div>
      </div>
    </Loading>
  );
}
