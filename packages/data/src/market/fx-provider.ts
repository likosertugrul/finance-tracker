import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

const FX_API = "https://open.er-api.com/v6/latest/USD";

/**
 * Döviz (FX) sağlayıcısı — bir para biriminin USD cinsinden değerini verir (ANAHTARSIZ).
 * open.er-api.com USD bazlı kurları döndürür (currency-per-USD); USD-per-currency = 1/kur.
 * Örn: 1 EUR = 1 / rates.EUR USD.
 *
 * Geçmiş mum yoktur (getCandles boş). subscribe hafif poller'dır (FX yavaş değişir).
 */
export class FxRatesProvider implements MarketDataProvider {
  private ratesPromise: Promise<Record<string, number>> | null = null;

  private fetchRates(): Promise<Record<string, number>> {
    if (!this.ratesPromise) {
      this.ratesPromise = fetch(FX_API)
        .then((r) => r.json())
        .then((j: { rates?: Record<string, number> }) => j.rates ?? {})
        .catch(() => ({}));
    }
    return this.ratesPromise;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const s = symbol.toUpperCase();
    if (s === "USD") return { symbol, price: "1", at: new Date() };
    const rates = await this.fetchRates();
    const rate = rates[s];
    if (!rate || rate <= 0) throw new Error(`FX kuru bulunamadı: ${s}`);
    const usdPerUnit = 1 / rate;
    return { symbol, price: String(usdPerUnit), at: new Date() };
  }

  async getCandles(_symbol: string, _interval: Interval, _range: Range): Promise<Candle[]> {
    return []; // FX için geçmiş mum sağlanmıyor
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    let stopped = false;
    const poll = async () => {
      for (const s of symbols) {
        try {
          const q = await this.getQuote(s);
          if (!stopped) onTick(q);
        } catch {
          /* kur yoksa atla */
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 60_000); // 60 sn'de bir güncelle
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }
}
