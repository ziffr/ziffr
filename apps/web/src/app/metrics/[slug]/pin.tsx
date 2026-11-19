"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { LayoutDashboard } from "lucide-react";
import { placeWidget } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";

export function PinMenu({ metricId, dashboards }: { metricId: number; dashboards: { id: number; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })} disabled={pending || !dashboards.length}>
        <LayoutDashboard /> Add to dashboard
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Adds a widget with the default template</DropdownMenuLabel>
          {dashboards.map((d) => (
            <DropdownMenuItem key={d.id} onClick={() => start(async () => { if (told(await placeWidget(d.id, { type: "metric", id: metricId }))) return; toast.success(`Added to ${d.name}`); })}>
              {d.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
