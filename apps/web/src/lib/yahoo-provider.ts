import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

// Uygulama interval → Yahoo interval (4h Yahoo'da yok → 60m)
const IV: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "60m",
  "1d": "1d",
};

async function yget(params: string): Promise<unknown> {
  const r = await fetch(`/api/yahoo?${params}`);
  if (!r.ok) throw new Error(`Yahoo proxy hatası: ${r.status}`);
  return r.json();
}

export interface YahooSymbol {
  symbol: string;
  name: string;
  exchange: string;
}

/**
 * Yahoo Finance sağlayıcısı (web) — TÜM borsalar (BIST .IS dahil), ANAHTARSIZ.
 * Same-origin /api/yahoo proxy'si üzerinden çalışır (CORS). Fiyat doğal para biriminde
 * gelir (BIST → TRY, ABD → USD); değerleme USD'ye çevirir.
 */
export class YahooFinanceProvider implements MarketDataProvider {
  /** Sembol/isim ile çok-borsalı hisse araması. */
  static async search(query: string): Promise<YahooSymbol[]> {
    const j = (await yget(`endpoint=search&q=${encodeURIComponent(query)}`)) as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; exchDisp?: string; quoteType?: string }>;
    };
    return (j.quotes ?? [])
      .filter((q) => q.quoteType === "EQUITY" && q.symbol)
      .slice(0, 20)
      .map((q) => ({
        symbol: q.symbol!,
        name: q.shortname || q.longname || q.symbol!,
        exchange: q.exchDisp || q.exchange || "",
      }));
  }

  /** Anlık fiyat + para birimi (varlık eklerken quoteCurrency'yi belirlemek için). */
  static async lookupQuote(symbol: string): Promise<{ price: string; currency: string }> {
    const j = (await yget(`endpoint=chart&symbol=${encodeURIComponent(symbol)}&range=1d&interval=1d`)) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }> };
    };
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") {
      throw new Error(`Yahoo fiyatı yok: ${symbol}`);
    }
    return { price: String(meta.regularMarketPrice), currency: meta.currency || "USD" };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const { price } = await YahooFinanceProvider.lookupQuote(symbol);
    return { symbol, price, at: new Date() };
  }

  async getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    const p1 = Math.floor(range.from.getTime() / 1000);
    const p2 = Math.floor((range.to ?? new Date()).getTime() / 1000);
    const j = (await yget(
      `endpoint=chart&symbol=${encodeURIComponent(symbol)}&interval=${IV[interval]}&period1=${p1}&period2=${p2}`,
    )) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
        }>;
      };
    };
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp) return [];
    const ts = res.timestamp;
    const q = res.indicators?.quote?.[0] ?? {};
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const c = q.close?.[i];
      if (o == null || c == null) continue; // boş aralıkları atla
      out.push({
        symbol,
        interval,
        openTime: new Date(ts[i]! * 1000),
        open: String(o),
        high: String(q.high?.[i] ?? o),
        low: String(q.low?.[i] ?? o),
        close: String(c),
        volume: String(q.volume?.[i] ?? 0),
      });
    }
    return out;
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    let stopped = false;
    const poll = async () => {
      for (const s of symbols) {
        try {
          const q = await this.getQuote(s);
          if (!stopped) onTick(q);
        } catch {
          /* fiyat yoksa atla */
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 20_000); // 20 sn'de bir
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }
}
