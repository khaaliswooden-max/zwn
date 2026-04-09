'use client';

import { useEffect, useState } from 'react';
import WorldCanvas from '@/components/WorldCanvas';

export default function GraphPage() {
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const calc = () => setHeight(window.innerHeight - 44 - 36); // nav + status
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return (
    <div className="w-full" style={{ height }}>
      <WorldCanvas height={height} />
    </div>
  );
}
