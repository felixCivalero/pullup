// One place that turns cents + currency into the string shown to a buyer.
// The room card, the product page, the checkout button, the fee breakdown and
// the receipt all read identically through here — so a KES product never shows
// "$" at the moment of payment (which it used to, because each surface rolled
// its own SEK/$-only formatter).
//
// House style (chosen 2026-06-16): amount with thousands separators, currency
// CODE as a suffix — "150 SEK", "2,500 KES", "29 USD". Symbols are ambiguous
// (kr = SEK/NOK/DKK), codes never are.

function toAmount(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

function code(currency) {
  return String(currency || "usd").toUpperCase();
}

// Product / ticket price label. Whole amounts show no decimals ("150 SEK"),
// fractional ones show two ("149.99 SEK").
export function formatPrice(cents, currency = "usd") {
  const amount = toAmount(cents);
  const pretty = amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${pretty} ${code(currency)}`;
}

// Itemized money in a breakdown/receipt — always two decimals so columns align
// ("150.00 SEK"). Same code-suffix style as formatPrice.
export function formatMoney(cents, currency = "usd") {
  const pretty = toAmount(cents).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${pretty} ${code(currency)}`;
}

// Convenience for surfaces where no/zero price means it's free. Pass the free
// label that fits the surface ("Free", "Free entry", …).
export function priceOrFree(cents, currency, freeLabel = "Free") {
  if (cents == null || Number(cents) === 0) return freeLabel;
  return formatPrice(cents, currency);
}
