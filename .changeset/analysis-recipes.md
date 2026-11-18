---
"@ziffr/web": minor
---

Analyses can now be written as files: the Analysis Recipe format, `ziffr.analysis/1`, with its JSON Schema in `docs/reference/analysis-recipe.schema.json`. A recipe is steps of Ziffr's verified functions (moving average, difference, growth, share, linear trend and slope, mean, standard deviation, z-score, seasonal index and correlation), each listed in the Calculation Catalogue and tested against an independent reference.
