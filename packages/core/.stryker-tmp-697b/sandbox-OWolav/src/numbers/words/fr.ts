// @ts-nocheck
// French words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language):
// "la semaine dernière", "octobre", "T3", "semaine 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** French. */
export const fr: AnswerWords = {
  code: "fr",
  name: "French",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["aujourd’hui"], last: ["hier"] },
      week: { this: ["cette semaine"], last: ["la semaine dernière"] },
      month: { this: ["ce mois-ci"], last: ["le mois dernier"] },
      quarter: { this: ["ce trimestre"], last: ["le trimestre dernier"] },
      year: { this: ["cette année"], last: ["l’année dernière"] },
    },
    months: [
      ["janvier", "janv"],
      ["février", "févr"],
      ["mars"],
      ["avril", "avr"],
      ["mai"],
      ["juin"],
      ["juillet", "juil"],
      ["août"],
      ["septembre", "sept"],
      ["octobre", "oct"],
      ["novembre", "nov"],
      ["décembre", "déc"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      // Without the article, as inside a sentence ("la valeur de la semaine dernière"), and the other common ways.
      week: { last: ["semaine dernière", "la semaine passée", "semaine passée", "la semaine précédente", "semaine précédente"] },
      month: { last: ["mois dernier", "le mois passé", "mois passé", "le mois précédent", "mois précédent"] },
      quarter: { last: ["trimestre dernier", "le trimestre précédent", "trimestre précédent"] },
      year: { last: ["année dernière", "l'an dernier", "l'an passé", "l'année passée", "année passée"] },
    },
    // Written without accents, as on a keyboard without them.
    months: [[], ["fevrier", "fevr"], [], [], [], [], [], ["aout"], [], [], [], ["decembre", "dec"]],
    monthsOnlyWithDate: [],
    week: { before: ["semaine", "sem"], after: ["semaine"] },
    // "T3" is the third trimestre, "S1" the first semestre.
    quarter: { before: ["t", "trimestre"], after: ["trimestre"] },
    half: { before: ["s", "semestre"], after: ["semestre"] },
    fiscalYear: ["exercice", "fy"],
    ordinal: ["e", "er", "re", "ème", "eme"],
    dateWords: [],
  },
};
