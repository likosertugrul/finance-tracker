"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Decimal,
  Money,
  computePortfolioValue,
  type Asset,
  type Holding,
  type Trade,
  type Transaction,
  type Category,
  type PriceQuote,
} from "@finance/core";
import {
  SupabaseAssetRepository,
  SupabaseHoldingRepository,
  SupabaseTradeRepository,
  SupabaseTransactionRepository,
  SupabaseCategoryRepository,
} from "@finance/data";
import {
  createMarketDataProvider,
  FxRatesProvider,
  RoutingMarketDataProvider,
} from "@finance/data/market";
import { YahooFinanceProvider } from "../../src/lib/yahoo-provider.js";
import { FonolojiProvider } from "../../src/lib/fonoloji-provider.js";
import { getSupabase } from "../../src/lib/supabase.js";
import { PriceChart } from "./price-chart.js";
import { AddAsset } from "./add-asset.js";
import { AllocationChart } from "./allocation-chart.js";

const BASE = "USD"; // İç hesaplama tabanı (sağlayıcı fiyatları USD). Görüntü birimi ayrı.
const CURRENCIES = ["USD", "EUR", "TRY", "GBP", "JPY"] as const;
const CLASS_LABELS: Record<string, string> = {
  crypto: "Kripto",
  stock: "Hisse",
  etf: "ETF",
  fx: "Döviz",
  fund: "Fon",
  cash: "Nakit",
};

export function Dashboard({ userId, email }: { userId: string; email: string }): ReactElement {
  const supabase = useMemo(() => getSupabase(), []);
  const repos = useMemo(
    () => ({
      assets: new SupabaseAssetRepository(supabase),
      holdings: new SupabaseHoldingRepository(supabase),
      trades: new SupabaseTradeRepository(supabase),
      transactions: new SupabaseTransactionRepository(supabase),
      categories: new SupabaseCategoryRepository(supabase),
    }),
    [supabase],
  );

  const [assets, setAssets] = useState<Asset[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({}); // symbol -> price
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState<
    { assetId: string; symbol: string; side: "buy" | "sell" } | null
  >(null);
  const [currency, setCurrency] = useState<string>(BASE); // görüntü para birimi
  const [usdRates, setUsdRates] = useState<Record<string, number>>({}); // currency → USD başına kur
  const [ratesLoaded, setRatesLoaded] = useState(false); // kur tablosu geldi mi (değerlemeyi bekletmek için)
  // Pozisyon sıralama
  const [sortKey, setSortKey] = useState<"symbol" | "pnl" | "qty" | "value" | "period">("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [perfDays, setPerfDays] = useState(30); // dönem getirisi penceresi (gün)
  const [periodReturns, setPeriodReturns] = useState<Record<string, number | null>>({});

  const reload = useCallback(async () => {
    try {
      const [a, h, t, tx, cats] = await Promise.all([
        repos.assets.listActive(),
        repos.holdings.listByUser(userId),
        repos.trades.listByUser(userId),
        repos.transactions.listByUser(userId),
        repos.categories.listForUser(userId),
      ]);
      setAssets(a);
      setHoldings(h);
      setTrades(t);
      setTransactions(tx);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repos, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Kayıtlı görüntü para birimini yükle (profiles.base_currency)
  useEffect(() => {
    supabase
      .from("profiles")
      .select("base_currency")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.base_currency) setCurrency(data.base_currency);
      });
  }, [supabase, userId]);

  // Tüm USD bazlı kur tablosunu bir kez çek (hem görüntü hem değerleme için).
  useEffect(() => {
    let active = true;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((j: { rates?: Record<string, number> }) => {
        if (active && j.rates) setUsdRates(j.rates);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRatesLoaded(true); // hata olsa da değerlemeyi bloke etme
      });
    return () => {
      active = false;
    };
  }, []);

  function changeCurrency(c: string) {
    setCurrency(c);
    void supabase.from("profiles").update({ base_currency: c }).eq("id", userId);
  }

  // Görüntü kuru: 1 USD = rate × seçilen birim
  const rate = currency === "USD" ? 1 : (usdRates[currency] ?? 1);

  // Herhangi bir para birimini USD'ye çevirir (BIST→TRY, EUR vb. → USD). Değerleme için.
  const toUsd = (m: Money, _target: string): Money => {
    const cur = m.currency;
    if (cur === "USD" || cur === "USDT" || cur === "USDC") return Money.of(m.amount, "USD");
    const r = usdRates[cur];
    // Kur bilinmiyorsa 1:1 SAYMA (137 TL'yi $137 yapmak toplamı şişirir) → 0 (değerleme dışı)
    if (!r || r <= 0) return Money.of(Decimal.ZERO, "USD");
    return Money.of(m.amount.divide(Decimal.from(String(r)), 10), "USD");
  };

  async function delTrade(id: string) {
    try {
      await repos.trades.delete(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function delTransaction(id: string) {
    try {
      await repos.transactions.delete(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // USD tutarını seçilen para birimine çevirip biçimler (geçersiz koda karşı dayanıklı)
  const fmt = (usd: number): string => {
    const v = usd * rate;
    try {
      return v.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
    } catch {
      return `${v.toFixed(2)} ${currency}`;
    }
  };

  // Bir tutarı (verilen para biriminde) USD sayısına çevirir
  const usdOf = (n: number, cur: string): number =>
    Number(toUsd(Money.of(String(n), cur), "USD").amount.toString());

  // Sağlayıcı yönlendirme: kripto → Coinbase (env), hisse/ETF → Finnhub (anahtar varsa).
  const provider = useMemo(() => {
    const cryptoProvider = createMarketDataProvider(
      process.env.NEXT_PUBLIC_MARKET_DATA_PROVIDER ?? "coinbase",
      { tickIntervalMs: 1000 },
    );
    const stockProvider = new YahooFinanceProvider(); // BIST + tüm borsalar, keyless
    const classBySymbol = new Map(assets.map((a) => [a.symbol, a.assetClass]));
    return new RoutingMarketDataProvider(
      (s) => classBySymbol.get(s),
      {
        crypto: cryptoProvider,
        stock: stockProvider,
        etf: stockProvider,
        fx: new FxRatesProvider(),
        fund: new FonolojiProvider(),
      },
      cryptoProvider,
    );
  }, [assets]);

  // Canlı fiyat akışı (Akış A) + başlangıç fiyat tohumu (borsa kapalıyken bile değer gösterir).
  useEffect(() => {
    if (assets.length === 0) return;
    let active = true;
    const symbols = assets.map((a) => a.symbol);
    for (const s of symbols) {
      provider
        .getQuote(s)
        .then((q) => active && setPrices((p) => ({ ...p, [s]: q.price })))
        .catch(() => {});
    }
    const unsub = provider.subscribe(symbols, (tick) =>
      setPrices((p) => ({ ...p, [tick.symbol]: tick.price })),
    );
    return () => {
      active = false;
      unsub();
    };
  }, [provider, assets]);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const portfolio = useMemo(() => {
    const priceMap = new Map<string, PriceQuote>();
    for (const h of holdings) {
      const asset = assetsById.get(h.assetId);
      const px = asset ? prices[asset.symbol] : undefined;
      if (asset && px) {
        priceMap.set(h.assetId, { price: Decimal.from(px), currency: asset.quoteCurrency });
      } else if (asset) {
        // Canlı fiyat yoksa (fon, manuel varlık) ortalama maliyetten değerle
        priceMap.set(h.assetId, { price: h.avgCost, currency: asset.quoteCurrency });
      }
    }
    return computePortfolioValue(holdings, priceMap, BASE, toUsd);
  }, [holdings, prices, assetsById, usdRates]);

  // Gelir/gider özeti (taban para birimi varsayımıyla toplanır — demo)
  const cashflow = useMemo(() => {
    let income = Decimal.ZERO;
    let expense = Decimal.ZERO;
    for (const t of transactions) {
      if (t.type === "income") income = income.add(t.amount);
      else expense = expense.add(t.amount);
    }
    return { income, expense, net: income.subtract(expense) };
  }, [transactions]);

  // Giderleri kategoriye göre grupla (AllocationChart için)
  const expenseByCategory = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const sums = new Map<string, number>(); // categoryId | "none" -> USD
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const key = t.categoryId ?? "none";
      sums.set(key, (sums.get(key) ?? 0) + Number(t.amount.toString()));
    }
    return [...sums.entries()].map(([key, value]) => {
      const c = key === "none" ? undefined : byId.get(key);
      return { label: c?.name ?? "Kategorisiz", value, ...(c?.color ? { color: c.color } : {}) };
    });
  }, [transactions, categories]);

  // Dağılım 1: varlık türüne göre (Kripto/Hisse/Döviz/Fon…)
  const allocByClass = useMemo(() => {
    const sums = new Map<string, number>();
    for (const b of portfolio.breakdown) {
      const cls = assetsById.get(b.assetId)?.assetClass ?? "other";
      const label = CLASS_LABELS[cls] ?? cls;
      sums.set(label, (sums.get(label) ?? 0) + Number(b.value.amount.toString()));
    }
    return [...sums.entries()].map(([label, value]) => ({ label, value }));
  }, [portfolio, assetsById]);

  // Dağılım 2: tek tek varlık bazında
  const allocByAsset = useMemo(
    () =>
      portfolio.breakdown.map((b) => ({
        label: assetsById.get(b.assetId)?.symbol ?? b.assetId.slice(0, 6),
        value: Number(b.value.amount.toString()),
      })),
    [portfolio, assetsById],
  );

  // Dönem getirisi: sıralama "period" iken her varlığın seçilen pencere içindeki % değişimi
  // (geçmiş fiyatlardan). Sağlayıcıya göre: Yahoo (hisse), Coinbase (kripto), Fonoloji (fon).
  useEffect(() => {
    if (sortKey !== "period" || holdings.length === 0) return;
    let active = true;
    const to = new Date();
    const from = new Date(Date.now() - perfDays * 86_400_000);
    (async () => {
      const entries = await Promise.all(
        holdings.map(async (h): Promise<readonly [string, number | null]> => {
          const asset = assetsById.get(h.assetId);
          if (!asset) return [h.assetId, null];
          try {
            const candles = await provider.getCandles(asset.symbol, "1d", { from, to });
            if (candles.length < 2) return [h.assetId, null];
            const first = Number(candles[0]!.close);
            const last = Number(candles[candles.length - 1]!.close);
            if (!first) return [h.assetId, null];
            return [h.assetId, (last / first - 1) * 100];
          } catch {
            return [h.assetId, null];
          }
        }),
      );
      if (active) setPeriodReturns(Object.fromEntries(entries));
    })();
    return () => {
      active = false;
    };
  }, [sortKey, perfDays, holdings, provider, assetsById]);

  // Pozisyon satırlarını hesapla + seçilen ölçüte göre sırala
  const positionRows = useMemo(() => {
    const rows = holdings.map((h) => {
      const asset = assetsById.get(h.assetId);
      const cur = asset?.quoteCurrency ?? "USD";
      const item = portfolio.breakdown.find((b) => b.assetId === h.assetId);
      const value = item ? Number(item.value.amount.toString()) : 0; // USD
      const px = asset ? prices[asset.symbol] : undefined;
      const avgCostUsd = usdOf(Number(h.avgCost.toString()), cur);
      const pxUsd = px ? usdOf(Number(px), cur) : avgCostUsd;
      const pnl = value - avgCostUsd * Number(h.netQuantity.toString());
      const qty = Number(h.netQuantity.toString());
      const symbol = asset?.symbol ?? h.assetId.slice(0, 6);
      const ret = periodReturns[h.assetId];
      return { h, asset, value, avgCostUsd, pxUsd, pnl, qty, symbol, ret: ret ?? null };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "symbol":
          return a.symbol.localeCompare(b.symbol) * dir;
        case "qty":
          return (a.qty - b.qty) * dir;
        case "value":
          return (a.value - b.value) * dir;
        case "pnl":
          return (a.pnl - b.pnl) * dir;
        case "period": {
          // null getiriler her zaman sona
          const av = a.ret ?? (dir === 1 ? Infinity : -Infinity);
          const bv = b.ret ?? (dir === 1 ? Infinity : -Infinity);
          return (av - bv) * dir;
        }
      }
    });
    return rows;
  }, [holdings, assetsById, portfolio, prices, usdOf, periodReturns, sortKey, sortDir]);

  const totalNum = Number(portfolio.total.amount.toString());

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Toplam Portföy Değeri</p>
          <h1 style={{ fontSize: 46, margin: "6px 0", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
            {ratesLoaded ? fmt(totalNum) : "…"}{" "}
            <span style={{ fontSize: 15, color: "var(--up)" }}>{ratesLoaded ? "● canlı" : "kurlar yükleniyor"}</span>
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: "#85786c", margin: 0, fontSize: 12 }}>{email}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 4 }}>
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              style={{
                padding: "5px 8px",
                borderRadius: 8,
                border: "1px solid #3f342a",
                background: "#17120f",
                color: "#efe6dc",
                fontSize: 12,
              }}
              aria-label="Para birimi"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button onClick={() => supabase.auth.signOut()} style={ghostBtn}>
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13 }}>Hata: {error}</p>
      )}

      {/* Gelir/Gider özeti */}
      <section style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <StatCard label="Gelir" value={fmt(Number(cashflow.income.toString()))} color="#22c55e" />
        <StatCard label="Gider" value={fmt(Number(cashflow.expense.toString()))} color="#ef4444" />
        <StatCard
          label="Net"
          value={fmt(Number(cashflow.net.toString()))}
          color={cashflow.net.isNegative() ? "#ef4444" : "#22c55e"}
        />
      </section>

      {/* Fiyat grafiği (canlı mum) */}
      <Section title="Fiyat grafiği (canlı mum · provider-agnostic)">
        <PriceChart assets={assets} provider={provider} />
      </Section>

      {/* Pozisyonlar (canlı) */}
      <Section title="Pozisyonlar (holdings_view · canlı fiyat)">
        {holdings.length === 0 ? (
          <Empty>Henüz pozisyon yok. Aşağıdan bir alım kaydı ekle.</Empty>
        ) : (
          <>
            {/* Sıralama kontrolü */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#85786c" }}>Sırala</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                style={sortSelect}
              >
                <option value="value">Değer</option>
                <option value="pnl">K/Z</option>
                <option value="qty">Miktar</option>
                <option value="symbol">Ad (alfabetik)</option>
                <option value="period">Dönem getirisi</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                style={miniBtn}
                title={sortKey === "period" ? (sortDir === "desc" ? "En çok kazandıran önce" : "En çok kaybettiren önce") : undefined}
              >
                {sortDir === "asc" ? "Artan ↑" : "Azalan ↓"}
              </button>
              {sortKey === "period" && (
                <span style={{ display: "flex", gap: 4 }}>
                  {([[7, "1H"], [30, "1A"], [90, "3A"], [180, "6A"]] as const).map(([d, l]) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPerfDays(d)}
                      style={{ ...miniBtn, ...(perfDays === d ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : {}) }}
                    >
                      {l}
                    </button>
                  ))}
                </span>
              )}
            </div>

            <table style={tableStyle}>
              <thead>
                <tr style={thRow}>
                  <th style={{ textAlign: "left" }}>Varlık</th>
                  <th>Adet</th>
                  <th>Ort. Maliyet</th>
                  <th>Fiyat</th>
                  <th>Değer</th>
                  <th>K/Z</th>
                  {sortKey === "period" && <th>Dönem</th>}
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {positionRows.map((r) => (
                  <tr key={r.h.assetId} style={tdRow}>
                    <td style={{ textAlign: "left", fontWeight: 600 }}>
                      {r.asset?.assetClass === "fund" ? (
                        <a
                          href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${r.asset.symbol}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--accent)" }}
                          title="TEFAS'ta güncel NAV"
                        >
                          {r.asset.symbol}
                        </a>
                      ) : (
                        r.symbol
                      )}
                    </td>
                    <td>{r.h.netQuantity.toString()}</td>
                    <td>{fmt(r.avgCostUsd)}</td>
                    <td>{fmt(r.pxUsd)}</td>
                    <td>{r.value > 0 ? fmt(r.value) : "…"}</td>
                    <td style={{ color: r.pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                      {r.value > 0 ? (r.pnl >= 0 ? "+" : "") + fmt(r.pnl) : "…"}
                    </td>
                    {sortKey === "period" && (
                      <td style={{ color: r.ret == null ? "#85786c" : r.ret >= 0 ? "#22c55e" : "#ef4444" }}>
                        {r.ret == null ? "—" : (r.ret >= 0 ? "+" : "") + r.ret.toFixed(2) + "%"}
                      </td>
                    )}
                    <td>
                      <button
                        type="button"
                        onClick={() => setManage({ assetId: r.h.assetId, symbol: r.asset?.symbol ?? "", side: "buy" })}
                        style={miniBtn}
                      >
                        Al
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => setManage({ assetId: r.h.assetId, symbol: r.asset?.symbol ?? "", side: "sell" })}
                        style={{ ...miniBtn, borderColor: "#7f1d1d", color: "#fca5a5" }}
                      >
                        Sat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {manage && (
          <ManageTradePanel
            manage={manage}
            currentPrice={prices[manage.symbol]}
            userId={userId}
            repo={repos.trades}
            onClose={() => setManage(null)}
            onDone={() => {
              setManage(null);
              void reload();
            }}
          />
        )}
      </Section>

      {/* Dağılım — türe göre + varlık bazında */}
      {holdings.length > 0 && (
        <Section title="Dağılım">
          <div style={{ display: "grid", gap: 28 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <p className="eyebrow" style={{ margin: 0 }}>Varlık türüne göre</p>
              <AllocationChart items={allocByClass} format={fmt} />
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <p className="eyebrow" style={{ margin: 0 }}>Varlık bazında</p>
              <AllocationChart items={allocByAsset} format={fmt} />
            </div>
          </div>
        </Section>
      )}

      {/* Varlık ekle (kendi portföyünü kur) */}
      <Section title="Portföyüne varlık ekle (coin / hisse)">
        <AddAsset
          assetRepo={repos.assets}
          tradeRepo={repos.trades}
          userId={userId}
          existing={assets}
          finnhubKey={process.env.NEXT_PUBLIC_FINNHUB_API_KEY}
          onAdded={reload}
        />
      </Section>

      {/* Gelir / gider */}
      <Section title="Gelir / gider ekle">
        <TransactionForm
          userId={userId}
          repo={repos.transactions}
          categories={categories}
          onDone={reload}
        />
      </Section>

      {/* Gider dağılımı (kategori) */}
      {expenseByCategory.length > 0 && (
        <Section title="Gider dağılımı (kategori)">
          <AllocationChart items={expenseByCategory} format={fmt} />
        </Section>
      )}

      {/* Son işlemler */}
      <Section title="Son alım-satımlar">
        {trades.length === 0 ? (
          <Empty>Kayıt yok.</Empty>
        ) : (
          <ul style={listStyle}>
            {trades.slice(0, 6).map((t) => {
              const asset = assetsById.get(t.assetId);
              return (
                <li key={t.id} style={{ ...listItem, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: t.side === "buy" ? "#22c55e" : "#ef4444" }}>
                    {t.side === "buy" ? "ALIŞ" : "SATIŞ"}
                  </span>
                  <span>
                    {t.quantity.toString()} {asset?.symbol ?? "?"} @ {fmt(Number(t.price.toString()))}
                  </span>
                  <span style={{ color: "#6b5f54" }}>{t.tradedAt.toLocaleDateString("tr-TR")}</span>
                  <button type="button" onClick={() => delTrade(t.id)} style={delBtn} title="Sil">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Son gelir-giderler">
        {transactions.length === 0 ? (
          <Empty>Kayıt yok.</Empty>
        ) : (
          <ul style={listStyle}>
            {transactions.slice(0, 6).map((t) => (
              <li key={t.id} style={{ ...listItem, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: t.type === "income" ? "#22c55e" : "#ef4444" }}>
                  {t.type === "income" ? "+" : "−"}
                  {fmt(Number(t.amount.toString()))}
                </span>
                <span style={{ color: "#a89c90" }}>{t.note ?? ""}</span>
                <span style={{ color: "#6b5f54" }}>{t.occurredAt.toLocaleDateString("tr-TR")}</span>
                <button type="button" onClick={() => delTransaction(t.id)} style={delBtn} title="Sil">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

/* ----------------------------- Formlar ----------------------------- */

function ManageTradePanel({
  manage,
  currentPrice,
  userId,
  repo,
  onClose,
  onDone,
}: {
  manage: { assetId: string; symbol: string; side: "buy" | "sell" };
  currentPrice: string | undefined;
  userId: string;
  repo: SupabaseTradeRepository;
  onClose: () => void;
  onDone: () => void;
}) {
  const isBuy = manage.side === "buy";
  const [quantity, setQuantity] = useState("");
  const [priceMode, setPriceMode] = useState<"unit" | "total">("unit");
  const [price, setPrice] = useState(currentPrice ? Number(currentPrice).toString() : "");
  const [totalAmount, setTotalAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // Birim fiyatı moda göre belirle (toplam → toplam ÷ adet)
    let unitPrice: string;
    if (priceMode === "total") {
      if (!quantity || Number(quantity) <= 0) {
        setErr("Adet gerekli.");
        return;
      }
      if (!totalAmount) {
        setErr("Toplam tutar gerekli.");
        return;
      }
      unitPrice = Decimal.from(totalAmount).divide(Decimal.from(quantity), 10).toString();
    } else {
      unitPrice = price;
    }
    if (!unitPrice) {
      setErr("Fiyat gerekli.");
      return;
    }

    setBusy(true);
    try {
      await repo.create({
        userId,
        accountId: null,
        assetId: manage.assetId,
        side: manage.side,
        quantity: Decimal.from(quantity || "0"),
        price: Decimal.from(unitPrice),
        fee: Decimal.ZERO,
        tradedAt: new Date(),
        note: null,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ ...card, marginTop: 12, borderColor: isBuy ? "#14532d" : "#7f1d1d" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ color: isBuy ? "#22c55e" : "#ef4444" }}>{isBuy ? "ALIŞ" : "SATIŞ"}</strong>
        <span style={{ fontWeight: 600 }}>{manage.symbol}</span>
        <button type="button" onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#85786c", cursor: "pointer", fontSize: 12 }}>
          kapat
        </button>
      </div>

      {/* Fiyat modu: Birim / Toplam */}
      <div style={{ display: "flex", gap: 6 }}>
        {([
          ["unit", "Birim fiyat"],
          ["total", "Toplam tutar"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setPriceMode(m)}
            style={{ ...miniBtn, ...(priceMode === m ? { background: "#c8814e", borderColor: "#c8814e", color: "white" } : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="Adet" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />
        {priceMode === "unit" ? (
          <input style={{ ...input, flex: 1 }} placeholder="Birim fiyat" value={price} onChange={(e) => setPrice(e.target.value)} required />
        ) : (
          <input style={{ ...input, flex: 1 }} placeholder="Toplam tutar" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} required />
        )}
      </div>

      {priceMode === "total" && Number(quantity) > 0 && Number(totalAmount) > 0 && (
        <p style={{ color: "#85786c", fontSize: 12, margin: 0 }}>
          Birim fiyat ≈ {(Number(totalAmount) / Number(quantity)).toLocaleString("en-US", { maximumFractionDigits: 4 })}
        </p>
      )}

      {err && <p style={errText}>{err}</p>}
      <button type="submit" disabled={busy} style={primaryBtn}>
        {busy ? "…" : isBuy ? "Alış Kaydet" : "Satış Kaydet"}
      </button>
    </form>
  );
}

function TransactionForm({
  userId,
  repo,
  categories,
  onDone,
}: {
  userId: string;
  repo: SupabaseTransactionRepository;
  categories: Category[];
  onDone: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const options = categories.filter((c) => c.type === type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await repo.create({
        userId,
        accountId: null,
        categoryId: categoryId || null,
        type,
        amount: Decimal.from(amount),
        currency: BASE,
        occurredAt: new Date(),
        note: note || null,
      });
      setAmount("");
      setNote("");
      setCategoryId("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={card}>
      <h3 style={cardTitle}>Gelir / Gider Ekle</h3>
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value as "income" | "expense");
          setCategoryId(""); // tür değişince kategori sıfırla
        }}
        style={input}
      >
        <option value="expense">Gider</option>
        <option value="income">Gelir</option>
      </select>
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={input}>
        <option value="">Kategori yok</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input style={input} placeholder={`Tutar (${BASE})`} value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <input style={input} placeholder="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p style={errText}>{err}</p>}
      <button type="submit" disabled={busy} style={primaryBtn}>
        {busy ? "…" : "Kaydet"}
      </button>
    </form>
  );
}

/* ----------------------------- UI yardımcıları ----------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: 22, color: "var(--text)", margin: "0 0 16px", fontWeight: 500 }}>{title}</h2>
      {children}
    </section>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ ...card, flex: 1, gap: 4 }}>
      <span style={{ color: "#85786c", fontSize: 12 }}>{label}</span>
      <span style={{ color, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#6b5f54", fontSize: 13 }}>{children}</p>;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" };
const thRow: React.CSSProperties = { color: "#85786c", fontSize: 12, textAlign: "right" };
const tdRow: React.CSSProperties = { borderTop: "1px solid #332a22", textAlign: "right", lineHeight: "2.4" };
const card: React.CSSProperties = { display: "grid", gap: 10, padding: 16, borderRadius: 12, background: "#221a15", border: "1px solid #332a22" };
const cardTitle: React.CSSProperties = { margin: 0, fontSize: 14 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #3f342a", background: "#17120f", color: "#efe6dc", fontSize: 14 };
const primaryBtn: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "none", background: "#c8814e", color: "white", fontSize: 14, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid #3f342a", background: "transparent", color: "#a89c90", fontSize: 12, cursor: "pointer", marginTop: 4 };
const miniBtn: React.CSSProperties = { padding: "3px 10px", borderRadius: 6, border: "1px solid #3f342a", background: "transparent", color: "#a89c90", fontSize: 12, cursor: "pointer" };
const sortSelect: React.CSSProperties = { padding: "4px 8px", borderRadius: 6, border: "1px solid #3f342a", background: "#221a15", color: "#e8dccb", fontSize: 12, cursor: "pointer" };
const delBtn: React.CSSProperties = { marginLeft: "auto", width: 22, height: 22, borderRadius: 6, border: "1px solid #3f342a", background: "transparent", color: "#fca5a5", fontSize: 14, lineHeight: "1", cursor: "pointer" };
const errText: React.CSSProperties = { color: "#ef4444", margin: 0, fontSize: 12 };
const listStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 };
const listItem: React.CSSProperties = { fontSize: 14, fontVariantNumeric: "tabular-nums" };
