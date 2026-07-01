import { Decimal } from "@finance/core";
import type { Transaction, TransactionRepository, NewTransaction } from "@finance/core";
import type { SupabaseClient } from "../supabase/client.js";

function rowToTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    accountId: (r.account_id as string | null) ?? null,
    categoryId: (r.category_id as string | null) ?? null,
    type: r.type as Transaction["type"],
    amount: Decimal.from(r.amount as string),
    currency: r.currency as string,
    occurredAt: new Date(r.occurred_at as string),
    note: (r.note as string | null) ?? null,
  };
}

/** Supabase implementasyonu — core/ports TransactionRepository sözleşmesi. RLS izole eder. */
export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByUser(userId: string): Promise<Transaction[]> {
    const { data, error } = await this.db
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false });
    if (error) throw new Error(`transactions okunamadı: ${error.message}`);
    return (data ?? []).map(rowToTransaction);
  }

  async create(input: NewTransaction): Promise<Transaction> {
    const { data, error } = await this.db
      .from("transactions")
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        category_id: input.categoryId,
        type: input.type,
        amount: input.amount.toString(),
        currency: input.currency,
        occurred_at: input.occurredAt.toISOString(),
        note: input.note,
      })
      .select("*")
      .single();
    if (error) throw new Error(`transaction oluşturulamadı: ${error.message}`);
    return rowToTransaction(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("transactions").delete().eq("id", id);
    if (error) throw new Error(`transaction silinemedi: ${error.message}`);
  }
}
