import * as THREE from 'three';
import { computeDepthOrder } from './depth-sort';

type SortCallback = (sortOrder: Uint32Array, camVersion: number) => void;

/**
 * Manages a single Web Worker for Gaussian depth sorting so the main thread
 * stays under 6ms/frame at high instance counts. Falls back to synchronous
 * sorting if Workers are unavailable or construction fails (SSR, old browsers).
 */
export class DepthSortPool {
  private worker: Worker | null = null;
  private pending = false;
  private nextVersion = 0;
  private lastHandled = 0;
  private onResult: SortCallback | null = null;

  constructor() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(
        new URL('./depth-sort.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e: MessageEvent<{ sortOrder: Uint32Array; camVersion: number }>) => {
        this.pending = false;
        const { sortOrder, camVersion } = e.data;
        if (camVersion <= this.lastHandled) return;
        this.lastHandled = camVersion;
        this.onResult?.(sortOrder, camVersion);
      };
      this.worker.onerror = () => {
        try {
          this.worker?.terminate();
        } catch {
          // ignore
        }
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  setCallback(cb: SortCallback): void {
    this.onResult = cb;
  }

  /**
   * Request a depth sort. If a worker is available, the sort runs off-thread
   * and the callback fires on a later frame. If not, the sort runs synchronously
   * and the returned `sortOrder` is non-null.
   */
  requestSort(
    positions: Float32Array,
    count: number,
    mv: THREE.Matrix4,
  ): Uint32Array | null {
    if (!this.worker) {
      return computeDepthOrder(positions, count, mv);
    }
    if (this.pending) return null;
    const version = ++this.nextVersion;
    const slice = new Float32Array(count * 3);
    slice.set(positions.subarray(0, count * 3));
    const mvElements = new Float32Array(mv.elements);
    this.pending = true;
    this.worker.postMessage(
      { positions: slice, count, mvElements, camVersion: version },
      [slice.buffer, mvElements.buffer],
    );
    return null;
  }

  dispose(): void {
    try {
      this.worker?.terminate();
    } catch {
      // ignore
    }
    this.worker = null;
    this.pending = false;
  }
}
