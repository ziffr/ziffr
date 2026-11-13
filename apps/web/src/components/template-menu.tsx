"use client";
// A team template's own menu in the Pool: everyone sees its versions; only its creator renames or deletes it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VersionsPanel } from "./versions-panel";
import { deleteTemplate, renameTemplate } from "@/app/template-actions";
import type { Profile, TeamTemplate } from "@ziffr/core/types";

export function TemplateMenu({ t, mine, people }: { t: TeamTemplate; mine: boolean; people: Profile[] }) {
  const [versions, setVersions] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <>
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
                start(() => renameTemplate(t.id, name, description));
              }}
            >
              <PencilLine /> Rename…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setTimeout(() => setVersions(true), 0)}><GitBranch /> Versions…</DropdownMenuItem>
          {mine && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (!confirm(`Delete the template “${t.name}”? Widgets made from it stay as they are.`)) return;
                  start(async () => { await deleteTemplate(t.id); toast.success("Template deleted"); });
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {versions && (
        <Dialog open onOpenChange={(o) => { if (!o) setVersions(false); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle className="sr-only">Versions of {t.name}</DialogTitle>
            <VersionsPanel type="template" id={t.id} people={people} onRestored={() => router.refresh()} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
