import type { Currency } from "./money.js";

/** DB enum `asset_class` ile birebir. */
export type AssetClass = "stock" | "crypto" | "etf" | "fx" | "cash" | "fund";

/**
 * Alınıp satılabilen enstrüman (sembol metadata). Paylaşımlı referans veridir —
 * kullanıcıya değil global kataloğa aittir.
 */
export interface Asset {
  readonly id: string;
  readonly symbol: string; // 'AAPL', 'BTC'
  readonly name: string;
  readonly assetClass: AssetClass;
  /** Fiyatın kote edildiği para birimi (örn BTC için 'USDT'). */
  readonly quoteCurrency: Currency;
  /** Piyasa veri sağlayıcısına özel sembol/ID (provider-agnostic eşleme). */
  readonly providerSymbol: string | null;
  /** Görüntüleme/yuvarlama için ondalık basamak sayısı. */
  readonly precision: number;
  readonly isActive: boolean;
}
