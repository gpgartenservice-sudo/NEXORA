// Metro (Bundler) – Expo-Standard mit einer Ausnahme:
// pdf-lib nutzt "tslib". Dessen ESM-Wrapper funktioniert im Web-Build von
// Metro nicht ("Cannot destructure property '__extends'"). Deshalb wird
// tslib direkt auf die fertige ES-Version umgeleitet.
const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

/** Nächstgelegene tslib-Kopie (pdf-lib bringt eine eigene, ältere Version mit). */
function findTslibEs6(fromFile) {
  let dir = path.dirname(fromFile);
  while (true) {
    const candidate = path.join(dir, 'node_modules', 'tslib', 'tslib.es6.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    const filePath = findTslibEs6(context.originModulePath);
    if (filePath) return { type: 'sourceFile', filePath };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
