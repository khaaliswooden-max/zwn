import { GaussianParams } from './types';

/** Generate Gaussians arranged in a sphere around a center point. */
export function generateSphereCluster(
  center: [number, number, number],
  count: number,
  baseColor: [number, number, number],
  baseOpacity: number,
  baseScale: number,
  spread: number,
): GaussianParams[] {
  const gaussians: GaussianParams[] = [];
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(2 * (i / count) - 1);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i; // golden angle
    const r = spread * (0.6 + 0.4 * Math.random());

    gaussians.push({
      position: [
        center[0] + r * Math.sin(phi) * Math.cos(theta),
        center[1] + r * Math.sin(phi) * Math.sin(theta),
        center[2] + r * Math.cos(phi),
      ],
      scale: [baseScale, baseScale, baseScale].map(
        (s) => s * (0.7 + 0.6 * Math.random()),
      ) as [number, number, number],
      color: baseColor,
      opacity: baseOpacity * (0.6 + 0.4 * Math.random()),
      intensity: 0.8 + 0.4 * Math.random(),
    });
  }
  return gaussians;
}

/** Blend a color toward coral-red based on risk level. */
export function riskTint(
  baseColor: [number, number, number],
  riskLevel: string,
): [number, number, number] {
  const tintStrength: Record<string, number> = {
    LOW: 0,
    MEDIUM: 0.15,
    HIGH: 0.35,
    CRITICAL: 0.6,
  };
  const strength = tintStrength[riskLevel] ?? 0;
  const critical: [number, number, number] = [0.85, 0.17, 0.17];
  return baseColor.map(
    (c, i) => c * (1 - strength) + critical[i] * strength,
  ) as [number, number, number];
}

/** Convert hex color string to [r, g, b] in 0-1 range. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}
