import * as cheerio from 'cheerio';
import { fetchJson, fetchText } from '../http.js';
import { toNumber } from '../numbers.js';

export const SOURCE = {
  id: 'ounce',
  name: 'Ounce.com.sa',
  url: 'https://ounce.com.sa/%D8%A3%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8/',
  color: 0x9b59b6,
};

// The live table on the page refreshes itself from this endpoint every 60s.
const API_URL = 'https://ounce.com.sa/wp-json/wgp/v1/prices?lang=ar';

const KARATS = ['24', '22', '21', '18'];

async function fromApi() {
  const data = await fetchJson(API_URL, { timeout: 12000 });
  if (!data?.success || !data?.prices) throw new Error('ounce.com.sa: API returned no prices');

  const karats = {};
  for (const k of KARATS) {
    const v = toNumber(data.prices[`${k}k`]);
    if (v !== null) karats[k] = v;
  }
  if (!Object.keys(karats).length) throw new Error('ounce.com.sa: API prices empty');

  return {
    karats,
    trend: data.trend ?? null,
    time: data.last_update ?? null,
    date: data.last_update_full?.split(' ')[0] ?? null,
    via: 'api',
  };
}

async function fromHtml() {
  const html = await fetchText(SOURCE.url);
  const $ = cheerio.load(html);

  const karats = {};
  $('.wgp-live-price[data-karat]').each((_, el) => {
    const k = ($(el).attr('data-karat') || '').replace(/k$/i, '');
    const v = toNumber($(el).text());
    if (k && v !== null && karats[k] === undefined) karats[k] = v;
  });

  if (!Object.keys(karats).length) {
    throw new Error('ounce.com.sa: no karat prices parsed (layout changed?)');
  }

  return {
    karats,
    trend: $('.wgp-live-trend').first().hasClass('down') ? 'down' : 'up',
    time: $('#wgp-last-update').first().text().trim() || null,
    date: null,
    via: 'html',
  };
}

/** Prefer the JSON API; fall back to scraping the rendered table. */
export async function fetchPrices() {
  let result;
  try {
    result = await fromApi();
  } catch (apiError) {
    try {
      result = await fromHtml();
    } catch (htmlError) {
      throw new Error(`${apiError.message} | fallback: ${htmlError.message}`);
    }
  }

  return {
    source: SOURCE,
    ounce: { sell: null, buy: null },
    missing: KARATS.filter((k) => result.karats[k] === undefined),
    fetchedAt: Date.now(),
    ...result,
  };
}
