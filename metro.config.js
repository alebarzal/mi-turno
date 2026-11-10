const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite en la web usa WebAssembly y necesita aislamiento de origen.
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

// El SDK de Anthropic tiene importaciones circulares en su versión ESM que Metro no
// tolera; se fuerza su versión CommonJS.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName === '@anthropic-ai/sdk' || moduleName.startsWith('@anthropic-ai/sdk/')) {
    return resolve({ ...context, unstable_conditionNames: ['require', 'default'] }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
