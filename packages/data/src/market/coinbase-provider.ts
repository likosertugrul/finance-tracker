import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

const REST = "https://api.exchange.coinbase.com";
const WS = "wss://ws-feed.exchange.coinbase.com";

// Coinbase granularity saniye cinsindendir; 4h yerine en yakın 6h (21600) kullanılır.
const GRANULARITY: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 21600,
  "1d": 86400,
};

/**
 * Coinbase Exchange gerçek piyasa veri sağlayıcısı (kripto, ANAHTARSIZ).
 * MarketDataProvider'ı implemente eder → mock/binance ile tak-çıkar.
 * Binance'in coğrafi kısıtlı olduğu bölgelerde (ör. TR) erişilebilir alternatiftir.
 *
 * Sembol eşlemesi: 'BTC' → 'BTC-USD'. Coinbase fiyatları USD; portföy FX'i USDT≈USD
 * kabul ettiğinden uyumlu.
 */
/** Katalog araması için hafif coin kaydı. */
export interface CoinbaseProduct {
  symbol: string; // base currency, örn 'BTC'
  name: string;
  quoteCurrency: string; // 'USD'
  providerSymbol: string; // 'BTC-USD'
}

export class CoinbaseProvider implements MarketDataProvider {
  constructor(private readonly quote: string = "USD") {}

  /**
   * USD ile işlem gören aktif coin ürünlerini getirir (katalog araması için).
   * Sağlayıcıya özel — MarketDataProvider port'unun parçası değildir.
   */
  static async listUsdProducts(): Promise<CoinbaseProduct[]> {
    const res = await fetch(`${REST}/products`);
    if (!res.ok) throw new Error(`Coinbase products hatası: ${res.status}`);
    const rows = (await res.json()) as Array<{
      id: string;
      base_currency: string;
      quote_currency: string;
      status: string;
      trading_disabled?: boolean;
    }>;
    return rows
      .filter((r) => r.quote_currency === "USD" && r.status === "online" && !r.trading_disabled)
      .map((r) => ({
        symbol: r.base_currency,
        name: r.base_currency,
        quoteCurrency: "USD",
        providerSymbol: r.id,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  private product(symbol: string): string {
    const s = symbol.toUpperCase();
    return s.includes("-") ? s : `${s}-${this.quote}`;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const p = this.product(symbol);
    const res = await fetch(`${REST}/products/${p}/ticker`);
    if (!res.ok) throw new Error(`Coinbase quote hatası (${p}): ${res.status}`);
    const j = (await res.json()) as { price: string; time: string };
    return { symbol, price: j.price, at: new Date(j.time) };
  }

  async getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    const p = this.product(symbol);
    const params = new URLSearchParams({
      granularity: String(GRANULARITY[interval]),
      start: range.from.toISOString(),
      end: (range.to ?? new Date()).toISOString(),
    });
    const res = await fetch(`${REST}/products/${p}/candles?${params}`);
    if (!res.ok) throw new Error(`Coinbase candles hatası (${p}): ${res.status}`);
    // Coinbase dizisi: [time(s), low, high, open, close, volume], yeni→eski sırada.
    const rows = (await res.json()) as number[][];
    return rows
      .slice()
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)) // eskiden yeniye
      .map((r) => ({
        symbol,
        interval,
        openTime: new Date((r[0] ?? 0) * 1000),
        low: String(r[1] ?? 0),
        high: String(r[2] ?? 0),
        open: String(r[3] ?? 0),
        close: String(r[4] ?? 0),
        volume: String(r[5] ?? 0),
      }));
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    const products = symbols.map((s) => this.product(s));
    const productToSymbol = new Map(products.map((p, i) => [p, symbols[i]!]));

    const ws = new WebSocket(WS);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", product_ids: products, channels: ["ticker"] }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
          type?: string;
          product_id?: string;
          price?: string;
          time?: string;
        };
        if (msg.type !== "ticker" || !msg.product_id || !msg.price) return;
        const symbol = productToSymbol.get(msg.product_id) ?? msg.product_id.split("-")[0]!;
        onTick({ symbol, price: msg.price, at: msg.time ? new Date(msg.time) : new Date() });
      } catch {
        // bozuk mesajı yoksay
      }
    };

    return () => ws.close();
  }
}
