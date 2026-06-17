// The storage-markup cost basis: a CONTINUOUS cost computed from a creator's
// real usage (not plan tiers), priced by a small rate card. Smooth from $0 up,
// so even tiny usage yields a small (non-zero) line — we earn a little from
// everyone, scaling with how much data they actually keep/move. The 30% markup
// (creator_billing_plans.markup_bps) is then taken on top of this number.
//
// v1 prices STORED data (db + storage bytes). Egress can be added to the rate
// card later. Rate is overridable via STORAGE_RATE_CENTS_PER_GB (no deploy).

const GB = 1024 ** 3;

export function storageRateCentsPerGb() {
  const v = Number(process.env.STORAGE_RATE_CENTS_PER_GB);
  return Number.isFinite(v) && v >= 0 ? v : 15; // $0.15 / GB-month
}

// Continuous cost in cents from real usage. The basis the markup is taken on.
export function usageToCostCents({ storedBytes = 0, egressBytes = 0 } = {}) {
  const gb = Math.max(0, (Number(storedBytes) || 0) + (Number(egressBytes) || 0)) / GB;
  return Math.round(gb * storageRateCentsPerGb());
}
