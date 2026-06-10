// Minimal lint: the point is `no-undef` — it statically catches identifiers
// that lost their import during the routes extraction (those would otherwise
// only blow up at request time). Style rules are intentionally absent.
import globals from "globals";

export default [
  {
    files: ["src/**/*.js", "tests/**/*.js", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
    },
  },
];
