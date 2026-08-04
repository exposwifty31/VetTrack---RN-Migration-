// ESLint flat config (ESLint 9). CommonJS — the repo has no "type":"module".
// eslint-config-expo/flat is the canonical Expo SDK-57 base config (an array of
// 13 flat blocks). On top of it we add two things: (1) ignore patterns for
// non-source paths, and (2) a scoped test-only rule override (both defined below).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    // .vendor is populated by vendor-vettrack (pre-install) and is not our code;
    // .worktrees may hold sibling checkouts; generated .d.ts are not lintable source.
    ignores: [
      "dist/*",
      ".vendor/*",
      ".worktrees/*",
      "node_modules/*",
      "**/*.d.ts",
      "babel.config.js",
    ],
  },
  {
    // Tests re-`require()` modules after mocking so a module that self-initializes
    // on import (e.g. the i18n config) re-inits fresh per case — a legitimate
    // jest module-reset pattern that a static import cannot express.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
