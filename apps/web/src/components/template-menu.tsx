"use client";
// A team template's own menu in the Pool: everyone sees its versions (in the side panel, spec 0050); only its creator renames or deletes it.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { told } from "@/lib/action-toast";
import { GitBranch, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSlideOver } from "./slide-over-host";
import { VersionsPanel } from "./versions-panel";
import { deleteTemplate, renameTemplate } from "@/app/template-actions";
import type { Profile, TeamTemplate } from "@ziffr/core/types";
import { useConfirm } from "./confirm-dialog";

/** The ⋯ menu of one team template in the Pool. */
export function TemplateMenu({ t, mine, people }: { t: TeamTemplate; mine: boolean; people: Profile[] }) {
  const panel = useSlideOver();
  const [, start] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`More for ${t.name}`} className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted focus-visible:opacity-100 data-[popup-open]:opacity-100">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          {mine && (
            <DropdownMenuItem
              onClick={() => {
                const name = window.prompt("Template name:", t.name);
                if (name === null) return;
                const description = window.prompt("What it is for:", t.description) ?? t.description;
                start(async () => { told(await renameTemplate(t.id, name, description), "Not renamed"); });
              }}
            >
              <PencilLine /> Rename…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setTimeout(() => panel.open({ title: `Versions of ${t.name}`, content: <VersionsPanel type="template" id={t.id} people={people} onRestored={() => router.refresh()} hideTitle /> }), 0)}><GitBranch /> Versions…</DropdownMenuItem>
          {mine && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  if (!(await confirm({ title: `Delete the template “${t.name}”?`, description: "Widgets made from it stay as they are. Nobody can start a new widget from it.", confirmLabel: "Delete template" }))) return;
                  start(async () => { if (told(await deleteTemplate(t.id), "Not deleted")) return; toast.success("Template deleted"); });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
