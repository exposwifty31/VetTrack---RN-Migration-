/**
 * Babel — G2 delight-stack de-risk (created 2026-08-04).
 * Repo had NO babel.config.js until now (Uniwind is Babel-free). Reanimated 4
 * requires its worklets Babel plugin, which MUST be the LAST entry in `plugins`.
 * React Compiler is deliberately deferred — if ever added it must be listed
 * FIRST, and it would add a second unproven variable to this bisect.
 * @babel/core is 7.29.7 here (not the Babel-8 main source in ~/Downloads).
 */
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
