// PROTOTYPE: Analyses are hardcoded here. This folder is where the Analysis plugin seam would go.
export const ANALYSES = [
  { id: "forecast", label: "Forecast", available: true, blurb: "Projects the trend a few periods ahead." },
  { id: "correlation", label: "Correlation", available: true, blurb: "Finds metrics that move together with this one." },
  { id: "clustering", label: "Clustering", available: false, blurb: "Groups periods that behave alike, e.g. ‘quiet months’ vs ‘campaign months’." },
  { id: "impact", label: "Impact analysis", available: false, blurb: "Estimates how much a change in one metric moves another." },
] as const;
