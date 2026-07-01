// Edge Function (Deno): piyasa veri ingestion worker'ı.
// Akış B: sağlayıcıdan kapanan OHLC mumlarını alır → price_candles'a IDEMPOTENT upsert
// (bileşik PK [asset_id, interval, open_time] çakışmasında günceller).
//
// Sağlayıcı henüz seçilmediğinden burada provider-agnostic bir `fetchCandles` arayüzü
// vardır; gerçek sağlayıcı (Finnhub/Binance/Polygon) seçilince yalnızca bu fonksiyon
// gerçek HTTP/WS çağrısıyla değiştirilir. Şu an deterministik sentetik veri üretir
// (core'daki MockMarketDataProvider ile aynı ruh).
//
// SERVICE ROLE anahtarı kullanır (price_candles'a yazma yalnız servis rolünde).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CandleRow {
  asset_id: string;
  interval: string;
  open_time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { interval = "1h" } = await safeBody(req);

  // 1. Aktif varlıkları al (sağlayıcı sembolleriyle birlikte)
  const { data: assets, error } = await db
    .from("assets")
    .select("id, symbol, provider_symbol")
    .eq("is_active", true);
  if (error) return json({ error: error.message }, 500);

  // 2. Her varlık için son mumları çek (provider-agnostic) ve upsert et
  let upserted = 0;
  for (const a of assets ?? []) {
    const candles = await fetchCandles(a.provider_symbol ?? a.symbol, interval, a.id);
    if (candles.length === 0) continue;
    // Bileşik PK çakışmasında güncelle → tekrar çalıştırma güvenli (idempotent)
    const { error: upErr } = await db
      .from("price_candles")
      .upsert(candles, { onConflict: "asset_id,interval,open_time" });
    if (upErr) return json({ error: upErr.message, asset: a.symbol }, 500);
    upserted += candles.length;
  }

  return json({ assets: assets?.length ?? 0, candles_upserted: upserted });
});

/**
 * Provider-agnostic mum getirme. GERÇEK SAĞLAYICI SEÇİLİNCE burası değişir:
 * örn. Binance: fetch(`https://api.binance.com/api/v3/klines?symbol=${providerSymbol}&interval=${interval}`)
 * Şimdilik son 24 saat için deterministik sentetik mum üretir.
 */
async function fetchCandles(
  providerSymbol: string,
  interval: string,
  assetId: string,
): Promise<CandleRow[]> {
  const stepMs = interval === "1d" ? 86_400_000 : 3_600_000;
  const now = Date.now();
  const rows: CandleRow[] = [];
  let price = basePrice(providerSymbol);
  for (let i = 24; i >= 0; i--) {
    const t = now - i * stepMs;
    const open = price;
    const close = Math.max(0.01, open + (pseudoRandom(providerSymbol, t) - 0.5) * open * 0.02);
    rows.push({
      asset_id: assetId,
      interval,
      open_time: new Date(t - (t % stepMs)).toISOString(),
      open: open.toFixed(8),
      high: (Math.max(open, close) * 1.005).toFixed(8),
      low: (Math.min(open, close) * 0.995).toFixed(8),
      close: close.toFixed(8),
      volume: (100 + pseudoRandom(providerSymbol, t + 1) * 900).toFixed(8),
    });
    price = close;
  }
  return rows;
}

function basePrice(symbol: string): number {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return 10 + (h % 50000) / 10;
}

function pseudoRandom(symbol: string, t: number): number {
  let h = t >>> 0;
  for (const ch of symbol) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h % 1_000_000) / 1_000_000;
}

async function safeBody(req: Request): Promise<{ interval?: string }> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
