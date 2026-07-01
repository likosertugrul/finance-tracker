-- =============================================================================
-- Kullanıcılar kendi portföyleri için katalog'a varlık (coin/hisse) ekleyebilsin.
-- assets paylaşımlı referans tablodur: okuma herkese açıktı; artık giriş yapmış
-- kullanıcılar INSERT de yapabilir. Güncelleme/silme yine yalnız servis rolünde.
-- unique(symbol, asset_class) çakışmayı (duplicate) önler.
-- =============================================================================

create policy "authenticated insert assets" on assets
  for insert to authenticated with check (true);
