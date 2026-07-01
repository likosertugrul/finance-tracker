import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      incrementalCache: async () => (await import("@opennextjs/cloudflare")).KVCache,
      tagCache: async () => (await import("@opennextjs/cloudflare")).DOTagCache,
      queue: async () => (await import("@opennextjs/cloudflare")).DOQueueHandler,
    },
  },
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: async () => (await import("@opennextjs/cloudflare")).fetchProxyRequest,
    },
  },
};

export default config;
