// @ts-nocheck
// The Takeaway of a what-if chain and the Recipe "What if A changes?" (GLOSSARY: Takeaway, Recipe; spec 0041, ticket 5). The Method
// (methods/what-if.ts) gives the change in each Metric reached, worked out from a Derived Metric's formula or estimated from a fit, with
// a range for what is estimated; this writes it in the Metrics' own words and units, and keeps the two apart in the sentence and in each
// row (the data for the picture): "worked out from its formula" has no range, "estimated" has "likely between", and a value outside what
// a Metric has been is only a point with "treat it as a guess". A what-if estimates what has gone together: it never reads as a promise
// or a cause. A refusal carries no number. Pure.
//
// What is held to here: the number in a sentence is the Method's number written in the Metric's unit (at least two significant digits,
// never a number above 0 written as 0, a sign never lost: the direction is a word); a range only where the Method gives one;
// nothing stronger than "moderate" with a caution; the footer once, and only where something is estimated; a Metric that is not
// in the list given (one the person may not see) is never named, used or counted.
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { formulaInputs, inputsProblem, usesPrevious } from "../formula";
import { MIN_PAIRS } from "../correlation";
import { changes } from "../basis";
import { formatNumber } from "../format";
import { fit, type Fit } from "../methods/fit";
import { MOST_METRICS, MOST_STEPS, planOf, whatIf, type NotReached, type Reached, type WhatIf, type WhatIfChange, type WhatIfLink } from "../methods/what-if";
import type { Span } from "../periods";
import type { Resolver } from "../display-periods";
import type { Metric, Point } from "../types";
import type { StrengthWord } from "./strength";
import { lines, onCommon, outsideText, written, type FitRecipeOptions } from "./fit-takeaway";
import { footerText, listOf, refusalTakeaway, sayIn, strengthWordIn, type Figure, type NumberRow, type Takeaway, type TakeawayContext } from "./takeaway";
import type { CaseKey, Slots } from "./wording";

/** What a row of the picture is: a value worked out from a formula (no range), estimated with a range, estimated with only a point
 * (outside what was seen: a guess), one whose direction cannot be told from chance, or one nothing can be said of. */
export type WhatIfKind = "worked-out" | "estimated" | "guess" | "unclear" | "refused";

/** One Metric a change reaches, in the numbers the picture draws (a bar, with a band only where estimated) and the sentence it is said in. */
export type WhatIfRow = {
  name: string;
  step: 1 | 2;
  kind: WhatIfKind;
  /** The change in the Metric and its "likely between" range, in its own unit; null where nothing is said of the size. */
  effect: number | null;
  lo: number | null;
  hi: number | null;
  strength: StrengthWord | null;
  strengthText: string | null;
  /** The Metrics of the first step the change came through. */
  through: string[];
  sentence: string;
};
/** A what-if's Takeaway with a row for each Metric reached. */
export type WhatIfTakeaway = Takeaway & {
  rows: WhatIfRow[];
};
const text = stryMutAct_9fa48("0") ? () => undefined : (stryCov_9fa48("0"), (() => {
  const text = (k: CaseKey, ctx: TakeawayContext, slots: Slots = {}) => sayIn(k, slots, ctx);
  return text;
})());
const figure = stryMutAct_9fa48("1") ? () => undefined : (stryCov_9fa48("1"), (() => {
  const figure = (label: string, value: number, shown: string): Figure => stryMutAct_9fa48("2") ? {} : (stryCov_9fa48("2"), {
    label,
    value,
    text: shown
  });
  return figure;
})());
const WEAKEST: readonly StrengthWord[] = stryMutAct_9fa48("3") ? [] : (stryCov_9fa48("3"), [stryMutAct_9fa48("4") ? "" : (stryCov_9fa48("4"), "cant-tell"), stryMutAct_9fa48("5") ? "" : (stryCov_9fa48("5"), "weak"), stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), "moderate"), stryMutAct_9fa48("7") ? "" : (stryCov_9fa48("7"), "strong")]);

/** The Takeaway of a what-if worked out by `whatIf`. `metrics` are the Metrics named in it (the one changed, those reached, those the
 * change went through) and `fits` the fits of its links, for what it was compared on. */
export function whatIfTakeaway(start: Metric, metrics: Metric[], result: WhatIf, fits: Fit[], ctx: TakeawayContext): WhatIfTakeaway {
  if (stryMutAct_9fa48("8")) {
    {}
  } else {
    stryCov_9fa48("8");
    const method = text(stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), "numbers-method-what-if"), ctx);
    if (stryMutAct_9fa48("12") ? false : stryMutAct_9fa48("11") ? true : stryMutAct_9fa48("10") ? result.ok : (stryCov_9fa48("10", "11", "12"), !result.ok)) return stryMutAct_9fa48("13") ? {} : (stryCov_9fa48("13"), {
      ...refusalTakeaway(method, lines(stryMutAct_9fa48("14") ? {} : (stryCov_9fa48("14"), {
        refusals: result.refusals,
        cautions: stryMutAct_9fa48("15") ? ["Stryker was here"] : (stryCov_9fa48("15"), []),
        switches: stryMutAct_9fa48("16") ? ["Stryker was here"] : (stryCov_9fa48("16"), [])
      }), ctx).refusals),
      rows: stryMutAct_9fa48("17") ? ["Stryker was here"] : (stryCov_9fa48("17"), [])
    });
    const known = stryMutAct_9fa48("18") ? () => undefined : (stryCov_9fa48("18"), (() => {
      const known = (name: string) => (stryMutAct_9fa48("21") ? name !== start.name : stryMutAct_9fa48("20") ? false : stryMutAct_9fa48("19") ? true : (stryCov_9fa48("19", "20", "21"), name === start.name)) ? start : metrics.find(stryMutAct_9fa48("22") ? () => undefined : (stryCov_9fa48("22"), m => stryMutAct_9fa48("25") ? m.name !== name : stryMutAct_9fa48("24") ? false : stryMutAct_9fa48("23") ? true : (stryCov_9fa48("23", "24", "25"), m.name === name)));
      return known;
    })());
    // A Metric that is not among those given is never written in another Metric's unit: nothing is said.
    // Names in the lines a verdict or a refusal carries count too: nothing is written about a Metric that was not given.
    const inSlots = stryMutAct_9fa48("26") ? () => undefined : (stryCov_9fa48("26"), (() => {
      const inSlots = (f: {
        slots: Record<string, unknown>;
      }) => stryMutAct_9fa48("27") ? [] : (stryCov_9fa48("27"), [...((stryMutAct_9fa48("30") ? typeof f.slots.name !== "string" : stryMutAct_9fa48("29") ? false : stryMutAct_9fa48("28") ? true : (stryCov_9fa48("28", "29", "30"), typeof f.slots.name === (stryMutAct_9fa48("31") ? "" : (stryCov_9fa48("31"), "string")))) ? stryMutAct_9fa48("32") ? [] : (stryCov_9fa48("32"), [f.slots.name]) : stryMutAct_9fa48("33") ? ["Stryker was here"] : (stryCov_9fa48("33"), [])), ...((stryMutAct_9fa48("36") ? typeof f.slots.names !== "string" : stryMutAct_9fa48("35") ? false : stryMutAct_9fa48("34") ? true : (stryCov_9fa48("34", "35", "36"), typeof f.slots.names === (stryMutAct_9fa48("37") ? "" : (stryCov_9fa48("37"), "string")))) ? f.slots.names.split(stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), ", ")) : stryMutAct_9fa48("39") ? ["Stryker was here"] : (stryCov_9fa48("39"), []))]);
      return inSlots;
    })());
    const named = result.reached.flatMap(stryMutAct_9fa48("40") ? () => undefined : (stryCov_9fa48("40"), r => r.ok ? stryMutAct_9fa48("41") ? [] : (stryCov_9fa48("41"), [r.name, ...r.through, ...r.outside.map(stryMutAct_9fa48("42") ? () => undefined : (stryCov_9fa48("42"), o => o.name)), ...r.beyond.map(stryMutAct_9fa48("43") ? () => undefined : (stryCov_9fa48("43"), o => o.name)), ...r.verdict.cautions.flatMap(inSlots)]) : stryMutAct_9fa48("44") ? [] : (stryCov_9fa48("44"), [r.name, ...inSlots(r.refusal)])));
    if (stryMutAct_9fa48("47") ? named.every(n => known(n) === undefined) : stryMutAct_9fa48("46") ? false : stryMutAct_9fa48("45") ? true : (stryCov_9fa48("45", "46", "47"), named.some(stryMutAct_9fa48("48") ? () => undefined : (stryCov_9fa48("48"), n => stryMutAct_9fa48("51") ? known(n) !== undefined : stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : (stryCov_9fa48("49", "50", "51"), known(n) === undefined))))) return stryMutAct_9fa48("52") ? {} : (stryCov_9fa48("52"), {
      ...refusalTakeaway(method, stryMutAct_9fa48("53") ? [] : (stryCov_9fa48("53"), [text(stryMutAct_9fa48("54") ? "" : (stryCov_9fa48("54"), "refuse-input"), ctx, stryMutAct_9fa48("55") ? {} : (stryCov_9fa48("55"), {
        what: stryMutAct_9fa48("56") ? "" : (stryCov_9fa48("56"), "the Metrics")
      }))])),
      rows: stryMutAct_9fa48("57") ? ["Stryker was here"] : (stryCov_9fa48("57"), [])
    });
    const metricOf = stryMutAct_9fa48("58") ? () => undefined : (stryCov_9fa48("58"), (() => {
      const metricOf = (name: string) => known(name)!;
      return metricOf;
    })());
    const span = (result.span ?? start.period) as Span;
    const figures: Figure[] = stryMutAct_9fa48("59") ? ["Stryker was here"] : (stryCov_9fa48("59"), []);
    const numbers: NumberRow[] = stryMutAct_9fa48("60") ? [] : (stryCov_9fa48("60"), [stryMutAct_9fa48("61") ? {} : (stryCov_9fa48("61"), {
      label: text(stryMutAct_9fa48("62") ? "" : (stryCov_9fa48("62"), "numbers-method"), ctx),
      text: method
    })]);
    const startText = written(start, Math.abs(result.by), ctx);
    if (stryMutAct_9fa48("65") ? false : stryMutAct_9fa48("64") ? true : stryMutAct_9fa48("63") ? legible(start, [Math.abs(result.by)], ctx) : (stryCov_9fa48("63", "64", "65"), !legible(start, stryMutAct_9fa48("66") ? [] : (stryCov_9fa48("66"), [Math.abs(result.by)]), ctx))) return stryMutAct_9fa48("67") ? {} : (stryCov_9fa48("67"), {
      ...refusalTakeaway(method, stryMutAct_9fa48("68") ? [] : (stryCov_9fa48("68"), [stryMutAct_9fa48("69") ? `` : (stryCov_9fa48("69"), `${start.name}: ${text(stryMutAct_9fa48("70") ? "" : (stryCov_9fa48("70"), "refuse-what-if-small"), ctx)}`)])),
      rows: stryMutAct_9fa48("71") ? ["Stryker was here"] : (stryCov_9fa48("71"), [])
    });
    if (stryMutAct_9fa48("72")) {
      ;
    } else {
      stryCov_9fa48("72");
      figures.push(figure(start.name, Math.abs(result.by), startText));
    }
    numbers.push(stryMutAct_9fa48("74") ? {} : (stryCov_9fa48("74"), {
      label: text(stryMutAct_9fa48("75") ? "" : (stryCov_9fa48("75"), "numbers-change-in"), ctx, stryMutAct_9fa48("76") ? {} : (stryCov_9fa48("76"), {
        name: start.name
      })),
      text: stryMutAct_9fa48("77") ? `` : (stryCov_9fa48("77"), `${text((stryMutAct_9fa48("81") ? result.by <= 0 : stryMutAct_9fa48("80") ? result.by >= 0 : stryMutAct_9fa48("79") ? false : stryMutAct_9fa48("78") ? true : (stryCov_9fa48("78", "79", "80", "81"), result.by > 0)) ? stryMutAct_9fa48("82") ? "" : (stryCov_9fa48("82"), "whatif-goes-up") : stryMutAct_9fa48("83") ? "" : (stryCov_9fa48("83"), "whatif-goes-down"), ctx)} ${startText}`)
    }));
    const cautions: string[] = stryMutAct_9fa48("84") ? ["Stryker was here"] : (stryCov_9fa48("84"), []);
    const rows: WhatIfRow[] = result.reached.map((r): WhatIfRow => {
      if (stryMutAct_9fa48("85")) {
        {}
      } else {
        stryCov_9fa48("85");
        if (stryMutAct_9fa48("88") ? false : stryMutAct_9fa48("87") ? true : stryMutAct_9fa48("86") ? r.ok : (stryCov_9fa48("86", "87", "88"), !r.ok)) return refusedRow(r, lines(stryMutAct_9fa48("89") ? {} : (stryCov_9fa48("89"), {
          refusals: stryMutAct_9fa48("90") ? [] : (stryCov_9fa48("90"), [r.refusal]),
          cautions: stryMutAct_9fa48("91") ? ["Stryker was here"] : (stryCov_9fa48("91"), []),
          switches: stryMutAct_9fa48("92") ? ["Stryker was here"] : (stryCov_9fa48("92"), [])
        }), ctx).refusals.join(stryMutAct_9fa48("93") ? "" : (stryCov_9fa48("93"), " ")));
        const m = metricOf(r.name);
        const through = (stryMutAct_9fa48("97") ? r.through.length <= 0 : stryMutAct_9fa48("96") ? r.through.length >= 0 : stryMutAct_9fa48("95") ? false : stryMutAct_9fa48("94") ? true : (stryCov_9fa48("94", "95", "96", "97"), r.through.length > 0)) ? text(stryMutAct_9fa48("98") ? "" : (stryCov_9fa48("98"), "whatif-through"), ctx, stryMutAct_9fa48("99") ? {} : (stryCov_9fa48("99"), {
          names: listOf(r.through, ctx)
        })) : stryMutAct_9fa48("100") ? "Stryker was here!" : (stryCov_9fa48("100"), "");
        const base = stryMutAct_9fa48("101") ? {} : (stryCov_9fa48("101"), {
          name: r.name,
          step: r.step,
          through: r.through
        });
        const kindText = text(r.exact ? stryMutAct_9fa48("102") ? "" : (stryCov_9fa48("102"), "numbers-kind-worked") : stryMutAct_9fa48("103") ? "" : (stryCov_9fa48("103"), "numbers-kind-estimated"), ctx);
        numbers.push(stryMutAct_9fa48("105") ? {} : (stryCov_9fa48("105"), {
          label: text(stryMutAct_9fa48("106") ? "" : (stryCov_9fa48("106"), "numbers-kind-on"), ctx, stryMutAct_9fa48("107") ? {} : (stryCov_9fa48("107"), {
            name: r.name
          })),
          text: kindText
        }));
        if (stryMutAct_9fa48("109") ? false : stryMutAct_9fa48("108") ? true : (stryCov_9fa48("108", "109"), r.exact)) {
          if (stryMutAct_9fa48("110")) {
            {}
          } else {
            stryCov_9fa48("110");
            const moves = text((stryMutAct_9fa48("114") ? r.effect <= 0 : stryMutAct_9fa48("113") ? r.effect >= 0 : stryMutAct_9fa48("112") ? false : stryMutAct_9fa48("111") ? true : (stryCov_9fa48("111", "112", "113", "114"), r.effect > 0)) ? stryMutAct_9fa48("115") ? "" : (stryCov_9fa48("115"), "whatif-goes-up") : stryMutAct_9fa48("116") ? "" : (stryCov_9fa48("116"), "whatif-goes-down"), ctx);
            const shown = written(m, Math.abs(r.effect), ctx);
            if (stryMutAct_9fa48("119") ? false : stryMutAct_9fa48("118") ? true : stryMutAct_9fa48("117") ? legible(m, [Math.abs(r.effect)], ctx) : (stryCov_9fa48("117", "118", "119"), !legible(m, stryMutAct_9fa48("120") ? [] : (stryCov_9fa48("120"), [Math.abs(r.effect)]), ctx))) return refusedRow(stryMutAct_9fa48("121") ? {} : (stryCov_9fa48("121"), {
              name: r.name,
              step: r.step
            }), text(stryMutAct_9fa48("122") ? "" : (stryCov_9fa48("122"), "refuse-what-if-small"), ctx));
            numbers.push(stryMutAct_9fa48("124") ? {} : (stryCov_9fa48("124"), {
              label: text(stryMutAct_9fa48("125") ? "" : (stryCov_9fa48("125"), "numbers-effect-on"), ctx, stryMutAct_9fa48("126") ? {} : (stryCov_9fa48("126"), {
                name: r.name
              })),
              text: stryMutAct_9fa48("127") ? `` : (stryCov_9fa48("127"), `${moves} ${shown}`)
            }));
            if (stryMutAct_9fa48("130") ? r.effect !== 0 : stryMutAct_9fa48("129") ? false : stryMutAct_9fa48("128") ? true : (stryCov_9fa48("128", "129", "130"), r.effect === 0)) return stryMutAct_9fa48("131") ? {} : (stryCov_9fa48("131"), {
              ...base,
              kind: stryMutAct_9fa48("132") ? "" : (stryCov_9fa48("132"), "worked-out"),
              effect: 0,
              lo: null,
              hi: null,
              strength: null,
              strengthText: null,
              sentence: text(stryMutAct_9fa48("133") ? "" : (stryCov_9fa48("133"), "whatif-row-worked-same"), ctx, stryMutAct_9fa48("134") ? {} : (stryCov_9fa48("134"), {
                name: r.name
              }))
            });
            if (stryMutAct_9fa48("135")) {
              ;
            } else {
              stryCov_9fa48("135");
              figures.push(figure(r.name, Math.abs(r.effect), shown));
            }
            return stryMutAct_9fa48("136") ? {} : (stryCov_9fa48("136"), {
              ...base,
              kind: stryMutAct_9fa48("137") ? "" : (stryCov_9fa48("137"), "worked-out"),
              effect: r.effect,
              lo: null,
              hi: null,
              strength: null,
              strengthText: null,
              sentence: text(stryMutAct_9fa48("138") ? "" : (stryCov_9fa48("138"), "whatif-row-worked"), ctx, stryMutAct_9fa48("139") ? {} : (stryCov_9fa48("139"), {
                name: r.name,
                moves,
                effect: shown
              }))
            });
          }
        }
        const lowest = stryMutAct_9fa48("140") ? r.strength && "cant-tell" : (stryCov_9fa48("140"), r.strength ?? (stryMutAct_9fa48("141") ? "" : (stryCov_9fa48("141"), "cant-tell")));
        const strengthText = strengthWordIn(lowest, ctx);
        if (stryMutAct_9fa48("142")) {
          ;
        } else {
          stryCov_9fa48("142");
          cautions.push(...lines(r.verdict, ctx).cautions);
        }
        numbers.push(stryMutAct_9fa48("144") ? {} : (stryCov_9fa48("144"), {
          label: text(stryMutAct_9fa48("145") ? "" : (stryCov_9fa48("145"), "numbers-rests-on"), ctx, stryMutAct_9fa48("146") ? {} : (stryCov_9fa48("146"), {
            name: r.name
          })),
          text: formatNumber(r.coefficients, 0, ctx.style)
        }));
        // A link that cannot be told from chance is said as that, with no number about its size; so is an effect of exactly 0.
        if (stryMutAct_9fa48("149") ? lowest === "cant-tell" && r.effect === 0 : stryMutAct_9fa48("148") ? false : stryMutAct_9fa48("147") ? true : (stryCov_9fa48("147", "148", "149"), (stryMutAct_9fa48("151") ? lowest !== "cant-tell" : stryMutAct_9fa48("150") ? false : (stryCov_9fa48("150", "151"), lowest === (stryMutAct_9fa48("152") ? "" : (stryCov_9fa48("152"), "cant-tell")))) || (stryMutAct_9fa48("154") ? r.effect !== 0 : stryMutAct_9fa48("153") ? false : (stryCov_9fa48("153", "154"), r.effect === 0)))) return stryMutAct_9fa48("155") ? {} : (stryCov_9fa48("155"), {
          ...base,
          kind: stryMutAct_9fa48("156") ? "" : (stryCov_9fa48("156"), "unclear"),
          effect: null,
          lo: null,
          hi: null,
          strength: stryMutAct_9fa48("157") ? "" : (stryCov_9fa48("157"), "cant-tell"),
          strengthText: strengthWordIn(stryMutAct_9fa48("158") ? "" : (stryCov_9fa48("158"), "cant-tell"), ctx),
          sentence: text(stryMutAct_9fa48("159") ? "" : (stryCov_9fa48("159"), "whatif-row-unclear"), ctx, stryMutAct_9fa48("160") ? {} : (stryCov_9fa48("160"), {
            name: r.name,
            start: start.name,
            through
          }))
        });
        const moves = text((stryMutAct_9fa48("164") ? r.effect <= 0 : stryMutAct_9fa48("163") ? r.effect >= 0 : stryMutAct_9fa48("162") ? false : stryMutAct_9fa48("161") ? true : (stryCov_9fa48("161", "162", "163", "164"), r.effect > 0)) ? stryMutAct_9fa48("165") ? "" : (stryCov_9fa48("165"), "whatif-go-up") : stryMutAct_9fa48("166") ? "" : (stryCov_9fa48("166"), "whatif-go-down"), ctx);
        const [lo, hi] = stryMutAct_9fa48("167") ? [] : (stryCov_9fa48("167"), [r.lo, r.hi]);
        const like = stryMutAct_9fa48("168") ? [] : (stryCov_9fa48("168"), [Math.abs(r.effect), ...((stryMutAct_9fa48("171") ? lo === null && hi === null : stryMutAct_9fa48("170") ? false : stryMutAct_9fa48("169") ? true : (stryCov_9fa48("169", "170", "171"), (stryMutAct_9fa48("173") ? lo !== null : stryMutAct_9fa48("172") ? false : (stryCov_9fa48("172", "173"), lo === null)) || (stryMutAct_9fa48("175") ? hi !== null : stryMutAct_9fa48("174") ? false : (stryCov_9fa48("174", "175"), hi === null)))) ? stryMutAct_9fa48("176") ? ["Stryker was here"] : (stryCov_9fa48("176"), []) : stryMutAct_9fa48("177") ? [] : (stryCov_9fa48("177"), [Math.abs(lo), Math.abs(hi)]))]);
        // Numbers that cannot be told from 0 or from each other in 15 places are not written: the row says so instead.
        if (stryMutAct_9fa48("180") ? false : stryMutAct_9fa48("179") ? true : stryMutAct_9fa48("178") ? legible(m, like, ctx) : (stryCov_9fa48("178", "179", "180"), !legible(m, like, ctx))) return refusedRow(stryMutAct_9fa48("181") ? {} : (stryCov_9fa48("181"), {
          name: r.name,
          step: r.step
        }), text(stryMutAct_9fa48("182") ? "" : (stryCov_9fa48("182"), "refuse-what-if-small"), ctx));
        const shown = written(m, Math.abs(r.effect), ctx, like);
        if (stryMutAct_9fa48("183")) {
          ;
        } else {
          stryCov_9fa48("183");
          figures.push(figure(r.name, Math.abs(r.effect), shown));
        }
        numbers.push(stryMutAct_9fa48("185") ? {} : (stryCov_9fa48("185"), {
          label: text(stryMutAct_9fa48("186") ? "" : (stryCov_9fa48("186"), "numbers-effect-on"), ctx, stryMutAct_9fa48("187") ? {} : (stryCov_9fa48("187"), {
            name: r.name
          })),
          text: stryMutAct_9fa48("188") ? `` : (stryCov_9fa48("188"), `${text((stryMutAct_9fa48("192") ? r.effect <= 0 : stryMutAct_9fa48("191") ? r.effect >= 0 : stryMutAct_9fa48("190") ? false : stryMutAct_9fa48("189") ? true : (stryCov_9fa48("189", "190", "191", "192"), r.effect > 0)) ? stryMutAct_9fa48("193") ? "" : (stryCov_9fa48("193"), "whatif-goes-up") : stryMutAct_9fa48("194") ? "" : (stryCov_9fa48("194"), "whatif-goes-down"), ctx)} ${shown}`)
        }));
        if (stryMutAct_9fa48("197") ? lo === null && hi === null : stryMutAct_9fa48("196") ? false : stryMutAct_9fa48("195") ? true : (stryCov_9fa48("195", "196", "197"), (stryMutAct_9fa48("199") ? lo !== null : stryMutAct_9fa48("198") ? false : (stryCov_9fa48("198", "199"), lo === null)) || (stryMutAct_9fa48("201") ? hi !== null : stryMutAct_9fa48("200") ? false : (stryCov_9fa48("200", "201"), hi === null)))) {
          if (stryMutAct_9fa48("202")) {
            {}
          } else {
            stryCov_9fa48("202");
            // Every driver that was outside is said, each with the edge of what was seen, the sign it has (a limit is a level, which may be below 0).
            const uniq = stryMutAct_9fa48("203") ? () => undefined : (stryCov_9fa48("203"), (() => {
              const uniq = (os: Reached["outside"]) => stryMutAct_9fa48("204") ? os : (stryCov_9fa48("204"), os.filter(stryMutAct_9fa48("205") ? () => undefined : (stryCov_9fa48("205"), (o, i) => stryMutAct_9fa48("208") ? os.findIndex(x => x.name === o.name && x.side === o.side && x.limit === o.limit) !== i : stryMutAct_9fa48("207") ? false : stryMutAct_9fa48("206") ? true : (stryCov_9fa48("206", "207", "208"), os.findIndex(stryMutAct_9fa48("209") ? () => undefined : (stryCov_9fa48("209"), x => stryMutAct_9fa48("212") ? x.name === o.name && x.side === o.side || x.limit === o.limit : stryMutAct_9fa48("211") ? false : stryMutAct_9fa48("210") ? true : (stryCov_9fa48("210", "211", "212"), (stryMutAct_9fa48("214") ? x.name === o.name || x.side === o.side : stryMutAct_9fa48("213") ? true : (stryCov_9fa48("213", "214"), (stryMutAct_9fa48("216") ? x.name !== o.name : stryMutAct_9fa48("215") ? true : (stryCov_9fa48("215", "216"), x.name === o.name)) && (stryMutAct_9fa48("218") ? x.side !== o.side : stryMutAct_9fa48("217") ? true : (stryCov_9fa48("217", "218"), x.side === o.side)))) && (stryMutAct_9fa48("220") ? x.limit !== o.limit : stryMutAct_9fa48("219") ? true : (stryCov_9fa48("219", "220"), x.limit === o.limit))))) === i))));
              return uniq;
            })());
            const [outs, beyonds] = stryMutAct_9fa48("221") ? [] : (stryCov_9fa48("221"), [uniq(r.outside), uniq(r.beyond)]);
            const limitOf = stryMutAct_9fa48("222") ? () => undefined : (stryCov_9fa48("222"), (() => {
              const limitOf = (o: Reached["outside"][number]) => o.change ? Math.abs(o.limit) : o.limit;
              return limitOf;
            })());
            const kinds = beyonds.map(stryMutAct_9fa48("223") ? () => undefined : (stryCov_9fa48("223"), o => (o.change ? o.side === "above" ? "whatif-beyond-rise" : "whatif-beyond-fall" : o.side === "above" ? "whatif-beyond-above" : "whatif-beyond-below") as CaseKey));
            const outside = (stryMutAct_9fa48("224") ? [] : (stryCov_9fa48("224"), [...outs.map(stryMutAct_9fa48("225") ? () => undefined : (stryCov_9fa48("225"), o => outsideText(o, metricOf(o.name), span, ctx))), ...beyonds.map(stryMutAct_9fa48("226") ? () => undefined : (stryCov_9fa48("226"), (o, i) => text(kinds[i], ctx, stryMutAct_9fa48("227") ? {} : (stryCov_9fa48("227"), {
              name: o.name,
              limit: written(metricOf(o.name), limitOf(o), ctx),
              span
            }))))])).join(stryMutAct_9fa48("228") ? "" : (stryCov_9fa48("228"), ". "));
            for (const o of stryMutAct_9fa48("229") ? [] : (stryCov_9fa48("229"), [...outs, ...beyonds])) if (stryMutAct_9fa48("230")) {
              ;
            } else {
              stryCov_9fa48("230");
              figures.push(figure(o.name, limitOf(o), written(metricOf(o.name), limitOf(o), ctx)));
            }
            if (stryMutAct_9fa48("232") ? false : stryMutAct_9fa48("231") ? true : (stryCov_9fa48("231", "232"), r.noRange)) return stryMutAct_9fa48("233") ? {} : (stryCov_9fa48("233"), {
              ...base,
              kind: stryMutAct_9fa48("234") ? "" : (stryCov_9fa48("234"), "guess"),
              effect: r.effect,
              lo: null,
              hi: null,
              strength: lowest,
              strengthText,
              sentence: text(stryMutAct_9fa48("235") ? "" : (stryCov_9fa48("235"), "whatif-row-norange"), ctx, stryMutAct_9fa48("236") ? {} : (stryCov_9fa48("236"), {
                name: r.name,
                moves,
                effect: shown,
                through
              }))
            });
            return stryMutAct_9fa48("237") ? {} : (stryCov_9fa48("237"), {
              ...base,
              kind: stryMutAct_9fa48("238") ? "" : (stryCov_9fa48("238"), "guess"),
              effect: r.effect,
              lo: null,
              hi: null,
              strength: lowest,
              strengthText,
              sentence: text(stryMutAct_9fa48("239") ? "" : (stryCov_9fa48("239"), "whatif-row-guess"), ctx, stryMutAct_9fa48("240") ? {} : (stryCov_9fa48("240"), {
                name: r.name,
                moves,
                effect: shown,
                through,
                outside
              }))
            });
          }
        }
        // Where the range reaches 0 or crosses it, each end says which way it goes; else both are sizes in the direction of the effect.
        const crossing = stryMutAct_9fa48("244") ? lo * hi > 0 : stryMutAct_9fa48("243") ? lo * hi < 0 : stryMutAct_9fa48("242") ? false : stryMutAct_9fa48("241") ? true : (stryCov_9fa48("241", "242", "243", "244"), (stryMutAct_9fa48("245") ? lo / hi : (stryCov_9fa48("245"), lo * hi)) <= 0);
        const mag = stryMutAct_9fa48("246") ? [Math.abs(lo), Math.abs(hi)] : (stryCov_9fa48("246"), (stryMutAct_9fa48("247") ? [] : (stryCov_9fa48("247"), [Math.abs(lo), Math.abs(hi)])).sort(stryMutAct_9fa48("248") ? () => undefined : (stryCov_9fa48("248"), (a, b) => stryMutAct_9fa48("249") ? a + b : (stryCov_9fa48("249"), a - b))));
        const end = stryMutAct_9fa48("250") ? () => undefined : (stryCov_9fa48("250"), (() => {
          const end = (v: number) => (stryMutAct_9fa48("253") ? v !== 0 : stryMutAct_9fa48("252") ? false : stryMutAct_9fa48("251") ? true : (stryCov_9fa48("251", "252", "253"), v === 0)) ? text(stryMutAct_9fa48("254") ? "" : (stryCov_9fa48("254"), "whatif-end-none"), ctx) : text((stryMutAct_9fa48("258") ? v <= 0 : stryMutAct_9fa48("257") ? v >= 0 : stryMutAct_9fa48("256") ? false : stryMutAct_9fa48("255") ? true : (stryCov_9fa48("255", "256", "257", "258"), v > 0)) ? stryMutAct_9fa48("259") ? "" : (stryCov_9fa48("259"), "whatif-end-up") : stryMutAct_9fa48("260") ? "" : (stryCov_9fa48("260"), "whatif-end-down"), ctx, stryMutAct_9fa48("261") ? {} : (stryCov_9fa48("261"), {
            amount: written(m, Math.abs(v), ctx, like)
          }));
          return end;
        })());
        const [loText, hiText] = crossing ? stryMutAct_9fa48("262") ? [] : (stryCov_9fa48("262"), [end(lo), end(hi)]) : stryMutAct_9fa48("263") ? [] : (stryCov_9fa48("263"), [written(m, mag[0], ctx, like), written(m, mag[1], ctx, like)]);
        for (const v of crossing ? stryMutAct_9fa48("264") ? [lo, hi] : (stryCov_9fa48("264"), (stryMutAct_9fa48("265") ? [] : (stryCov_9fa48("265"), [lo, hi])).filter(stryMutAct_9fa48("266") ? () => undefined : (stryCov_9fa48("266"), v => stryMutAct_9fa48("269") ? v === 0 : stryMutAct_9fa48("268") ? false : stryMutAct_9fa48("267") ? true : (stryCov_9fa48("267", "268", "269"), v !== 0)))) : mag) figures.push(figure(stryMutAct_9fa48("271") ? `` : (stryCov_9fa48("271"), `${r.name} ${text(stryMutAct_9fa48("272") ? "" : (stryCov_9fa48("272"), "numbers-range"), ctx)}`), Math.abs(v), written(m, Math.abs(v), ctx, like)));
        numbers.push(stryMutAct_9fa48("274") ? {} : (stryCov_9fa48("274"), {
          label: text(stryMutAct_9fa48("275") ? "" : (stryCov_9fa48("275"), "numbers-range-on"), ctx, stryMutAct_9fa48("276") ? {} : (stryCov_9fa48("276"), {
            name: r.name
          })),
          text: stryMutAct_9fa48("277") ? `` : (stryCov_9fa48("277"), `${loText} – ${hiText}`)
        }));
        return stryMutAct_9fa48("278") ? {} : (stryCov_9fa48("278"), {
          ...base,
          kind: stryMutAct_9fa48("279") ? "" : (stryCov_9fa48("279"), "estimated"),
          effect: r.effect,
          lo,
          hi,
          strength: lowest,
          strengthText,
          sentence: text(stryMutAct_9fa48("280") ? "" : (stryCov_9fa48("280"), "whatif-row-range"), ctx, stryMutAct_9fa48("281") ? {} : (stryCov_9fa48("281"), {
            name: r.name,
            moves,
            effect: shown,
            lo: loText,
            hi: hiText,
            through
          }))
        });
      }
    });
    const said = stryMutAct_9fa48("282") ? rows : (stryCov_9fa48("282"), rows.filter(stryMutAct_9fa48("283") ? () => undefined : (stryCov_9fa48("283"), r => stryMutAct_9fa48("286") ? r.kind === "refused" : stryMutAct_9fa48("285") ? false : stryMutAct_9fa48("284") ? true : (stryCov_9fa48("284", "285", "286"), r.kind !== (stryMutAct_9fa48("287") ? "" : (stryCov_9fa48("287"), "refused"))))));
    if (stryMutAct_9fa48("290") ? said.length !== 0 : stryMutAct_9fa48("289") ? false : stryMutAct_9fa48("288") ? true : (stryCov_9fa48("288", "289", "290"), said.length === 0)) return stryMutAct_9fa48("291") ? {} : (stryCov_9fa48("291"), {
      ...refusalTakeaway(method, rows.map(stryMutAct_9fa48("292") ? () => undefined : (stryCov_9fa48("292"), r => r.sentence))),
      rows
    });
    const first = stryMutAct_9fa48("293") ? said.map(r => r.sentence) : (stryCov_9fa48("293"), said.slice(0, 3).map(stryMutAct_9fa48("294") ? () => undefined : (stryCov_9fa48("294"), r => r.sentence)));
    const more = stryMutAct_9fa48("295") ? said.length + first.length : (stryCov_9fa48("295"), said.length - first.length);
    const estimated = stryMutAct_9fa48("296") ? result.reached : (stryCov_9fa48("296"), result.reached.filter(stryMutAct_9fa48("297") ? () => undefined : (stryCov_9fa48("297"), (r): r is Reached => stryMutAct_9fa48("300") ? r.ok || !r.exact : stryMutAct_9fa48("299") ? false : stryMutAct_9fa48("298") ? true : (stryCov_9fa48("298", "299", "300"), r.ok && (stryMutAct_9fa48("301") ? r.exact : (stryCov_9fa48("301"), !r.exact))))));
    // "Next month" belongs on the headline only where every estimated link counts a change; else it is said once as an assumption.
    const byChange = stryMutAct_9fa48("302") ? estimated.length : (stryCov_9fa48("302"), estimated.filter(stryMutAct_9fa48("303") ? () => undefined : (stryCov_9fa48("303"), r => r.byChange)).length);
    const allByChange = stryMutAct_9fa48("306") ? estimated.length > 0 && byChange === estimated.length || result.reached.every(r => r.ok && !r.exact) : stryMutAct_9fa48("305") ? false : stryMutAct_9fa48("304") ? true : (stryCov_9fa48("304", "305", "306"), (stryMutAct_9fa48("308") ? estimated.length > 0 || byChange === estimated.length : stryMutAct_9fa48("307") ? true : (stryCov_9fa48("307", "308"), (stryMutAct_9fa48("311") ? estimated.length <= 0 : stryMutAct_9fa48("310") ? estimated.length >= 0 : stryMutAct_9fa48("309") ? true : (stryCov_9fa48("309", "310", "311"), estimated.length > 0)) && (stryMutAct_9fa48("313") ? byChange !== estimated.length : stryMutAct_9fa48("312") ? true : (stryCov_9fa48("312", "313"), byChange === estimated.length)))) && (stryMutAct_9fa48("314") ? result.reached.some(r => r.ok && !r.exact) : (stryCov_9fa48("314"), result.reached.every(stryMutAct_9fa48("315") ? () => undefined : (stryCov_9fa48("315"), r => stryMutAct_9fa48("318") ? r.ok || !r.exact : stryMutAct_9fa48("317") ? false : stryMutAct_9fa48("316") ? true : (stryCov_9fa48("316", "317", "318"), r.ok && (stryMutAct_9fa48("319") ? r.exact : (stryCov_9fa48("319"), !r.exact))))))));
    const slots = stryMutAct_9fa48("320") ? {} : (stryCov_9fa48("320"), {
      start: start.name,
      goes: text((stryMutAct_9fa48("324") ? result.by <= 0 : stryMutAct_9fa48("323") ? result.by >= 0 : stryMutAct_9fa48("322") ? false : stryMutAct_9fa48("321") ? true : (stryCov_9fa48("321", "322", "323", "324"), result.by > 0)) ? stryMutAct_9fa48("325") ? "" : (stryCov_9fa48("325"), "whatif-goes-up") : stryMutAct_9fa48("326") ? "" : (stryCov_9fa48("326"), "whatif-goes-down"), ctx),
      by: startText,
      when: allByChange ? text(stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), "whatif-when-next"), ctx, stryMutAct_9fa48("328") ? {} : (stryCov_9fa48("328"), {
        span
      })) : stryMutAct_9fa48("329") ? "Stryker was here!" : (stryCov_9fa48("329"), ""),
      pct: (stryMutAct_9fa48("332") ? result.percent !== null : stryMutAct_9fa48("331") ? false : stryMutAct_9fa48("330") ? true : (stryCov_9fa48("330", "331", "332"), result.percent === null)) ? stryMutAct_9fa48("333") ? "Stryker was here!" : (stryCov_9fa48("333"), "") : formatNumber(Math.abs(result.percent), percentDigits(Math.abs(result.percent)), ctx.style)
    });
    const headline = text((stryMutAct_9fa48("336") ? result.percent !== null : stryMutAct_9fa48("335") ? false : stryMutAct_9fa48("334") ? true : (stryCov_9fa48("334", "335", "336"), result.percent === null)) ? stryMutAct_9fa48("337") ? "" : (stryCov_9fa48("337"), "whatif-headline") : stryMutAct_9fa48("338") ? "" : (stryCov_9fa48("338"), "whatif-headline-percent"), ctx, slots);
    if (stryMutAct_9fa48("341") ? result.percent === null : stryMutAct_9fa48("340") ? false : stryMutAct_9fa48("339") ? true : (stryCov_9fa48("339", "340", "341"), result.percent !== null)) figures.push(figure(stryMutAct_9fa48("343") ? `` : (stryCov_9fa48("343"), `${start.name} %`), Math.abs(result.percent), slots.pct));
    // The weakest of every estimated row, one that cannot be told from chance included.
    const strength = stryMutAct_9fa48("344") ? WEAKEST.find(w => rows.some(r => r.kind !== "worked-out" && r.kind !== "refused" && r.strength === w)) && null : (stryCov_9fa48("344"), WEAKEST.find(stryMutAct_9fa48("345") ? () => undefined : (stryCov_9fa48("345"), w => stryMutAct_9fa48("346") ? rows.every(r => r.kind !== "worked-out" && r.kind !== "refused" && r.strength === w) : (stryCov_9fa48("346"), rows.some(stryMutAct_9fa48("347") ? () => undefined : (stryCov_9fa48("347"), r => stryMutAct_9fa48("350") ? r.kind !== "worked-out" && r.kind !== "refused" || r.strength === w : stryMutAct_9fa48("349") ? false : stryMutAct_9fa48("348") ? true : (stryCov_9fa48("348", "349", "350"), (stryMutAct_9fa48("352") ? r.kind !== "worked-out" || r.kind !== "refused" : stryMutAct_9fa48("351") ? true : (stryCov_9fa48("351", "352"), (stryMutAct_9fa48("354") ? r.kind === "worked-out" : stryMutAct_9fa48("353") ? true : (stryCov_9fa48("353", "354"), r.kind !== (stryMutAct_9fa48("355") ? "" : (stryCov_9fa48("355"), "worked-out")))) && (stryMutAct_9fa48("357") ? r.kind === "refused" : stryMutAct_9fa48("356") ? true : (stryCov_9fa48("356", "357"), r.kind !== (stryMutAct_9fa48("358") ? "" : (stryCov_9fa48("358"), "refused")))))) && (stryMutAct_9fa48("360") ? r.strength !== w : stryMutAct_9fa48("359") ? true : (stryCov_9fa48("359", "360"), r.strength === w)))))))) ?? null);
    const modes = new Set(fits.map(stryMutAct_9fa48("361") ? () => undefined : (stryCov_9fa48("361"), f => f.basis)));
    const basis = (stryMutAct_9fa48("364") ? fits.length !== 0 : stryMutAct_9fa48("363") ? false : stryMutAct_9fa48("362") ? true : (stryCov_9fa48("362", "363", "364"), fits.length === 0)) ? null : (stryMutAct_9fa48("368") ? modes.size <= 1 : stryMutAct_9fa48("367") ? modes.size >= 1 : stryMutAct_9fa48("366") ? false : stryMutAct_9fa48("365") ? true : (stryCov_9fa48("365", "366", "367", "368"), modes.size > 1)) ? text(stryMutAct_9fa48("369") ? "" : (stryCov_9fa48("369"), "basis-what-if-mixed"), ctx) : text((stryMutAct_9fa48("372") ? fits[0].basis !== "changes" : stryMutAct_9fa48("371") ? false : stryMutAct_9fa48("370") ? true : (stryCov_9fa48("370", "371", "372"), fits[0].basis === (stryMutAct_9fa48("373") ? "" : (stryCov_9fa48("373"), "changes")))) ? stryMutAct_9fa48("374") ? "" : (stryCov_9fa48("374"), "basis-changes") : stryMutAct_9fa48("375") ? "" : (stryCov_9fa48("375"), "basis-values"), ctx);
    const distinct = stryMutAct_9fa48("376") ? [] : (stryCov_9fa48("376"), [...new Set(cautions)]);
    return stryMutAct_9fa48("377") ? {} : (stryCov_9fa48("377"), {
      ...refusalTakeaway(method, stryMutAct_9fa48("378") ? ["Stryker was here"] : (stryCov_9fa48("378"), [])),
      kind: stryMutAct_9fa48("379") ? "" : (stryCov_9fa48("379"), "answer"),
      refusal: null,
      sentence: (stryMutAct_9fa48("380") ? [] : (stryCov_9fa48("380"), [headline, ...first, ...((stryMutAct_9fa48("384") ? more <= 0 : stryMutAct_9fa48("383") ? more >= 0 : stryMutAct_9fa48("382") ? false : stryMutAct_9fa48("381") ? true : (stryCov_9fa48("381", "382", "383", "384"), more > 0)) ? stryMutAct_9fa48("385") ? [] : (stryCov_9fa48("385"), [text(stryMutAct_9fa48("386") ? "" : (stryCov_9fa48("386"), "whatif-more"), ctx, stryMutAct_9fa48("387") ? {} : (stryCov_9fa48("387"), {
        n: more
      }))]) : stryMutAct_9fa48("388") ? ["Stryker was here"] : (stryCov_9fa48("388"), []))])).join(stryMutAct_9fa48("389") ? "" : (stryCov_9fa48("389"), " ")),
      strength,
      strengthText: (stryMutAct_9fa48("392") ? strength !== null : stryMutAct_9fa48("391") ? false : stryMutAct_9fa48("390") ? true : (stryCov_9fa48("390", "391", "392"), strength === null)) ? null : strengthWordIn(strength, ctx),
      range: null,
      basis,
      assumptions: stryMutAct_9fa48("393") ? [] : (stryCov_9fa48("393"), [text(stryMutAct_9fa48("394") ? "" : (stryCov_9fa48("394"), "whatif-assumes-rest"), ctx), ...((stryMutAct_9fa48("395") ? estimated.every(r => r.coefficients > 1) : (stryCov_9fa48("395"), estimated.some(stryMutAct_9fa48("396") ? () => undefined : (stryCov_9fa48("396"), r => stryMutAct_9fa48("400") ? r.coefficients <= 1 : stryMutAct_9fa48("399") ? r.coefficients >= 1 : stryMutAct_9fa48("398") ? false : stryMutAct_9fa48("397") ? true : (stryCov_9fa48("397", "398", "399", "400"), r.coefficients > 1))))) ? stryMutAct_9fa48("401") ? [] : (stryCov_9fa48("401"), [text(stryMutAct_9fa48("402") ? "" : (stryCov_9fa48("402"), "whatif-assumes-chain"), ctx)]) : stryMutAct_9fa48("403") ? ["Stryker was here"] : (stryCov_9fa48("403"), [])), ...((stryMutAct_9fa48("406") ? byChange > 0 || !allByChange : stryMutAct_9fa48("405") ? false : stryMutAct_9fa48("404") ? true : (stryCov_9fa48("404", "405", "406"), (stryMutAct_9fa48("409") ? byChange <= 0 : stryMutAct_9fa48("408") ? byChange >= 0 : stryMutAct_9fa48("407") ? true : (stryCov_9fa48("407", "408", "409"), byChange > 0)) && (stryMutAct_9fa48("410") ? allByChange : (stryCov_9fa48("410"), !allByChange)))) ? stryMutAct_9fa48("411") ? [] : (stryCov_9fa48("411"), [text(stryMutAct_9fa48("412") ? "" : (stryCov_9fa48("412"), "whatif-assumes-next"), ctx, stryMutAct_9fa48("413") ? {} : (stryCov_9fa48("413"), {
        span
      }))]) : stryMutAct_9fa48("414") ? ["Stryker was here"] : (stryCov_9fa48("414"), []))]),
      cautions: distinct,
      footer: (stryMutAct_9fa48("418") ? estimated.length <= 0 : stryMutAct_9fa48("417") ? estimated.length >= 0 : stryMutAct_9fa48("416") ? false : stryMutAct_9fa48("415") ? true : (stryCov_9fa48("415", "416", "417", "418"), estimated.length > 0)) ? footerText(ctx) : null,
      figures,
      numbers,
      rows
    });
  }
}

/** The decimals a percent is written with: none for a whole one, else at least two significant digits (never a percent above 0 written as 0), up to 15. */
function percentDigits(v: number): number {
  if (stryMutAct_9fa48("419")) {
    {}
  } else {
    stryCov_9fa48("419");
    return Number.isInteger(v) ? 0 : stryMutAct_9fa48("420") ? Math.max(15, Math.max(2, Math.ceil(1 - Math.log10(v)))) : (stryCov_9fa48("420"), Math.min(15, stryMutAct_9fa48("421") ? Math.min(2, Math.ceil(1 - Math.log10(v))) : (stryCov_9fa48("421"), Math.max(2, Math.ceil(stryMutAct_9fa48("422") ? 1 + Math.log10(v) : (stryCov_9fa48("422"), 1 - Math.log10(v)))))));
  }
}

/** Whether numbers can be written in a Metric's unit so that none above 0 reads as 0 and no two that differ read the same, within 15 places. */
function legible(m: Metric, values: number[], ctx: TakeawayContext): boolean {
  if (stryMutAct_9fa48("423")) {
    {}
  } else {
    stryCov_9fa48("423");
    const texts = values.map(stryMutAct_9fa48("424") ? () => undefined : (stryCov_9fa48("424"), v => written(m, v, ctx, values)));
    return stryMutAct_9fa48("427") ? values.every((v, i) => v === 0 || /[1-9]/.test(texts[i])) || new Set(values).size === new Set(texts).size : stryMutAct_9fa48("426") ? false : stryMutAct_9fa48("425") ? true : (stryCov_9fa48("425", "426", "427"), (stryMutAct_9fa48("428") ? values.some((v, i) => v === 0 || /[1-9]/.test(texts[i])) : (stryCov_9fa48("428"), values.every(stryMutAct_9fa48("429") ? () => undefined : (stryCov_9fa48("429"), (v, i) => stryMutAct_9fa48("432") ? v === 0 && /[1-9]/.test(texts[i]) : stryMutAct_9fa48("431") ? false : stryMutAct_9fa48("430") ? true : (stryCov_9fa48("430", "431", "432"), (stryMutAct_9fa48("434") ? v !== 0 : stryMutAct_9fa48("433") ? false : (stryCov_9fa48("433", "434"), v === 0)) || (stryMutAct_9fa48("435") ? /[^1-9]/ : (stryCov_9fa48("435"), /[1-9]/)).test(texts[i])))))) && (stryMutAct_9fa48("437") ? new Set(values).size !== new Set(texts).size : stryMutAct_9fa48("436") ? true : (stryCov_9fa48("436", "437"), new Set(values).size === new Set(texts).size)));
  }
}
function refusedRow(r: Pick<NotReached, "name" | "step">, sentence: string): WhatIfRow {
  if (stryMutAct_9fa48("438")) {
    {}
  } else {
    stryCov_9fa48("438");
    return stryMutAct_9fa48("439") ? {} : (stryCov_9fa48("439"), {
      name: r.name,
      step: r.step,
      kind: stryMutAct_9fa48("440") ? "" : (stryCov_9fa48("440"), "refused"),
      effect: null,
      lo: null,
      hi: null,
      strength: null,
      strengthText: null,
      through: stryMutAct_9fa48("441") ? ["Stryker was here"] : (stryCov_9fa48("441"), []),
      sentence: stryMutAct_9fa48("442") ? `` : (stryCov_9fa48("442"), `${r.name}: ${sentence}`)
    });
  }
}

// ---- the Recipe ----

/** The one-click question this ticket adds, in the person's words, with what it asks and what Ziffr fills in (spec 0041, "Recipes"). */
export const WHAT_IF_RECIPES = [{
  id: "what-if",
  question: "What if {A} changes?",
  asks: ["A", "the change, as an amount or a percent"],
  fills: "the Metrics that clearly moved with A (a Derived Metric built from A is worked out exactly; the others are read from a straight line through their history), and then the Metrics that clearly moved with those, at most 2 steps and 12 Metrics in all, everything else staying where it was"
}] as const;

/** The most Metrics the first step keeps. */
export const MOST_FIRST = 5;
/** The most Metrics looked at for the first step. */
export const MOST_LOOKED_AT = 20;
/** The most Metrics looked at for each Metric of the first step. */
export const MOST_PER_STEP = 8;

// The levels a formula's inputs are at in the period the change counts from (the changed Metric's latest), by Metric name; null where one has none there.
function levelsOf(inputs: Metric[], series: Map<number, Point[]>, period: string): Record<string, number> | null {
  if (stryMutAct_9fa48("443")) {
    {}
  } else {
    stryCov_9fa48("443");
    const maps = inputs.map(stryMutAct_9fa48("444") ? () => undefined : (stryCov_9fa48("444"), m => new Map((stryMutAct_9fa48("445") ? series.get(m.id) && [] : (stryCov_9fa48("445"), series.get(m.id) ?? (stryMutAct_9fa48("446") ? ["Stryker was here"] : (stryCov_9fa48("446"), [])))).map(stryMutAct_9fa48("447") ? () => undefined : (stryCov_9fa48("447"), p => stryMutAct_9fa48("448") ? [] : (stryCov_9fa48("448"), [p.period, p.value]))))));
    return (stryMutAct_9fa48("449") ? maps.some(m => m.has(period)) : (stryCov_9fa48("449"), maps.every(stryMutAct_9fa48("450") ? () => undefined : (stryCov_9fa48("450"), m => m.has(period))))) ? Object.fromEntries(inputs.map(stryMutAct_9fa48("451") ? () => undefined : (stryCov_9fa48("451"), (m, i) => stryMutAct_9fa48("452") ? [] : (stryCov_9fa48("452"), [m.name, maps[i].get(period)!])))) : null;
  }
}
type Found = {
  target: Metric;
  link: WhatIfLink;
  exact: boolean;
  partial: number;
  fit: Fit | null;
};

/** "What if A changes?": `others` are the Metrics a person may see (nothing else is read or named), the history in `resolve`. The Metrics that
 * clearly moved with `start` (a straight line through each pair's history; a Derived Metric built from it is worked out exactly) are the
 * first step. Each Metric that moved with the first step is then fitted on `start` and the first-step Metrics that move it, so that the
 * effect of `start` direct and the effect through each one are told apart; a driver that cannot be told from chance is left out and the
 * fit made again. The second step is what the Method follows from those links. */
export function whatIfRecipe(start: Metric, change: WhatIfChange, others: Metric[], resolve: Resolver, opts: FitRecipeOptions): WhatIfTakeaway {
  if (stryMutAct_9fa48("453")) {
    {}
  } else {
    stryCov_9fa48("453");
    const method = text(stryMutAct_9fa48("454") ? "" : (stryCov_9fa48("454"), "numbers-method-what-if"), opts.ctx);
    const none = stryMutAct_9fa48("455") ? () => undefined : (stryCov_9fa48("455"), (() => {
      const none = (lines: string[], notes: string[] = stryMutAct_9fa48("456") ? ["Stryker was here"] : (stryCov_9fa48("456"), [])): WhatIfTakeaway => stryMutAct_9fa48("457") ? {} : (stryCov_9fa48("457"), {
        ...refusalTakeaway(method, lines),
        notes,
        rows: stryMutAct_9fa48("458") ? ["Stryker was here"] : (stryCov_9fa48("458"), [])
      });
      return none;
    })());
    const everyone = stryMutAct_9fa48("459") ? [] : (stryCov_9fa48("459"), [start, ...(stryMutAct_9fa48("460") ? others : (stryCov_9fa48("460"), others.filter(stryMutAct_9fa48("461") ? () => undefined : (stryCov_9fa48("461"), m => stryMutAct_9fa48("464") ? m.id === start.id : stryMutAct_9fa48("463") ? false : stryMutAct_9fa48("462") ? true : (stryCov_9fa48("462", "463", "464"), m.id !== start.id)))))]);
    const dup = everyone.find(stryMutAct_9fa48("465") ? () => undefined : (stryCov_9fa48("465"), (m, i) => stryMutAct_9fa48("468") ? everyone.findIndex(o => o.name === m.name) === i : stryMutAct_9fa48("467") ? false : stryMutAct_9fa48("466") ? true : (stryCov_9fa48("466", "467", "468"), everyone.findIndex(stryMutAct_9fa48("469") ? () => undefined : (stryCov_9fa48("469"), o => stryMutAct_9fa48("472") ? o.name !== m.name : stryMutAct_9fa48("471") ? false : stryMutAct_9fa48("470") ? true : (stryCov_9fa48("470", "471", "472"), o.name === m.name))) !== i)));
    if (stryMutAct_9fa48("474") ? false : stryMutAct_9fa48("473") ? true : (stryCov_9fa48("473", "474"), dup)) return none(stryMutAct_9fa48("475") ? [] : (stryCov_9fa48("475"), [text(stryMutAct_9fa48("476") ? "" : (stryCov_9fa48("476"), "refuse-same-names"), opts.ctx, stryMutAct_9fa48("477") ? {} : (stryCov_9fa48("477"), {
      name: dup.name
    }))]));
    // A Metric the changed one is built from does not move when it changes: it is not a candidate.
    const pool = stryMutAct_9fa48("479") ? everyone.filter(m => !start.formula?.includes(`{${m.slug}}`)) : stryMutAct_9fa48("478") ? everyone.slice(1) : (stryCov_9fa48("478", "479"), everyone.slice(1).filter(stryMutAct_9fa48("480") ? () => undefined : (stryCov_9fa48("480"), m => stryMutAct_9fa48("481") ? start.formula?.includes(`{${m.slug}}`) : (stryCov_9fa48("481"), !(stryMutAct_9fa48("482") ? start.formula.includes(`{${m.slug}}`) : (stryCov_9fa48("482"), start.formula?.includes(stryMutAct_9fa48("483") ? `` : (stryCov_9fa48("483"), `{${m.slug}}`))))))));
    if (stryMutAct_9fa48("486") ? pool.length !== 0 : stryMutAct_9fa48("485") ? false : stryMutAct_9fa48("484") ? true : (stryCov_9fa48("484", "485", "486"), pool.length === 0)) return none(stryMutAct_9fa48("487") ? [] : (stryCov_9fa48("487"), [text(stryMutAct_9fa48("488") ? "" : (stryCov_9fa48("488"), "drivers-empty"), opts.ctx, stryMutAct_9fa48("489") ? {} : (stryCov_9fa48("489"), {
      target: start.name
    }))]));
    const on = onCommon(stryMutAct_9fa48("490") ? [] : (stryCov_9fa48("490"), [start, ...pool]), resolve, opts);
    if (stryMutAct_9fa48("493") ? typeof on !== "string" : stryMutAct_9fa48("492") ? false : stryMutAct_9fa48("491") ? true : (stryCov_9fa48("491", "492", "493"), typeof on === (stryMutAct_9fa48("494") ? "" : (stryCov_9fa48("494"), "string")))) return none(stryMutAct_9fa48("495") ? [] : (stryCov_9fa48("495"), [on]));
    const {
      span
    } = on;
    const series = new Map(stryMutAct_9fa48("496") ? everyone.concat(pool).map((m, i) => [m.id, on.series[i]] as const) : (stryCov_9fa48("496"), everyone.slice(0, 1).concat(pool).map(stryMutAct_9fa48("497") ? () => undefined : (stryCov_9fa48("497"), (m, i) => [m.id, on.series[i]] as const))));
    const last = on.series[0][stryMutAct_9fa48("498") ? on.series[0].length + 1 : (stryCov_9fa48("498"), on.series[0].length - 1)];
    if (stryMutAct_9fa48("501") ? last !== undefined : stryMutAct_9fa48("500") ? false : stryMutAct_9fa48("499") ? true : (stryCov_9fa48("499", "500", "501"), last === undefined)) return none(stryMutAct_9fa48("502") ? [] : (stryCov_9fa48("502"), [text(stryMutAct_9fa48("503") ? "" : (stryCov_9fa48("503"), "refuse-what-if-latest"), opts.ctx, stryMutAct_9fa48("504") ? {} : (stryCov_9fa48("504"), {
      name: start.name
    }))]));
    const latest = last.value;
    const left = new Set<string>();
    const builds = stryMutAct_9fa48("505") ? () => undefined : (stryCov_9fa48("505"), (() => {
      const builds = (m: Metric, from: Metric) => Boolean(stryMutAct_9fa48("506") ? m.formula.includes(`{${from.slug}}`) : (stryCov_9fa48("506"), m.formula?.includes(stryMutAct_9fa48("507") ? `` : (stryCov_9fa48("507"), `{${from.slug}}`))));
      return builds;
    })());
    const strongest = stryMutAct_9fa48("508") ? () => undefined : (stryCov_9fa48("508"), (() => {
      const strongest = (f: Fit) => stryMutAct_9fa48("509") ? Math.min(...f.drivers.map(d => Math.abs(d.partial))) : (stryCov_9fa48("509"), Math.max(...f.drivers.map(stryMutAct_9fa48("510") ? () => undefined : (stryCov_9fa48("510"), d => Math.abs(d.partial)))));
      return strongest;
    })());
    const fitOn = stryMutAct_9fa48("511") ? () => undefined : (stryCov_9fa48("511"), (() => {
      const fitOn = (target: Metric, drivers: Metric[]) => fit(stryMutAct_9fa48("512") ? {} : (stryCov_9fa48("512"), {
        target: stryMutAct_9fa48("513") ? {} : (stryCov_9fa48("513"), {
          name: target.name,
          points: series.get(target.id)!
        }),
        drivers: drivers.map(stryMutAct_9fa48("514") ? () => undefined : (stryCov_9fa48("514"), d => stryMutAct_9fa48("515") ? {} : (stryCov_9fa48("515"), {
          name: d.name,
          points: series.get(d.id)!,
          id: d.id
        }))),
        span,
        metrics: stryMutAct_9fa48("516") ? [] : (stryCov_9fa48("516"), [target, ...drivers])
      }));
      return fitOn;
    })());
    // The Metrics worth fitting against `target`: the ones whose changes follow its own most closely (|r| of the changes, ties by id). This only chooses which
    // to look at, so it is worked out in doubles, once for each Metric's changes: every number given comes from the exact fits.
    const changesOf = new Map<number, Map<string, number>>();
    const changed = (m: Metric) => {
      if (stryMutAct_9fa48("517")) {
        {}
      } else {
        stryCov_9fa48("517");
        if (stryMutAct_9fa48("520") ? false : stryMutAct_9fa48("519") ? true : stryMutAct_9fa48("518") ? changesOf.has(m.id) : (stryCov_9fa48("518", "519", "520"), !changesOf.has(m.id))) changesOf.set(m.id, new Map(changes(series.get(m.id)!, span).map(stryMutAct_9fa48("522") ? () => undefined : (stryCov_9fa48("522"), p => stryMutAct_9fa48("523") ? [] : (stryCov_9fa48("523"), [p.period, p.value])))));
        return changesOf.get(m.id)!;
      }
    };
    const closeness = (a: Metric, b: Metric): number => {
      if (stryMutAct_9fa48("524")) {
        {}
      } else {
        stryCov_9fa48("524");
        const other = changed(b);
        const pairs = (stryMutAct_9fa48("525") ? [] : (stryCov_9fa48("525"), [...changed(a)])).flatMap(stryMutAct_9fa48("526") ? () => undefined : (stryCov_9fa48("526"), ([period, x]) => other.has(period) ? stryMutAct_9fa48("527") ? [] : (stryCov_9fa48("527"), [stryMutAct_9fa48("528") ? [] : (stryCov_9fa48("528"), [x, other.get(period)!])]) : stryMutAct_9fa48("529") ? ["Stryker was here"] : (stryCov_9fa48("529"), [])));
        if (stryMutAct_9fa48("533") ? pairs.length >= MIN_PAIRS : stryMutAct_9fa48("532") ? pairs.length <= MIN_PAIRS : stryMutAct_9fa48("531") ? false : stryMutAct_9fa48("530") ? true : (stryCov_9fa48("530", "531", "532", "533"), pairs.length < MIN_PAIRS)) return 0;
        const [mx, my] = (stryMutAct_9fa48("534") ? [] : (stryCov_9fa48("534"), [0, 1])).map(stryMutAct_9fa48("535") ? () => undefined : (stryCov_9fa48("535"), k => stryMutAct_9fa48("536") ? pairs.reduce((t, p) => t + p[k], 0) * pairs.length : (stryCov_9fa48("536"), pairs.reduce(stryMutAct_9fa48("537") ? () => undefined : (stryCov_9fa48("537"), (t, p) => stryMutAct_9fa48("538") ? t - p[k] : (stryCov_9fa48("538"), t + p[k])), 0) / pairs.length)));
        const [sxx, syy, sxy] = pairs.reduce(stryMutAct_9fa48("539") ? () => undefined : (stryCov_9fa48("539"), (t, p) => stryMutAct_9fa48("540") ? [] : (stryCov_9fa48("540"), [stryMutAct_9fa48("541") ? t[0] - (p[0] - mx) ** 2 : (stryCov_9fa48("541"), t[0] + (stryMutAct_9fa48("542") ? p[0] + mx : (stryCov_9fa48("542"), p[0] - mx)) ** 2), stryMutAct_9fa48("543") ? t[1] - (p[1] - my) ** 2 : (stryCov_9fa48("543"), t[1] + (stryMutAct_9fa48("544") ? p[1] + my : (stryCov_9fa48("544"), p[1] - my)) ** 2), stryMutAct_9fa48("545") ? t[2] - (p[0] - mx) * (p[1] - my) : (stryCov_9fa48("545"), t[2] + (stryMutAct_9fa48("546") ? (p[0] - mx) / (p[1] - my) : (stryCov_9fa48("546"), (stryMutAct_9fa48("547") ? p[0] + mx : (stryCov_9fa48("547"), p[0] - mx)) * (stryMutAct_9fa48("548") ? p[1] + my : (stryCov_9fa48("548"), p[1] - my)))))])), stryMutAct_9fa48("549") ? [] : (stryCov_9fa48("549"), [0, 0, 0]));
        const r = stryMutAct_9fa48("550") ? sxy * Math.sqrt(sxx * syy) : (stryCov_9fa48("550"), sxy / Math.sqrt(stryMutAct_9fa48("551") ? sxx / syy : (stryCov_9fa48("551"), sxx * syy)));
        // A series that does not change has no r: it counts as 0.
        return Number.isFinite(r) ? Math.abs(r) : 0;
      }
    };
    const closest = (target: Metric, among: Metric[], most: number) => {
      if (stryMutAct_9fa48("552")) {
        {}
      } else {
        stryCov_9fa48("552");
        const r = new Map(among.map(stryMutAct_9fa48("553") ? () => undefined : (stryCov_9fa48("553"), m => stryMutAct_9fa48("554") ? [] : (stryCov_9fa48("554"), [m.id, closeness(target, m)]))));
        return stryMutAct_9fa48("556") ? [...among].slice(0, most) : stryMutAct_9fa48("555") ? [...among].sort((a, b) => r.get(b.id)! - r.get(a.id)! || a.id - b.id) : (stryCov_9fa48("555", "556"), (stryMutAct_9fa48("557") ? [] : (stryCov_9fa48("557"), [...among])).sort(stryMutAct_9fa48("558") ? () => undefined : (stryCov_9fa48("558"), (a, b) => stryMutAct_9fa48("561") ? r.get(b.id)! - r.get(a.id)! && a.id - b.id : stryMutAct_9fa48("560") ? false : stryMutAct_9fa48("559") ? true : (stryCov_9fa48("559", "560", "561"), (stryMutAct_9fa48("562") ? r.get(b.id)! + r.get(a.id)! : (stryCov_9fa48("562"), r.get(b.id)! - r.get(a.id)!)) || (stryMutAct_9fa48("563") ? a.id + b.id : (stryCov_9fa48("563"), a.id - b.id))))).slice(0, most));
      }
    };
    // The formula of a Derived Metric as a link, where every Metric it names is here, counted by the common period, with none reaching back.
    const worked = (t: Metric): Found | null => {
      if (stryMutAct_9fa48("564")) {
        {}
      } else {
        stryCov_9fa48("564");
        const inputs = formulaInputs(t.formula!).map(stryMutAct_9fa48("565") ? () => undefined : (stryCov_9fa48("565"), s => everyone.find(stryMutAct_9fa48("566") ? () => undefined : (stryCov_9fa48("566"), m => stryMutAct_9fa48("569") ? m.slug !== s : stryMutAct_9fa48("568") ? false : stryMutAct_9fa48("567") ? true : (stryCov_9fa48("567", "568", "569"), m.slug === s)))));
        const have = inputs as Metric[];
        const levels = (stryMutAct_9fa48("572") ? (inputs.some(m => m === undefined) || usesPrevious(t.formula!) || t.period !== span || have.some(m => m.period !== span)) && inputsProblem(t, have) !== null : stryMutAct_9fa48("571") ? false : stryMutAct_9fa48("570") ? true : (stryCov_9fa48("570", "571", "572"), (stryMutAct_9fa48("574") ? (inputs.some(m => m === undefined) || usesPrevious(t.formula!) || t.period !== span) && have.some(m => m.period !== span) : stryMutAct_9fa48("573") ? false : (stryCov_9fa48("573", "574"), (stryMutAct_9fa48("576") ? (inputs.some(m => m === undefined) || usesPrevious(t.formula!)) && t.period !== span : stryMutAct_9fa48("575") ? false : (stryCov_9fa48("575", "576"), (stryMutAct_9fa48("578") ? inputs.some(m => m === undefined) && usesPrevious(t.formula!) : stryMutAct_9fa48("577") ? false : (stryCov_9fa48("577", "578"), (stryMutAct_9fa48("579") ? inputs.every(m => m === undefined) : (stryCov_9fa48("579"), inputs.some(stryMutAct_9fa48("580") ? () => undefined : (stryCov_9fa48("580"), m => stryMutAct_9fa48("583") ? m !== undefined : stryMutAct_9fa48("582") ? false : stryMutAct_9fa48("581") ? true : (stryCov_9fa48("581", "582", "583"), m === undefined))))) || usesPrevious(t.formula!))) || (stryMutAct_9fa48("585") ? t.period === span : stryMutAct_9fa48("584") ? false : (stryCov_9fa48("584", "585"), t.period !== span)))) || (stryMutAct_9fa48("586") ? have.every(m => m.period !== span) : (stryCov_9fa48("586"), have.some(stryMutAct_9fa48("587") ? () => undefined : (stryCov_9fa48("587"), m => stryMutAct_9fa48("590") ? m.period === span : stryMutAct_9fa48("589") ? false : stryMutAct_9fa48("588") ? true : (stryCov_9fa48("588", "589", "590"), m.period !== span))))))) || (stryMutAct_9fa48("592") ? inputsProblem(t, have) === null : stryMutAct_9fa48("591") ? false : (stryCov_9fa48("591", "592"), inputsProblem(t, have) !== null)))) ? null : levelsOf(have, series, last.period);
        if (stryMutAct_9fa48("595") ? false : stryMutAct_9fa48("594") ? true : stryMutAct_9fa48("593") ? levels : (stryCov_9fa48("593", "594", "595"), !levels)) {
          if (stryMutAct_9fa48("596")) {
            {}
          } else {
            stryCov_9fa48("596");
            if (stryMutAct_9fa48("597")) {
              ;
            } else {
              stryCov_9fa48("597");
              left.add(t.name);
            }
            return null;
          }
        }
        return stryMutAct_9fa48("598") ? {} : (stryCov_9fa48("598"), {
          target: t,
          exact: stryMutAct_9fa48("599") ? false : (stryCov_9fa48("599"), true),
          partial: 1,
          fit: null,
          link: stryMutAct_9fa48("600") ? {} : (stryCov_9fa48("600"), {
            kind: stryMutAct_9fa48("601") ? "" : (stryCov_9fa48("601"), "worked"),
            target: t.name,
            formula: t.formula!,
            names: Object.fromEntries(have.map(stryMutAct_9fa48("602") ? () => undefined : (stryCov_9fa48("602"), m => stryMutAct_9fa48("603") ? [] : (stryCov_9fa48("603"), [m.slug, m.name])))),
            levels
          })
        });
      }
    };
    const estimated = stryMutAct_9fa48("604") ? () => undefined : (stryCov_9fa48("604"), (() => {
      const estimated = (t: Metric, f: Fit): Found => stryMutAct_9fa48("605") ? {} : (stryCov_9fa48("605"), {
        target: t,
        exact: stryMutAct_9fa48("606") ? true : (stryCov_9fa48("606"), false),
        partial: strongest(f),
        fit: f,
        link: stryMutAct_9fa48("607") ? {} : (stryCov_9fa48("607"), {
          kind: stryMutAct_9fa48("608") ? "" : (stryCov_9fa48("608"), "fit"),
          fit: f
        })
      });
      return estimated;
    })());
    const order = stryMutAct_9fa48("609") ? () => undefined : (stryCov_9fa48("609"), (() => {
      const order = (a: Found, b: Found) => stryMutAct_9fa48("612") ? (Number(b.exact) - Number(a.exact) || b.partial - a.partial) && a.target.id - b.target.id : stryMutAct_9fa48("611") ? false : stryMutAct_9fa48("610") ? true : (stryCov_9fa48("610", "611", "612"), (stryMutAct_9fa48("614") ? Number(b.exact) - Number(a.exact) && b.partial - a.partial : stryMutAct_9fa48("613") ? false : (stryCov_9fa48("613", "614"), (stryMutAct_9fa48("615") ? Number(b.exact) + Number(a.exact) : (stryCov_9fa48("615"), Number(b.exact) - Number(a.exact))) || (stryMutAct_9fa48("616") ? b.partial + a.partial : (stryCov_9fa48("616"), b.partial - a.partial)))) || (stryMutAct_9fa48("617") ? a.target.id + b.target.id : (stryCov_9fa48("617"), a.target.id - b.target.id)));
      return order;
    })());

    // The first step: what clearly moved with the Metric changed, each on its own.
    const firstFound: Found[] = stryMutAct_9fa48("618") ? ["Stryker was here"] : (stryCov_9fa48("618"), []);
    const candidates1 = stryMutAct_9fa48("619") ? pool : (stryCov_9fa48("619"), pool.filter(stryMutAct_9fa48("620") ? () => undefined : (stryCov_9fa48("620"), m => stryMutAct_9fa48("623") ? !builds(m, start) || !builds(start, m) : stryMutAct_9fa48("622") ? false : stryMutAct_9fa48("621") ? true : (stryCov_9fa48("621", "622", "623"), (stryMutAct_9fa48("624") ? builds(m, start) : (stryCov_9fa48("624"), !builds(m, start))) && (stryMutAct_9fa48("625") ? builds(start, m) : (stryCov_9fa48("625"), !builds(start, m)))))));
    for (const t of closest(start, candidates1, MOST_LOOKED_AT)) {
      if (stryMutAct_9fa48("626")) {
        {}
      } else {
        stryCov_9fa48("626");
        const f = fitOn(t, stryMutAct_9fa48("627") ? [] : (stryCov_9fa48("627"), [start]));
        if (stryMutAct_9fa48("630") ? f.ok || f.drivers[0].strength !== "cant-tell" : stryMutAct_9fa48("629") ? false : stryMutAct_9fa48("628") ? true : (stryCov_9fa48("628", "629", "630"), f.ok && (stryMutAct_9fa48("632") ? f.drivers[0].strength === "cant-tell" : stryMutAct_9fa48("631") ? true : (stryCov_9fa48("631", "632"), f.drivers[0].strength !== (stryMutAct_9fa48("633") ? "" : (stryCov_9fa48("633"), "cant-tell")))))) if (stryMutAct_9fa48("634")) {
          ;
        } else {
          stryCov_9fa48("634");
          firstFound.push(estimated(t, f));
        }
      }
    }
    for (const t of stryMutAct_9fa48("635") ? pool : (stryCov_9fa48("635"), pool.filter(stryMutAct_9fa48("636") ? () => undefined : (stryCov_9fa48("636"), m => builds(m, start))))) {
      if (stryMutAct_9fa48("637")) {
        {}
      } else {
        stryCov_9fa48("637");
        const w = worked(t);
        if (stryMutAct_9fa48("639") ? false : stryMutAct_9fa48("638") ? true : (stryCov_9fa48("638", "639"), w)) if (stryMutAct_9fa48("640")) {
          ;
        } else {
          stryCov_9fa48("640");
          firstFound.push(w);
        }
      }
    }
    const ranked = stryMutAct_9fa48("641") ? firstFound : (stryCov_9fa48("641"), firstFound.sort(order));
    const first = stryMutAct_9fa48("642") ? ranked : (stryCov_9fa48("642"), ranked.slice(0, MOST_FIRST));
    const cutFirst = stryMutAct_9fa48("643") ? ranked.map(f => f.target.name) : (stryCov_9fa48("643"), ranked.slice(MOST_FIRST).map(stryMutAct_9fa48("644") ? () => undefined : (stryCov_9fa48("644"), f => f.target.name)));
    const firstMetrics = first.map(stryMutAct_9fa48("645") ? () => undefined : (stryCov_9fa48("645"), f => f.target));

    // Each Metric that may have moved with the first step is fitted on the changed Metric and the first-step Metrics nearer to it, the ones that cannot be told
    // from chance left out and the fit made again. Which of two Metrics that moved with the changed one is upstream is not known: the one whose link to it is
    // closer is read as nearer (ties by Metric id), so a Metric is only ever fitted on those nearer than it and never on one that is fitted on it. A Metric
    // is only fitted on those whose own link has the changed Metric alone as its driver ("pure"), so that no change runs more than two steps.
    const pure: Metric[] = stryMutAct_9fa48("646") ? ["Stryker was here"] : (stryCov_9fa48("646"), []);
    const linkFor = (t: Metric): Found | null => {
      if (stryMutAct_9fa48("647")) {
        {}
      } else {
        stryCov_9fa48("647");
        const chain = stryMutAct_9fa48("648") ? [start, ...pure] : (stryCov_9fa48("648"), (stryMutAct_9fa48("649") ? [] : (stryCov_9fa48("649"), [start, ...pure])).filter(stryMutAct_9fa48("650") ? () => undefined : (stryCov_9fa48("650"), m => stryMutAct_9fa48("653") ? m.id !== t.id || !builds(m, t) : stryMutAct_9fa48("652") ? false : stryMutAct_9fa48("651") ? true : (stryCov_9fa48("651", "652", "653"), (stryMutAct_9fa48("655") ? m.id === t.id : stryMutAct_9fa48("654") ? true : (stryCov_9fa48("654", "655"), m.id !== t.id)) && (stryMutAct_9fa48("656") ? builds(m, t) : (stryCov_9fa48("656"), !builds(m, t)))))));
        if (stryMutAct_9fa48("659") ? chain.every(m => builds(t, m)) : stryMutAct_9fa48("658") ? false : stryMutAct_9fa48("657") ? true : (stryCov_9fa48("657", "658", "659"), chain.some(stryMutAct_9fa48("660") ? () => undefined : (stryCov_9fa48("660"), m => builds(t, m))))) return worked(t);
        const drivers = stryMutAct_9fa48("661") ? [] : (stryCov_9fa48("661"), [start, ...closest(t, stryMutAct_9fa48("662") ? chain : (stryCov_9fa48("662"), chain.filter(stryMutAct_9fa48("663") ? () => undefined : (stryCov_9fa48("663"), m => stryMutAct_9fa48("666") ? m.id === start.id : stryMutAct_9fa48("665") ? false : stryMutAct_9fa48("664") ? true : (stryCov_9fa48("664", "665", "666"), m.id !== start.id)))), 2)]);
        let f = fitOn(t, drivers);
        const clear = f.ok ? stryMutAct_9fa48("667") ? f.drivers.map(d => d.name) : (stryCov_9fa48("667"), f.drivers.filter(stryMutAct_9fa48("668") ? () => undefined : (stryCov_9fa48("668"), d => stryMutAct_9fa48("671") ? d.strength === "cant-tell" : stryMutAct_9fa48("670") ? false : stryMutAct_9fa48("669") ? true : (stryCov_9fa48("669", "670", "671"), d.strength !== (stryMutAct_9fa48("672") ? "" : (stryCov_9fa48("672"), "cant-tell"))))).map(stryMutAct_9fa48("673") ? () => undefined : (stryCov_9fa48("673"), d => d.name))) : stryMutAct_9fa48("674") ? ["Stryker was here"] : (stryCov_9fa48("674"), []);
        // A driver that cannot be told from chance is left out and the fit made again, so that the one that matters is not hidden by it.
        if (stryMutAct_9fa48("677") ? f.ok && clear.length > 0 || clear.length < f.drivers.length : stryMutAct_9fa48("676") ? false : stryMutAct_9fa48("675") ? true : (stryCov_9fa48("675", "676", "677"), (stryMutAct_9fa48("679") ? f.ok || clear.length > 0 : stryMutAct_9fa48("678") ? true : (stryCov_9fa48("678", "679"), f.ok && (stryMutAct_9fa48("682") ? clear.length <= 0 : stryMutAct_9fa48("681") ? clear.length >= 0 : stryMutAct_9fa48("680") ? true : (stryCov_9fa48("680", "681", "682"), clear.length > 0)))) && (stryMutAct_9fa48("685") ? clear.length >= f.drivers.length : stryMutAct_9fa48("684") ? clear.length <= f.drivers.length : stryMutAct_9fa48("683") ? true : (stryCov_9fa48("683", "684", "685"), clear.length < f.drivers.length)))) f = fitOn(t, stryMutAct_9fa48("686") ? drivers : (stryCov_9fa48("686"), drivers.filter(stryMutAct_9fa48("687") ? () => undefined : (stryCov_9fa48("687"), m => clear.includes(m.name)))));
        return (stryMutAct_9fa48("690") ? f.ok || f.drivers.some(d => d.strength !== "cant-tell") : stryMutAct_9fa48("689") ? false : stryMutAct_9fa48("688") ? true : (stryCov_9fa48("688", "689", "690"), f.ok && (stryMutAct_9fa48("691") ? f.drivers.every(d => d.strength !== "cant-tell") : (stryCov_9fa48("691"), f.drivers.some(stryMutAct_9fa48("692") ? () => undefined : (stryCov_9fa48("692"), d => stryMutAct_9fa48("695") ? d.strength === "cant-tell" : stryMutAct_9fa48("694") ? false : stryMutAct_9fa48("693") ? true : (stryCov_9fa48("693", "694", "695"), d.strength !== (stryMutAct_9fa48("696") ? "" : (stryCov_9fa48("696"), "cant-tell"))))))))) ? estimated(t, f) : null;
      }
    };
    const isInFirst = new Set(first.map(stryMutAct_9fa48("697") ? () => undefined : (stryCov_9fa48("697"), f => f.target.id)));
    const pool2 = stryMutAct_9fa48("698") ? [] : (stryCov_9fa48("698"), [...new Map((stryMutAct_9fa48("699") ? [] : (stryCov_9fa48("699"), [...firstMetrics, ...firstMetrics.flatMap(stryMutAct_9fa48("700") ? () => undefined : (stryCov_9fa48("700"), b => closest(b, stryMutAct_9fa48("701") ? pool : (stryCov_9fa48("701"), pool.filter(stryMutAct_9fa48("702") ? () => undefined : (stryCov_9fa48("702"), m => stryMutAct_9fa48("705") ? !isInFirst.has(m.id) || !builds(m, start) : stryMutAct_9fa48("704") ? false : stryMutAct_9fa48("703") ? true : (stryCov_9fa48("703", "704", "705"), (stryMutAct_9fa48("706") ? isInFirst.has(m.id) : (stryCov_9fa48("706"), !isInFirst.has(m.id))) && (stryMutAct_9fa48("707") ? builds(m, start) : (stryCov_9fa48("707"), !builds(m, start))))))), MOST_PER_STEP)))])).map(stryMutAct_9fa48("708") ? () => undefined : (stryCov_9fa48("708"), m => stryMutAct_9fa48("709") ? [] : (stryCov_9fa48("709"), [m.id, m])))).values()]);
    const links: Found[] = stryMutAct_9fa48("710") ? ["Stryker was here"] : (stryCov_9fa48("710"), []);
    for (const t of pool2) {
      if (stryMutAct_9fa48("711")) {
        {}
      } else {
        stryCov_9fa48("711");
        const l = linkFor(t);
        // A first-step Metric keeps its own pair link where no better one is found.
        const mine = stryMutAct_9fa48("712") ? l && first.find(f => f.target.id === t.id) : (stryCov_9fa48("712"), l ?? first.find(stryMutAct_9fa48("713") ? () => undefined : (stryCov_9fa48("713"), f => stryMutAct_9fa48("716") ? f.target.id !== t.id : stryMutAct_9fa48("715") ? false : stryMutAct_9fa48("714") ? true : (stryCov_9fa48("714", "715", "716"), f.target.id === t.id))));
        if (stryMutAct_9fa48("719") ? false : stryMutAct_9fa48("718") ? true : stryMutAct_9fa48("717") ? mine : (stryCov_9fa48("717", "718", "719"), !mine)) continue;
        if (stryMutAct_9fa48("720")) {
          ;
        } else {
          stryCov_9fa48("720");
          links.push(mine);
        }
        if (stryMutAct_9fa48("723") ? isInFirst.has(t.id) && mine.fit !== null || mine.fit.drivers.every(d => d.name === start.name) : stryMutAct_9fa48("722") ? false : stryMutAct_9fa48("721") ? true : (stryCov_9fa48("721", "722", "723"), (stryMutAct_9fa48("725") ? isInFirst.has(t.id) || mine.fit !== null : stryMutAct_9fa48("724") ? true : (stryCov_9fa48("724", "725"), isInFirst.has(t.id) && (stryMutAct_9fa48("727") ? mine.fit === null : stryMutAct_9fa48("726") ? true : (stryCov_9fa48("726", "727"), mine.fit !== null)))) && (stryMutAct_9fa48("728") ? mine.fit.drivers.some(d => d.name === start.name) : (stryCov_9fa48("728"), mine.fit.drivers.every(stryMutAct_9fa48("729") ? () => undefined : (stryCov_9fa48("729"), d => stryMutAct_9fa48("732") ? d.name !== start.name : stryMutAct_9fa48("731") ? false : stryMutAct_9fa48("730") ? true : (stryCov_9fa48("730", "731", "732"), d.name === start.name))))))) if (stryMutAct_9fa48("733")) {
          ;
        } else {
          stryCov_9fa48("733");
          pure.push(t);
        }
      }
    }
    const [sure, more] = stryMutAct_9fa48("734") ? [] : (stryCov_9fa48("734"), [stryMutAct_9fa48("735") ? links : (stryCov_9fa48("735"), links.filter(stryMutAct_9fa48("736") ? () => undefined : (stryCov_9fa48("736"), f => isInFirst.has(f.target.id)))), stryMutAct_9fa48("738") ? links.sort(order) : stryMutAct_9fa48("737") ? links.filter(f => !isInFirst.has(f.target.id)) : (stryCov_9fa48("737", "738"), links.filter(stryMutAct_9fa48("739") ? () => undefined : (stryCov_9fa48("739"), f => stryMutAct_9fa48("740") ? isInFirst.has(f.target.id) : (stryCov_9fa48("740"), !isInFirst.has(f.target.id)))).sort(order))]);
    const room = stryMutAct_9fa48("741") ? Math.min(0, MOST_METRICS - 1 - sure.length) : (stryCov_9fa48("741"), Math.max(0, stryMutAct_9fa48("742") ? MOST_METRICS - 1 + sure.length : (stryCov_9fa48("742"), (stryMutAct_9fa48("743") ? MOST_METRICS + 1 : (stryCov_9fa48("743"), MOST_METRICS - 1)) - sure.length)));
    let found = stryMutAct_9fa48("744") ? [] : (stryCov_9fa48("744"), [...sure, ...(stryMutAct_9fa48("745") ? more : (stryCov_9fa48("745"), more.slice(0, room)))]);
    const dropped = stryMutAct_9fa48("746") ? more.map(f => f.target.name) : (stryCov_9fa48("746"), more.slice(room).map(stryMutAct_9fa48("747") ? () => undefined : (stryCov_9fa48("747"), f => f.target.name)));
    // The link of a Metric that is too far is left out, until the rest can be followed (the links made here never drive each other).
    const gone: string[] = stryMutAct_9fa48("748") ? ["Stryker was here"] : (stryCov_9fa48("748"), []);
    for (let p = planOf(start.name, found.map(stryMutAct_9fa48("749") ? () => undefined : (stryCov_9fa48("749"), f => f.link))); stryMutAct_9fa48("751") ? found.length > 0 && "case" in p || p.case === "refuse-what-if-deep" : stryMutAct_9fa48("750") ? false : (stryCov_9fa48("750", "751"), (stryMutAct_9fa48("753") ? found.length > 0 || "case" in p : stryMutAct_9fa48("752") ? true : (stryCov_9fa48("752", "753"), (stryMutAct_9fa48("756") ? found.length <= 0 : stryMutAct_9fa48("755") ? found.length >= 0 : stryMutAct_9fa48("754") ? true : (stryCov_9fa48("754", "755", "756"), found.length > 0)) && (stryMutAct_9fa48("757") ? "" : (stryCov_9fa48("757"), "case")) in p)) && (stryMutAct_9fa48("759") ? p.case !== "refuse-what-if-deep" : stryMutAct_9fa48("758") ? true : (stryCov_9fa48("758", "759"), p.case === (stryMutAct_9fa48("760") ? "" : (stryCov_9fa48("760"), "refuse-what-if-deep"))))); p = planOf(start.name, found.map(stryMutAct_9fa48("761") ? () => undefined : (stryCov_9fa48("761"), f => f.link)))) {
      if (stryMutAct_9fa48("762")) {
        {}
      } else {
        stryCov_9fa48("762");
        const drop = found.find(stryMutAct_9fa48("763") ? () => undefined : (stryCov_9fa48("763"), f => stryMutAct_9fa48("766") ? f.target.name !== p.slots.name : stryMutAct_9fa48("765") ? false : stryMutAct_9fa48("764") ? true : (stryCov_9fa48("764", "765", "766"), f.target.name === p.slots.name)))!;
        if (stryMutAct_9fa48("767")) {
          ;
        } else {
          stryCov_9fa48("767");
          gone.push(drop.target.name);
        }
        found = stryMutAct_9fa48("768") ? found : (stryCov_9fa48("768"), found.filter(stryMutAct_9fa48("769") ? () => undefined : (stryCov_9fa48("769"), f => stryMutAct_9fa48("772") ? f === drop : stryMutAct_9fa48("771") ? false : stryMutAct_9fa48("770") ? true : (stryCov_9fa48("770", "771", "772"), f !== drop))));
      }
    }
    // A note for each kind of Metric left out, naming them; none where none was.
    const note = stryMutAct_9fa48("773") ? () => undefined : (stryCov_9fa48("773"), (() => {
      const note = (names: string[], key: CaseKey, slots: Slots = {}): string[] => (stryMutAct_9fa48("777") ? names.length <= 0 : stryMutAct_9fa48("776") ? names.length >= 0 : stryMutAct_9fa48("775") ? false : stryMutAct_9fa48("774") ? true : (stryCov_9fa48("774", "775", "776", "777"), names.length > 0)) ? stryMutAct_9fa48("778") ? [] : (stryCov_9fa48("778"), [text(key, opts.ctx, stryMutAct_9fa48("779") ? {} : (stryCov_9fa48("779"), {
        ...slots,
        names: listOf(stryMutAct_9fa48("780") ? [...names] : (stryCov_9fa48("780"), (stryMutAct_9fa48("781") ? [] : (stryCov_9fa48("781"), [...names])).sort()), opts.ctx)
      }))]) : stryMutAct_9fa48("782") ? ["Stryker was here"] : (stryCov_9fa48("782"), []);
      return note;
    })());
    const notes = stryMutAct_9fa48("783") ? [] : (stryCov_9fa48("783"), [...note(stryMutAct_9fa48("784") ? [] : (stryCov_9fa48("784"), [...left]), stryMutAct_9fa48("785") ? "" : (stryCov_9fa48("785"), "note-what-if-formula")), ...note(cutFirst, stryMutAct_9fa48("786") ? "" : (stryCov_9fa48("786"), "note-what-if-first"), stryMutAct_9fa48("787") ? {} : (stryCov_9fa48("787"), {
      n: MOST_FIRST,
      start: start.name
    })), ...note(dropped, stryMutAct_9fa48("788") ? "" : (stryCov_9fa48("788"), "note-what-if-left"), stryMutAct_9fa48("789") ? {} : (stryCov_9fa48("789"), {
      most: MOST_METRICS
    })), ...note(gone, stryMutAct_9fa48("790") ? "" : (stryCov_9fa48("790"), "note-what-if-deep"), stryMutAct_9fa48("791") ? {} : (stryCov_9fa48("791"), {
      most: MOST_STEPS
    })), ...((stryMutAct_9fa48("795") ? candidates1.length <= MOST_LOOKED_AT : stryMutAct_9fa48("794") ? candidates1.length >= MOST_LOOKED_AT : stryMutAct_9fa48("793") ? false : stryMutAct_9fa48("792") ? true : (stryCov_9fa48("792", "793", "794", "795"), candidates1.length > MOST_LOOKED_AT)) ? stryMutAct_9fa48("796") ? [] : (stryCov_9fa48("796"), [text(stryMutAct_9fa48("797") ? "" : (stryCov_9fa48("797"), "note-what-if-unlooked"), opts.ctx, stryMutAct_9fa48("798") ? {} : (stryCov_9fa48("798"), {
      n: stryMutAct_9fa48("799") ? candidates1.length + MOST_LOOKED_AT : (stryCov_9fa48("799"), candidates1.length - MOST_LOOKED_AT),
      most: MOST_LOOKED_AT,
      start: start.name
    }))]) : stryMutAct_9fa48("800") ? ["Stryker was here"] : (stryCov_9fa48("800"), []))]);
    const result = whatIf(stryMutAct_9fa48("801") ? {} : (stryCov_9fa48("801"), {
      start: stryMutAct_9fa48("802") ? {} : (stryCov_9fa48("802"), {
        name: start.name,
        latest
      }),
      change,
      links: found.map(stryMutAct_9fa48("803") ? () => undefined : (stryCov_9fa48("803"), f => f.link))
    }));
    const t = whatIfTakeaway(start, everyone, result, found.flatMap(stryMutAct_9fa48("804") ? () => undefined : (stryCov_9fa48("804"), f => f.fit ? stryMutAct_9fa48("805") ? [] : (stryCov_9fa48("805"), [f.fit]) : stryMutAct_9fa48("806") ? ["Stryker was here"] : (stryCov_9fa48("806"), []))), opts.ctx);
    // Which of two Metrics that move together comes first is read, not known: said wherever a Metric is reached through another.
    const chosen = (stryMutAct_9fa48("807") ? t.rows.every(r => r.kind !== "worked-out" && r.kind !== "refused") : (stryCov_9fa48("807"), t.rows.some(stryMutAct_9fa48("808") ? () => undefined : (stryCov_9fa48("808"), r => stryMutAct_9fa48("811") ? r.kind !== "worked-out" || r.kind !== "refused" : stryMutAct_9fa48("810") ? false : stryMutAct_9fa48("809") ? true : (stryCov_9fa48("809", "810", "811"), (stryMutAct_9fa48("813") ? r.kind === "worked-out" : stryMutAct_9fa48("812") ? true : (stryCov_9fa48("812", "813"), r.kind !== (stryMutAct_9fa48("814") ? "" : (stryCov_9fa48("814"), "worked-out")))) && (stryMutAct_9fa48("816") ? r.kind === "refused" : stryMutAct_9fa48("815") ? true : (stryCov_9fa48("815", "816"), r.kind !== (stryMutAct_9fa48("817") ? "" : (stryCov_9fa48("817"), "refused"))))))))) ? stryMutAct_9fa48("818") ? [] : (stryCov_9fa48("818"), [text(stryMutAct_9fa48("819") ? "" : (stryCov_9fa48("819"), "whatif-assumes-chosen"), opts.ctx)]) : stryMutAct_9fa48("820") ? ["Stryker was here"] : (stryCov_9fa48("820"), []);
    const read = (stryMutAct_9fa48("821") ? t.rows.every(r => r.through.length > 0) : (stryCov_9fa48("821"), t.rows.some(stryMutAct_9fa48("822") ? () => undefined : (stryCov_9fa48("822"), r => stryMutAct_9fa48("826") ? r.through.length <= 0 : stryMutAct_9fa48("825") ? r.through.length >= 0 : stryMutAct_9fa48("824") ? false : stryMutAct_9fa48("823") ? true : (stryCov_9fa48("823", "824", "825", "826"), r.through.length > 0))))) ? stryMutAct_9fa48("827") ? [] : (stryCov_9fa48("827"), [text(stryMutAct_9fa48("828") ? "" : (stryCov_9fa48("828"), "whatif-assumes-order"), opts.ctx, stryMutAct_9fa48("829") ? {} : (stryCov_9fa48("829"), {
      start: start.name
    }))]) : stryMutAct_9fa48("830") ? ["Stryker was here"] : (stryCov_9fa48("830"), []);
    return stryMutAct_9fa48("831") ? {} : (stryCov_9fa48("831"), {
      ...t,
      assumptions: stryMutAct_9fa48("832") ? [] : (stryCov_9fa48("832"), [...t.assumptions, ...chosen, ...read]),
      notes: stryMutAct_9fa48("833") ? [] : (stryCov_9fa48("833"), [...notes, ...t.notes])
    });
  }
}