import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * React Native Supabase client. Web'den farkı: oturum AsyncStorage'da kalıcı.
 *
 * ÖNEMLİ: Fiziksel telefon (Expo Go) 127.0.0.1'e ulaşamaz — EXPO_PUBLIC_SUPABASE_URL
 * Mac'in LAN IP'si olmalı (örn http://192.168.1.20:54321). Bkz. apps/mobile/.env.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı değil (apps/mobile/.env).",
  );
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
