"use client";

// WEB implementasyonu — TradingView lightweight-charts.
// Mum (candlestick) veya çizgi/alan (line) grafiği — `type` prop'u ile.
// Aynı dosya adının `.native.tsx` varyantı (Skia) RN'de otomatik seçilir.

import { useEffect, useRef, type ReactElement } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandleChartProps } from "./types.js";

export function CandleChart({
  data,
  live,
  height = 260,
  type = "candlestick",
}: CandleChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);

  // Grafiği + seriyi oluştur (tip değişince yeniden kurulur)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#221a15" },
        textColor: "#a89c90",
      },
      grid: {
        vertLines: { color: "#332a22" },
        horzLines: { color: "#332a22" },
      },
      rightPriceScale: { borderColor: "#332a22" },
      timeScale: { borderColor: "#332a22", timeVisible: true },
      autoSize: true,
    });

    seriesRef.current =
      type === "line"
        ? chart.addAreaSeries({
            lineColor: "#c8814e",
            lineWidth: 2,
            topColor: "rgba(200, 129, 78, 0.35)",
            bottomColor: "rgba(200, 129, 78, 0.02)",
          })
        : chart.addCandlestickSeries({
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
          });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, type]);

  // Geçmiş veriyi yükle (tipe göre biçimle)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (type === "line") {
      (series as ISeriesApi<"Area">).setData(
        data.map((d) => ({ time: d.time as UTCTimestamp, value: d.close })),
      );
    } else {
      (series as ISeriesApi<"Candlestick">).setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [data, type]);

  // Canlı son noktayı güncelle
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !live) return;
    if (type === "line") {
      (series as ISeriesApi<"Area">).update({ time: live.time as UTCTimestamp, value: live.close });
    } else {
      (series as ISeriesApi<"Candlestick">).update({
        time: live.time as UTCTimestamp,
        open: live.open,
        high: live.high,
        low: live.low,
        close: live.close,
      });
    }
  }, [live, type]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
