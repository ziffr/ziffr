// PROTOTYPE: Analyses are hardcoded here. This folder is where the Analysis plugin seam would go.
// Only what runs is listed: nothing is shown as "coming soon" (ticket #988). The newer Methods are the picker's, in
// packages/core/src/method-picker.ts.
export const ANALYSES = [
  { id: "forecast", label: "Forecast", blurb: "Projects the trend a few periods ahead." },
  { id: "correlation", label: "Correlation", blurb: "Finds metrics that move together with this one." },
] as const;
