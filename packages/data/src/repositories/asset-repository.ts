import type { Asset, AssetRepository, NewAsset } from "@finance/core";
import type { SupabaseClient } from "../supabase/client.js";

function rowToAsset(r: Record<string, unknown>): Asset {
  return {
    id: r.id as string,
    symbol: r.symbol as string,
    name: r.name as string,
    assetClass: r.asset_class as Asset["assetClass"],
    quoteCurrency: r.quote_currency as string,
    providerSymbol: (r.provider_symbol as string | null) ?? null,
    precision: r.precision as number,
    isActive: r.is_active as boolean,
  };
}

/** Supabase implementasyonu — assets paylaşımlı referans tablo (herkese okuma). */
export class SupabaseAssetRepository implements AssetRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getById(id: string): Promise<Asset | null> {
    const { data, error } = await this.db.from("assets").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`asset okunamadı: ${error.message}`);
    return data ? rowToAsset(data) : null;
  }

  async getBySymbol(symbol: string): Promise<Asset | null> {
    const { data, error } = await this.db
      .from("assets")
      .select("*")
      .eq("symbol", symbol)
      .maybeSingle();
    if (error) throw new Error(`asset okunamadı: ${error.message}`);
    return data ? rowToAsset(data) : null;
  }

  async listActive(): Promise<Asset[]> {
    const { data, error } = await this.db
      .from("assets")
      .select("*")
      .eq("is_active", true)
      .order("symbol");
    if (error) throw new Error(`assets okunamadı: ${error.message}`);
    return (data ?? []).map(rowToAsset);
  }

  async create(input: NewAsset): Promise<Asset> {
    const { data, error } = await this.db
      .from("assets")
      .insert({
        symbol: input.symbol,
        name: input.name,
        asset_class: input.assetClass,
        quote_currency: input.quoteCurrency,
        provider_symbol: input.providerSymbol,
        precision: input.precision,
        is_active: input.isActive,
      })
      .select("*")
      .single();

    if (error) {
      // unique(symbol, asset_class) çakışması → mevcut varlığı GÜNCELLE (idempotent + meta tazele).
      // Sebep: aynı sembol yeni/farklı para birimiyle yeniden eklenince eski quote_currency
      // (örn fonun TRY yerine USD kalması) düzeltilmeli; aksi halde trade yanlış birimde değerlenir.
      if (error.code === "23505") {
        const { data: updated, error: upErr } = await this.db
          .from("assets")
          .update({
            name: input.name,
            quote_currency: input.quoteCurrency,
            provider_symbol: input.providerSymbol,
            is_active: input.isActive,
          })
          .eq("symbol", input.symbol)
          .eq("asset_class", input.assetClass)
          .select("*")
          .maybeSingle();
        if (upErr) throw new Error(`asset güncellenemedi: ${upErr.message}`);
        if (updated) return rowToAsset(updated);
        // Güncelleme satır döndürmediyse mevcut kaydı oku (yarış durumu)
        const { data: existing } = await this.db
          .from("assets")
          .select("*")
          .eq("symbol", input.symbol)
          .eq("asset_class", input.assetClass)
          .maybeSingle();
        if (existing) return rowToAsset(existing);
      }
      throw new Error(`asset oluşturulamadı: ${error.message}`);
    }
    return rowToAsset(data);
  }
}
