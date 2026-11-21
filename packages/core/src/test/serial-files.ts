// Test infrastructure for the database and app test configs (spec 0001, testing decisions). Imported by the configs
// that set `fileParallelism: false`: those files count installation-wide figures (Workspaces, Metrics, Usage) and
// need the database to themselves. Vitest 4 lets VITEST_MAX_WORKERS override that setting, so a run with
// VITEST_MAX_WORKERS=2 (to save CPU) ran two files at once and the figures changed under each other (#483). The
// variables are pinned to 1 here, before Vitest resolves its configuration.
process.env.VITEST_MAX_WORKERS = "1";
process.env.VITEST_MIN_WORKERS = "1";
