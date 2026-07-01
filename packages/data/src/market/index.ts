import type { MarketDataProvider } from "@finance/core";
import { MockMarketDataProvider } from "./mock-provider.js";
import { BinanceProvider } from "./binance-provider.js";
import { CoinbaseProvider } from "./coinbase-provider.js";

export { MockMarketDataProvider } from "./mock-provider.js";
export { BinanceProvider } from "./binance-provider.js";
export { CoinbaseProvider, type CoinbaseProduct } from "./coinbase-provider.js";
export { FinnhubProvider, type FinnhubSymbol } from "./finnhub-provider.js";
export { FxRatesProvider } from "./fx-provider.js";
export { RoutingMarketDataProvider } from "./routing-provider.js";

export type ProviderName = "mock" | "binance" | "coinbase";

/**
 * Sağlayıcı factory'si — provider-agnostic seçim noktası.
 * Uygulamalar yalnızca bunu çağırır; somut sağlayıcı env/config ile belirlenir.
 * Yeni sağlayıcı (Finnhub vb.) eklemek = burada bir case.
 */
export function createMarketDataProvider(
  name: string | undefined,
  opts?: { tickIntervalMs?: number },
): MarketDataProvider {
  switch (name) {
    case "coinbase":
      return new CoinbaseProvider();
    case "binance":
      return new BinanceProvider();
    case "mock":
    default:
      return new MockMarketDataProvider(opts);
  }
}
