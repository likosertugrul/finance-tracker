import type { Decimal } from "./decimal.js";

/** DB enum `trade_side` ile birebir. */
export type TradeSide = "buy" | "sell";

/**
 * Varlık alım-satım (envanter / lot) kaydı. Portföy pozisyonlarının tek kaynağıdır;
 * anlık pozisyon bu kayıtlardan TÜRETİLİR (bkz. computeHoldings usecase).
 */
export interface Trade {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string | null;
  readonly assetId: string;
  readonly side: TradeSide;
  /** Enstrüman adedi (pozitif). */
  readonly quantity: Decimal;
  /** Birim fiyat (asset.quoteCurrency cinsinden). */
  readonly price: Decimal;
  /** Komisyon (asset.quoteCurrency cinsinden). */
  readonly fee: Decimal;
  readonly tradedAt: Date;
  readonly note: string | null;
}
