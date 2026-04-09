import { v4 as uuidv4 } from 'uuid';

export type AccessTrack = 'API_ACCESS' | 'PLATFORM_PARTNERSHIP' | 'INSTITUTIONAL';

export interface ApiKeyRecord {
  key: string;
  track: AccessTrack;
  createdAt: number;
  revokedAt?: number;
}

// In-memory store for dev. Swap for Neo4j or Redis before production.
const store = new Map<string, ApiKeyRecord>();

export function generateKey(track: AccessTrack = 'API_ACCESS'): ApiKeyRecord {
  const key = `zwm_${uuidv4().replace(/-/g, '')}`;
  const record: ApiKeyRecord = { key, track, createdAt: Date.now() };
  store.set(key, record);
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
  return true;
}

export function getKeyRecord(key: string): ApiKeyRecord | undefined {
  return store.get(key);
}
