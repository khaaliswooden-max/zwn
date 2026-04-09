import { ZWM_GQL_BASE } from './constants';

export async function gqlQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const resp = await fetch(ZWM_GQL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`GraphQL HTTP ${resp.status}`);
  const json = (await resp.json()) as { data?: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error('GraphQL errors');
  return json.data as T;
}
