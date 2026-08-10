import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

export async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function writeState(patch) {
  const next = { ...(await readState()), ...patch };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
