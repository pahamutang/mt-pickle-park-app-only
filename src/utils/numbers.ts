// Strict number parsing for text boxes. parseFloat/parseInt are too forgiving:
// "12abc" quietly becomes 12, "2.9" becomes 2, and "Infinity" or "1e999" slip
// past an isNaN() check and end up in a bill. These return null instead.

// Largest amount we accept in a single money field (court fee, order price,
// cash received). Far above any real bill, but small enough that totals can't
// overflow or look absurd.
export const MAX_MONEY = 1_000_000;

// Largest quantity accepted for a single order line.
export const MAX_QTY = 999;

/** "250", "250.50", ".5", "1,250" -> number. Anything else (or out of range) -> null. */
export function parseMoney(text: string, max: number = MAX_MONEY): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

/** "3" -> 3. Decimals, signs, letters, or out of range (min..max) -> null. */
export function parseWholeNumber(text: string, min = 1, max: number = MAX_QTY): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
