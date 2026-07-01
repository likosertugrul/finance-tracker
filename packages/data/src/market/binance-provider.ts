import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

const REST = "https://api.binance.com";
const WS = "wss://stream.binance.com:9443/stream";

// Uygulama interval'ları Binance ile birebir aynı; yine de açık eşleme tutuyoruz.
const INTERVALS: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

/**
 * Binance gerçek piyasa veri sağlayıcısı (kripto, ANAHTARSIZ).
 * MarketDataProvider'ı implemente eder → mock yerine tak-çıkar.
 *
 * Sembol eşlemesi: uygulama sembolü ('BTC') → Binance çifti ('BTCUSDT').
 * Varsayılan quote 'USDT'. Binance'te olmayan semboller (hisseler) sessizce atlanır.
 *
 * Çalışma ortamı: tarayıcı ve React Native (global WebSocket/fetch mevcut).
 * Node tarafı (Edge ingestion) ayrı ele alınır.
 */
export class BinanceProvider implements MarketDataProvider {
  constructor(private readonly quote: string = "USDT") {}

  private pair(symbol: string): string {
    const s = symbol.toUpperCase();
    return s.endsWith(this.quote) ? s : s + this.quote;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const pair = this.pair(symbol);
    const res = await fetch(`${REST}/api/v3/ticker/price?symbol=${pair}`);
    if (!res.ok) throw new Error(`Binance quote hatası (${pair}): ${res.status}`);
    const json = (await res.json()) as { price: string };
    return { symbol, price: json.price, at: new Date() };
  }

  async getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    const pair = this.pair(symbol);
    const params = new URLSearchParams({
      symbol: pair,
      interval: INTERVALS[interval],
      startTime: String(range.from.getTime()),
      endTime: String((range.to ?? new Date()).getTime()),
      limit: "1000",
    });
    const res = await fetch(`${REST}/api/v3/klines?${params}`);
    if (!res.ok) throw new Error(`Binance klines hatası (${pair}): ${res.status}`);
    // Binance kline dizisi: [openTime, open, high, low, close, volume, ...]
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => ({
      symbol,
      interval,
      openTime: new Date(r[0] as number),
      open: r[1] as string,
      high: r[2] as string,
      low: r[3] as string,
      close: r[4] as string,
      volume: r[5] as string,
    }));
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    // Combined stream: <pair>@trade kanalları (küçük harf)
    const streams = symbols.map((s) => `${this.pair(s).toLowerCase()}@trade`).join("/");
    const pairToSymbol = new Map(symbols.map((s) => [this.pair(s), s]));

    const ws = new WebSocket(`${WS}?streams=${streams}`);
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
          data?: { s?: string; p?: string; T?: number };
        };
        const d = msg.data;
        if (!d?.s || !d.p) return;
        const symbol = pairToSymbol.get(d.s) ?? d.s.replace(this.quote, "");
        onTick({ symbol, price: d.p, at: new Date(d.T ?? Date.now()) });
      } catch {
        // bozuk mesajı yoksay
      }
    };

    return () => ws.close();
  }
}
