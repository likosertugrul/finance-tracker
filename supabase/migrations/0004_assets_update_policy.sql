-- =============================================================================
-- assets paylaşımlı katalog: kimliği doğrulanmış kullanıcılar var olan bir varlığın
-- meta verisini (özellikle quote_currency / provider_symbol) güncelleyebilsin.
-- Sebep: aynı sembol yeniden eklenince eski/yanlış para birimi düzeltilebilmeli
-- (örn fonun TRY yerine USD kalması). create() çakışmada UPDATE yapar.
-- =============================================================================
create policy "authenticated update assets"
  on assets for update
  to authenticated
  using (true)
  with check (true);
