import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

const REST = "https://finnhub.io/api/v1";
const WS = "wss://ws.finnhub.io";

/**
 * Finnhub sağlayıcısı — ABD hisseleri için canlı fiyat (ANAHTAR gerekir).
 * MarketDataProvider'ı implemente eder.
 *
 * Ücretsiz katman: /quote (anlık fiyat) ve WebSocket trade akışı çalışır.
 * Geçmiş mum (/stock/candle) ücretsiz katmanda kısıtlıdır → getCandles boş döner
 * (hisse grafiği boş kalır; fiyat ve portföy değeri çalışmaya devam eder).
 *
 * Not: API anahtarı bu kurulumda istemci tarafındadır (NEXT_PUBLIC_*). Üretimde
 * bir Edge Function proxy'si arkasına alınmalıdır.
 */
/** Hisse arama sonucu. */
export interface FinnhubSymbol {
  symbol: string;
  description: string;
}

export class FinnhubProvider implements MarketDataProvider {
  constructor(private readonly apiKey: string) {}

  /**
   * Sembol/isim ile hisse arama (ücretsiz katman destekler).
   * Sağlayıcıya özel — MarketDataProvider port'unun parçası değil.
   */
  static async search(query: string, apiKey: string): Promise<FinnhubSymbol[]> {
    const res = await fetch(
      `${REST}/search?q=${encodeURIComponent(query)}&token=${apiKey}`,
    );
    if (!res.ok) throw new Error(`Finnhub arama hatası: ${res.status}`);
    const j = (await res.json()) as {
      result?: Array<{ symbol: string; description: string; type?: string }>;
    };
    return (j.result ?? [])
      // Birincil ABD sembolleri (nokta içermeyen) — yabancı/duplike kayıtları ele
      .filter((r) => r.symbol && !r.symbol.includes("."))
      .slice(0, 20)
      .map((r) => ({ symbol: r.symbol, description: r.description }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const res = await fetch(`${REST}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`);
    if (!res.ok) throw new Error(`Finnhub quote hatası (${symbol}): ${res.status}`);
    const j = (await res.json()) as { c?: number; t?: number };
    if (typeof j.c !== "number" || j.c === 0) throw new Error(`Finnhub fiyatı yok (${symbol})`);
    return { symbol, price: String(j.c), at: new Date((j.t ?? Date.now() / 1000) * 1000) };
  }

  async getCandles(_symbol: string, _interval: Interval, _range: Range): Promise<Candle[]> {
    // Ücretsiz katman geçmiş mum vermez → boş (grafik boş kalır, hata yok).
    return [];
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    const ws = new WebSocket(`${WS}?token=${this.apiKey}`);
    ws.onopen = () => {
      for (const s of symbols) ws.send(JSON.stringify({ type: "subscribe", symbol: s }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
          type?: string;
          data?: Array<{ s: string; p: number; t: number }>;
        };
        if (m.type !== "trade" || !m.data) return;
        for (const t of m.data) {
          onTick({ symbol: t.s, price: String(t.p), at: new Date(t.t) });
        }
      } catch {
        // bozuk mesajı yoksay
      }
    };
    return () => {
      try {
        for (const s of symbols) ws.send(JSON.stringify({ type: "unsubscribe", symbol: s }));
      } catch {
        /* bağlantı zaten kapalıysa yoksay */
      }
      ws.close();
    };
  }
}
