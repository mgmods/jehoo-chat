const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.resolve(workspaceRoot, "packages/shared")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Keep Expo/Metro's default package-export resolution. Disabling package
// exports can make Metro emit an undefined module ID for LiveKit's stream
// polyfills under Hermes.
module.exports = config;
