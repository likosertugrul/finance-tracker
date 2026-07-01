"use client";

import { useEffect, useState, type ReactElement } from "react";
import { CandleChart, type CandlePoint, type ChartType } from "@finance/ui/charts";
import type { Asset, MarketDataProvider, Interval } from "@finance/core";

const HOUR = 3600;

/** Zaman periyodu ön ayarları. interval, mum başına süre; days, geriye dönük aralık.
 *  Coinbase istek başına ≤300 mum sınırına uyacak şekilde seçildi. */
const PERIODS: ReadonlyArray<{ key: string; label: string; interval: Interval; days: number }> = [
  { key: "1d", label: "1G", interval: "15m", days: 1 },
  { key: "1w", label: "1H", interval: "1h", days: 7 },
  { key: "1mo", label: "1A", interval: "4h", days: 30 },
  { key: "3mo", label: "3A", interval: "1d", days: 90 },
  { key: "6mo", label: "6A", interval: "1d", days: 180 },
];

/**
 * Seçili varlık için canlı mum grafiği.
 * - Geçmiş: provider.getCandles (Akış B'nin istemci karşılığı)
 * - Canlı: tick'ler son (açık) mumu günceller (Akış A)
 * Veri kaynağı provider-agnostic — gerçek sağlayıcıda aynı kod çalışır.
 */
export function PriceChart({
  assets,
  provider,
}: {
  assets: Asset[];
  provider: MarketDataProvider;
}): ReactElement {
  const [symbol, setSymbol] = useState("");
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [live, setLive] = useState<CandlePoint | null>(null);
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [period, setPeriod] = useState(PERIODS[1]!); // varsayılan 1 hafta

  useEffect(() => {
    if (!symbol && assets.length > 0) setSymbol(assets[0]!.symbol);
  }, [assets, symbol]);

  // Geçmiş mumları yükle
  useEffect(() => {
    if (!symbol) return;
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - period.days * 24 * HOUR * 1000);
    provider
      .getCandles(symbol, period.interval, { from, to })
      .then((cs) => {
        if (!active) return;
        const points = cs.map((c) => ({
          time: Math.floor(c.openTime.getTime() / 1000),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        setCandles(points);
        setLive(points.length > 0 ? { ...points[points.length - 1]! } : null);
      })
      .catch(() => {
        // Sağlayıcı bu sembolü desteklemiyorsa (örn Binance + hisse) grafiği boş bırak
        if (active) {
          setCandles([]);
          setLive(null);
        }
      });
    return () => {
      active = false;
    };
  }, [symbol, provider, period]);

  // Canlı tick → son mumu güncelle
  useEffect(() => {
    if (!symbol) return;
    const unsub = provider.subscribe([symbol], (tick) => {
      const price = Number(tick.price);
      setLive((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          close: price,
          high: Math.max(prev.high, price),
          low: Math.min(prev.low, price),
        };
      });
    });
    return unsub;
  }, [symbol, provider]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{
            width: 160,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #3f342a",
            background: "#17120f",
            color: "#efe6dc",
            fontSize: 14,
          }}
        >
          {assets.map((a) => (
            <option key={a.id} value={a.symbol}>
              {a.symbol} — {a.name}
            </option>
          ))}
        </select>

        {/* Grafik tipi: Mum / Çizgi */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {([
            ["candlestick", "Mum"],
            ["line", "Çizgi"],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setChartType(t)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #3f342a",
                background: chartType === t ? "#c8814e" : "transparent",
                color: chartType === t ? "white" : "#a89c90",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Zaman periyodu */}
      <div style={{ display: "flex", gap: 6 }}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid #3f342a",
              background: period.key === p.key ? "#2e251d" : "transparent",
              color: period.key === p.key ? "#efe6dc" : "#85786c",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #332a22" }}>
        <CandleChart data={candles} live={live} height={280} type={chartType} />
      </div>
    </div>
  );
}
