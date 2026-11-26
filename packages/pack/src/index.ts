// @ziffr/pack (GLOSSARY: Pack): the Pack format and the formats of the things in it, with the checks Ziffr runs on
// every Pack it is given. Plain data, no code: a Pack this kit accepts is one Ziffr accepts.
export { checkPack, checkPackValue, FEED_TEMPLATE_IDS, PACK_2_SCHEMA, PACK_FORMAT, PACK_FORMAT_2, PACK_LICENSES, PACK_LIMITS, PACK_SCHEMA, UNSIGNED_WARNING, versionBelow, type Pack, type PackCheck, type PackItem, type PackKind, type PackSource } from "./pack.js";
export { PACK_POSITION_LIMITS, type PackPosition, type PackRepeat } from "./pack-positions.js";
export type { PackTotal } from "./pack-totals.js";
export { guideRuns, PACK_GUIDE_LIMITS, PACK_GUIDE_SCHEMA, PACK_GUIDE_SECTIONS, type PackGuide, type PackGuideBlock, type PackGuideSection } from "./pack-guide.js";
export { checkMetricFile, METRIC_FILE_SCHEMA, type MetricFile } from "./metric-file.js";
export { checkDashboardTemplateFile, DASHBOARD_TEMPLATE_SCHEMA, type DashboardTemplateFile } from "./dashboard-template-file.js";
export { checkDeckTemplateFile, DECK_TEMPLATE_2_SCHEMA, DECK_TEMPLATE_SCHEMA, type DeckTemplateFile } from "./deck-template-file.js";
export { SLIDE_ELEMENT_KINDS, SLIDE_ELEMENT_LIMITS, SLIDE_TONES, type SlideElement, type SlideElementKind, type SlideTone } from "./slide-element.js";
export { checkWorkflowTemplateFile, WORKFLOW_TEMPLATE_2_SCHEMA, WORKFLOW_TEMPLATE_SCHEMA, type WorkflowTemplateFile } from "./workflow-template-file.js";
export type { WorkflowTemplateFileStep } from "./kinds.js";
export { checkThemeFile, THEME_FILE_2_SCHEMA, THEME_FILE_SCHEMA, type ThemeFile } from "./theme-file.js";
export { checkViewDesign, VIEW_DESIGN_SCHEMA, type ViewDesign } from "./view-design.js";
export { checkAnalysisRecipe, ANALYSIS_RECIPE_SCHEMA, ANALYSIS_RECIPE_SCHEMA_2, drawnOutputs, type AnalysisRecipe, type AnalysisRecipe2, type AnyAnalysisRecipe } from "./analysis-recipe.js";
export { aimsAtAssistant } from "./assistant-words.js";
export type { Problem } from "./json-check.js";
export { LOGO_MAX_BYTES, LOGO_MAX_PIXELS, PACK_LOGO_MAX_BYTES, cleanLogo, logoOk, logoProblem, logoRatio, svgClean, svgIsPlain } from "./logo.js";
export { checkWorkspaceExport, WorkspaceExportChecker, WORKSPACE_EXPORT_FORMAT, WORKSPACE_EXPORT_FORMATS, WORKSPACE_EXPORT_KINDS, WORKSPACE_EXPORT_LIMITS, WORKSPACE_EXPORT_SCHEMA, type WorkspaceExportCheck, type WorkspaceExportRecord, type WorkspaceExportKind, type WorkspaceExportReaderLimits } from "./workspace-export.js";
export { TAG_NAME_MAX, TAGS_PER_ENTRY, normaliseTagName, tagNameProblem } from "./tag-names.js";
export { BREAKDOWN_PARENTS, hasParents, nameKey, readParents, type ParentsRead, type PartRow } from "./breakdown-parents.js";
export { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS, isBusinessFunction, type BusinessFunction } from "./business-functions.js";
export { AUDIENCE_LIMITS, AUDIENCE_PARTS, AUDIENCE_SCHEMA, AUDIENCE_SINCE, COUNTRIES, EMPLOYEE_BANDS, INDUSTRIES, REVENUE_BANDS, SEGMENTS, checkAudience, type AudiencePart, type EmployeeBand, type Industry, type PackAudience, type RevenueBand, type Segment } from "./audience.js";
