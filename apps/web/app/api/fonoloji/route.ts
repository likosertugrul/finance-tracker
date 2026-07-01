import { NextResponse } from "next/server";

/**
 * Fonoloji proxy (sunucu tarafı) — TR yatırım fonları için NAV/arama/geçmiş.
 * API anahtarı (FONOLOJI_API_KEY) yalnız burada kullanılır; istemciye sızmaz, CORS aşılır.
 *
 * Kullanım:
 *   /api/fonoloji?endpoint=search&q=para
 *   /api/fonoloji?endpoint=fund&code=PHE
 *   /api/fonoloji?endpoint=history&code=PHE&period=1y
 */
const BASE = "https://fonoloji.com/v1";

export async function GET(req: Request): Promise<Response> {
  const key = process.env.FONOLOJI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "FONOLOJI_API_KEY tanımlı değil (.env.local)." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") ?? "fund";
  const code = (searchParams.get("code") ?? "").trim();
  const q = searchParams.get("q") ?? "";
  const period = searchParams.get("period") ?? "1y";

  let target: string;
  if (endpoint === "search") {
    target = `${BASE}/search?q=${encodeURIComponent(q)}`;
  } else if (endpoint === "history") {
    target = `${BASE}/funds/${encodeURIComponent(code)}/history?period=${encodeURIComponent(period)}`;
  } else {
    target = `${BASE}/funds/${encodeURIComponent(code)}`;
  }

  try {
    const r = await fetch(target, { headers: { "X-API-Key": key, Accept: "application/json" } });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fonoloji proxy hatası" },
      { status: 502 },
    );
  }
}
