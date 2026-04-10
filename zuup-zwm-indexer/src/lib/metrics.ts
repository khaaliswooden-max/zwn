/**
 * ZWM Indexer Metrics — lightweight Prometheus-compatible metrics collection.
 *
 * No external dependencies — implements counters and histograms natively.
 * Exports toPrometheus() for `GET /metrics` and toJSON() for health checks.
 */

// ── Counter ─────────────────────────────────────────────────────────────────────

class Counter {
  private counts = new Map<string, number>();

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = labelKey(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + value);
  }

  get(labels: Record<string, string> = {}): number {
    return this.counts.get(labelKey(labels)) ?? 0;
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
    for (const [key, value] of this.counts) {
      lines.push(`${name}${key} ${value}`);
    }
    return lines.join('\n');
  }

  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [key, value] of this.counts) {
      obj[key || 'total'] = value;
    }
    return obj;
  }
}

// ── Histogram ───────────────────────────────────────────────────────────────────

class Histogram {
  private observations = new Map<string, number[]>();

  observe(labels: Record<string, string> = {}, value: number): void {
    const key = labelKey(labels);
    let arr = this.observations.get(key);
    if (!arr) {
      arr = [];
      this.observations.set(key, arr);
    }
    arr.push(value);
    // Keep last 1000 observations per label set to bound memory
    if (arr.length > 1000) arr.shift();
  }

  summary(labels: Record<string, string> = {}): { count: number; sum: number; avg: number; p50: number; p95: number; p99: number } {
    const arr = this.observations.get(labelKey(labels)) ?? [];
    if (arr.length === 0) return { count: 0, sum: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: sorted.length,
      sum,
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    };
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} summary`];
    for (const [key] of this.observations) {
      const s = this.summary(parseLabels(key));
      lines.push(`${name}_count${key} ${s.count}`);
      lines.push(`${name}_sum${key} ${s.sum.toFixed(2)}`);
      lines.push(`${name}${key || '{quantile="0.5"}'}{quantile="0.5"} ${s.p50.toFixed(2)}`);
      lines.push(`${name}${key || '{quantile="0.95"}'}{quantile="0.95"} ${s.p95.toFixed(2)}`);
      lines.push(`${name}${key || '{quantile="0.99"}'}{quantile="0.99"} ${s.p99.toFixed(2)}`);
    }
    return lines.join('\n');
  }

  toJSON(): Record<string, { count: number; avg: number; p50: number; p95: number; p99: number }> {
    const obj: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number }> = {};
    for (const [key] of this.observations) {
      const s = this.summary(parseLabels(key));
      obj[key || 'all'] = { count: s.count, avg: s.avg, p50: s.p50, p95: s.p95, p99: s.p99 };
    }
    return obj;
  }
}

// ── Gauge (for last-event timestamps, queue depths, etc.) ───────────────────────

class Gauge {
  private values = new Map<string, number>();

  set(labels: Record<string, string> = {}, value: number): void {
    this.values.set(labelKey(labels), value);
  }

  get(labels: Record<string, string> = {}): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  toPrometheus(name: string, help: string): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
    for (const [key, value] of this.values) {
      lines.push(`${name}${key} ${value}`);
    }
    return lines.join('\n');
  }

  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [key, value] of this.values) {
      obj[key || 'value'] = value;
    }
    return obj;
  }
}

// ── Label helpers ───────────────────────────────────────────────────────────────

function labelKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
}

function parseLabels(key: string): Record<string, string> {
  if (!key || key === '') return {};
  const inner = key.slice(1, -1); // strip { }
  const result: Record<string, string> = {};
  for (const pair of inner.split(',')) {
    const [k, v] = pair.split('=');
    if (k && v) result[k] = v.replace(/"/g, '');
  }
  return result;
}

// ── Singleton metrics registry ──────────────────────────────────────────────────

export const metrics = {
  /** Total events processed per platform. */
  eventsProcessed: new Counter(),

  /** Total events that failed processing (write or parse error). */
  eventsFailed: new Counter(),

  /** Neo4j write latency in ms per platform. */
  writeLatencyMs: new Histogram(),

  /** Causal propagation latency in ms per rule. */
  propagationLatencyMs: new Histogram(),

  /** Causal propagation attempts (includes retries). */
  propagationAttempts: new Counter(),

  /** Dead-lettered propagations per rule. */
  propagationDeadLettered: new Counter(),

  /** Last event timestamp per platform (epoch ms). */
  lastEventTimestamp: new Gauge(),

  /** Active listener count. */
  activeListeners: new Gauge(),

  /** Export all metrics in Prometheus text exposition format. */
  toPrometheus(): string {
    return [
      metrics.eventsProcessed.toPrometheus('zwm_events_processed_total', 'Total Solana events processed'),
      metrics.eventsFailed.toPrometheus('zwm_events_failed_total', 'Total events that failed processing'),
      metrics.writeLatencyMs.toPrometheus('zwm_write_latency_ms', 'Neo4j write latency in milliseconds'),
      metrics.propagationLatencyMs.toPrometheus('zwm_propagation_latency_ms', 'Causal propagation HTTP latency in milliseconds'),
      metrics.propagationAttempts.toPrometheus('zwm_propagation_attempts_total', 'Total causal propagation attempts including retries'),
      metrics.propagationDeadLettered.toPrometheus('zwm_propagation_dead_lettered_total', 'Total propagations sent to dead-letter queue'),
      metrics.lastEventTimestamp.toPrometheus('zwm_last_event_timestamp', 'Timestamp of last processed event per platform'),
      metrics.activeListeners.toPrometheus('zwm_active_listeners', 'Number of active Solana WebSocket listeners'),
    ].join('\n\n') + '\n';
  },

  /** Export all metrics as JSON (for /health endpoint). */
  toJSON(): Record<string, unknown> {
    return {
      eventsProcessed: metrics.eventsProcessed.toJSON(),
      eventsFailed: metrics.eventsFailed.toJSON(),
      writeLatencyMs: metrics.writeLatencyMs.toJSON(),
      propagationLatencyMs: metrics.propagationLatencyMs.toJSON(),
      propagationAttempts: metrics.propagationAttempts.toJSON(),
      propagationDeadLettered: metrics.propagationDeadLettered.toJSON(),
      lastEventTimestamp: metrics.lastEventTimestamp.toJSON(),
      activeListeners: metrics.activeListeners.toJSON(),
    };
  },
};
