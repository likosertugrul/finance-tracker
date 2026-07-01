import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
  AssetClass,
} from "@finance/core";

/**
 * Sembolün varlık sınıfına göre doğru sağlayıcıya yönlendiren bileşik sağlayıcı.
 * Örn: kripto → Coinbase, hisse → Finnhub. Sınıfı bilinmeyen sembol fallback'e gider.
 *
 * Uygulama, sembol→sınıf eşlemesini (assets'ten) `classOf` ile sağlar; böylece tek bir
 * MarketDataProvider arayüzü arkasında birden çok kaynak şeffaf biçimde kullanılır.
 */
export class RoutingMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly classOf: (symbol: string) => AssetClass | undefined,
    private readonly providers: Partial<Record<AssetClass, MarketDataProvider>>,
    private readonly fallback: MarketDataProvider,
  ) {}

  private pick(symbol: string): MarketDataProvider {
    const cls = this.classOf(symbol);
    return (cls && this.providers[cls]) || this.fallback;
  }

  getQuote(symbol: string): Promise<Quote> {
    return this.pick(symbol).getQuote(symbol);
  }

  getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    return this.pick(symbol).getCandles(symbol, interval, range);
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    // Sembolleri sağlayıcıya göre grupla, her gruba tek subscribe çağır.
    const groups = new Map<MarketDataProvider, string[]>();
    for (const s of symbols) {
      const p = this.pick(s);
      const arr = groups.get(p) ?? [];
      arr.push(s);
      groups.set(p, arr);
    }
    const unsubs = [...groups.entries()].map(([p, syms]) => p.subscribe(syms, onTick));
    return () => unsubs.forEach((u) => u());
  }
}
