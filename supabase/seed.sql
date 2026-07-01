-- =============================================================================
-- Seed: referans varlıklar + sistem (varsayılan) gelir/gider kategorileri.
-- Yerel geliştirme için `supabase db reset` ile yüklenir.
-- =============================================================================

-- Varlıklar (provider_symbol sağlayıcı seçilince doldurulur)
insert into assets (symbol, name, asset_class, quote_currency, precision) values
  ('BTC',  'Bitcoin',        'crypto', 'USDT', 2),
  ('ETH',  'Ethereum',       'crypto', 'USDT', 2),
  ('SOL',  'Solana',         'crypto', 'USDT', 2),
  ('AAPL', 'Apple Inc.',     'stock',  'USD',  2),
  ('MSFT', 'Microsoft Corp', 'stock',  'USD',  2),
  ('SPY',  'S&P 500 ETF',    'etf',    'USD',  2)
on conflict (symbol, asset_class) do nothing;

-- Sistem kategorileri (user_id null → tüm kullanıcılar okuyabilir, RLS politikası gereği)
insert into categories (user_id, name, type, icon, color) values
  (null, 'Maaş',        'income',  'wallet',       '#16a34a'),
  (null, 'Yatırım Geliri', 'income', 'trending-up', '#22c55e'),
  (null, 'Diğer Gelir', 'income',  'plus-circle',  '#4ade80'),
  (null, 'Market',      'expense', 'shopping-cart','#ef4444'),
  (null, 'Kira',        'expense', 'home',         '#f97316'),
  (null, 'Faturalar',   'expense', 'file-text',    '#eab308'),
  (null, 'Ulaşım',      'expense', 'car',          '#06b6d4'),
  (null, 'Eğlence',     'expense', 'film',         '#a855f7')
on conflict do nothing;
