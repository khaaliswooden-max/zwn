export default function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] tracking-widest font-semibold bg-zwn-amber/10 text-zwn-amber border border-zwn-amber/20 ${className}`}
    >
      DEMO DATA
    </span>
  );
}
