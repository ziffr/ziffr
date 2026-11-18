// Taking a View Design away (spec 0024, GLOSSARY: View Design, Sample Data): its file and a Sample Data file that
// fits its Slots, downloaded in the browser. Security: both are made from the design and made-up Sample Data only;
// nothing of the Workspace's Metrics or values goes into either.
import { designFile, designFileName, sampleFile } from "@ziffr/core/design-files";
import type { ViewDesign } from "@ziffr/core/view-design";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a design as its file, and the Sample Data that comes with it. */
export function downloadDesign(design: ViewDesign) {
  download(designFileName(design, "view"), designFile(design));
  // A second download right after the first: browsers may ask once whether a page may download several files.
  setTimeout(() => download(designFileName(design, "sample"), sampleFile(design)), 300);
}
