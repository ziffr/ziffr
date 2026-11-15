// The user guide's start (docs/user-guide): its first chapter, or a note when this installation has none.
import { redirect } from "next/navigation";
import { chapterHref, guideChapters } from "@/lib/user-guide";

export const metadata = { title: "User guide · Ziffr" };

export default async function GuidePage() {
  const [first] = await guideChapters();
  if (first) redirect(chapterHref(first.slug));
  return (
    <div className="mx-auto max-w-md py-12 text-center text-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">User guide</h1>
      <p className="mt-2 text-muted-foreground">This installation has no user guide yet. Its chapters belong in the folder docs/user-guide.</p>
    </div>
  );
}
