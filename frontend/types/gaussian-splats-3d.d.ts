/**
 * Type declarations for @mkkellogg/gaussian-splats-3d v0.4.x
 * The library doesn't ship TypeScript types, so we declare the subset we use.
 */
declare module '@mkkellogg/gaussian-splats-3d' {
  import * as THREE from 'three';

  export interface AddSplatSceneOptions {
    splatAlphaRemovalThreshold?: number;
    showLoadingUI?: boolean;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    onProgress?: (progress: number) => void;
  }

  export interface ViewerOptions {
    selfDrivenMode?: boolean;
    useBuiltInControls?: boolean;
    sharedMemoryForWorkers?: boolean;
    threeScene?: THREE.Scene;
    renderer?: THREE.WebGLRenderer;
    camera?: THREE.Camera;
    rootElement?: HTMLElement | null;
    dropInMode?: boolean;
    logLevel?: number;
    splatAlphaRemovalThreshold?: number;
  }

  export interface DropInViewerOptions {
    sharedMemoryForWorkers?: boolean;
    splatAlphaRemovalThreshold?: number;
    logLevel?: number;
  }

  export class Viewer {
    constructor(options?: ViewerOptions);
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
    start(): void;
    update(renderer?: THREE.WebGLRenderer, camera?: THREE.Camera): void;
    dispose(): void;
    initialized: boolean;
  }

  export class DropInViewer extends THREE.Group {
    constructor(options?: DropInViewerOptions);
    viewer: Viewer;
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
  }

  export const LogLevel: {
    None: number;
    Error: number;
    Warning: number;
    Info: number;
    Debug: number;
  };
}
