import type { Currency } from "./money.js";
import type { Decimal } from "./decimal.js";

/** DB enum `cashflow_type` ile birebir. */
export type CashflowType = "income" | "expense";

/**
 * Gelir/gider nakit akışı kaydı. `amount` her zaman pozitiftir; yön `type`'tan gelir.
 * Varlık alım-satımı buraya DEĞİL `Trade`'e yazılır.
 */
export interface Transaction {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly type: CashflowType;
  /** Daima pozitif. */
  readonly amount: Decimal;
  readonly currency: Currency;
  readonly occurredAt: Date;
  readonly note: string | null;
}
