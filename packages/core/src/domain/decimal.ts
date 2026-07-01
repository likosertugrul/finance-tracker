/**
 * Arbitrary-precision decimal backed by `bigint`.
 *
 * Finansal hesaplarda `number` (IEEE-754 float) ASLA kullanılmaz: 0.1 + 0.2 !== 0.3
 * gibi yuvarlama hataları para/miktar hesabında kabul edilemez. Bu tip, değeri
 * tamsayı (`bigint`) olarak ölçeklenmiş biçimde tutar ve tüm aritmetiği tamsayı
 * üzerinde yapar.
 *
 * value = mantissa, scale = ondalık basamak sayısı  →  gerçek değer = mantissa / 10^scale
 * Örn: 12.34  →  { mantissa: 1234n, scale: 2 }
 */
export class Decimal {
  private constructor(
    /** Ölçeklenmiş tamsayı değer. */
    readonly mantissa: bigint,
    /** Ondalık basamak sayısı (>= 0). */
    readonly scale: number,
  ) {}

  static readonly ZERO = new Decimal(0n, 0);

  /** Bir string ("12.34"), number veya bigint'ten Decimal üretir. */
  static from(input: string | number | bigint | Decimal): Decimal {
    if (input instanceof Decimal) return input;
    if (typeof input === "bigint") return new Decimal(input, 0);

    const text = typeof input === "number" ? numberToPlainString(input) : input.trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
      throw new Error(`Geçersiz Decimal değeri: "${text}"`);
    }

    const negative = text.startsWith("-");
    const unsigned = text.replace(/^[+-]/, "");
    const [intPart, fracPart = ""] = unsigned.split(".");
    const scale = fracPart.length;
    const mantissa = BigInt((intPart === "" ? "0" : intPart) + fracPart || "0");
    return new Decimal(negative ? -mantissa : mantissa, scale);
  }

  private static rescale(a: Decimal, b: Decimal): { a: bigint; b: bigint; scale: number } {
    const scale = Math.max(a.scale, b.scale);
    return {
      a: a.mantissa * 10n ** BigInt(scale - a.scale),
      b: b.mantissa * 10n ** BigInt(scale - b.scale),
      scale,
    };
  }

  add(other: Decimal): Decimal {
    const { a, b, scale } = Decimal.rescale(this, other);
    return new Decimal(a + b, scale);
  }

  subtract(other: Decimal): Decimal {
    const { a, b, scale } = Decimal.rescale(this, other);
    return new Decimal(a - b, scale);
  }

  multiply(other: Decimal): Decimal {
    return new Decimal(this.mantissa * other.mantissa, this.scale + other.scale);
  }

  /**
   * Sonucu `scale` basamağa (yarı-yukarı yuvarlayarak) bölme. Tam bölünme garanti
   * olmadığından (örn 1/3) hedef hassasiyet zorunludur.
   */
  divide(other: Decimal, scale: number): Decimal {
    if (other.isZero()) throw new Error("Decimal sıfıra bölünemez.");
    // result = (M_a / 10^s_a) / (M_b / 10^s_b) = (M_a * 10^s_b) / (M_b * 10^s_a)
    // Hedef `scale`'e yuvarlamak için 1 fazla basamakla hesaplayıp round ederiz.
    const numerator = this.mantissa * 10n ** BigInt(other.scale + scale + 1);
    const denominator = other.mantissa * 10n ** BigInt(this.scale);
    const quotient = numerator / denominator; // mantissa @ (scale + 1)
    return new Decimal(quotient, scale + 1).round(scale);
  }

  /** `decimalPlaces` basamağa, yarı-yukarı (round half up) yuvarlar. */
  round(decimalPlaces: number): Decimal {
    if (decimalPlaces >= this.scale) return this;
    const drop = this.scale - decimalPlaces;
    const divisor = 10n ** BigInt(drop);
    const half = divisor / 2n;
    const q = this.mantissa / divisor;
    const r = this.mantissa % divisor;
    const rounded = absBigInt(r) >= half ? q + (this.mantissa < 0n ? -1n : 1n) : q;
    return new Decimal(rounded, decimalPlaces);
  }

  isZero(): boolean {
    return this.mantissa === 0n;
  }

  isNegative(): boolean {
    return this.mantissa < 0n;
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const { a, b } = Decimal.rescale(this, other);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  /**
   * Veritabanı/serileştirme için kanonik string ("12.34", "-0.5", "100").
   * Sondaki anlamsız sıfırlar kırpılır (normalize) — "150.0000" → "150", "2.50" → "2.5".
   */
  toString(): string {
    const negative = this.mantissa < 0n;
    const digits = absBigInt(this.mantissa).toString().padStart(this.scale + 1, "0");
    const cut = digits.length - this.scale;
    const intPart = digits.slice(0, cut);
    let fracPart = this.scale > 0 ? digits.slice(cut).replace(/0+$/, "") : "";
    const body = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    // -0 gibi durumları normalle
    return (negative && this.mantissa !== 0n ? "-" : "") + body;
  }

  /** Yalnızca görüntüleme için — hassasiyet kaybı olabilir. */
  toNumber(): number {
    return Number(this.toString());
  }
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** number'ı bilimsel gösterim olmadan düz ondalık string'e çevirir. */
function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Geçersiz sayı: ${value}`);
  if (!/e/i.test(String(value))) return String(value);
  // Bilimsel gösterimi aç (örn 1e-7)
  return value.toFixed(20).replace(/\.?0+$/, "");
}
