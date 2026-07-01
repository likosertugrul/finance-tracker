import type { Decimal } from "./decimal.js";

/**
 * Türetilmiş pozisyon (envanter). Veritabanında ayrı tablo değildir —
 * `holdings_view` (DB) veya `computeHoldings` (core) tarafından `Trade`'lerden üretilir.
 */
export interface Holding {
  readonly assetId: string;
  /** Net adet = Σ buy − Σ sell. */
  readonly netQuantity: Decimal;
  /** Açık pozisyonun ağırlıklı ortalama maliyeti (birim başına). */
  readonly avgCost: Decimal;
}
