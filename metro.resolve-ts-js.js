/**
 * R5: NodeNext `.js` specifiers in @vettrack/shared point at `.ts` sources.
 * Vite strips the extension; Metro resolves literally — retry with .ts/.tsx.
 */
function withTsJsResolver(config) {
  const upstream = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve =
      upstream ??
      ((ctx, name, plat) => ctx.resolveRequest(ctx, name, plat));

    try {
      return resolve(context, moduleName, platform);
    } catch (firstError) {
      if (typeof moduleName === "string" && moduleName.endsWith(".js")) {
        for (const ext of [".ts", ".tsx"]) {
          const retryName = `${moduleName.slice(0, -".js".length)}${ext}`;
          try {
            return resolve(context, retryName, platform);
          } catch {
            // try next extension
          }
        }
      }
      throw firstError;
    }
  };

  return config;
}

module.exports = { withTsJsResolver };
