import { describe, it, expect } from "vitest";
import { Decimal } from "../domain/decimal.js";
import { Money } from "../domain/money.js";
import type { Trade } from "../domain/trade.js";
import { computeHoldings } from "./compute-holdings.js";
import { computePortfolioValue, type PriceQuote } from "./compute-portfolio-value.js";

function trade(p: Partial<Trade> & Pick<Trade, "side" | "quantity" | "price">): Trade {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "u1",
    accountId: null,
    assetId: "btc",
    fee: Decimal.ZERO,
    tradedAt: new Date("2024-01-01"),
    note: null,
    ...p,
  };
}

describe("computeHoldings", () => {
  it("ağırlıklı ortalama maliyeti doğru türetir", () => {
    const trades = [
      trade({ side: "buy", quantity: Decimal.from("1"), price: Decimal.from("100"), tradedAt: new Date("2024-01-01") }),
      trade({ side: "buy", quantity: Decimal.from("1"), price: Decimal.from("200"), tradedAt: new Date("2024-01-02") }),
    ];
    const [h] = computeHoldings(trades);
    expect(h?.netQuantity.toString()).toBe("2");
    expect(h?.avgCost.toString()).toBe("150"); // (100 + 200) / 2
  });

  it("satışta ortalama maliyeti korur, net adedi düşürür", () => {
    const trades = [
      trade({ side: "buy", quantity: Decimal.from("2"), price: Decimal.from("100"), tradedAt: new Date("2024-01-01") }),
      trade({ side: "sell", quantity: Decimal.from("1"), price: Decimal.from("150"), tradedAt: new Date("2024-01-03") }),
    ];
    const [h] = computeHoldings(trades);
    expect(h?.netQuantity.toString()).toBe("1");
    expect(h?.avgCost.toString()).toBe("100");
  });

  it("net adet sıfırsa pozisyonu çıkarır", () => {
    const trades = [
      trade({ side: "buy", quantity: Decimal.from("1"), price: Decimal.from("100") }),
      trade({ side: "sell", quantity: Decimal.from("1"), price: Decimal.from("120"), tradedAt: new Date("2024-02-01") }),
    ];
    expect(computeHoldings(trades)).toHaveLength(0);
  });

  it("alım komisyonunu maliyet tabanına ekler", () => {
    const trades = [
      trade({ side: "buy", quantity: Decimal.from("1"), price: Decimal.from("100"), fee: Decimal.from("10") }),
    ];
    const [h] = computeHoldings(trades);
    expect(h?.avgCost.toString()).toBe("110");
  });
});

describe("computePortfolioValue", () => {
  it("pozisyonları güncel fiyatla değerleyip toplar (tek para birimi)", () => {
    const holdings = [
      { assetId: "btc", netQuantity: Decimal.from("2"), avgCost: Decimal.from("100") },
      { assetId: "eth", netQuantity: Decimal.from("10"), avgCost: Decimal.from("5") },
    ];
    const prices = new Map<string, PriceQuote>([
      ["btc", { price: Decimal.from("150"), currency: "USD" }],
      ["eth", { price: Decimal.from("8"), currency: "USD" }],
    ]);
    const result = computePortfolioValue(holdings, prices, "USD");
    expect(result.total.toString()).toBe("380 USD"); // 2*150 + 10*8
    expect(result.breakdown).toHaveLength(2);
  });

  it("fiyatı bilinmeyen pozisyonu atlar", () => {
    const holdings = [{ assetId: "btc", netQuantity: Decimal.from("1"), avgCost: Decimal.from("100") }];
    const result = computePortfolioValue(holdings, new Map(), "USD");
    expect(result.total.toString()).toBe("0 USD");
  });

  it("FxConverter ile farklı kote para birimlerini tabana çevirir", () => {
    const holdings = [{ assetId: "aapl", netQuantity: Decimal.from("1"), avgCost: Decimal.from("0") }];
    const prices = new Map<string, PriceQuote>([["aapl", { price: Decimal.from("100"), currency: "USD" }]]);
    // USD → TRY @ 32
    const fx = (m: Money, target: string) =>
      target === "TRY" ? Money.of(m.amount.multiply(Decimal.from("32")), "TRY") : m;
    const result = computePortfolioValue(holdings, prices, "TRY", fx);
    expect(result.total.toString()).toBe("3200 TRY");
  });
});
