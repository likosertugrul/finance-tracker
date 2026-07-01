import { createSupabaseClient, type SupabaseClient } from "@finance/data";

let client: SupabaseClient | null = null;

/** Tarayıcı için tekil (singleton) Supabase client. Env değerleri build sırasında gömülür. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil (.env).",
    );
  }
  client = createSupabaseClient(url, key);
  return client;
}
