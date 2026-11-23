// GLOSSARY: Slide-over. Builds src/lib/help-index.generated.json, the Help panel's search index, from docs/user-guide.
// The file is a build artifact (git-ignored): package.json runs this before build, dev, test, typecheck and lint and after
// install, so a fresh clone has it. The logic lives in src/lib/help-index-build.ts; esbuild bundles that TypeScript on the
// fly so this runs on any Node version without type-stripping flags. Writes only when the content changed.
import { build } from "esbuild";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = join(web, "../../docs/user-guide");
const out = join(web, "src/lib/help-index.generated.json");

const bundle = await build({
  entryPoints: [join(web, "src/lib/help-index-build.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "error",
});
const { buildHelpIndex } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const files = readdirSync(guideDir).filter((f) => f.endsWith(".md")).sort().map((name) => ({ name, markdown: readFileSync(join(guideDir, name), "utf8") }));
const json = JSON.stringify(buildHelpIndex(files)) + "\n";
if (!existsSync(out) || readFileSync(out, "utf8") !== json) writeFileSync(out, json);
