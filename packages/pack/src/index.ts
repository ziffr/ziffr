// @ziffr/pack (GLOSSARY: Pack): the Pack format and the formats of the things in it, with the checks Ziffr runs on
// every Pack it is given. Plain data, no code: a Pack this kit accepts is one Ziffr accepts.
export { checkPack, checkPackValue, PACK_FORMAT, PACK_LICENSES, PACK_LIMITS, PACK_SCHEMA, UNSIGNED_WARNING, versionBelow, type Pack, type PackCheck, type PackItem, type PackKind } from "./pack.js";
export { checkMetricFile, METRIC_FILE_SCHEMA, type MetricFile } from "./metric-file.js";
export { checkDashboardTemplateFile, DASHBOARD_TEMPLATE_SCHEMA, type DashboardTemplateFile } from "./dashboard-template-file.js";
export { checkDeckTemplateFile, DECK_TEMPLATE_SCHEMA, type DeckTemplateFile } from "./deck-template-file.js";
export { checkWorkflowTemplateFile, WORKFLOW_TEMPLATE_SCHEMA, type WorkflowTemplateFile } from "./workflow-template-file.js";
export { checkThemeFile, THEME_FILE_SCHEMA, type ThemeFile } from "./theme-file.js";
export { checkViewDesign, VIEW_DESIGN_SCHEMA, type ViewDesign } from "./view-design.js";
export { checkAnalysisRecipe, ANALYSIS_RECIPE_SCHEMA, type AnalysisRecipe } from "./analysis-recipe.js";
export { aimsAtAssistant } from "./assistant-words.js";
export type { Problem } from "./json-check.js";
export { LOGO_MAX_BYTES, LOGO_MAX_PIXELS, PACK_LOGO_MAX_BYTES, cleanLogo, logoOk, logoProblem, logoRatio, svgClean, svgIsPlain } from "./logo.js";
export { checkWorkspaceExport, WorkspaceExportChecker, WORKSPACE_EXPORT_FORMAT, WORKSPACE_EXPORT_FORMATS, WORKSPACE_EXPORT_KINDS, WORKSPACE_EXPORT_LIMITS, WORKSPACE_EXPORT_SCHEMA, type WorkspaceExportCheck, type WorkspaceExportRecord, type WorkspaceExportKind, type WorkspaceExportReaderLimits } from "./workspace-export.js";
export { TAG_NAME_MAX, TAGS_PER_ENTRY, normaliseTagName, tagNameProblem } from "./tag-names.js";
