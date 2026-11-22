// The static rules of the Extension Kit (GLOSSARY: Extension Kit), run on the TypeScript syntax tree, never on text
// patterns: only the allowed imports; no forbidden identifier; no property reached by a string; no `any`; no
// assignment to anything outside the function; and no word in the Takeaway wording that a person should never read.
// They are a first line, not a security boundary: the person who reads every line of an Extension is the boundary
// (spec 0042). Where a rule cannot decide (a string kept in a variable and used as a key is followed only for
// constants), it refuses rather than allows.
import ts from "typescript";

/** The name of the reason a rule refuses an Extension. Each bad Extension is refused for exactly one. */
export type RuleName =
  | "syntax"
  | "import-not-allowed"
  | "clock"
  | "random"
  | "ambient-global"
  | "network"
  | "dynamic-code"
  | "timer"
  | "string-access"
  | "reach-by-property"
  | "any-type"
  | "outside-assignment"
  | "locale"
  | "this-keyword"
  | "module-state"
  | "forbidden-word";

/** One thing a rule found: its reason, the line (1-based) and what is wrong, in plain words. */
export type RuleProblem = { rule: RuleName; line: number; message: string };

/** The only modules an Extension may import. */
export const ALLOWED_IMPORTS = ["@ziffr/extension-kit", "@ziffr/figures"] as const;

const IDENTIFIERS: Record<string, RuleName> = {
  Date: "clock",
  performance: "clock",
  crypto: "random",
  Intl: "locale",
  process: "ambient-global",
  globalThis: "ambient-global",
  window: "ambient-global",
  document: "ambient-global",
  fetch: "network",
  XMLHttpRequest: "network",
  eval: "dynamic-code",
  Function: "dynamic-code",
  require: "dynamic-code",
  setTimeout: "timer",
  setInterval: "timer",
  setImmediate: "timer",
};
/** The only names an Extension may use that it did not declare or import: everything else global is refused (an allowlist,
 * since a denylist always misses something). `Math` may be used only as `Math.name` and never `Math.random`, `Object` only as
 * `Object.keys`, `values`, `entries`, `freeze` and `fromEntries`. The rest are type names the compiler provides. */
export const ALLOWED_GLOBALS: ReadonlySet<string> = new Set([
  "Math", "Number", "String", "Boolean", "Array", "JSON", "Map", "Set", "BigInt", "Infinity", "NaN", "undefined", "isFinite", "isNaN",
  "parseFloat", "parseInt", "Symbol", "Error", "RangeError", "TypeError",
  "ReadonlyArray", "ReadonlyMap", "ReadonlySet", "Record", "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude", "Extract", "NonNullable",
  "ReturnType", "Parameters", "Awaited", "ArrayLike", "Iterable", "Iterator", "IterableIterator", "Generator", "PropertyKey", "const",
]);
const OBJECT_MEMBERS = new Set(["keys", "values", "entries", "freeze", "fromEntries"]);
/** Methods whose result depends on the machine's language settings, which would make a number or a sort order differ between machines. */
const LOCALE_METHODS = new Set(["localeCompare", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toLocaleUpperCase", "toLocaleLowerCase"]);
/** Methods that change the value they are called on. */
const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "add", "delete", "clear"]);
/** Files that hold code that runs: a variable at the top of these that can change is state shared between calls. */
const CODE_FILES = new Set(["method.ts", "mark.ts", "reference.ts"]);
/** Property names that reach the `Function` constructor or the prototype chain from any value. */
const REACHING = new Set(["constructor", "prototype", "__proto__"]);
/** The words a Takeaway never says (spec 0041): cause, because, significant, p-value, regression, R², coefficient, confidence. */
const WORDS = /(?<![\p{L}\p{N}])(?:caus(?:e|es|ed|ing|al|ality)|because|significan(?:t|tly|ce)|p[- ]?values?|regression|r[- ]?squared|coefficients?|confidence)(?![\p{L}\p{N}])|R²/iu;

const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken, ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** One function's own names: its parameters and everything it declares (not those of functions inside it). */
type Scope = { params: Set<string>; locals: Set<string> };

const isFunction = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

/** Every name a binding (a name or a destructuring pattern) declares. */
function bindingNames(b: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(b)) into.add(b.text);
  else for (const e of b.elements) if (!ts.isOmittedExpression(e)) bindingNames(e.name, into);
}

/** The names `fn` declares itself: parameters, and variables, functions, classes and catch variables in its body. */
function scopeOf(fn: ts.FunctionLikeDeclaration): Scope {
  const s: Scope = { params: new Set(), locals: new Set() };
  for (const p of fn.parameters) bindingNames(p.name, s.params);
  if (ts.isFunctionExpression(fn) && fn.name) s.locals.add(fn.name.text);
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n)) bindingNames(n.name, s.locals);
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) s.locals.add(n.name.text);
    if (isFunction(n)) return;
    ts.forEachChild(n, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return s;
}

/** Whether an expression builds a text out of pieces (a literal, a template, or `+` with one in it). */
function textBuilt(e: ts.Expression, texts: Set<string>): boolean {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) return textBuilt(e.expression, texts);
  if (ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)) return true;
  if (ts.isIdentifier(e)) return texts.has(e.text);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) return textBuilt(e.left, texts) || textBuilt(e.right, texts);
  return false;
}

/** The identifier at the root of an assignment target, and whether the target is that name alone. */
function rootOf(e: ts.Expression): { name: string | null; direct: boolean } {
  let cur: ts.Expression = e;
  let direct = true;
  for (;;) {
    if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur) || ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
    else if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      cur = cur.expression;
      direct = false;
    } else break;
  }
  return { name: ts.isIdentifier(cur) ? cur.text : cur.kind === ts.SyntaxKind.ThisKeyword ? "this" : null, direct };
}

/** Records every name the file declares itself: variables, parameters, functions, classes, types, type parameters and imports. */
function declaredNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) bindingNames(n.name, names);
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassExpression(n)) && n.name && ts.isIdentifier(n.name)) names.add(n.name.text);
    else if (ts.isTypeParameterDeclaration(n) || ts.isImportSpecifier(n) || ts.isNamespaceImport(n) || ts.isImportEqualsDeclaration(n)) names.add(n.name.text);
    else if (ts.isImportClause(n) && n.name) names.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** Whether a top-level `const`'s value cannot change: a plain value, a function, `as const`, `Object.freeze(…)` or a readonly type. */
function fixedValue(d: ts.VariableDeclaration): boolean {
  const t = d.type;
  if (t && ((ts.isTypeOperatorNode(t) && t.operator === ts.SyntaxKind.ReadonlyKeyword) || (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && /^Readonly/.test(t.typeName.text)))) return true;
  let e = d.initializer;
  while (e && (ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e))) e = e.expression;
  if (!e) return false;
  if (ts.isAsExpression(e) && ts.isTypeReferenceNode(e.type) && e.type.typeName.getText() === "const") return true;
  if (ts.isPrefixUnaryExpression(e)) return ts.isNumericLiteral(e.operand);
  if (ts.isCallExpression(e)) return ts.isPropertyAccessExpression(e.expression) && e.expression.getText() === "Object.freeze";
  return ts.isNumericLiteral(e) || ts.isStringLiteralLike(e) || ts.isBigIntLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword
    || ts.isArrowFunction(e) || ts.isFunctionExpression(e) || ts.isIdentifier(e) || ts.isPropertyAccessExpression(e);
}

/** Every name a destructuring assignment target writes to, as expressions. */
function targetsOf(e: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(e)) return targetsOf(e.expression);
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((x) => (ts.isSpreadElement(x) ? targetsOf(x.expression) : ts.isOmittedExpression(x) ? [] : targetsOf(x)));
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.flatMap((p) => {
      if (ts.isShorthandPropertyAssignment(p)) return [p.name];
      if (ts.isPropertyAssignment(p)) return targetsOf(p.initializer);
      if (ts.isSpreadAssignment(p)) return targetsOf(p.expression);
      return [];
    });
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) return targetsOf(e.left);
  return [e];
}

/** Whether an identifier only names something (a label, the new name in `export { a as b }`) and refers to no variable. */
function isNotReference(n: ts.Identifier): boolean {
  const p = n.parent;
  if ((ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) && p.label === n) return true;
  if (ts.isImportTypeNode(p) && p.qualifier === n) return true;
  if (ts.isImportSpecifier(p) && p.propertyName === n) return true;
  if (ts.isMetaProperty(p) && p.name === n) return true;
  if (ts.isExportSpecifier(p) && p.parent.parent.moduleSpecifier !== undefined) return true;
  return ts.isExportSpecifier(p) && p.propertyName !== undefined && p.name === n;
}

/** Whether `n` is a property's name rather than a reference to a variable (`row.fetch`, `{ fetch: 1 }`, `{ fetch() {} }`). */
function isPropertyName(n: ts.Identifier): boolean {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isEnumMember(p)) && p.name === n) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  return false;
}

/** Runs the rules on one TypeScript file's text; `wording` also holds the file to the words a Takeaway never says, and `code`
 * (the default for method.ts, mark.ts and reference.ts) to having no variable at the top of the file that can change. */
export function checkRules(file: string, text: string, options: { wording?: boolean; code?: boolean } = {}): RuleProblem[] {
  const out: RuleProblem[] = [];
  const code = options.code ?? CODE_FILES.has(file);
  const syntax = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } }).diagnostics ?? [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (rule: RuleName, n: ts.Node, message: string) => void out.push({ rule, line: lineOf(n), message });
  for (const d of syntax) {
    const line = d.start === undefined ? 1 : sf.getLineAndCharacterOfPosition(d.start).line + 1;
    out.push({ rule: "syntax", line, message: ts.flattenDiagnosticMessageText(d.messageText, "\n") });
  }
  if (syntax.length) return out;

  // Constants that hold a built text: a key made of them is a string used as a property name.
  const texts = new Set<string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && textBuilt(n.initializer, texts)) texts.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const declared = declaredNames(sf);
  if (code) {
    for (const s of sf.statements) {
      if (!ts.isVariableStatement(s)) continue;
      const isConst = (s.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const d of s.declarationList.declarations) {
        if (!isConst) add("module-state", d, "is a variable at the top of the file that can change: state shared between calls. Use const.");
        else if (!fixedValue(d)) add("module-state", d, "is a top-level value that can change (a list, object, Map or Set): write it `as const`, with a readonly type or in Object.freeze(…).");
      }
    }
  }

  const checkModule = (n: ts.Node, spec: ts.Expression | undefined): void => {
    const name = spec && ts.isStringLiteralLike(spec) ? spec.text : null;
    if (name === null || !(ALLOWED_IMPORTS as readonly string[]).includes(name)) {
      add("import-not-allowed", n, `imports ${name === null ? "something that is not a fixed name" : `“${name}”`}; an Extension may import only ${ALLOWED_IMPORTS.map((m) => `“${m}”`).join(" and ")}.`);
    }
  };

  const walk = (n: ts.Node, scopes: Scope[]): void => {
    if (ts.isImportDeclaration(n)) checkModule(n, n.moduleSpecifier);
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier) checkModule(n, n.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) checkModule(n, n.moduleReference.expression);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) add("dynamic-code", n, "calls import(…): an Extension loads nothing at run time.");
    else if (ts.isImportTypeNode(n)) add("dynamic-code", n, "uses an import(…) type: an Extension loads nothing at run time.");
    else if (ts.isMetaProperty(n) && n.keywordToken === ts.SyntaxKind.ImportKeyword) add("dynamic-code", n, "reads import.meta: an Extension knows nothing about where it runs.");

    if (n.kind === ts.SyntaxKind.AnyKeyword) add("any-type", n, "uses the type any: write the type.");

    if (n.kind === ts.SyntaxKind.ThisKeyword || n.kind === ts.SyntaxKind.ThisType || (ts.isIdentifier(n) && n.text === "this")) add("this-keyword", n, "uses this: what a value is depends on how it is called. Write a function over its arguments.");
    else if (ts.isIdentifier(n) && !isPropertyName(n)) {
      const rule = Object.prototype.hasOwnProperty.call(IDENTIFIERS, n.text) ? IDENTIFIERS[n.text] : undefined;
      if (rule) add(rule, n, `uses “${n.text}”, which an Extension may not.`);
      else if (!declared.has(n.text) && !ALLOWED_GLOBALS.has(n.text) && !isNotReference(n)) {
        const p = n.parent;
        if (n.text !== "Object" || !(ts.isPropertyAccessExpression(p) && p.expression === n && OBJECT_MEMBERS.has(p.name.text))) add("ambient-global", n, `uses “${n.text}”, which is neither declared in the file nor on the short list of what an Extension may use.`);
      }
      // Math is allowed except its random numbers, so it must be used as Math.name and never handed around or taken apart.
      if (n.text === "Math") {
        const p = n.parent;
        const direct = ts.isPropertyAccessExpression(p) && p.expression === n && p.name.text !== "random";
        if (!direct && !(ts.isElementAccessExpression(p) && p.expression === n)) add("random", n, "uses Math other than as Math.name, and Math.random is not allowed.");
      }
    }
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (ts.isIdentifier(n.expression) && n.expression.text === "Math" && name === "random") add("random", n, "uses Math.random: an Extension is deterministic.");
      if (REACHING.has(name)) add("reach-by-property", n, `reaches “${name}”, which leads to the Function constructor or the prototype chain.`);
      if (LOCALE_METHODS.has(name)) add("locale", n, `uses ${name}, whose result depends on the machine's language settings.`);
    }
    if (ts.isElementAccessExpression(n)) {
      const a = n.argumentExpression;
      const onMath = ts.isIdentifier(n.expression) && n.expression.text === "Math";
      if (onMath || textBuilt(a, texts)) add("string-access", n, "reaches a property by a string: write the name after a dot.");
    }

    const find = (name: string | null): "local" | "param" | null => {
      let found: "local" | "param" | null = null;
      for (let i = scopes.length - 1; i >= 0 && !found; i--) found = scopes[i].locals.has(name ?? "") ? "local" : scopes[i].params.has(name ?? "") ? "param" : null;
      return found;
    };
    // A call that changes what it is called on, when that is the input or something outside the function.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && MUTATORS.has(n.expression.name.text)) {
      const { name } = rootOf(n.expression.expression);
      if (name !== null && name !== "this" && find(name) !== "local") add("outside-assignment", n, `calls ${n.expression.name.text} on “${name}”, which changes it; it is not a variable of the function (copy it first).`);
    }
    const target = (e: ts.Expression): void => {
      for (const t of targetsOf(e)) {
        const { name, direct } = rootOf(t);
        const found = find(name);
        if (name === "this") continue;
        if (name === null) add("outside-assignment", t, "assigns to something that is not a variable of the function.");
        // A name declared nowhere in the file is reported once, as a global that is not on the list.
        else if (found === null && !declared.has(name)) continue;
        else if (found === null) add("outside-assignment", t, `assigns to “${name}”, which is not declared inside the function.`);
        else if (found === "param" && !direct) add("outside-assignment", t, `changes what “${name}” holds, which the caller handed in: an Extension never changes its input.`);
      }
    };
    if (ts.isBinaryExpression(n) && ASSIGNMENTS.has(n.operatorToken.kind)) target(n.left);
    else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) target(n.operand);
    else if (ts.isDeleteExpression(n)) target(n.expression);
    else if ((ts.isForInStatement(n) || ts.isForOfStatement(n)) && !ts.isVariableDeclarationList(n.initializer)) target(n.initializer);

    if (options.wording && (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))) {
      const m = WORDS.exec(n.text);
      if (m) add("forbidden-word", n, `says “${m[0]}”, which a Takeaway never says.`);
    }

    if (isFunction(n)) {
      const inner = [...scopes, scopeOf(n)];
      ts.forEachChild(n, (c) => walk(c, inner));
    } else ts.forEachChild(n, (c) => walk(c, scopes));
  };
  walk(sf, []);
  return out.sort((a, b) => a.line - b.line);
}
