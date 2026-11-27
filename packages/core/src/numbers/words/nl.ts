// Dutch words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language):
// "vorige week", "oktober", "Q3", "week 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** Dutch. */
export const nl: AnswerWords = {
  code: "nl",
  name: "Dutch",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["vandaag"], last: ["gisteren"] },
      week: { this: ["deze week"], last: ["vorige week"] },
      month: { this: ["deze maand"], last: ["vorige maand"] },
      quarter: { this: ["dit kwartaal"], last: ["vorig kwartaal"] },
      year: { this: ["dit jaar"], last: ["vorig jaar"] },
    },
    months: [
      ["januari", "jan"],
      ["februari", "feb"],
      ["maart", "mrt"],
      ["april", "apr"],
      ["mei"],
      ["juni", "jun"],
      ["juli", "jul"],
      ["augustus", "aug"],
      ["september", "sep"],
      ["oktober", "okt"],
      ["november", "nov"],
      ["december", "dec"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      week: { last: ["afgelopen week", "verleden week"] },
      month: { last: ["afgelopen maand", "verleden maand"] },
      quarter: { last: ["afgelopen kwartaal"] },
      year: { last: ["afgelopen jaar", "verleden jaar"] },
    },
    months: [[], [], ["maa"], [], [], [], [], [], ["sept"], [], [], []],
    monthsOnlyWithDate: [],
    week: { before: ["week", "wk", "w"], after: ["week"] },
    quarter: { before: ["q", "kwartaal"], after: ["kwartaal"] },
    half: { before: ["h", "halfjaar"], after: ["halfjaar"] },
    fiscalYear: ["boekjaar", "bj", "fy"],
    ordinal: ["e", "ste", "de"],
    dateWords: [],
    reply: {
      yes: ["ja", "ja graag", "ja, graag"],
      no: ["nee", "nee bedankt", "nee, bedankt", "bedankt", "dank je", "dank u", "dankjewel", "dank je wel"],
      greetings: ["hallo", "hoi", "beste", "geachte", "goedemorgen", "goedemiddag", "goedenavond"],
      closings: ["groet", "groeten", "groetjes", "met vriendelijke groet", "met vriendelijke groeten", "vriendelijke groet", "mvg", "bedankt"],
      sentFrom: ["verzonden vanaf mijn …", "verstuurd vanaf mijn …"],
    },
  },
};
