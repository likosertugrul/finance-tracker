-- =============================================================================
-- asset_class enum'una 'fund' (yatırım fonu) ekle. 'fx' ve 'etf' zaten mevcut.
-- =============================================================================
alter type asset_class add value if not exists 'fund';
