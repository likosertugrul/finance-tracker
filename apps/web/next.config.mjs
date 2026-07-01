/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo paketleri TS kaynağı olarak gelir → Next derlesin.
  transpilePackages: ["@finance/core", "@finance/data", "@finance/ui"],
  webpack: (config) => {
    // ".js" uzantılı importların ".ts" kaynağına çözülmesi (NodeNext stili kaynak).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
