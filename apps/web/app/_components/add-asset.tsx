"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Decimal, type Asset, type AssetClass, type MarketDataProvider } from "@finance/core";
import {
  CoinbaseProvider,
  FxRatesProvider,
  type CoinbaseProduct,
} from "@finance/data/market";
import { YahooFinanceProvider, type YahooSymbol } from "../../src/lib/yahoo-provider.js";
import { FonolojiProvider, type FonSymbol } from "../../src/lib/fonoloji-provider.js";
import type { SupabaseAssetRepository, SupabaseTradeRepository } from "@finance/data";

interface Picked {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quoteCurrency: string;
  providerSymbol: string | null;
}

/**
 * Portföye varlık ekleme:
 * - Coin: Coinbase kataloğundan ara.  Hisse: Finnhub'dan ara (anahtar gerekir).
 * - Seçince güncel fiyat çekilir. Kullanıcı ANLIK fiyattan veya kendi ALIŞ fiyatından ekler.
 * - Tek adımda katalog kaydı (assets) + alım işlemi (trades) → pozisyon oluşur.
 */
export function AddAsset({
  assetRepo,
  tradeRepo,
  userId,
  existing,
  finnhubKey,
  onAdded,
  onLoginRequest,
}: {
  assetRepo: SupabaseAssetRepository;
  tradeRepo: SupabaseTradeRepository;
  userId: string;
  existing: Asset[];
  finnhubKey?: string | undefined;
  onAdded: () => void;
  onLoginRequest?: () => void;
}): ReactElement {
  const [mode, setMode] = useState<"crypto" | "stock" | "fx" | "fund">("crypto");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<"current" | "manual" | "total">("current");
  const [manualPrice, setManualPrice] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setPicked(null);
    setCurrentPrice(null);
    setPriceMode("current");
    setManualPrice("");
    setTotalAmount("");
    setQuantity("");
    setCurrency("USD");
    setErr(null);
  }

  async function pick(p: Picked) {
    setPicked(p);
    setCurrentPrice(null);
    setPriceMode("current");
    setCurrency(p.quoteCurrency); // otomatik para birimi (kullanıcı değiştirebilir)
    setErr(null);
    try {
      // Hisse: Yahoo'dan fiyat + para birimi (BIST → TRY, ABD → USD) gelir
      if (p.assetClass === "stock") {
        const { price, currency: cur } = await YahooFinanceProvider.lookupQuote(p.symbol);
        setPicked({ ...p, quoteCurrency: cur });
        setCurrency(cur);
        setCurrentPrice(Number(price).toString());
        return;
      }
      // Fon: Fonoloji'den canlı NAV (TRY)
      if (p.assetClass === "fund") {
        const { price } = await FonolojiProvider.lookupQuote(p.symbol);
        setCurrentPrice(Number(price).toString());
        return;
      }
      // Diğer sınıflar: tek fiyat (fon → manuel, sağlayıcı yok)
      let provider: MarketDataProvider | null = null;
      if (p.assetClass === "crypto") provider = new CoinbaseProvider();
      else if (p.assetClass === "fx") provider = new FxRatesProvider();
      if (!provider) {
        setPriceMode("manual");
        return;
      }
      const q = await provider.getQuote(p.symbol);
      setCurrentPrice(Number(q.price).toString());
    } catch {
      setPriceMode("manual"); // fiyat alınamazsa elle gir
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;

    // Birim fiyatı moda göre belirle
    let unitPrice: string;
    if (priceMode === "total") {
      // Toplam tutar ÷ adet = birim fiyat
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
      unitPrice = (priceMode === "current" ? currentPrice : manualPrice) ?? "";
    }
    if (!unitPrice) {
      setErr("Fiyat gerekli.");
      return;
    }
    if (userId === "guest") {
      setErr("Varlık eklemek için giriş yapman gerekiyor.");
      onLoginRequest?.();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const asset = await assetRepo.create({
        symbol: picked.symbol,
        name: picked.name,
        assetClass: picked.assetClass,
        quoteCurrency: currency,
        providerSymbol: picked.providerSymbol,
        precision: 2,
        isActive: true,
      });
      await tradeRepo.create({
        userId,
        accountId: null,
        assetId: asset.id,
        side: "buy",
        quantity: Decimal.from(quantity || "0"),
        price: Decimal.from(unitPrice),
        fee: Decimal.ZERO,
        tradedAt: new Date(),
        note: null,
      });
      reset();
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div style={card}>
      <h3 style={{ margin: 0, fontSize: 14 }}>Portföye varlık ekle</h3>
      <div style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
        {([
          ["crypto", "Coin"],
          ["stock", "Hisse"],
          ["fx", "Döviz"],
          ["fund", "Fon"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              reset();
            }}
            style={{ ...chip, ...(mode === m ? chipActive : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      {!picked ? (
        mode === "crypto" ? (
          <CoinSearch existing={existing} onPick={pick} />
        ) : mode === "stock" ? (
          <StockSearch onPick={pick} />
        ) : mode === "fx" ? (
          <CurrencyPick existing={existing} onPick={pick} />
        ) : (
          <FundSearch onPick={pick} />
        )
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{picked.symbol}</span>
            <span style={muted}>{picked.name}</span>
            <button type="button" onClick={reset} style={linkBtn}>değiştir</button>
          </div>

          {/* Fiyat modu */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!currentPrice}
              onClick={() => {
                setPriceMode("current");
                setCurrency(picked.quoteCurrency); // anlık fiyat kaynağın para biriminde
              }}
              style={{ ...chip, ...(priceMode === "current" ? chipActive : {}), opacity: currentPrice ? 1 : 0.5 }}
            >
              Anlık fiyat{currentPrice ? `: ${fmtCur(Number(currentPrice), picked.quoteCurrency)}` : " (yok)"}
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("manual")}
              style={{ ...chip, ...(priceMode === "manual" ? chipActive : {}) }}
            >
              Birim fiyat
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("total")}
              style={{ ...chip, ...(priceMode === "total" ? chipActive : {}) }}
            >
              Toplam tutar
            </button>
          </div>

          {/* Para birimi — anlık modda kaynağa kilitli, manuel/toplam modda serbest */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={muted}>Para birimi</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={priceMode === "current"}
              style={{ ...input, width: "auto", opacity: priceMode === "current" ? 0.6 : 1 }}
            >
              {["USD", "TRY", "EUR", "GBP", "JPY"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {priceMode === "current" && (
              <span style={muted}>(anlık fiyat {picked.quoteCurrency} cinsinden)</span>
            )}
          </div>

          {priceMode === "manual" && (
            <input
              style={input}
              placeholder="Birim alış fiyatı"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              required
            />
          )}

          {priceMode === "total" && (
            <input
              style={input}
              placeholder="Toplam tutar (elindeki hisselerin toplam ederi)"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              required
            />
          )}

          <input
            style={input}
            placeholder={priceMode === "total" ? "Adet (kaç hisse)" : "Adet"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            autoFocus
          />

          {priceMode === "total" && Number(quantity) > 0 && Number(totalAmount) > 0 && (
            <p style={muted}>
              Birim fiyat ≈ {fmtCur(Number(totalAmount) / Number(quantity), currency)}
            </p>
          )}

          {err && <p style={errText}>{err}</p>}
          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? "…" : "Portföye Ekle"}
          </button>
        </form>
      )}
    </div>
  );
}

function CoinSearch({
  existing,
  onPick,
}: {
  existing: Asset[];
  onPick: (p: Picked) => void;
}): ReactElement {
  const [products, setProducts] = useState<CoinbaseProduct[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const owned = useMemo(
    () => new Set(existing.filter((a) => a.assetClass === "crypto").map((a) => a.symbol)),
    [existing],
  );

  useEffect(() => {
    CoinbaseProvider.listUsdProducts()
      .then(setProducts)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => p.symbol.includes(q)).slice(0, 20);
  }, [products, query]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input style={input} placeholder="Coin ara (örn BTC, SOL, ADA)…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading && <p style={muted}>Katalog yükleniyor…</p>}
      {err && <p style={errText}>{err}</p>}
      <div style={resultsBox}>
        {results.map((p) => (
          <button
            key={p.providerSymbol}
            type="button"
            onClick={() =>
              onPick({ symbol: p.symbol, name: p.name, assetClass: "crypto", quoteCurrency: p.quoteCurrency, providerSymbol: p.providerSymbol })
            }
            style={pill}
          >
            {p.symbol}
            {owned.has(p.symbol) ? " •" : " +"}
          </button>
        ))}
        {!loading && results.length === 0 && <p style={muted}>Sonuç yok.</p>}
      </div>
    </div>
  );
}

function StockSearch({ onPick }: { onPick: (p: Picked) => void }): ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YahooSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Yahoo ile çok-borsalı arama (BIST .IS dahil), 350ms debounce
  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      YahooFinanceProvider.search(query.trim())
        .then((r) => active && setResults(r))
        .catch((e) => active && setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => active && setLoading(false));
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        style={input}
        placeholder="Hisse ara (örn THYAO, garanti, apple, AAPL)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <p style={muted}>Aranıyor…</p>}
      {err && <p style={errText}>{err}</p>}
      <div style={{ ...resultsBox, flexDirection: "column", flexWrap: "nowrap" }}>
        {results.map((r) => (
          <button
            key={r.symbol}
            type="button"
            onClick={() =>
              onPick({ symbol: r.symbol, name: r.name, assetClass: "stock", quoteCurrency: "USD", providerSymbol: r.symbol })
            }
            style={{ ...row }}
          >
            <span style={{ fontWeight: 600 }}>{r.symbol}</span>
            <span style={muted}>{r.name}</span>
            {r.exchange && <span style={{ ...muted, marginLeft: "auto" }}>{r.exchange}</span>}
          </button>
        ))}
        {!loading && query.trim() && results.length === 0 && <p style={muted}>Sonuç yok.</p>}
      </div>
    </div>
  );
}

/** Döviz seçimi — sabit liste; fiyat USD/birim olarak FxRatesProvider'dan gelir. */
const FX_CHOICES: ReadonlyArray<[string, string]> = [
  ["EUR", "Euro"],
  ["GBP", "İngiliz Sterlini"],
  ["TRY", "Türk Lirası"],
  ["JPY", "Japon Yeni"],
  ["CHF", "İsviçre Frangı"],
  ["CAD", "Kanada Doları"],
  ["AUD", "Avustralya Doları"],
  ["CNY", "Çin Yuanı"],
  ["USD", "ABD Doları"],
];

function CurrencyPick({
  existing,
  onPick,
}: {
  existing: Asset[];
  onPick: (p: Picked) => void;
}): ReactElement {
  const owned = useMemo(
    () => new Set(existing.filter((a) => a.assetClass === "fx").map((a) => a.symbol)),
    [existing],
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={muted}>Hangi dövizi tutuyorsun? Değer güncel kurla (USD) hesaplanır.</p>
      <div style={resultsBox}>
        {FX_CHOICES.map(([code, name]) => (
          <button
            key={code}
            type="button"
            title={name}
            onClick={() =>
              onPick({ symbol: code, name, assetClass: "fx", quoteCurrency: "USD", providerSymbol: code })
            }
            style={pill}
          >
            {code}
            {owned.has(code) ? " •" : " +"}
          </button>
        ))}
      </div>
    </div>
  );
}

function FundSearch({ onPick }: { onPick: (p: Picked) => void }): ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FonSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = query.trim().toUpperCase();

  // Fonoloji ile arama (kod/isim), 350ms debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      FonolojiProvider.search(query.trim())
        .then((r) => active && setResults(r))
        .catch((e) => active && setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => active && setLoading(false));
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  function manualAdd() {
    if (trimmed)
      onPick({ symbol: trimmed, name: trimmed, assetClass: "fund", quoteCurrency: "TRY", providerSymbol: trimmed });
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        style={input}
        placeholder="Fon ara (kod veya isim — örn PHE, para piyasası)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <p style={muted}>Aranıyor…</p>}
      {err && <p style={errText}>{err}</p>}
      <div style={{ ...resultsBox, flexDirection: "column", flexWrap: "nowrap" }}>
        {results.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() =>
              onPick({ symbol: r.code, name: r.name || r.code, assetClass: "fund", quoteCurrency: "TRY", providerSymbol: r.code })
            }
            style={{ ...row }}
          >
            <span style={{ fontWeight: 600 }}>{r.code}</span>
            <span style={muted}>{r.name}</span>
          </button>
        ))}
      </div>

      {/* Manuel yedek: arama sonuç vermezse / anahtar yoksa kodu elle ekle */}
      {trimmed && results.length === 0 && !loading && (
        <div style={{ display: "grid", gap: 6 }}>
          <button type="button" onClick={manualAdd} style={{ ...pill, textAlign: "left" }}>
            “{trimmed}” fonunu manuel ekle (fiyatı kendin gir)
          </button>
          <a
            href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(trimmed)}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)", fontSize: 12 }}
          >
            {trimmed} için NAV'ı TEFAS'ta gör →
          </a>
        </div>
      )}
      <p style={muted}>Fiyatlar Fonoloji'den (TL). Anahtar yoksa fonu manuel ekleyebilirsin.</p>
    </div>
  );
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Para birimi koduna göre biçimler; geçersiz kod (örn kripto) için yedek gösterim. */
function fmtCur(n: number, cur: string): string {
  try {
    return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 });
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

const card: React.CSSProperties = { display: "grid", gap: 6, padding: 16, borderRadius: 12, background: "#221a15", border: "1px solid #332a22" };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #3f342a", background: "#17120f", color: "#efe6dc", fontSize: 14 };
const primaryBtn: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "none", background: "#c8814e", color: "white", fontSize: 14, cursor: "pointer" };
const chip: React.CSSProperties = { padding: "6px 14px", borderRadius: 999, border: "1px solid #3f342a", background: "transparent", color: "#a89c90", fontSize: 13, cursor: "pointer" };
const chipActive: React.CSSProperties = { background: "#c8814e", borderColor: "#c8814e", color: "white" };
const pill: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #3f342a", background: "#17120f", color: "#efe6dc", fontSize: 13, cursor: "pointer" };
const row: React.CSSProperties = { display: "flex", gap: 10, alignItems: "baseline", padding: "8px 10px", borderRadius: 8, border: "1px solid #3f342a", background: "#17120f", color: "#efe6dc", fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%" };
const resultsBox: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" };
const muted: React.CSSProperties = { color: "#85786c", fontSize: 12, margin: 0 };
const errText: React.CSSProperties = { color: "#ef4444", fontSize: 12, margin: 0 };
const linkBtn: React.CSSProperties = { marginLeft: "auto", background: "none", border: "none", color: "#85786c", fontSize: 12, cursor: "pointer" };
