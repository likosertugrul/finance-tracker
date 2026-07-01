-- =============================================================================
-- FinTech uygulaması — başlangıç şeması
-- Enum'lar, tablolar, RLS, holdings_view, trigger'lar.
-- Para ASLA float değil → numeric. Her kullanıcı tablosunda RLS zorunlu.
-- =============================================================================

-- gen_random_uuid() için (PG 13+ çekirdeğinde; yine de garanti olsun diye)
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum'lar (core/domain ile birebir)
-- -----------------------------------------------------------------------------
create type cashflow_type as enum ('income', 'expense');
create type asset_class   as enum ('stock', 'crypto', 'etf', 'fx', 'cash');
create type trade_side    as enum ('buy', 'sell');

-- -----------------------------------------------------------------------------
-- updated_at otomatik güncelleme trigger fonksiyonu
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — auth.users uzantısı (1-1)
-- -----------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  base_currency text not null default 'USD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Yeni auth.users → otomatik profil oluştur
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- accounts — hesap/cüzdan gruplama
-- -----------------------------------------------------------------------------
create table accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  kind       text not null default 'cash',  -- 'bank' | 'brokerage' | 'wallet' | 'cash'
  currency   text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_accounts_user on accounts (user_id);
create trigger trg_accounts_updated before update on accounts
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- categories — gelir/gider kategorileri (user_id null = sistem varsayılanı)
-- -----------------------------------------------------------------------------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  name       text not null,
  type       cashflow_type not null,
  icon       text,
  color      text,
  parent_id  uuid references categories (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_categories_user on categories (user_id);

-- -----------------------------------------------------------------------------
-- transactions — gelir/gider nakit akışı
-- -----------------------------------------------------------------------------
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid references accounts (id) on delete set null,
  category_id uuid references categories (id) on delete set null,
  type        cashflow_type not null,
  amount      numeric(20, 4) not null check (amount > 0),  -- daima pozitif; yön type'tan
  currency    text not null,
  occurred_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_tx_user_time on transactions (user_id, occurred_at desc);
create trigger trg_tx_updated before update on transactions
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- assets — enstrüman ana listesi (paylaşımlı referans veri)
-- -----------------------------------------------------------------------------
create table assets (
  id              uuid primary key default gen_random_uuid(),
  symbol          text not null,
  name            text not null,
  asset_class     asset_class not null,
  quote_currency  text not null,
  provider_symbol text,           -- sağlayıcıya özel ID (provider-agnostic eşleme)
  precision       int not null default 2,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (symbol, asset_class)
);

-- -----------------------------------------------------------------------------
-- trades — varlık alım-satım (envanter / lot). Portföyün tek kaynağı.
-- -----------------------------------------------------------------------------
create table trades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  account_id uuid references accounts (id) on delete set null,
  asset_id   uuid not null references assets (id),
  side       trade_side not null,
  quantity   numeric(28, 10) not null check (quantity > 0),
  price      numeric(28, 10) not null check (price >= 0),
  fee        numeric(20, 4)  not null default 0 check (fee >= 0),
  traded_at  timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_trades_user_asset on trades (user_id, asset_id, traded_at);
create trigger trg_trades_updated before update on trades
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- holdings_view — anlık pozisyon (Trade'lerden TÜRETİLİR, ayrı tablo değil)
-- Ağırlıklı ortalama maliyet: toplam maliyet / net adet.
-- core/usecases/computeHoldings ile aynı mantık (tek doğruluk kaynağı).
-- -----------------------------------------------------------------------------
create view holdings_view
with (security_invoker = true)  -- sorgulayanın RLS'i uygulanır (kullanıcı izolasyonu)
as
with movements as (
  select
    user_id,
    asset_id,
    case when side = 'buy' then quantity else -quantity end as signed_qty,
    -- buy maliyeti: miktar*fiyat + komisyon; sell'de maliyet ayrı ele alınır
    case when side = 'buy' then quantity * price + fee else 0 end as buy_cost,
    case when side = 'buy' then quantity else 0 end as buy_qty
  from trades
),
agg as (
  select
    user_id,
    asset_id,
    sum(signed_qty) as net_quantity,
    sum(buy_cost)   as total_buy_cost,
    sum(buy_qty)    as total_buy_qty
  from movements
  group by user_id, asset_id
)
select
  user_id,
  asset_id,
  net_quantity,
  -- ortalama alım maliyeti (birim başına). Satışlar net adedi düşürür ama
  -- ortalama-maliyet yönteminde birim maliyeti değiştirmez.
  case when total_buy_qty > 0
       then round(total_buy_cost / total_buy_qty, 10)
       else 0 end as avg_cost
from agg
where net_quantity <> 0;

-- -----------------------------------------------------------------------------
-- price_candles — OHLC mum verisi (grafik geçmişi). Idempotent upsert için PK.
-- -----------------------------------------------------------------------------
create table price_candles (
  asset_id   uuid not null references assets (id) on delete cascade,
  interval   text not null,           -- '1m','5m','15m','1h','4h','1d'
  open_time  timestamptz not null,
  open       numeric(28, 10) not null,
  high       numeric(28, 10) not null,
  low        numeric(28, 10) not null,
  close      numeric(28, 10) not null,
  volume     numeric(28, 10) not null default 0,
  primary key (asset_id, interval, open_time)
);
create index idx_candles_lookup on price_candles (asset_id, interval, open_time desc);

-- -----------------------------------------------------------------------------
-- portfolio_snapshots — periyodik portföy değeri (zaman serisi grafiği)
-- -----------------------------------------------------------------------------
create table portfolio_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  captured_at timestamptz not null default now(),
  total_value numeric(20, 4) not null,
  currency    text not null,
  breakdown   jsonb not null default '[]'::jsonb
);
create index idx_snapshots_user_time on portfolio_snapshots (user_id, captured_at desc);

-- -----------------------------------------------------------------------------
-- watchlist — takip listesi
-- -----------------------------------------------------------------------------
create table watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  asset_id   uuid not null references assets (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, asset_id)
);
create index idx_watchlist_user on watchlist (user_id);

-- -----------------------------------------------------------------------------
-- ai_recommendations — AI motoru çıktıları (genişleme noktası; ilk fazda boş)
-- -----------------------------------------------------------------------------
create table ai_recommendations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  context        jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  model          text
);
create index idx_ai_user_time on ai_recommendations (user_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Kullanıcıya ait tablolar: yalnızca sahibi okuyup yazabilir.
alter table profiles            enable row level security;
alter table accounts            enable row level security;
alter table categories          enable row level security;
alter table transactions        enable row level security;
alter table trades              enable row level security;
alter table portfolio_snapshots enable row level security;
alter table watchlist           enable row level security;
alter table ai_recommendations  enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own accounts" on accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- categories: sahibinin satırları + sistem (user_id null) satırları okunur; yazma yalnız sahip
create policy "read own or system categories" on categories
  for select using (user_id is null or auth.uid() = user_id);
create policy "write own categories" on categories
  for insert with check (auth.uid() = user_id);
create policy "update own categories" on categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own categories" on categories
  for delete using (auth.uid() = user_id);

create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own trades" on trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own snapshots" on portfolio_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own watchlist" on watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own recommendations" on ai_recommendations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Paylaşımlı referans tablolar: herkese okuma; yazma yalnız servis rolü
-- (RLS açık + sadece SELECT politikası → anon/auth yazamaz, service_role RLS'i baypas eder).
alter table assets        enable row level security;
alter table price_candles enable row level security;

create policy "read assets" on assets for select using (true);
create policy "read candles" on price_candles for select using (true);
