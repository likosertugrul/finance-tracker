// Monorepo Metro yapılandırması.
// 1) workspace kökünü izle + node_modules yollarını ekle (paylaşılan paketler için).
// 2) ".js" uzantılı kaynak importlarını uzantısız çözerek Metro'nun platforma duyarlı
//    (.native.tsx / .tsx / .ts) çözümlemesini koru — paketlerimiz NodeNext stili
//    ".js" importları kullanıyor, kaynak ise .ts/.tsx.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (moduleName.startsWith("./") || moduleName.startsWith("../")) &&
    moduleName.endsWith(".js")
  ) {
    // ".js" -> uzantısız; Metro platforma duyarlı uzantıları (.native.tsx, .tsx, .ts) dener
    const stripped = moduleName.replace(/\.js$/, "");
    return context.resolveRequest(context, stripped, platform);
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
