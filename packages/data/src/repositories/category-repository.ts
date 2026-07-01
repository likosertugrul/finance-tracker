import type { Category, CategoryRepository } from "@finance/core";
import type { SupabaseClient } from "../supabase/client.js";

function rowToCategory(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    name: r.name as string,
    type: r.type as Category["type"],
    icon: (r.icon as string | null) ?? null,
    color: (r.color as string | null) ?? null,
    parentId: (r.parent_id as string | null) ?? null,
  };
}

/**
 * Supabase implementasyonu — sistem (user_id null) + kullanıcının kendi kategorileri.
 * RLS "read own or system categories" politikası zaten her ikisini de okumaya izin verir;
 * sorgu yine de açıkça filtreler.
 */
export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listForUser(userId: string): Promise<Category[]> {
    const { data, error } = await this.db
      .from("categories")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("name");
    if (error) throw new Error(`categories okunamadı: ${error.message}`);
    return (data ?? []).map(rowToCategory);
  }
}
