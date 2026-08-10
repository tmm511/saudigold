import { EmbedBuilder } from 'discord.js';
import { config } from './config.js';
import { formatSar } from './numbers.js';

const KARAT_ORDER = ['24', '22', '21', '18'];
const TREND = {
  up: { icon: '🔺', label: 'ارتفاع (Rising)' },
  down: { icon: '🔻', label: 'هبوط (Falling)' },
  stable: { icon: '▪️', label: 'ثبات (Stable)' },
  neutral: { icon: '▪️', label: 'ثبات (Stable)' },
  flat: { icon: '▪️', label: 'ثبات (Stable)' },
};

/**
 * One row per karat, stacked vertically. Discord has no way to centre text in
 * an embed, so readability comes from each karat owning a full-width row
 * instead of being squeezed into a three-across grid.
 */
function karatField(karat, value, previous) {
  let delta = '';
  if (typeof previous === 'number' && previous !== 0) {
    const diff = value - previous;
    const arrow = diff > 0 ? '🔺' : diff < 0 ? '🔻' : '▪️';
    const sign = diff > 0 ? '+' : '';
    delta = `  ${arrow} ${sign}${formatSar(diff)} (${sign}${((diff / previous) * 100).toFixed(2)}%)`;
  }
  return {
    name: `عيار ${karat} (Karat)`,
    value: `**${formatSar(value)} SAR**${delta}`,
    inline: false,
  };
}

function ounceBlock(ounce) {
  if (!ounce || (ounce.sell === null && ounce.buy === null)) return null;
  const lines = ['### ⚖️ الأونصة (Ounce)'];
  if (ounce.sell !== null) lines.push(`🔴 **بيع (Sell):**  \`${formatSar(ounce.sell)}\` SAR`);
  if (ounce.buy !== null) lines.push(`🟢 **شراء (Buy):**  \`${formatSar(ounce.buy)}\` SAR`);
  return lines.join('\n');
}

export function buildSourceEmbed(result) {
  const embed = new EmbedBuilder().setColor(result.meta.color).setTitle(result.meta.name).setURL(result.meta.url);

  if (!result.ok) {
    return embed
      .setColor(0xed4245)
      .setDescription(`⚠️ تعذر جلب الأسعار — could not fetch prices.\n\`\`\`${result.error}\`\`\``);
  }

  const { data } = result;
  const parts = [];

  const ounce = ounceBlock(data.ounce);
  if (ounce) parts.push(ounce);
  const trend = TREND[String(data.trend).toLowerCase()];
  if (trend) parts.push(`${trend.icon} **الاتجاه (Trend):** ${trend.label}`);
  if (parts.length) embed.setDescription(parts.join('\n'));

  const fields = KARAT_ORDER.filter((k) => data.karats[k] !== undefined).map((k) =>
    karatField(k, data.karats[k], data.previous?.[k]),
  );
  if (fields.length) embed.addFields(fields);
  else embed.setDescription([...parts, '⚠️ لا توجد أسعار عيارات متاحة حالياً.'].join('\n'));

  // Left-to-right only. The previous footer put Arabic beside the timestamp,
  // and Discord's bidirectional layout moved the trailing "am" and the
  // separators to the wrong side of the line.
  const stamp = [data.date, data.time].filter(Boolean).join(' ');
  embed.setFooter({ text: `${config.footerText}${stamp ? ` • ${stamp}` : ''}` });
  embed.setTimestamp(data.fetchedAt);

  return embed;
}

export function buildEmbeds(results) {
  return results.map(buildSourceEmbed);
}

/**
 * The message carries no buttons, deliberately.
 *
 * A button only works while a process is connected and listening for the
 * click. The scheduled poster exits seconds after it runs, so a button on its
 * message is dead — clicking it just reports a failed interaction. The message
 * updates itself on a schedule, which is what a refresh button would have done
 * anyway.
 *
 * Sending this explicitly (rather than omitting the field) matters: a PATCH
 * that omits `components` leaves any existing ones in place.
 */
export function buildComponents() {
  return [];
}
