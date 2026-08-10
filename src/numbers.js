// Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits -> ASCII.
const AR_DIGITS = /[٠-٩۰-۹]/g;

export function normalizeDigits(input) {
  return String(input ?? '').replace(AR_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** "  16,259.18 ريال " -> 16259.18 ; returns null when there is no number. */
export function toNumber(raw) {
  const cleaned = normalizeDigits(raw)
    .replace(/[٫]/g, '.') // Arabic decimal separator
    .replace(/[٬ \s]/g, '') // Arabic thousands separator, nbsp, spaces
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatSar(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
