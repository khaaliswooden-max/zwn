import RiskBadge from './RiskBadge';

interface RiskData {
  riskLevel: string;
  complianceStatus?: string;
  complianceScore?: number;
  fitiq?: number | null;
  availability?: number | null;
  anomalyFlag?: boolean;
}

interface Props {
  entityId: string;
  risk: RiskData;
  lastSeen?: number;
}

export default function EntityCard({ entityId, risk, lastSeen }: Props) {
  const signals = [
    risk.complianceStatus && `${risk.complianceStatus} (${risk.complianceScore ?? '—'}/100)`,
    risk.fitiq != null && `FitIQ ${risk.fitiq}`,
    risk.availability != null && `avail ${risk.availability}`,
    risk.anomalyFlag && 'ANOMALY',
  ].filter(Boolean);

  return (
    <div className="border border-zwn-border bg-zwn-surface rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zwn-text font-medium">{entityId}</span>
        <RiskBadge level={risk.riskLevel} />
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signals.map((s, i) => (
            <span
              key={i}
              className="text-[10px] text-zwn-muted border border-zwn-border rounded px-2 py-0.5"
            >
              {String(s)}
            </span>
          ))}
        </div>
      )}

      {lastSeen && (
        <div className="text-[9px] text-zwn-border">
          last seen {new Date(lastSeen).toISOString().slice(0, 19).replace('T', ' ')}
        </div>
      )}
    </div>
  );
}
