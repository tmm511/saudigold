const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

async function request(url, { timeout = 15000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res;
}

/**
 * Fetch a page as text, honouring the charset declared in the response headers
 * or in a <meta charset> tag. Neither source sends a charset header reliably,
 * and both serve Arabic, so guessing wrong turns every label into mojibake.
 */
export async function fetchText(url, opts) {
  const res = await request(url, opts);
  const buf = Buffer.from(await res.arrayBuffer());

  const contentType = res.headers.get('content-type') || '';
  let charset = (/charset=([^;]+)/i.exec(contentType)?.[1] || '')
    .trim()
    .toLowerCase()
    .replace(/["']/g, '');

  if (!charset) {
    const head = buf.subarray(0, 4096).toString('latin1');
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8').toLowerCase();
  }

  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

export async function fetchJson(url, opts) {
  const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } });
  return res.json();
}
