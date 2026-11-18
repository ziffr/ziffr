// Spanish words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language):
// "la semana pasada", "octubre", "T3", "semana 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** Spanish. */
export const es: AnswerWords = {
  code: "es",
  name: "Spanish",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["hoy"], last: ["ayer"] },
      week: { this: ["esta semana"], last: ["la semana pasada"] },
      month: { this: ["este mes"], last: ["el mes pasado"] },
      quarter: { this: ["este trimestre"], last: ["el trimestre pasado"] },
      year: { this: ["este año"], last: ["el año pasado"] },
    },
    months: [
      ["enero", "ene"],
      ["febrero", "feb"],
      ["marzo", "mar"],
      ["abril", "abr"],
      ["mayo", "may"],
      ["junio", "jun"],
      ["julio", "jul"],
      ["agosto", "ago"],
      ["septiembre", "sept"],
      ["octubre", "oct"],
      ["noviembre", "nov"],
      ["diciembre", "dic"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      week: { last: ["semana pasada", "la semana anterior", "semana anterior"] },
      month: { last: ["mes pasado", "el mes anterior", "mes anterior"] },
      quarter: { last: ["trimestre pasado", "el trimestre anterior", "trimestre anterior"] },
      year: { last: ["año pasado", "el año anterior", "año anterior"] },
    },
    months: [[], [], [], [], [], [], [], [], ["setiembre"], [], [], []],
    // "ago" is also English ("two weeks ago"): a month only next to a day or a year.
    monthsOnlyWithDate: ["ago"],
    week: { before: ["semana", "sem"], after: ["semana"] },
    // "T3" is the third trimestre, "S1" the first semestre.
    quarter: { before: ["t", "q", "trimestre"], after: ["trimestre"] },
    half: { before: ["s", "semestre"], after: ["semestre"] },
    fiscalYear: ["ejercicio", "fy"],
    ordinal: ["º", "°", "er", "o"],
    // "12 de noviembre de 2026".
    dateWords: ["de"],
  },
};
