# Finance — Cross-Platform FinTech Uygulaması

Mobil (iOS/Android, Expo) + Web (Next.js) için gerçek zamanlı borsa/kripto portföy,
gelir/gider ve grafik uygulaması. Backend & realtime: Supabase.

Mimari kararlar ve gerekçeleri için: `.claude/plans/` altındaki mimari plan dosyası.

## Monorepo Yapısı (Turborepo)

```
apps/        mobile (Expo), web (Next.js)
packages/
  core/      ⭐ platformdan bağımsız iş mantığı (domain, ports, usecases) — saf TS
  data/      Supabase repository'leri + provider-agnostic market adapter'ları
  ui/        paylaşılan UI + grafik soyutlaması (Skia ↔ lightweight-charts)
  state/     TanStack Query + Zustand + realtime hook'ları
  config/    ortam/sabitler/feature flag
  types/     paylaşılan tipler (DB tipleri)
supabase/    migrations, functions (Edge), seed
```

**Bağımlılık yönü:** `apps` → `ui|state` → `core` ← `data`. `core` hiçbir şeye
bağımlı değildir (ne Supabase ne React); sağlayıcı/DB değişse bile iş kuralları sabit.

## Kurulum

```bash
# 1. Bağımlılıklar (pnpm önerilir)
corepack enable && pnpm install

# 2. Ortam değişkenleri
cp .env.example .env   # ardından Supabase URL/anon key'i doldur

# 3. Yerel Supabase (Docker gerekir)
supabase start                 # ilk seferde imajları indirir
supabase db reset              # migration + seed uygular

# 4. Geliştirme
pnpm dev                       # turbo: mobil + web paralel
```

## Veri Akışı (Pipeline) Özeti

- **Akış A — canlı tick:** İstemci `MarketDataProvider.subscribe()` ile sağlayıcı
  WS'ine bağlanır → Zustand → Skia grafik (60fps). Anlık portföy değeri istemcide
  `computePortfolioValue` (saf core) ile hesaplanır.
- **Akış B — kalıcı:** `supabase/functions/ingestion` kapanan OHLC mumlarını
  `price_candles`'a idempotent upsert eder; `portfolio-snapshot` cron'u portföy
  değerini `portfolio_snapshots`'a yazar.
- **Akış C — senkron:** DB değişiklikleri Supabase Realtime ile çok-cihaz senkron +
  TanStack Query cache invalidasyonu.
- **Akış D — AI (ileri faz):** `ai-advisor` Edge Function → `ai_recommendations`.

### Sağlayıcı (provider) seçimi
Piyasa veri sağlayıcısı henüz seçilmedi. `MarketDataProvider` arayüzü
(`packages/core/src/ports/market-data-provider.ts`) sağlayıcıdan bağımsızdır;
şu an `MockMarketDataProvider` kullanılır. Gerçek sağlayıcıya geçiş = yalnızca
`packages/data/src/market` altına yeni bir adapter eklemek.

## Doğrulama

```bash
# Birim testleri (finansal hesap mantığı: Decimal, holdings, portfolio)
pnpm test                                  # veya paket bazında:
cd packages/core && npx vitest run
cd packages/data && npx vitest run

# DB şeması + RLS + holdings_view
supabase db reset                          # migration + seed
# holdings_view'ın trade'lerden doğru türettiğini SQL ile doğrula (örnek seed sonrası)
```

## Güvenlik

- Tüm kullanıcı tablolarında **Row Level Security** açık; her satır `auth.uid()` ile izole.
- `assets`/`price_candles` paylaşımlı referans: herkese okuma, yazma yalnız service role.
- **Service role anahtarı** yalnızca Edge Functions'ta; istemciye ASLA konmaz.
- Para hesapları `Decimal` (bigint tabanlı) ile yapılır — float yuvarlama hatası yok.
