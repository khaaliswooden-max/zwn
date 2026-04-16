import { RECENT_ENTITY_IDS } from '@/lib/mock';

export const STORAGE_KEY = 'zwn_recent_entities';
const MAX_RECENT = 5;

export function getRecentEntities(): string[] {
  if (typeof window === 'undefined') return RECENT_ENTITY_IDS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : RECENT_ENTITY_IDS;
  } catch {
    return RECENT_ENTITY_IDS;
  }
}

export function addRecentEntity(id: string): void {
  const existing = getRecentEntities().filter((e) => e !== id);
  const updated = [id, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
