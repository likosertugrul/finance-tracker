import type {
  MarketDataProvider,
  Quote,
  Candle,
  Tick,
  Interval,
  Range,
  Unsubscribe,
} from "@finance/core";

async function fget(params: string): Promise<unknown> {
  const r = await fetch(`/api/fonoloji?${params}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Fonoloji hatası (${r.status})${t ? ": " + t.slice(0, 120) : ""}`);
  }
  return r.json();
}

export interface FonSymbol {
  code: string;
  name: string;
}

function pick<T>(obj: unknown, keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k] as T;
  return undefined;
}

function toArray(j: unknown): Record<string, unknown>[] {
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  const inner = pick<unknown>(j, ["points", "results", "funds", "data", "items", "history", "prices"]);
  return Array.isArray(inner) ? (inner as Record<string, unknown>[]) : [];
}

/** range.days → Fonoloji period kodu */
function periodFor(days: number): string {
  if (days <= 8) return "1w";
  if (days <= 35) return "1m";
  if (days <= 100) return "3m";
  if (days <= 200) return "6m";
  return "1y";
}

/**
 * Fonoloji sağlayıcısı (web) — TR yatırım fonları, NAV/geçmiş/arama (ANAHTAR proxy'de).
 * Fiyatlar TL; değerleme TRY→USD çevirir. Same-origin /api/fonoloji proxy'si üzerinden.
 * Yanıt anahtarları esnek ayrıştırılır (API şeması ufak değişse de dayanıklı).
 */
export class FonolojiProvider implements MarketDataProvider {
  static async search(query: string): Promise<FonSymbol[]> {
    const j = await fget(`endpoint=search&q=${encodeURIComponent(query)}`);
    return toArray(j)
      .map((r) => ({
        code: String(pick<string>(r, ["code", "fonkod", "symbol", "kod"]) ?? "").toUpperCase(),
        name: String(pick<string>(r, ["name", "fonunvan", "title", "unvan"]) ?? ""),
      }))
      .filter((r) => r.code)
      .slice(0, 25);
  }

  static async lookupQuote(code: string): Promise<{ price: string; currency: string }> {
    const j = await fget(`endpoint=fund&code=${encodeURIComponent(code)}`);
    const fund = pick<Record<string, unknown>>(j, ["fund"]) ?? (j as Record<string, unknown>);
    const price = pick<number>(fund, ["current_price", "price", "nav", "fiyat", "last_price"]);
    if (typeof price !== "number") throw new Error(`Fonoloji NAV bulunamadı: ${code}`);
    return { price: String(price), currency: "TRY" };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const { price } = await FonolojiProvider.lookupQuote(symbol);
    return { symbol, price, at: new Date() };
  }

  async getCandles(symbol: string, interval: Interval, range: Range): Promise<Candle[]> {
    const days = ((range.to ?? new Date()).getTime() - range.from.getTime()) / 86_400_000;
    const j = await fget(
      `endpoint=history&code=${encodeURIComponent(symbol)}&period=${periodFor(days)}`,
    );
    const rows = toArray(j);
    const out: Candle[] = [];
    for (const r of rows) {
      const dateRaw = pick<string | number>(r, ["date", "tarih", "time"]);
      const priceRaw = pick<number | string>(r, ["price", "value", "nav", "fiyat", "close"]);
      if (dateRaw == null || priceRaw == null) continue;
      const t = typeof dateRaw === "number" ? new Date(dateRaw) : new Date(dateRaw);
      const p = String(priceRaw);
      out.push({ symbol, interval, openTime: t, open: p, high: p, low: p, close: p, volume: "0" });
    }
    out.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    return out;
  }

  subscribe(symbols: string[], onTick: (tick: Tick) => void): Unsubscribe {
    // Fon NAV'ı günlük güncellenir — seyrek poll yeterli (5 dk).
    let stopped = false;
    const poll = async () => {
      for (const s of symbols) {
        try {
          const q = await this.getQuote(s);
          if (!stopped) onTick(q);
        } catch {
          /* yoksa atla */
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 300_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }
}
