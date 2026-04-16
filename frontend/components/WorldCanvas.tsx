'use client';

import { Component, ReactNode } from 'react';
import dynamic from 'next/dynamic';

const NebulaCanvas = dynamic(
  () => import('@/components/nebula/NebulaCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-zwn-muted text-[11px] tracking-widest bg-zwn-bg">
        loading world model...
      </div>
    ),
  },
);

interface ErrorState {
  hasError: boolean;
  error: string;
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; height?: number; splatUrl?: string },
  ErrorState
> {
  constructor(props: { children: ReactNode; height?: number; splatUrl?: string }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorState {
    return { hasError: true, error: error.message || String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zwn-bg text-zwn-muted text-[11px] tracking-widest gap-4 p-8">
          <div className="text-zwn-coral">canvas failed to initialize</div>
          <div className="text-[9px] max-w-md break-all text-center opacity-60">
            {this.state.error}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="text-[10px] text-zwn-teal border border-zwn-border px-3 py-1 rounded hover:bg-zwn-surface"
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  height?: number;
  /** Optional 3DGS splat URL to render as an environmental backdrop. */
  splatUrl?: string;
  /** External camera focus target — triggers fly-to animation when set. */
  focusTarget?: [number, number, number] | null;
}

export default function WorldCanvas({ height, splatUrl, focusTarget }: Props) {
  return (
    <CanvasErrorBoundary height={height} splatUrl={splatUrl}>
      <NebulaCanvas height={height} splatUrl={splatUrl} focusTarget={focusTarget} />
    </CanvasErrorBoundary>
  );
}
