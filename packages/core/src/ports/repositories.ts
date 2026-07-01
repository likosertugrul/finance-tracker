import type { Asset } from "../domain/asset.js";
import type { Transaction } from "../domain/transaction.js";
import type { Trade } from "../domain/trade.js";
import type { Holding } from "../domain/holding.js";
import type { Category } from "../domain/category.js";

/**
 * Repository sözleşmeleri. Somut implementasyon `packages/data/repositories` altında
 * Supabase ile yapılır; `core` yalnızca bu arayüzlere bağımlıdır.
 *
 * Yazma için kullanılan girdi tipleri: id/türetilen alanlar olmadan (DB üretir).
 */

export type NewTransaction = Omit<Transaction, "id">;
export type NewTrade = Omit<Trade, "id">;
export type NewAsset = Omit<Asset, "id">;

export interface TransactionRepository {
  listByUser(userId: string): Promise<Transaction[]>;
  create(input: NewTransaction): Promise<Transaction>;
  delete(id: string): Promise<void>;
}

export interface TradeRepository {
  listByUser(userId: string): Promise<Trade[]>;
  create(input: NewTrade): Promise<Trade>;
  delete(id: string): Promise<void>;
}

export interface AssetRepository {
  getById(id: string): Promise<Asset | null>;
  getBySymbol(symbol: string): Promise<Asset | null>;
  listActive(): Promise<Asset[]>;
  /** Katalog'a yeni varlık ekler (varsa mevcut olanı döndürür — idempotent). */
  create(input: NewAsset): Promise<Asset>;
}

export interface HoldingRepository {
  /** DB `holdings_view`'dan türetilmiş anlık pozisyonlar. */
  listByUser(userId: string): Promise<Holding[]>;
}

export interface CategoryRepository {
  /** Sistem (user_id null) + kullanıcının kendi kategorileri. */
  listForUser(userId: string): Promise<Category[]>;
}
