import * as THREE from 'three';

const _vec3 = new THREE.Vector3();

/**
 * Compute a back-to-front sort order for Gaussian instances.
 * Returns an index array sorted by descending camera-space Z.
 */
export function computeDepthOrder(
  positions: Float32Array,
  count: number,
  mvMatrix: THREE.Matrix4,
): Uint32Array {
  const indices = new Uint32Array(count);
  const depths = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    indices[i] = i;
    _vec3.set(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    );
    _vec3.applyMatrix4(mvMatrix);
    depths[i] = _vec3.z;
  }

  // Sort back-to-front: most negative Z (farthest) first
  indices.sort((a, b) => depths[a] - depths[b]);

  return indices;
}

/**
 * Reorder typed array data according to a sorted index.
 * Operates in-place using a temporary buffer.
 */
export function reorderBuffer(
  buffer: Float32Array,
  sortedIndices: Uint32Array,
  stride: number,
): void {
  const temp = new Float32Array(buffer.length);
  for (let i = 0; i < sortedIndices.length; i++) {
    const src = sortedIndices[i] * stride;
    const dst = i * stride;
    for (let j = 0; j < stride; j++) {
      temp[dst + j] = buffer[src + j];
    }
  }
  buffer.set(temp);
}
