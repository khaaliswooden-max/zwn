import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export type AccessTrack = 'API_ACCESS' | 'PLATFORM_PARTNERSHIP' | 'INSTITUTIONAL';

export interface ApiKeyRecord {
  key: string;
  track: AccessTrack;
  createdAt: number;
  revokedAt?: number;
}

const store = new Map<string, ApiKeyRecord>();

const DATA_DIR  = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'api-keys.json');

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as ApiKeyRecord[];
    for (const record of raw) store.set(record.key, record);
    console.log(`[api-key-store] Loaded ${store.size} key(s) from disk.`);
  } catch (err) {
    console.error('[api-key-store] Failed to load from disk:', err);
  }
}

function saveToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...store.values()], null, 2));
  } catch (err) {
    console.error('[api-key-store] Failed to save to disk:', err);
  }
}

loadFromDisk();

export function generateKey(track: AccessTrack = 'API_ACCESS'): ApiKeyRecord {
  const key = `zwm_${uuidv4().replace(/-/g, '')}`;
  const record: ApiKeyRecord = { key, track, createdAt: Date.now() };
  store.set(key, record);
  saveToDisk();
  return record;
}

export function validateKey(key: string): boolean {
  const record = store.get(key);
  return record !== undefined && record.revokedAt === undefined;
}

export function revokeKey(key: string): boolean {
  const record = store.get(key);
  if (!record || record.revokedAt !== undefined) return false;
  record.revokedAt = Date.now();
  saveToDisk();
  return true;
}

export function getKeyRecord(key: string): ApiKeyRecord | undefined {
  return store.get(key);
}

export function listKeys(): ApiKeyRecord[] {
  return [...store.values()];
}
