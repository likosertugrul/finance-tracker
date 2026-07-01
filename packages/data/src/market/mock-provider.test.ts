import { describe, it, expect, vi, afterEach } from "vitest";
import { MockMarketDataProvider } from "./mock-provider.js";

afterEach(() => vi.useRealTimers());

describe("MockMarketDataProvider", () => {
  it("aynı sembol için belirlenimci quote üretir", async () => {
    const p = new MockMarketDataProvider();
    const a = await p.getQuote("BTC");
    const b = await p.getQuote("BTC");
    expect(a.price).toBe(b.price);
    expect(Number(a.price)).toBeGreaterThan(0);
  });

  it("verilen aralık için OHLC mumları üretir (high>=low)", async () => {
    const p = new MockMarketDataProvider();
    const candles = await p.getCandles("ETH", "1h", {
      from: new Date("2024-01-01T00:00:00Z"),
      to: new Date("2024-01-01T05:00:00Z"),
    });
    expect(candles.length).toBe(6); // 0..5 saat dahil
    for (const c of candles) {
      expect(Number(c.high)).toBeGreaterThanOrEqual(Number(c.low));
      expect(c.interval).toBe("1h");
    }
  });

  it("abonelik canlı tick yayınlar ve unsubscribe durdurur", () => {
    vi.useFakeTimers();
    const p = new MockMarketDataProvider({ tickIntervalMs: 1000 });
    const ticks: string[] = [];
    const unsub = p.subscribe(["BTC", "ETH"], (t) => ticks.push(t.symbol));

    vi.advanceTimersByTime(3000);
    expect(ticks.length).toBe(6); // 3 tick × 2 sembol

    unsub();
    vi.advanceTimersByTime(3000);
    expect(ticks.length).toBe(6); // durdu
  });
});
