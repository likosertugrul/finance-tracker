/**
 * Piyasa veri sağlayıcısı port'u (pipeline'ın kalbi).
 *
 * Bu arayüz, somut sağlayıcılardan (Finnhub, Binance, Polygon, mock...) bağımsızdır.
 * Sağlayıcı değişimi = `packages/data/market` altında bu arayüzü implemente eden yeni
 * bir adapter eklemek. `core` hiçbir sağlayıcıyı tanımaz.
 *
 * Semboller burada UYGULAMA sembolüdür (Asset.symbol, örn 'BTC'); adapter, gerekirse
 * `Asset.providerSymbol` üzerinden sağlayıcıya özel formata çevirir.
 */

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Range {
  /** Dahil — başlangıç zamanı. */
  readonly from: Date;
  /** Dahil — bitiş zamanı (varsayılan: şimdi). */
  readonly to?: Date;
}

/** Anlık fiyat kotasyonu. Fiyatlar string (Decimal'e güvenli dönüşüm için). */
export interface Quote {
  readonly symbol: string;
  readonly price: string;
  readonly at: Date;
}

/** OHLC mum verisi. */
export interface Candle {
  readonly symbol: string;
  readonly interval: Interval;
  readonly openTime: Date;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

/** Canlı fiyat tick'i (WebSocket akışı). */
export interface Tick {
  readonly symbol: string;
  readonly price: string;
  readonly at: Date;
}

/** Akış aboneliğini sonlandırır. */
export type Unsubscribe = () => void;

export interface MarketDataProvider {
  /** Tek bir enstrümanın anlık fiyatı. */
  getQuote(symbol: string): Promise<Quote>;

  /** Grafik için geçmiş OHLC mumları. */
  getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]>;

  /**
   * Canlı tick akışına abone olur (genelde WebSocket). Dönen fonksiyon aboneliği kapatır.
   * Sağlayıcı doğrudan WS desteklemiyorsa adapter polling ile aynı sözleşmeyi sağlayabilir.
   */
  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe;
}
