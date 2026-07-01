import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Sembol bazlı belirlenimci başlangıç fiyatı (test tekrar üretilebilirliği için). */
function basePrice(symbol: string): number {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return 10 + (h % 50000) / 10; // ~10 .. 5010
}

function fmt(n: number): string {
  return n.toFixed(8).replace(/\.?0+$/, "");
}

/**
 * Gerçek sağlayıcı (Finnhub/Binance/Polygon) seçilene kadar kullanılan sahte sağlayıcı.
 * Rastgele yürüyüş (random walk) ile sentetik mum ve canlı tick üretir.
 * Pipeline'ın A (canlı tick) ve B (geçmiş OHLC) akışlarını uçtan uca test etmeyi sağlar.
 *
 * `MarketDataProvider` arayüzünü implemente eder → gerçek sağlayıcıyla yer değiştirmek
 * yalnızca bu adapter'ı değiştirmektir; `core` ve UI değişmez.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly opts: {
      /** Tick yayınlama aralığı (ms). */
      tickIntervalMs?: number;
      /** Rastgele yürüyüş için zamanlayıcı enjeksiyonu (test için). */
      now?: () => number;
    } = {},
  ) {}

  async getQuote(symbol: string): Promise<Quote> {
    return { symbol, price: fmt(basePrice(symbol)), at: new Date() };
  }

  async getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    const step = INTERVAL_MS[interval];
    const to = (range.to ?? new Date()).getTime();
    const from = range.from.getTime();
    const candles: Candle[] = [];
    let price = basePrice(symbol);

    for (let t = from; t <= to; t += step) {
      const open = price;
      const drift = (pseudoRandom(symbol, t) - 0.5) * open * 0.02; // ±%2
      const close = Math.max(0.01, open + drift);
      const high = Math.max(open, close) * (1 + pseudoRandom(symbol, t + 1) * 0.01);
      const low = Math.min(open, close) * (1 - pseudoRandom(symbol, t + 2) * 0.01);
      const volume = 100 + pseudoRandom(symbol, t + 3) * 900;
      candles.push({
        symbol,
        interval,
        openTime: new Date(t),
        open: fmt(open),
        high: fmt(high),
        low: fmt(low),
        close: fmt(close),
        volume: fmt(volume),
      });
      price = close;
    }
    return candles;
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    const prices = new Map(symbols.map((s) => [s, basePrice(s)]));
    const now = this.opts.now ?? (() => Date.now());
    const timer = setInterval(() => {
      for (const s of symbols) {
        const prev = prices.get(s)!;
        const next = Math.max(0.01, prev + (Math.random() - 0.5) * prev * 0.005);
        prices.set(s, next);
        onTick({ symbol: s, price: fmt(next), at: new Date(now()) });
      }
    }, this.opts.tickIntervalMs ?? 1000);

    return () => clearInterval(timer);
  }
}

/** Belirlenimci [0,1) — aynı (symbol, t) için aynı değer. */
function pseudoRandom(symbol: string, t: number): number {
  let h = t >>> 0;
  for (const ch of symbol) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h % 1_000_000) / 1_000_000;
}
