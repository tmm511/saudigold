// Fetch both sources and print what the bot would show — no Discord token needed.
import { fetchAll } from '../src/prices.js';
import { formatSar } from '../src/numbers.js';
import { buildEmbeds } from '../src/embeds.js';

const results = await fetchAll();

for (const result of results) {
  console.log(`\n=== ${result.meta.name} (${result.meta.url}) ===`);
  if (!result.ok) {
    console.log(`  FAILED: ${result.error}`);
    continue;
  }
  const { data } = result;
  if (data.ounce?.sell !== null || data.ounce?.buy !== null) {
    console.log(`  Ounce  sell: ${formatSar(data.ounce.sell)}   buy: ${formatSar(data.ounce.buy)}`);
  }
  for (const k of ['24', '22', '21', '18']) {
    if (data.karats[k] === undefined) continue;
    const prev = data.previous?.[k];
    const delta = typeof prev === 'number' ? `  (prev ${formatSar(prev)}, ${formatSar(data.karats[k] - prev)})` : '';
    console.log(`  Karat ${k.padStart(2)}: ${formatSar(data.karats[k])} SAR${delta}`);
  }
  console.log(`  Trend:   ${data.trend ?? 'n/a'}`);
  console.log(`  Updated: ${[data.date, data.time].filter(Boolean).join(' ') || 'n/a'}`);
  if (data.missing?.length) console.log(`  Missing karats: ${data.missing.join(', ')}`);
}

// Building the embeds here catches Discord validation errors (empty field
// values, over-long text) without needing to be logged in.
console.log('\n=== Discord embed payload ===');
console.log(JSON.stringify(buildEmbeds(results).map((e) => e.toJSON()), null, 2));

