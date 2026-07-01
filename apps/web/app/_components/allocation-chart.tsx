"use client";

import type { ReactElement } from "react";

const COLORS = [
  "#c8814e", "#22c55e", "#f59e0b", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

/**
 * Portföy dağılımı (donut) — varlık ağırlıkları. Bağımlılıksız SVG.
 * value'lar taban birimde (USD) gelir; `format` görüntü birimine çevirip biçimler.
 */
export function AllocationChart({
  items,
  format,
}: {
  items: { label: string; value: number; color?: string }[];
  format: (n: number) => string;
}): ReactElement {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((s, i) => s + i.value, 0);

  if (total <= 0) {
    return <p style={{ color: "#85786c", fontSize: 13 }}>Değerlenmiş pozisyon yok.</p>;
  }

  const r = 70;
  const sw = 22;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const segs = positive.map((it, idx) => {
    const pct = it.value / total;
    const seg = {
      ...it,
      pct,
      color: it.color ?? COLORS[idx % COLORS.length]!,
      dash: pct * C,
      offset: -acc * C,
    };
    acc += pct;
    return seg;
  });

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={180} height={180} viewBox="0 0 180 180">
        <g transform="rotate(-90 90 90)">
          <circle cx={90} cy={90} r={r} fill="none" stroke="#332a22" strokeWidth={sw} />
          {segs.map((s, i) => (
            <circle
              key={i}
              cx={90}
              cy={90}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={sw}
              strokeDasharray={`${s.dash} ${C - s.dash}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </g>
        <text x={90} y={84} textAnchor="middle" fill="#85786c" fontSize={11}>
          Toplam
        </text>
        <text x={90} y={104} textAnchor="middle" fill="#efe6dc" fontSize={14} fontWeight={600}>
          {format(total)}
        </text>
      </svg>

      <div style={{ display: "grid", gap: 8, minWidth: 200, flex: 1 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "#85786c" }}>{(s.pct * 100).toFixed(1)}%</span>
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
