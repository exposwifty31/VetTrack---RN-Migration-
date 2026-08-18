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
      // Sibling agent checkouts (jest already ignores <rootDir>/.claude/ via
      // modulePathIgnorePatterns; eslint needs its own entry — surfaced when
      // the @clerk/clerk-expo -> @clerk/expo swap made a sibling worktree's
      // imports unresolvable in THIS tree's node_modules).
      ".claude/*",
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
  {
    // scripts/ runs in Node, not in the app runtime. eslint-config-expo supplies
    // the React Native globals, which do not include CommonJS's __dirname /
    // __filename — `eslint . --max-warnings=0` reports them as no-undef in
    // scripts/release-config/*.js. Declared here rather than with an
    // `/* eslint-env node */` comment, which flat config no longer honors (it
    // warns today and becomes an error in ESLint 10).
    // .js ONLY. `scripts/**/*.mjs` is ESM, where __dirname and __filename do
    // not exist — declaring them as globals there would let ESLint accept a
    // reference that throws ReferenceError at run time. The one .mjs that wants
    // __dirname (vendor-vettrack.mjs) derives it from import.meta.url itself.
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: { __dirname: "readonly", __filename: "readonly" },
    },
  },
  {
    // react-hooks/immutability (a React Compiler rule) treats all values as
    // immutable, but a Reanimated shared value — `useSharedValue().value = withSpring(...)`
    // — is a legitimately-mutable external store; `.value =` is its documented API
    // (in worklets AND in JS callbacks). The rule can't model that and false-positives
    // on every animation. Off project-wide for that specific reason (not a blanket
    // disable of react-hooks — the other hooks rules stay on).
    rules: { "react-hooks/immutability": "off" },
  },
]);
