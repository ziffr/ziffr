// The way from the View Designs and Playground screens to the guide that explains every field (GLOSSARY: View Design,
// Playground). It opens in a new tab, so what the person typed stays where it is.
import { BookOpen } from "lucide-react";

/** Where the guide "Writing a View Design" is published (docs/guides/view-designs.md). */
const VIEW_DESIGN_GUIDE_URL = "https://docs.ziffr.net/packs-and-themes/view-designs/";

/** A link to the guide on how to write a View Design, in a new tab. */
export function ViewDesignGuideLink() {
  return (
    <a href={VIEW_DESIGN_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
      <BookOpen className="size-4" aria-hidden /> How to write a View Design
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
