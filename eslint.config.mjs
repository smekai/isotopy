import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Every `no-restricted-syntax` block below must carry these: ESLint replaces a
// rule's options wholesale rather than merging them, so a block that redefines
// the rule silently drops whatever the base block banned.
//
// Only the single-property form is banned. Spreading a group —
// `...(cond ? { a, b } : {})` — is a different thing, and unrolling it would
// repeat the condition per field.
const NO_CONDITIONAL_SPREAD = ["consequent", "alternate"].map((empty) => ({
  selector: `SpreadElement > ConditionalExpression[${empty}.properties.length=0][${
    empty === "consequent" ? "alternate" : "consequent"
  }.properties.length=1]`,
  message:
    "exactOptionalPropertyTypes is off, so absent and undefined are the same state — assign the field directly ({ framing: x }) instead of spreading a conditional.",
}));

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      ".adhd/**",
      ".claude/**",
      "design/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
      "no-restricted-syntax": ["error", ...NO_CONDITIONAL_SPREAD],
    },
  },
  {
    files: ["packages/server/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...NO_CONDITIONAL_SPREAD,
        {
          selector:
            "CallExpression[typeArguments][callee.property.name='json']",
          message:
            "Validate request bodies with parseRequestBody and a runtime schema.",
        },
        {
          selector:
            "TSAsExpression > CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
          message:
            "Validate parsed JSON at its boundary instead of casting it.",
        },
      ],
    },
  },
  {
    files: ["packages/*/test/**/*.{ts,tsx}", "packages/ui/e2e/**/*.ts"],
    ignores: ["**/support/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...NO_CONDITIONAL_SPREAD,
        ...["IfStatement", "ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "TryStatement"].map(
          (statement) => ({
            selector: `CallExpression[callee.name=/^(test|it)$/] > ArrowFunctionExpression ${statement}`,
            message:
              "Move loops, polls and branching into test/support/ — a test body states what holds, not how to check it.",
          }),
        ),
      ],
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
