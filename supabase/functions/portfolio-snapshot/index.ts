// Edge Function (Deno): periyodik portföy değeri anlık görüntüsü.
// Akış B: cron ile çağrılır → her kullanıcının holdings_view'ı × son fiyat (price_candles)
// hesaplanıp portfolio_snapshots'a yazılır. Portföy değeri zaman grafiği bundan beslenir.
//
// SERVICE ROLE anahtarı kullanır (RLS'i baypas eder) — yalnızca sunucu tarafında çalışır.
// Çağrı: Supabase Scheduled Functions (pg_cron / cron.json) ile saatlik/günlük.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Tüm kullanıcıların pozisyonları (service role → RLS baypas, view tüm satırları döner)
  const { data: holdings, error: hErr } = await db
    .from("holdings_view")
    .select("user_id, asset_id, net_quantity");
  if (hErr) return json({ error: hErr.message }, 500);

  // 2. Her asset için en güncel kapanış fiyatı (1d veya en küçük interval'ın son mumu)
  const assetIds = [...new Set((holdings ?? []).map((h) => h.asset_id))];
  const priceByAsset = await latestClosePrices(db, assetIds);

  // 3. Kullanıcı bazında değerle ve yaz
  const { data: profiles } = await db.from("profiles").select("id, base_currency");
  const baseByUser = new Map((profiles ?? []).map((p) => [p.id, p.base_currency]));

  const byUser = new Map<string, { total: number; breakdown: unknown[] }>();
  for (const h of holdings ?? []) {
    const price = priceByAsset.get(h.asset_id);
    if (price === undefined) continue; // fiyatı bilinmeyen pozisyon atlanır
    const value = Number(h.net_quantity) * price; // NOT: FX dönüşümü ileri faz
    const acc = byUser.get(h.user_id) ?? { total: 0, breakdown: [] };
    acc.total += value;
    acc.breakdown.push({ asset_id: h.asset_id, quantity: h.net_quantity, value });
    byUser.set(h.user_id, acc);
  }

  const rows = [...byUser.entries()].map(([userId, agg]) => ({
    user_id: userId,
    total_value: agg.total.toFixed(4),
    currency: baseByUser.get(userId) ?? "USD",
    breakdown: agg.breakdown,
  }));

  if (rows.length > 0) {
    const { error: insErr } = await db.from("portfolio_snapshots").insert(rows);
    if (insErr) return json({ error: insErr.message }, 500);
  }

  return json({ snapshots: rows.length });
});

async function latestClosePrices(
  db: ReturnType<typeof createClient>,
  assetIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const assetId of assetIds) {
    const { data } = await db
      .from("price_candles")
      .select("close")
      .eq("asset_id", assetId)
      .order("open_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) result.set(assetId, Number(data.close));
  }
  return result;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
