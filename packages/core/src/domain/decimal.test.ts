import { describe, it, expect } from "vitest";
import { Decimal } from "./decimal.js";

describe("Decimal", () => {
  it("float yuvarlama hatasına düşmez (0.1 + 0.2 === 0.3)", () => {
    expect(Decimal.from("0.1").add(Decimal.from("0.2")).toString()).toBe("0.3");
  });

  it("farklı ölçekleri hizalayarak toplar/çıkarır", () => {
    expect(Decimal.from("1.5").add(Decimal.from("2.25")).toString()).toBe("3.75");
    expect(Decimal.from("5").subtract(Decimal.from("0.001")).toString()).toBe("4.999");
  });

  it("çarpar ve ölçeği korur", () => {
    expect(Decimal.from("1.5").multiply(Decimal.from("3")).toString()).toBe("4.5");
    expect(Decimal.from("0.1").multiply(Decimal.from("0.1")).toString()).toBe("0.01");
  });

  it("hedef hassasiyetle böler ve yarı-yukarı yuvarlar", () => {
    expect(Decimal.from("1").divide(Decimal.from("3"), 4).toString()).toBe("0.3333");
    expect(Decimal.from("2").divide(Decimal.from("3"), 4).toString()).toBe("0.6667");
    expect(Decimal.from("10").divide(Decimal.from("4"), 2).toString()).toBe("2.5");
  });

  it("negatif değerleri doğru yuvarlar", () => {
    expect(Decimal.from("-2.5").round(0).toString()).toBe("-3");
    expect(Decimal.from("-1").divide(Decimal.from("3"), 2).toString()).toBe("-0.33");
  });

  it("sıfıra bölmede hata fırlatır", () => {
    expect(() => Decimal.from("1").divide(Decimal.ZERO, 2)).toThrow();
  });

  it("bilimsel gösterimli number'ı düz string'e çevirir", () => {
    expect(Decimal.from(1e-7).toString()).toBe("0.0000001");
  });

  it("karşılaştırma yapar", () => {
    expect(Decimal.from("1.10").equals(Decimal.from("1.1"))).toBe(true);
    expect(Decimal.from("2").compare(Decimal.from("10"))).toBe(-1);
  });
});
