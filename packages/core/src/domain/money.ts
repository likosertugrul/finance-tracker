import { Decimal } from "./decimal.js";

/** ISO 4217 kodu ('USD','EUR','TRY') veya kripto sembolü ('USDT'). */
export type Currency = string;

/**
 * Para value object: tutar + para birimi. Tutar her zaman `Decimal` (float değil).
 * Farklı para birimleri arasında aritmetik yapılamaz — bu, sınıf sınırında hata fırlatır.
 */
export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: string | number | bigint | Decimal, currency: Currency): Money {
    return new Money(Decimal.from(amount), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(Decimal.ZERO, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Para birimi uyuşmazlığı: ${this.currency} ile ${other.currency} toplanamaz. ` +
          `Önce ortak bir para birimine çevirin (FX).`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.add(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.subtract(other.amount), this.currency);
  }

  /** Skaler (adet/oran) ile çarpar — örn. miktar × birim fiyat. */
  scale(factor: Decimal): Money {
    return new Money(this.amount.multiply(factor), this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}
