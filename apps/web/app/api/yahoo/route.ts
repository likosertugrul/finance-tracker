import { NextResponse } from "next/server";

/**
 * Yahoo Finance proxy (sunucu tarafı) — tarayıcı CORS'unu aşar.
 * Yahoo, BIST (.IS) dahil tüm borsaları anahtarsız sunar; tarayıcıdan CORS engellenir,
 * bu yüzden istek bu same-origin route üzerinden sunucudan yapılır.
 *
 * Kullanım:
 *   /api/yahoo?endpoint=search&q=garanti
 *   /api/yahoo?endpoint=chart&symbol=THYAO.IS&interval=1d&period1=...&period2=...
 *   /api/yahoo?endpoint=chart&symbol=AAPL&range=1d&interval=1d
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") ?? "chart";

  let target: string;
  if (endpoint === "search") {
    const q = searchParams.get("q") ?? "";
    target = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0`;
  } else {
    const symbol = searchParams.get("symbol") ?? "";
    const interval = searchParams.get("interval") ?? "1d";
    const range = searchParams.get("range");
    const period1 = searchParams.get("period1");
    const period2 = searchParams.get("period2");
    const qs = range
      ? `interval=${interval}&range=${range}`
      : `interval=${interval}&period1=${period1}&period2=${period2}`;
    target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`;
  }

  try {
    const r = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "yahoo proxy hatası" },
      { status: 502 },
    );
  }
}
