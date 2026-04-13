/** Detect GPU rendering capabilities for graceful degradation. */

export type RenderTier = 'webgpu' | 'webgl2' | 'webgl1';

let cachedTier: RenderTier | null = null;

export function detectCapabilities(): RenderTier {
  if (cachedTier) return cachedTier;

  if (typeof window === 'undefined') {
    cachedTier = 'webgl2';
    return cachedTier;
  }

  // Check WebGPU
  if ('gpu' in navigator) {
    cachedTier = 'webgpu';
    return cachedTier;
  }

  // Check WebGL2
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      cachedTier = 'webgl2';
      return cachedTier;
    }
  } catch {
    // fall through
  }

  cachedTier = 'webgl1';
  return cachedTier;
}

/** Whether volumetric shaders and post-processing are supported. */
export function supportsVolumetric(): boolean {
  return detectCapabilities() !== 'webgl1';
}
