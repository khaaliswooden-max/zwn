/// <reference lib="webworker" />

import * as THREE from 'three';
import { computeDepthOrder } from './depth-sort';

type SortRequest = {
  positions: Float32Array;
  count: number;
  mvElements: Float32Array;
  camVersion: number;
};

type SortResponse = {
  sortOrder: Uint32Array;
  camVersion: number;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const mv = new THREE.Matrix4();

ctx.onmessage = (e: MessageEvent<SortRequest>) => {
  const { positions, count, mvElements, camVersion } = e.data;
  mv.fromArray(mvElements);
  const sortOrder = computeDepthOrder(positions, count, mv);
  const response: SortResponse = { sortOrder, camVersion };
  ctx.postMessage(response, [sortOrder.buffer]);
};
