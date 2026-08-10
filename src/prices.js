import * as saudigoldprice from './sources/saudigoldprice.js';
import * as ounce from './sources/ounce.js';

export const SOURCES = [
  { meta: saudigoldprice.SOURCE, fetchPrices: saudigoldprice.fetchPrices },
  { meta: ounce.SOURCE, fetchPrices: ounce.fetchPrices },
];

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
