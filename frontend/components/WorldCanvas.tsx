'use client';

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

interface Props {
  height?: number;
}

export default function WorldCanvas({ height }: Props) {
  return <NebulaCanvas height={height} />;
}
