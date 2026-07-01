import { Decimal } from "@finance/core";
import type {
  Trade,
  Holding,
  TradeRepository,
  HoldingRepository,
  NewTrade,
} from "@finance/core";
import type { SupabaseClient } from "../supabase/client.js";

/** DB satırı (snake_case) → domain Trade. numeric alanlar string gelir → Decimal. */
function rowToTrade(r: Record<string, unknown>): Trade {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    accountId: (r.account_id as string | null) ?? null,
    assetId: r.asset_id as string,
    side: r.side as Trade["side"],
    quantity: Decimal.from(r.quantity as string),
    price: Decimal.from(r.price as string),
    fee: Decimal.from(r.fee as string),
    tradedAt: new Date(r.traded_at as string),
    note: (r.note as string | null) ?? null,
  };
}

/**
 * Supabase implementasyonu — core/ports TradeRepository sözleşmesini karşılar.
 * RLS sayesinde sorgular otomatik olarak oturum açan kullanıcıya kısıtlanır;
 * yine de `user_id` filtresi savunma amaçlı eklenir.
 */
export class SupabaseTradeRepository implements TradeRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByUser(userId: string): Promise<Trade[]> {
    const { data, error } = await this.db
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .order("traded_at", { ascending: true });
    if (error) throw new Error(`trades okunamadı: ${error.message}`);
    return (data ?? []).map(rowToTrade);
  }

  async create(input: NewTrade): Promise<Trade> {
    const { data, error } = await this.db
      .from("trades")
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        asset_id: input.assetId,
        side: input.side,
        quantity: input.quantity.toString(),
        price: input.price.toString(),
        fee: input.fee.toString(),
        traded_at: input.tradedAt.toISOString(),
        note: input.note,
      })
      .select("*")
      .single();
    if (error) throw new Error(`trade oluşturulamadı: ${error.message}`);
    return rowToTrade(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("trades").delete().eq("id", id);
    if (error) throw new Error(`trade silinemedi: ${error.message}`);
  }
}

/**
 * Anlık pozisyonlar `holdings_view`'dan okunur — türetim DB'de (computeHoldings ile
 * aynı mantık). security_invoker view olduğundan RLS sorgulayan kullanıcıya uygulanır.
 */
export class SupabaseHoldingRepository implements HoldingRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByUser(userId: string): Promise<Holding[]> {
    const { data, error } = await this.db
      .from("holdings_view")
      .select("asset_id, net_quantity, avg_cost")
      .eq("user_id", userId);
    if (error) throw new Error(`holdings okunamadı: ${error.message}`);
    return (data ?? []).map((r) => ({
      assetId: r.asset_id as string,
      netQuantity: Decimal.from(r.net_quantity as string),
      avgCost: Decimal.from(r.avg_cost as string),
    }));
  }
}
