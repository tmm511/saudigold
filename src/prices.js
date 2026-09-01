import * as saudigoldprice from './sources/saudigoldprice.js';
import * as ounce from './sources/ounce.js';

/**
 * ttlMs is the minimum gap between real requests to a source, so the poll loop
 * can run fast without hitting both sites at the same rate.
 *
 * ounce.com.sa is a small JSON endpoint the site's own page polls, so checking
 * it every 5 seconds costs it almost nothing. saudigoldprice.com means
 * downloading and parsing a full HTML page, so it is held to once every 15
 * seconds: fast enough to catch a change within seconds of it appearing,
 * slow enough not to look like abuse and get the host's IP blocked.
 */
export const SOURCES = [
  { meta: saudigoldprice.SOURCE, fetchPrices: saudigoldprice.fetchPrices, ttlMs: 15_000 },
  { meta: ounce.SOURCE, fetchPrices: ounce.fetchPrices, ttlMs: 5_000 },
];

const cache = new Map();

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
 * Per-source fingerprints of the prices, keyed by source id, for sources that
 * answered. Unlike priceSignature this leaves failures out entirely, so it can
 * be compared across ticks to ask "did a price move?" without a source going
 * down or coming back counting as movement.
 */
export function priceFingerprints(results) {
  return Object.fromEntries(
    results
      .filter((r) => r.ok)
      .map((r) => [r.meta.id, JSON.stringify([r.data.karats, r.data.ounce, r.data.trend])]),
  );
}

/** True when a source present in both snapshots reports different prices. */
export function pricesMoved(previous, next) {
  return Object.keys(next).some((id) => id in previous && previous[id] !== next[id]);
}

/**
 * Fetch every source concurrently. A failing source never takes the others
 * down — it comes back as { ok: false, error } so the embed can say so.
 */
export async function fetchAll({ force = false } = {}) {
  return Promise.all(
    SOURCES.map(async ({ meta, fetchPrices, ttlMs }) => {
      const cached = cache.get(meta.id);
      if (!force && cached && Date.now() - cached.at < ttlMs) return cached.result;

      let result;
      try {
        result = { ok: true, meta, data: await fetchPrices() };
      } catch (error) {
        result = { ok: false, meta, error: error.message || String(error) };
      }

      cache.set(meta.id, { at: Date.now(), result });
      return result;
    }),
  );
}
