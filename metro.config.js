const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { withTsJsResolver } = require("./metro.resolve-ts-js");

const projectRoot = __dirname;
const vendorVettrack = path.resolve(projectRoot, ".vendor/vettrack");

let config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), vendorVettrack];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  ...(config.resolver.nodeModulesPaths ?? []),
];

// Apply .js→.ts before Uniwind so withUniwindConfig stays the outermost wrapper.
config = withTsJsResolver(config);

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
