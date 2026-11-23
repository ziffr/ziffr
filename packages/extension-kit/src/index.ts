// @ziffr/extension-kit (GLOSSARY: Extension Kit): what an author writes an Extension against, and the shape and static
// checks Ziffr runs on it. An Extension is never loaded at run time: it is read, checked and shipped in a release.
export { refuse, type Refusal, type Series } from "./types.js";
export { checkManifest, EXTENSION_FORMAT, EXTENSION_FORMATS, EXTENSION_LICENSES, EXTENSION_LIMITS, EXTENSION_SCHEMA, VALUE_KINDS, type ExtensionManifest, type ManifestCheck, type ValueKind } from "./manifest.js";
export { ALLOWED_IMPORTS, checkRules, type RuleName, type RuleProblem } from "./rules.js";
export { checkExtensionFiles, IMPLEMENTATION_MAX_LINES, problemLine, REQUIRED_FILES, type ExtensionFiles, type ExtensionProblem, type ShapeRule } from "./check.js";
export { readExtensionFolder } from "./run.js";
export { RUN_RULES, runChecks, type RunOptions, type RunRule } from "./run-checks.js";
