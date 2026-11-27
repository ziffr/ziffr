// Italian words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language):
// "la settimana scorsa", "ottobre", "T3", "settimana 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** Italian. */
export const it: AnswerWords = {
  code: "it",
  name: "Italian",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["oggi"], last: ["ieri"] },
      week: { this: ["questa settimana"], last: ["settimana scorsa"] },
      month: { this: ["questo mese"], last: ["mese scorso"] },
      quarter: { this: ["questo trimestre"], last: ["trimestre scorso"] },
      year: { this: ["quest’anno"], last: ["anno scorso"] },
    },
    months: [
      ["gennaio", "gen"],
      ["febbraio", "feb"],
      ["marzo", "mar"],
      ["aprile", "apr"],
      ["maggio", "mag"],
      ["giugno", "giu"],
      ["luglio", "lug"],
      ["agosto", "ago"],
      ["settembre", "set"],
      ["ottobre", "ott"],
      ["novembre", "nov"],
      ["dicembre", "dic"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      week: { last: ["la settimana scorsa", "scorsa settimana", "la settimana precedente", "settimana precedente"] },
      month: { last: ["il mese scorso", "lo scorso mese", "scorso mese", "il mese precedente", "mese precedente"] },
      quarter: { last: ["il trimestre scorso", "lo scorso trimestre", "scorso trimestre"] },
      year: { last: ["l'anno scorso", "lo scorso anno", "scorso anno"] },
    },
    months: [[], [], [], [], [], [], [], [], [], [], [], []],
    // "set" and "ago" are also English ("set", "two weeks ago"): a month only next to a day or a year.
    monthsOnlyWithDate: ["set", "ago"],
    week: { before: ["settimana", "sett"], after: ["settimana"] },
    quarter: { before: ["t", "q", "trimestre"], after: ["trimestre"] },
    half: { before: ["s", "h", "semestre"], after: ["semestre"] },
    fiscalYear: ["esercizio", "fy"],
    ordinal: ["°", "º", "o"],
    dateWords: [],
    reply: {
      yes: ["sì", "si", "sì grazie", "sì, grazie"],
      no: ["no", "no grazie", "no, grazie", "grazie", "grazie mille"],
      greetings: ["ciao", "salve", "buongiorno", "buonasera", "caro", "cara", "gentile"],
      closings: ["cordiali saluti", "distinti saluti", "saluti", "un saluto", "a presto", "grazie", "grazie mille"],
      sentFrom: ["inviato da …", "inviato dal mio …"],
    },
  },
};
