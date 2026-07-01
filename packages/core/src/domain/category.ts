import type { CashflowType } from "./transaction.js";

/**
 * Gelir/gider kategorisi. `userId === null` → sistem (varsayılan) kategorisi (herkese açık);
 * dolu ise kullanıcıya ait. `type` kategorinin gelir mi gider mi olduğunu belirler.
 */
export interface Category {
  readonly id: string;
  readonly userId: string | null;
  readonly name: string;
  readonly type: CashflowType;
  readonly icon: string | null;
  readonly color: string | null;
  readonly parentId: string | null;
}
