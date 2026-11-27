// German words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language): "letzte Woche", "Oktober",
// "Q3", "KW 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** German. */
export const de: AnswerWords = {
  code: "de",
  name: "German",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["heute"], last: ["gestern"] },
      week: { this: ["diese woche"], last: ["letzte woche"] },
      month: { this: ["diesen monat"], last: ["letzten monat"] },
      quarter: { this: ["dieses quartal"], last: ["letztes quartal"] },
      year: { this: ["dieses jahr"], last: ["letztes jahr"] },
    },
    months: [
      ["januar", "jan"],
      ["februar", "feb"],
      ["märz", "mär"],
      ["april", "apr"],
      ["mai"],
      ["juni", "jun"],
      ["juli", "jul"],
      ["august", "aug"],
      ["september", "sep"],
      ["oktober", "okt"],
      ["november", "nov"],
      ["dezember", "dez"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      // The forms these take after a preposition: "in dieser Woche", "im letzten Quartal", "vom vorigen Monat".
      week: { this: ["dieser woche"], last: ["letzten woche", "vorige woche", "vorigen woche", "vergangene woche", "vergangenen woche", "vorwoche"] },
      month: { this: ["diesem monat", "dieser monat"], last: ["letzter monat", "letztem monat", "vorigen monat", "vorigem monat", "vergangenen monat", "vormonat"] },
      quarter: { this: ["diesem quartal"], last: ["letzten quartal", "letztem quartal", "vorigen quartal", "vorigem quartal", "vergangenen quartal", "vorquartal"] },
      year: { this: ["diesem jahr"], last: ["letzten jahr", "letztem jahr", "vorigen jahr", "vorigem jahr", "vergangenen jahr", "vorjahr"] },
    },
    months: [["jänner"], [], ["maerz", "mrz"], [], [], [], [], [], ["sept"], [], [], []],
    monthsOnlyWithDate: [],
    week: { before: ["kw", "kalenderwoche", "woche"], after: ["kw", "kalenderwoche", "woche"] },
    quarter: { before: ["q", "quartal"], after: ["quartal"] },
    half: { before: ["h", "hj", "halbjahr"], after: ["halbjahr", "hj"] },
    fiscalYear: ["gj", "fy"],
    ordinal: ["."],
    dateWords: [],
    reply: {
      yes: ["ja", "ja bitte", "ja, bitte"],
      no: ["nein", "nein danke", "nein, danke", "nö", "danke", "danke schön", "dankeschön", "vielen dank", "danke dir", "danke ihnen"],
      greetings: ["hallo", "hi", "hey", "liebe", "lieber", "liebes", "sehr geehrte", "sehr geehrter", "sehr geehrtes", "guten morgen", "guten tag", "guten abend", "moin", "servus"],
      closings: ["viele grüße", "viele grüsse", "liebe grüße", "liebe grüsse", "beste grüße", "beste grüsse", "schöne grüße", "schöne grüsse", "herzliche grüße", "herzliche grüsse", "freundliche grüße", "freundliche grüsse", "mit freundlichen grüßen", "mit freundlichen grüssen", "mit besten grüßen", "grüße", "gruß", "gruss", "lg", "vg", "mfg", "danke", "vielen dank", "danke und viele grüße", "danke und gruß"],
      sentFrom: ["von meinem … gesendet", "gesendet von meinem …"],
    },
  },
};
