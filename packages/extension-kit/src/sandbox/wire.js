// How numbers, lists and answers cross between the checker and the process that runs an Extension (GLOSSARY: Extension Kit).
// JSON cannot carry NaN, Infinity or a minus zero, and an Extension must be shown them, so they travel tagged. Everything
// that comes back from an Extension is data of this shape and nothing else: no function, no class, no symbol.

const MAX_DEPTH = 24;
const MAX_NODES = 200_000;

/** Turns a value into plain JSON that keeps every number exactly; throws for anything that is not plain data. */
export function encode(value) {
  const budget = { nodes: 0 };
  const walk = (v, depth) => {
    if (depth > MAX_DEPTH) throw new Error("is nested more than 24 levels deep");
    if (++budget.nodes > MAX_NODES) throw new Error("is larger than 200,000 values");
    if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0) ? v : { "#": Object.is(v, -0) ? "-0" : String(v) };
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (v === undefined) return { "#": "undefined" };
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new Error("is not plain data (a class instance, a promise or a built-in object)");
      return { o: Object.keys(v).map((k) => [k, walk(v[k], depth + 1)]) };
    }
    throw new Error(`is a ${typeof v}, and only plain data may be returned`);
  };
  return walk(value, 0);
}

/** The inverse of `encode`; a shape it does not know becomes an error rather than a guess. */
export function decode(wire) {
  const walk = (w, depth) => {
    if (depth > MAX_DEPTH) throw new Error("too deep");
    if (w === null || typeof w === "string" || typeof w === "boolean" || typeof w === "number") return w;
    if (Array.isArray(w)) return w.map((x) => walk(x, depth + 1));
    if (typeof w === "object" && typeof w["#"] === "string") {
      const t = w["#"];
      if (t === "NaN") return NaN;
      if (t === "Infinity") return Infinity;
      if (t === "-Infinity") return -Infinity;
      if (t === "-0") return -0;
      if (t === "undefined") return undefined;
    }
    if (typeof w === "object" && Array.isArray(w.o)) return Object.fromEntries(w.o.map(([k, x]) => [k, walk(x, depth + 1)]));
    throw new Error("unknown shape");
  };
  return walk(wire, 0);
}

/** Whether a decoded answer is a refusal: an object with only a `refused` text. */
export function isRefusal(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.refused === "string";
}

/** Whether two decoded answers are equal: exactly, or numbers within a relative tolerance (0 means exactly). Refusals are equal whatever their words. */
export function same(a, b, relative = 0) {
  if (isRefusal(a) || isRefusal(b)) return isRefusal(a) && isRefusal(b);
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a === b) return true;
    return relative > 0 && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= relative * Math.max(Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i], relative));
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k], relative));
  }
  return a === b;
}
