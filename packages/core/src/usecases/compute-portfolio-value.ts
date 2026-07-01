import { Decimal } from "../domain/decimal.js";
import { Money } from "../domain/money.js";
import type { Currency } from "../domain/money.js";
import type { Holding } from "../domain/holding.js";

/** Bir varlığın anlık fiyatı + kote para birimi. */
export interface PriceQuote {
  readonly price: Decimal;
  readonly currency: Currency;
}

/**
 * FX dönüşüm fonksiyonu: bir Money'yi hedef para birimine çevirir.
 * Sağlayıcıdan/oranlardan beslenir; tüm pozisyonlar farklı kote para birimlerinde
 * olabileceğinden portföy değeri tek bir taban para biriminde toplanır.
 */
export type FxConverter = (amount: Money, target: Currency) => Money;

export interface PortfolioBreakdownItem {
  readonly assetId: string;
  readonly quantity: Decimal;
  readonly value: Money; // taban para biriminde
}

export interface PortfolioValue {
  readonly total: Money;
  readonly breakdown: PortfolioBreakdownItem[];
}

/**
 * Anlık portföy değerini hesaplar: Σ (pozisyon adedi × güncel fiyat), taban para
 * birimine çevrilerek. Saf fonksiyon — UI, ağ veya Supabase'e bağımlı değildir.
 * Akış A (canlı tick) ve `portfolio-snapshot` Edge Function'ı bu mantığı paylaşır.
 *
 * @param holdings   türetilmiş pozisyonlar (computeHoldings veya holdings_view)
 * @param prices     assetId → güncel fiyat kotasyonu
 * @param baseCurrency raporlama para birimi (profiles.base_currency)
 * @param fx         para birimi dönüşümü; kote == taban ise kimlik fonksiyon yeterli
 */
export function computePortfolioValue(
  holdings: readonly Holding[],
  prices: ReadonlyMap<string, PriceQuote>,
  baseCurrency: Currency,
  fx: FxConverter = identityFx,
): PortfolioValue {
  let total = Money.zero(baseCurrency);
  const breakdown: PortfolioBreakdownItem[] = [];

  for (const h of holdings) {
    const quote = prices.get(h.assetId);
    if (!quote) continue; // fiyatı bilinmeyen pozisyon değerlemeye katılmaz

    const grossInQuote = Money.of(quote.price, quote.currency).scale(h.netQuantity);
    const value = fx(grossInQuote, baseCurrency);
    total = total.add(value);
    breakdown.push({ assetId: h.assetId, quantity: h.netQuantity, value });
  }

  return { total, breakdown };
}

/** Varsayılan FX: yalnızca para birimi zaten taban ise geçerlidir; değilse hata. */
function identityFx(amount: Money, target: Currency): Money {
  if (amount.currency !== target) {
    throw new Error(
      `FX dönüştürücü gerekli: ${amount.currency} → ${target}. ` +
        `computePortfolioValue çağrısına bir FxConverter geçin.`,
    );
  }
  return amount;
}
