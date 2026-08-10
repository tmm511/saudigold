import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import { normalizeDigits, toNumber } from '../numbers.js';

export const SOURCE = {
  id: 'saudigoldprice',
  name: 'Saudi Gold Price',
  url: 'https://saudigoldprice.com/',
  color: 0xf1c40f,
};

const KARATS = ['24', '22', '21', '18'];

/**
 * The page is server-rendered as div-based tables:
 *   .divTable > .divTableBody > .divTableRow > .divTableCell / .divTableHead
 *
 * There are several such tables (ounce summary, gram prices, bullion, history,
 * buy/sell) and their ORDER is not stable between requests — so every table is
 * located by the text it contains, never by index.
 */
function rowsOf($, table) {
  return $(table)
    .find('.divTableRow')
    .map((_, row) => ({
      head: $(row)
        .find('.divTableHead')
        .map((__, c) => normalizeDigits($(c).text()).replace(/\s+/g, ' ').trim())
        .get(),
      cells: $(row)
        .find('.divTableCell')
        .map((__, c) => normalizeDigits($(c).text()).replace(/\s+/g, ' ').trim())
        .get(),
    }))
    .get();
}

function findTable(tables, predicate) {
  return tables.find(predicate) ?? null;
}

export async function fetchPrices() {
  const html = await fetchText(SOURCE.url);
  const $ = cheerio.load(html);

  const tables = $('.divTable')
    .map((_, t) => ({ el: t, rows: rowsOf($, t) }))
    .get();

  // --- per-gram prices + ounce buy/sell -------------------------------------
  const gramTable = findTable(tables, (t) => t.rows.some((r) => /جرام الذهب عيار/.test(r.cells[0] ?? '')));
  if (!gramTable) {
    throw new Error('saudigoldprice.com: gram price table not found (layout changed?)');
  }

  const karats = {};
  const ounce = { sell: null, buy: null };

  for (const { cells } of gramTable.rows) {
    if (cells.length < 2) continue;
    const label = cells[0];
    const sar = toNumber(cells[1]);
    if (sar === null) continue;

    const karat = /عيار\s*(\d{1,2})/.exec(label)?.[1];
    if (karat && /جرام|غرام/.test(label)) {
      karats[karat] = sar;
    } else if (/[أاإ]ونصة/.test(label)) {
      if (/بيع/.test(label)) ounce.sell = sar;
      else if (/شراء/.test(label)) ounce.buy = sar;
    }
  }

  if (!Object.keys(karats).length) {
    throw new Error('saudigoldprice.com: no karat prices parsed (layout changed?)');
  }

  // --- previous day, from the history table ---------------------------------
  // Header looks like ["الذهب في هبوط", "عيار 24", "عيار 22", ...] and each row
  // is [YYYY-MM-DD, price24, price22, ...]; row 0 is today, row 1 is yesterday.
  const historyTable = findTable(tables, (t) =>
    t.rows.some((r) => r.head.length >= 3 && r.head.filter((h) => /عيار\s*\d/.test(h)).length >= 3),
  );

  const previous = {};
  let trend = null;

  if (historyTable) {
    const header = historyTable.rows.find((r) => r.head.some((h) => /عيار\s*\d/.test(h)))?.head ?? [];
    const karatByColumn = header.map((h) => /عيار\s*(\d{1,2})/.exec(h)?.[1] ?? null);

    if (/هبوط|انخفاض|تراجع/.test(header[0] ?? '')) trend = 'down';
    else if (/ارتفاع|صعود/.test(header[0] ?? '')) trend = 'up';
    else if (/ثبات|استقرار/.test(header[0] ?? '')) trend = 'stable';

    const dataRows = historyTable.rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.cells[0] ?? ''));
    const yesterday = dataRows[1];
    if (yesterday) {
      karatByColumn.forEach((karat, col) => {
        if (!karat) return;
        const value = toNumber(yesterday.cells[col]);
        if (value !== null) previous[karat] = value;
      });
    }
  }

  // --- timestamps -----------------------------------------------------------
  const date =
    gramTable.rows.find((r) => r.head.length)?.head.find((h) => /^\d{4}\/\d{2}\/\d{2}$/.test(h)) ?? null;
  const time = /(\d{1,2}:\d{2}:\d{2}\s*[ap]\.?m\.?)/i.exec(normalizeDigits($('body').text()))?.[1] ?? null;

  return {
    source: SOURCE,
    karats,
    previous,
    ounce,
    trend,
    date,
    time,
    missing: KARATS.filter((k) => karats[k] === undefined),
    fetchedAt: Date.now(),
  };
}
