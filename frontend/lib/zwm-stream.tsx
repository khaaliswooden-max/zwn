'use client';

/**
 * ZWM live-event stream — EventSource-backed React Context.
 *
 * Subscribes once per app instance to `/enterprise/events/stream` on the
 * indexer and fans events out to consumers via a typed `subscribe()` API.
 * Auto-reconnects with exponential backoff. Silent fallback: if the endpoint
 * is unreachable or no API key is configured, consumers simply never fire.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ZWM_API_BASE } from './constants';

export type ZwmStreamEvent =
  | {
      kind: 'SUBSTRATE_EVENT';
      substrateEventId: string;
      eventType: string;
      source: string;
      payload: Record<string, unknown>;
      timestamp: number;
    }
  | {
      kind: 'CAUSAL_PROPAGATION';
      substrateEventId: string;
      ruleId: string;
      source: string;
      target: string;
      effect: string;
      params: Record<string, unknown>;
      timestamp: number;
    };

type Listener = (event: ZwmStreamEvent) => void;

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface ZwmStreamContextValue {
  status: StreamStatus;
  subscribe: (listener: Listener) => () => void;
}

const NOOP_UNSUBSCRIBE = () => {};

const ZwmStreamContext = createContext<ZwmStreamContextValue>({
  status: 'idle',
  subscribe: () => NOOP_UNSUBSCRIBE,
});

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function ZwmStreamProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const listenersRef = useRef<Set<Listener>>(new Set());
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  // Stable subscribe — returned value is memoized via useCallback so that
  // consumers passing it into effect deps don't re-subscribe every render.
  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ZWM_API_KEY;
    if (!apiKey) {
      // No key configured (e.g. public preview builds) — stream stays idle
      // and listeners receive nothing. Caller decides on fallback UX.
      setStatus('idle');
      return;
    }

    let cancelled = false;

    const fanOut = (event: ZwmStreamEvent) => {
      for (const listener of listenersRef.current) {
        try {
          listener(event);
        } catch (err) {
          console.error('[zwm-stream] listener threw:', err);
        }
      }
    };

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');

      const url = `${ZWM_API_BASE}/enterprise/events/stream?apiKey=${encodeURIComponent(apiKey)}`;
      const source = new EventSource(url);
      sourceRef.current = source;

      source.onopen = () => {
        if (cancelled) return;
        backoffRef.current = INITIAL_BACKOFF_MS;
        setStatus('open');
      };

      source.onerror = () => {
        if (cancelled) return;
        // EventSource auto-reconnects, but it re-uses the same URL with no
        // backoff — we close + schedule manually for better control.
        source.close();
        sourceRef.current = null;
        setStatus('error');
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
        reconnectTimeoutRef.current = window.setTimeout(connect, delay);
      };

      const handle = (evt: MessageEvent) => {
        if (!evt.data) return;
        try {
          const parsed = JSON.parse(evt.data) as ZwmStreamEvent;
          fanOut(parsed);
        } catch (err) {
          console.warn('[zwm-stream] bad payload:', err);
        }
      };

      source.addEventListener('SUBSTRATE_EVENT', handle);
      source.addEventListener('CAUSAL_PROPAGATION', handle);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setStatus('closed');
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);

  return <ZwmStreamContext.Provider value={value}>{children}</ZwmStreamContext.Provider>;
}

/** Subscribe to live ZWM events. Returns the current connection status. */
export function useZwmStream(listener?: Listener): StreamStatus {
  const { status, subscribe } = useContext(ZwmStreamContext);

  useEffect(() => {
    if (!listener) return;
    return subscribe(listener);
  }, [listener, subscribe]);

  return status;
}
