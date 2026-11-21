// Taking a Theme away (GLOSSARY: Theme): its file, made in the browser from the Theme the page already shows.
// Security: the file holds colours, fonts and slide settings only; never an image or a web address (themeToFile).
import { themeFileText, themeToFile } from "@ziffr/core/theme-file";
import type { ThemeSlides, ThemeTokens } from "@ziffr/core/types";

/** Downloads a Theme as a `ziffr.theme/1` file. */
export function downloadTheme(name: string, tokens: ThemeTokens, slides: ThemeSlides) {
  const file = themeFileText(themeToFile(name, tokens, slides));
  const url = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
