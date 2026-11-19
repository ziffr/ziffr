// ESLint for @ziffr/mcp: TypeScript rules plus the documentation standard (docs/guides/documentation.md):
// every module starts with a header comment, every export has a doc comment.
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { codeHealth } from "../../eslint.code-health.mjs";

/** Every module starts with a comment saying what it is for and which glossary term it implements. */
const moduleHeader = {
  meta: { type: "suggestion", messages: { missing: "Start the module with a header comment: what it is for, and its GLOSSARY term." } },
  create(context) {
    return {
      Program(node) {
        const first = node.body[0];
        if (!first) return;
        const before = context.sourceCode.getCommentsBefore(first);
        if (before.length === 0) context.report({ node: first, messageId: "missing" });
      },
    };
  },
};

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/test/**"],
    plugins: { jsdoc, ziffr: { rules: { "module-header": moduleHeader } } },
    rules: {
      "ziffr/module-header": "error",
      "jsdoc/require-jsdoc": ["error", {
        publicOnly: true,
        require: { FunctionDeclaration: true, ArrowFunctionExpression: true, FunctionExpression: true },
        contexts: ["TSTypeAliasDeclaration", "TSInterfaceDeclaration", "ExportNamedDeclaration > VariableDeclaration"],
      }],
    },
  },
  codeHealth,
);
