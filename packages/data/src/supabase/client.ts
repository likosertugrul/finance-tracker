import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client fabrikası. URL ve anon key istemci-güvenlidir (RLS koruması zaten DB'de).
 * Servis rolü anahtarı ASLA istemciye konmaz — yalnızca Edge Functions içinde kullanılır.
 */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export type { SupabaseClient };
