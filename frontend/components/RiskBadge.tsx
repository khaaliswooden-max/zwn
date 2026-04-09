import { RISK_COLORS } from '@/lib/constants';

interface Props {
  level: string;
  small?: boolean;
}

export default function RiskBadge({ level, small }: Props) {
  const color = RISK_COLORS[level] ?? '#888780';
  const sz = small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';

  return (
    <span
      className={`inline-block rounded-sm font-semibold tracking-widest border ${sz}`}
      style={{ color, borderColor: `${color}40`, background: `${color}12` }}
    >
      {level}
    </span>
  );
}
