"use client";
import { useTransition } from "react";
import { LayoutDashboard } from "lucide-react";
import { togglePin } from "@/app/actions";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";

export function PinMenu({ metricId, dashboards }: { metricId: number; dashboards: { id: number; name: string; pinned: boolean }[] }) {
  const [pending, start] = useTransition();
  const n = dashboards.filter((d) => d.pinned).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })} disabled={pending}>
        <LayoutDashboard /> {n ? `On ${n} dashboard${n > 1 ? "s" : ""}` : "Pin to dashboard"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Dashboards</DropdownMenuLabel>
          {dashboards.map((d) => (
            <DropdownMenuCheckboxItem key={d.id} checked={d.pinned} onCheckedChange={() => start(() => togglePin(d.id, metricId, d.pinned))}>
              {d.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
