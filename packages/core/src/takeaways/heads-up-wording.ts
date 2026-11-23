// The words of the Heads-ups (GLOSSARY: Heads-up, Takeaway; spec 0041, "Heads-ups"): data keyed by case like the rest of the
// Takeaway wording (wording.ts spreads it into the one table), kept in a file of its own so a Heads-up's words are read in one
// place. A Heads-up says what two Metrics have done together, never what caused what: the footer is the Takeaway's own.
// No text here may hold a word a non-analyst would have to look up (the forbidden-word test walks them).

/** The cases of a Heads-up's sentences, labels for Show the numbers and its chance written small. */
export const HEADS_UP_EN = {
  "hu-together-same": "{a} and {b} have started moving together ({strength}, over {n} {periodsOf|n}).",
  "hu-together-same-opposite": "{a} and {b} have started moving in opposite directions ({strength}, over {n} {periodsOf|n}).",
  "hu-together-leads": "{a} and {b} have started moving together: when {a} rises, {b} follows {lag} {periodsOf|lag} later ({strength}, over {n} {periodsOf|n}).",
  "hu-together-leads-opposite": "{a} and {b} have started moving in opposite directions: when {a} rises, {b} falls {lag} {periodsOf|lag} later ({strength}, over {n} {periodsOf|n}).",
  "hu-stopped": "{a} and {b} used to move together. Over the last {recent} {periods}, they have not.",
  "hu-stopped-opposite": "{a} and {b} used to move in opposite directions. Over the last {recent} {periods}, they have not.",
  "hu-stopped-leads": "{a} and {b} used to move together: when {a} rose, {b} followed {lag} {periodsOf|lag} later. Over the last {recent} {periods}, they have not.",
  "hu-stopped-leads-opposite": "{a} and {b} used to move in opposite directions: when {a} rose, {b} fell {lag} {periodsOf|lag} later. Over the last {recent} {periods}, they have not.",
  "numbers-method-hu-together": "Moving together: changes compared at delays of 0 to 3 periods either way, corrected for the pairs looked at",
  "numbers-method-hu-stopped": "Stopped moving together: the last periods against the history before them, corrected for the pairs looked at",
  "numbers-hu-effective": "Pairs, allowing for each Metric following its own past",
  "numbers-hu-first-half": "First half of the periods",
  "numbers-hu-second-half": "Second half of the periods",
  "numbers-hu-half": "{r} over {n} {periodsOf|n}",
  "numbers-hu-looked-at": "Pairs of Metrics looked at",
  "numbers-hu-luck": "Chance of this by luck, after correcting for the pairs looked at",
  "numbers-hu-before": "Before the last periods",
  "numbers-hu-recent": "The last periods",
  "numbers-hu-drop": "Chance of a drop this big by luck, after correcting for the pairs looked at",
  "hu-chance-under": "under 0.0001",
} as const;
