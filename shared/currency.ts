/**
 * Converting grant money to a single currency so totals can be added up.
 *
 * Grants are recorded in the currency they were awarded in -- USD and QAR in
 * practice, EUR allowed by the schema -- and a dashboard figure that silently
 * added those together would be meaningless. Everything is expressed in QAR,
 * the currency the institution reports in.
 *
 * **QAR/USD is a peg, not a market rate.** The Qatar Central Bank has fixed it
 * at 3.64 riyals to the dollar since 2001, so that conversion is exact and does
 * not go stale. EUR is not pegged and its rate here is an approximation, dated
 * below, which is why it is marked as one.
 */

export const REPORTING_CURRENCY = "QAR";

export interface ConversionRate {
  /** Riyals per unit of this currency. */
  rate: number;
  /** A peg is exact and stable; anything else drifts and needs revisiting. */
  pegged: boolean;
  note: string;
}

export const QAR_RATES: Record<string, ConversionRate> = {
  QAR: { rate: 1, pegged: true, note: "The reporting currency." },
  USD: {
    rate: 3.64,
    pegged: true,
    note: "Fixed by the Qatar Central Bank since 2001. Exact, not a market rate.",
  },
  EUR: {
    // No EUR grant exists yet. When one appears this figure is an estimate and
    // is labelled as such rather than being presented as fact.
    rate: 3.95,
    pegged: false,
    note: "Approximate, as at September 2026. Not pegged, so it drifts.",
  },
};

export interface ConvertedTotal {
  /** Sum in QAR of everything that could be converted. */
  qar: number;
  /** True when every contributing amount used a pegged rate. */
  exact: boolean;
  /** Currencies encountered with no rate, so nothing vanishes silently. */
  unconverted: string[];
}

const amountOf = (value: string | number | null | undefined): number => {
  if (value == null || value === "") return 0;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

/**
 * Add up amounts given in mixed currencies.
 *
 * A currency with no rate is not guessed at and not quietly dropped: it is
 * left out of the total and named, so a figure is never silently short.
 */
export function sumInQar(
  entries: ReadonlyArray<{ amount: string | number | null | undefined; currency?: string | null }>,
): ConvertedTotal {
  let qar = 0;
  let exact = true;
  const unconverted = new Set<string>();

  for (const entry of entries) {
    const amount = amountOf(entry.amount);
    if (amount === 0) continue;

    // A missing currency is treated as the reporting one: these are our own
    // records, and the alternative is discarding real money over a blank cell.
    const code = (entry.currency || REPORTING_CURRENCY).trim().toUpperCase();
    const conversion = QAR_RATES[code];
    if (!conversion) {
      unconverted.add(code);
      continue;
    }
    qar += amount * conversion.rate;
    if (!conversion.pegged) exact = false;
  }

  return { qar: Math.round(qar), exact, unconverted: [...unconverted].sort() };
}

export function formatQar(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "QAR",
    maximumFractionDigits: 0,
  }).format(amount);
}
