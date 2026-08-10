import * as saudigoldprice from './sources/saudigoldprice.js';
import * as ounce from './sources/ounce.js';

export const SOURCES = [
  { meta: saudigoldprice.SOURCE, fetchPrices: saudigoldprice.fetchPrices },
  { meta: ounce.SOURCE, fetchPrices: ounce.fetchPrices },
];

/**
 * A stable fingerprint of the prices themselves, ignoring timestamps.
 *
 * Both sites restamp "last update" every minute whether or not a number moved,
 * so comparing whole payloads would report a change constantly. Comparing this
 * instead means the Discord message is edited only when a price actually
 * changes — which is both what the user sees as "live" and what keeps us well
 * clear of Discord's edit rate limits.
 */
export function priceSignature(results) {
  return JSON.stringify(
    results.map((r) =>
      r.ok ? [r.meta.id, r.data.karats, r.data.ounce, r.data.trend] : [r.meta.id, 'error', r.error],
    ),
  );
}

/**
 * Fetch every source concurrently. A failing source never takes the others
 * down — it comes back as { ok: false, error } so the embed can say so.
 */
export async function fetchAll() {
  return Promise.all(
    SOURCES.map(async ({ meta, fetchPrices }) => {
      try {
        return { ok: true, meta, data: await fetchPrices() };
      } catch (error) {
        return { ok: false, meta, error: error.message || String(error) };
      }
    }),
  );
}
