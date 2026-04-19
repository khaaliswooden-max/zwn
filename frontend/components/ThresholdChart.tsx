'use client';

import { useMemo } from 'react';

export interface Experiment {
  iteration: number;
  metric: number | null;
  f1: number | null;
  precision?: number | null;
  recall?: number | null;
  description: string;
  status: 'kept' | 'reverted' | 'error' | 'timeout' | 'parse_error';
  delta?: number;
  timestamp: string;
}

interface Props {
  baselineF1: number;
  bestF1: number;
  experiments: Experiment[];
}

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

export default function ThresholdChart({ baselineF1, bestF1, experiments }: Props) {
  const { points, yMin, yMax, runningBest } = useMemo(() => {
    const valid = experiments.filter((e) => typeof e.f1 === 'number');
    const f1s = valid.map((e) => e.f1 as number);
    const allY = [baselineF1, bestF1, ...f1s];
    let lo = Math.min(...allY);
    let hi = Math.max(...allY);
    // Widen slightly so the curve isn't flush against the axes.
    const span = Math.max(hi - lo, 0.02);
    lo = Math.max(0, lo - span * 0.15);
    hi = Math.min(1, hi + span * 0.1);

    const xRange = WIDTH - PADDING.left - PADDING.right;
    const yRange = HEIGHT - PADDING.top - PADDING.bottom;
    const count = Math.max(valid.length, 1);

    // Running best curve (always monotonically improving toward bestF1).
    let running = baselineF1;
    const pts = valid.map((exp, i) => {
      const f1 = exp.f1 as number;
      if (exp.status === 'kept' && f1 > running) running = f1;
      const x = PADDING.left + (i / Math.max(count - 1, 1)) * xRange;
      const y = PADDING.top + (1 - (f1 - lo) / (hi - lo)) * yRange;
      const yBest = PADDING.top + (1 - (running - lo) / (hi - lo)) * yRange;
      return { ...exp, f1, x, y, yBest };
    });

    return { points: pts, yMin: lo, yMax: hi, runningBest: running };
  }, [baselineF1, bestF1, experiments]);

  const yBaseline =
    PADDING.top + (1 - (baselineF1 - yMin) / (yMax - yMin)) * (HEIGHT - PADDING.top - PADDING.bottom);

  // Y-axis ticks: baseline, midpoint, best
  const ticks = [yMin, baselineF1, bestF1, yMax].sort((a, b) => a - b);
  const uniqueTicks = Array.from(new Set(ticks.map((v) => Number(v.toFixed(3)))));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="F1 score over autoresearch iterations"
      >
        {/* Plot area border */}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={WIDTH - PADDING.left - PADDING.right}
          height={HEIGHT - PADDING.top - PADDING.bottom}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="1"
        />

        {/* Y-axis gridlines + labels */}
        {uniqueTicks.map((tick) => {
          const y =
            PADDING.top + (1 - (tick - yMin) / (yMax - yMin)) * (HEIGHT - PADDING.top - PADDING.bottom);
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="#1a1a1a"
                strokeDasharray="2 3"
                strokeWidth="0.5"
              />
              <text
                x={PADDING.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                fill="#888880"
              >
                {tick.toFixed(3)}
              </text>
            </g>
          );
        })}

        {/* Baseline reference line */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={yBaseline}
          y2={yBaseline}
          stroke="#888880"
          strokeDasharray="4 3"
          strokeWidth="1"
        />
        <text
          x={WIDTH - PADDING.right - 2}
          y={yBaseline - 4}
          textAnchor="end"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fill="#888880"
        >
          baseline {baselineF1.toFixed(4)}
        </text>

        {/* Running-best curve (teal step line) */}
        {points.length > 1 && (
          <path
            d={
              'M ' +
              points
                .map((p, i) => (i === 0 ? `${p.x} ${p.yBest}` : `L ${p.x} ${p.yBest}`))
                .join(' ')
            }
            fill="none"
            stroke="#1D9E75"
            strokeWidth="1.5"
          />
        )}

        {/* Per-iteration F1 points */}
        {points.map((p) => (
          <g key={p.iteration}>
            <title>{`iter ${p.iteration}: F1=${p.f1.toFixed(4)} · ${p.status}\n${p.description}`}</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.status === 'kept' ? 3.5 : 2.5}
              fill={p.status === 'kept' ? '#1D9E75' : '#888880'}
              stroke={p.status === 'kept' ? '#0a0a0a' : 'transparent'}
              strokeWidth="1"
              fillOpacity={p.status === 'kept' ? 1 : 0.35}
            />
          </g>
        ))}

        {/* X-axis labels */}
        {points.length > 0 && (
          <>
            <text
              x={PADDING.left}
              y={HEIGHT - 8}
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              fill="#888880"
            >
              iter 1
            </text>
            <text
              x={WIDTH - PADDING.right}
              y={HEIGHT - 8}
              textAnchor="end"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              fill="#888880"
            >
              iter {points.length}
            </text>
            <text
              x={(PADDING.left + WIDTH - PADDING.right) / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              fill="#888880"
            >
              running best → {runningBest.toFixed(4)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
