"use client";
// What follows adding a Pack from its Preview (specs 0030 and 0068; GLOSSARY: Pack, Preview): a Pack that sets
// something up opens its guided set-up at the first question; any other says what was added and where it is.
import { useRouter } from "next/navigation";
import { fromPath, setsUp } from "@/app/use-pack/paths";
import { useInstalledToast } from "@/components/pack-guide-help";
import type { PackPreview, PackPreviewItem } from "@ziffr/core/packs";

const ADDED: Record<PackPreviewItem["kind"], [one: string, many: string]> = {
  metric: ["Metric Catalog entry", "Metric Catalog entries"], dashboard: ["Dashboard Template", "Dashboard Templates"], deck: ["Deck Template", "Deck Templates"],
  workflow: ["Workflow Template", "Workflow Templates"], view: ["View Design", "View Designs"], theme: ["Theme", "Themes"],
};

/** What a Pack added, in words, and where to find it. */
function addedWords(items: readonly Pick<PackPreviewItem, "kind">[]): string {
  const parts = (Object.keys(ADDED) as PackPreviewItem["kind"][]).flatMap((kind) => {
    const n = items.filter((i) => i.kind === kind).length;
    return n ? [`${n} ${ADDED[kind][n === 1 ? 0 : 1]}`] : [];
  });
  const added = parts.length ? `Added: ${parts.join(", ")}. ` : "";
  return `${added}Entries are in the Metric Catalog; designs and Themes are where you start from them.`;
}

/** What to call with the new install once the Preview's button added the Pack. The guided set-up draws its own frame,
 * so it is loaded as a whole page. */
export function useAfterInstall(): (installId: number, preview: PackPreview) => void {
  const router = useRouter();
  const installedToast = useInstalledToast();
  return (installId, preview) => {
    if (setsUp(preview.items.map((i) => i.kind))) return window.location.assign(fromPath(`/use-pack/${installId}`, "preview"));
    installedToast(installId, preview.manifest, addedWords(preview.items));
    router.refresh();
  };
}
