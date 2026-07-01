// NATIVE (React Native / Expo) implementasyonu — @shopify/react-native-skia.
// Metro bu dosyayı `candle-chart.tsx` (web) yerine otomatik seçer. Tüketici tek
// <CandleChart/> görür; aynı CandleChartProps sözleşmesi.
//
// Skia Expo Go'da gömülü gelir. Hafif, bağımlılığı az bir mum grafiği:
// her mum için fitil (ince Rect) + gövde (Rect). Eksen yok (sade).

import { useMemo, useState } from "react";
import { View } from "react-native";
import { Canvas, Rect, Group } from "@shopify/react-native-skia";
import type { CandleChartProps, CandlePoint } from "./types.js";

const UP = "#22c55e";
const DOWN = "#ef4444";
const BG = "#11151f";

export function CandleChart({ data, live, height = 260 }: CandleChartProps) {
  const [width, setWidth] = useState(0);

  // Geçmiş + canlı son mum (varsa son mumu replace eder)
  const candles = useMemo<CandlePoint[]>(() => {
    if (!live || data.length === 0) return data;
    const copy = data.slice(0, -1);
    copy.push(live);
    return copy;
  }, [data, live]);

  const geom = useMemo(() => {
    if (candles.length === 0 || width === 0) return null;
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;
    const pad = 8;
    const usableH = height - pad * 2;
    const slot = width / candles.length;
    const bodyW = Math.max(1, slot * 0.6);

    const y = (price: number) => pad + (max - price) * (usableH / range);

    return candles.map((c, i) => {
      const cx = i * slot + slot / 2;
      const up = c.close >= c.open;
      const bodyTop = y(Math.max(c.open, c.close));
      const bodyBottom = y(Math.min(c.open, c.close));
      return {
        key: `${c.time}-${i}`,
        color: up ? UP : DOWN,
        wickX: cx - 0.5,
        wickY: y(c.high),
        wickH: Math.max(1, y(c.low) - y(c.high)),
        bodyX: cx - bodyW / 2,
        bodyY: bodyTop,
        bodyH: Math.max(1, bodyBottom - bodyTop),
        bodyW,
      };
    });
  }, [candles, width, height]);

  return (
    <View
      style={{ width: "100%", height, backgroundColor: BG, borderRadius: 12 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {geom && width > 0 ? (
        <Canvas style={{ width, height }}>
          {geom.map((g) => (
            <Group key={g.key}>
              {/* fitil */}
              <Rect x={g.wickX} y={g.wickY} width={1} height={g.wickH} color={g.color} />
              {/* gövde */}
              <Rect x={g.bodyX} y={g.bodyY} width={g.bodyW} height={g.bodyH} color={g.color} />
            </Group>
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}
