/** Grafik mum noktası — platformdan bağımsız. time: UNIX saniye. */
export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartType = "candlestick" | "line";

export interface CandleChartProps {
  /** Geçmiş mumlar (artan zaman sırası). */
  data: CandlePoint[];
  /** Canlı güncellenecek son mum (opsiyonel) — varsa son mumu replace eder. */
  live?: CandlePoint | null;
  height?: number;
  /** Grafik tipi: mum (candlestick) veya çizgi/alan (line). Varsayılan candlestick. */
  type?: ChartType;
}
