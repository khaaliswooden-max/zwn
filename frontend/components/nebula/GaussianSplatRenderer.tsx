'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ClusterDescriptor, GaussianParams, CausalAnimation } from '@/lib/nebula/types';
import { computeDepthOrder, reorderBuffer } from '@/lib/nebula/depth-sort';
import { SIMPLEX_NOISE_3D, FBM_3D } from '@/lib/nebula/noise.glsl';
import { supportsVolumetric } from '@/lib/nebula/capabilities';

// ── Volumetric Shaders (Tier 2 — WebGL2+) ──────────────────────────────────

const VERT_VOLUMETRIC = /* glsl */ `
precision highp float;

attribute vec3 instancePosition;
attribute vec3 instanceScale;
attribute vec4 instanceColor;
attribute float instanceIntensity;

uniform float uTime;

varying vec2 vUv;
varying vec4 vColor;
varying float vIntensity;
varying vec3 vWorldPos;

void main() {
  vUv = position.xy;
  vColor = instanceColor;
  vIntensity = instanceIntensity;

  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  float sx = instanceScale.x * 3.0;
  float sy = instanceScale.y * 3.0;

  vec3 worldPos = instancePosition
    + camRight * position.x * sx
    + camUp    * position.y * sy;

  vWorldPos = instancePosition;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const FRAG_VOLUMETRIC = /* glsl */ `
precision highp float;

${SIMPLEX_NOISE_3D}
${FBM_3D}

uniform float uTime;
uniform float uTurbulenceSpeed;

varying vec2 vUv;
varying vec4 vColor;
varying float vIntensity;
varying vec3 vWorldPos;

void main() {
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;

  // Sample 3D noise at world position offset by time
  float n = fbm(vWorldPos * 3.0 + uTime * uTurbulenceSpeed * 0.15);

  // Volumetric Gaussian falloff modulated by noise
  float g = exp(-4.5 * d2);
  float volumetric = g * (0.6 + 0.4 * n);

  // Inner core glow — bright concentrated center
  float core = exp(-12.0 * d2) * vIntensity * 1.5;

  // Outer halo — soft light scatter
  float halo = exp(-1.5 * d2) * 0.15;

  // Combine layers
  float shape = max(volumetric, 0.0) + core + halo;
  float alpha = shape * vColor.a * vIntensity;
  vec3 color = vColor.rgb * vIntensity * (max(volumetric, 0.0) + core * 2.0)
             + vColor.rgb * halo * 0.5;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

// ── Fallback Shaders (WebGL1) ───────────────────────────────────────────────

const VERT_BASIC = /* glsl */ `
precision highp float;

attribute vec3 instancePosition;
attribute vec3 instanceScale;
attribute vec4 instanceColor;
attribute float instanceIntensity;

varying vec2 vUv;
varying vec4 vColor;
varying float vIntensity;

void main() {
  vUv = position.xy;
  vColor = instanceColor;
  vIntensity = instanceIntensity;

  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  float sx = instanceScale.x * 3.0;
  float sy = instanceScale.y * 3.0;

  vec3 worldPos = instancePosition
    + camRight * position.x * sx
    + camUp    * position.y * sy;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const FRAG_BASIC = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec4 vColor;
varying float vIntensity;

void main() {
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float g = exp(-4.5 * d2);

  float alpha = g * vColor.a * vIntensity;
  vec3 color = vColor.rgb * vIntensity;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

// ── Turbulence speed per risk level ─────────────────────────────────────────

const TURBULENCE_MAP: Record<string, number> = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 1.0,
  CRITICAL: 1.8,
};

function getDominantTurbulence(clusters: ClusterDescriptor[]): number {
  let maxTurb = 0.3;
  for (const c of clusters) {
    const t = TURBULENCE_MAP[c.riskLevel] ?? 0.3;
    if (t > maxTurb) maxTurb = t;
  }
  return maxTurb;
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  clusters: ClusterDescriptor[];
  causalAnimations?: CausalAnimation[];
  selectedClusterId?: string | null;
}

export default function GaussianSplatRenderer({
  clusters,
  causalAnimations,
  selectedClusterId,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const lastSortCamPos = useRef(new THREE.Vector3());
  const volumetric = useRef(supportsVolumetric());

  const { geometry, material, totalCount, clusterRanges } = useMemo(() => {
    const allGaussians: GaussianParams[] = [];
    const ranges: { clusterId: string; start: number; count: number }[] = [];

    for (const cluster of clusters) {
      const start = allGaussians.length;
      allGaussians.push(...cluster.gaussians);
      ranges.push({
        clusterId: cluster.nodeId,
        start,
        count: cluster.gaussians.length,
      });
    }

    const transitReserve = 30;
    const count = allGaussians.length + transitReserve;

    const quadPositions = new Float32Array([
      -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    ]);
    const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    geo.setIndex(new THREE.BufferAttribute(quadIndices, 1));
    geo.instanceCount = allGaussians.length;

    const posArr = new Float32Array(count * 3);
    const scaleArr = new Float32Array(count * 3);
    const colorArr = new Float32Array(count * 4);
    const intensityArr = new Float32Array(count);

    for (let i = 0; i < allGaussians.length; i++) {
      const g = allGaussians[i];
      posArr[i * 3] = g.position[0];
      posArr[i * 3 + 1] = g.position[1];
      posArr[i * 3 + 2] = g.position[2];
      scaleArr[i * 3] = g.scale[0];
      scaleArr[i * 3 + 1] = g.scale[1];
      scaleArr[i * 3 + 2] = g.scale[2];
      colorArr[i * 4] = g.color[0];
      colorArr[i * 4 + 1] = g.color[1];
      colorArr[i * 4 + 2] = g.color[2];
      colorArr[i * 4 + 3] = g.opacity;
      intensityArr[i] = g.intensity;
    }

    const posAttr = new THREE.InstancedBufferAttribute(posArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const scaleAttr = new THREE.InstancedBufferAttribute(scaleArr, 3);
    scaleAttr.setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.InstancedBufferAttribute(colorArr, 4);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const intensityAttr = new THREE.InstancedBufferAttribute(intensityArr, 1);
    intensityAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('instancePosition', posAttr);
    geo.setAttribute('instanceScale', scaleAttr);
    geo.setAttribute('instanceColor', colorAttr);
    geo.setAttribute('instanceIntensity', intensityAttr);

    const useVolumetric = volumetric.current;
    const turbulence = getDominantTurbulence(clusters);

    const mat = new THREE.ShaderMaterial({
      vertexShader: useVolumetric ? VERT_VOLUMETRIC : VERT_BASIC,
      fragmentShader: useVolumetric ? FRAG_VOLUMETRIC : FRAG_BASIC,
      uniforms: useVolumetric
        ? {
            uTime: { value: 0 },
            uTurbulenceSpeed: { value: turbulence },
          }
        : {},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });

    return { geometry: geo, material: mat, totalCount: count, clusterRanges: ranges };
  }, [clusters]);

  // Store base positions for breathing animation
  const basePositions = useRef<Float32Array | null>(null);
  if (!basePositions.current || basePositions.current.length !== totalCount * 3) {
    const posAttr = geometry.getAttribute('instancePosition') as THREE.InstancedBufferAttribute;
    basePositions.current = new Float32Array(posAttr.array.length);
    basePositions.current.set(posAttr.array as Float32Array);
  }

  const driftVelocities = useRef<Float32Array | null>(null);
  if (!driftVelocities.current || driftVelocities.current.length !== totalCount * 3) {
    driftVelocities.current = new Float32Array(totalCount * 3);
  }

  // Refs for props that change frequently — avoids recreating the useFrame callback
  const selectedRef = useRef(selectedClusterId);
  selectedRef.current = selectedClusterId;
  const causalRef = useRef(causalAnimations);
  causalRef.current = causalAnimations;

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = clock.elapsedTime;
    const currentSelected = selectedRef.current;
    const currentCausalAnims = causalRef.current;

    // Update time uniform for volumetric shaders
    if (volumetric.current && material.uniforms.uTime) {
      material.uniforms.uTime.value = time;
    }

    const geo = mesh.geometry as THREE.InstancedBufferGeometry;
    const posAttr = geo.getAttribute('instancePosition') as THREE.InstancedBufferAttribute;
    const scaleAttr = geo.getAttribute('instanceScale') as THREE.InstancedBufferAttribute;
    const colorAttr = geo.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
    const intensityAttr = geo.getAttribute('instanceIntensity') as THREE.InstancedBufferAttribute;

    const posData = posAttr.array as Float32Array;
    const scaleData = scaleAttr.array as Float32Array;
    const colorData = colorAttr.array as Float32Array;
    const intensityData = intensityAttr.array as Float32Array;
    const basePosData = basePositions.current!;
    const driftData = driftVelocities.current!;

    let instanceCount = 0;

    for (const cluster of clusters) {
      const range = clusterRanges.find((r) => r.clusterId === cluster.nodeId);
      if (!range) continue;

      const isSelected = currentSelected === cluster.nodeId;
      const isDimmed = currentSelected != null && !isSelected;

      for (let i = range.start; i < range.start + range.count; i++) {
        const gi = i - range.start;
        const g = cluster.gaussians[gi];
        if (!g) continue;

        const breathe =
          cluster.pulseRate > 0
            ? 1 + 0.05 * Math.sin(time * cluster.pulseRate * Math.PI * 2 + gi * 0.7)
            : 1;

        driftData[i * 3] += (Math.random() - 0.5) * 0.003;
        driftData[i * 3 + 1] += (Math.random() - 0.5) * 0.003;
        driftData[i * 3 + 2] += (Math.random() - 0.5) * 0.003;
        driftData[i * 3] *= 0.98;
        driftData[i * 3 + 1] *= 0.98;
        driftData[i * 3 + 2] *= 0.98;

        posData[i * 3] = basePosData[i * 3] + driftData[i * 3];
        posData[i * 3 + 1] = basePosData[i * 3 + 1] + driftData[i * 3 + 1];
        posData[i * 3 + 2] = basePosData[i * 3 + 2] + driftData[i * 3 + 2];

        scaleData[i * 3] = g.scale[0] * breathe;
        scaleData[i * 3 + 1] = g.scale[1] * breathe;
        scaleData[i * 3 + 2] = g.scale[2] * breathe;

        colorData[i * 4] = g.color[0];
        colorData[i * 4 + 1] = g.color[1];
        colorData[i * 4 + 2] = g.color[2];
        colorData[i * 4 + 3] = isDimmed ? g.opacity * 0.2 : isSelected ? Math.min(g.opacity * 1.3, 1) : g.opacity;

        intensityData[i] = g.intensity * breathe;

        instanceCount = Math.max(instanceCount, i + 1);
      }
    }

    if (currentCausalAnims) {
      for (const anim of currentCausalAnims) {
        if (anim.phase === 'transit' || anim.phase === 'emit') {
          for (const tg of anim.transitGaussians) {
            if (instanceCount >= totalCount) break;
            const i = instanceCount;
            posData[i * 3] = tg.position[0];
            posData[i * 3 + 1] = tg.position[1];
            posData[i * 3 + 2] = tg.position[2];
            scaleData[i * 3] = tg.scale[0];
            scaleData[i * 3 + 1] = tg.scale[1];
            scaleData[i * 3 + 2] = tg.scale[2];
            colorData[i * 4] = tg.color[0];
            colorData[i * 4 + 1] = tg.color[1];
            colorData[i * 4 + 2] = tg.color[2];
            colorData[i * 4 + 3] = tg.opacity;
            intensityData[i] = tg.intensity;
            instanceCount++;
          }
        }
      }
    }

    geo.instanceCount = instanceCount;

    // Depth sort when camera has moved significantly
    const camPos = camera.position;
    if (lastSortCamPos.current.distanceTo(camPos) > 0.3) {
      lastSortCamPos.current.copy(camPos);
      const mvMatrix = new THREE.Matrix4().multiplyMatrices(
        camera.matrixWorldInverse,
        mesh.matrixWorld,
      );
      const sortOrder = computeDepthOrder(posData, instanceCount, mvMatrix);
      reorderBuffer(posData, sortOrder, 3);
      reorderBuffer(scaleData, sortOrder, 3);
      reorderBuffer(colorData, sortOrder, 4);
      reorderBuffer(intensityData, sortOrder, 1);
    }

    posAttr.needsUpdate = true;
    scaleAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    intensityAttr.needsUpdate = true;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
