import { Decimal } from "../domain/decimal.js";
import type { Trade } from "../domain/trade.js";
import type { Holding } from "../domain/holding.js";

/** Ortalama maliyet hesabında kullanılan ondalık hassasiyet. */
const COST_SCALE = 10;

/**
 * `Trade` kayıtlarından anlık pozisyonları (Holding) türetir — ağırlıklı ortalama
 * maliyet yöntemiyle. Bu, DB'deki `holdings_view` ile aynı mantığın saf TS karşılığıdır
 * (test ve istemci-tarafı türetim için).
 *
 * Kurallar:
 * - buy: net adet ve toplam maliyet (miktar×fiyat + komisyon) artar.
 * - sell: net adet azalır; toplam maliyet, satılan adedin ortalama maliyeti kadar düşer
 *   (ortalama maliyet yöntemi). Satış komisyonu maliyet tabanını değiştirmez.
 * - Net adedi sıfır olan pozisyonlar sonuçtan çıkarılır.
 *
 * Not: Kronolojik tutarlılık için trade'ler `tradedAt` artan sırada işlenir.
 */
export function computeHoldings(trades: readonly Trade[]): Holding[] {
  const byAsset = new Map<string, { qty: Decimal; cost: Decimal }>();

  const ordered = [...trades].sort((a, b) => a.tradedAt.getTime() - b.tradedAt.getTime());

  for (const t of ordered) {
    const acc = byAsset.get(t.assetId) ?? { qty: Decimal.ZERO, cost: Decimal.ZERO };

    if (t.side === "buy") {
      const gross = t.quantity.multiply(t.price).add(t.fee);
      acc.qty = acc.qty.add(t.quantity);
      acc.cost = acc.cost.add(gross);
    } else {
      const avgCost = acc.qty.isZero()
        ? Decimal.ZERO
        : acc.cost.divide(acc.qty, COST_SCALE);
      const costRemoved = avgCost.multiply(t.quantity);
      acc.qty = acc.qty.subtract(t.quantity);
      acc.cost = acc.cost.subtract(costRemoved);
    }

    byAsset.set(t.assetId, acc);
  }

  const holdings: Holding[] = [];
  for (const [assetId, { qty, cost }] of byAsset) {
    if (qty.isZero()) continue;
    holdings.push({
      assetId,
      netQuantity: qty,
      avgCost: cost.divide(qty, COST_SCALE),
    });
  }
  return holdings;
}
