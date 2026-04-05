"""Formats ZWM graph data into a structured prompt context block."""
from datetime import datetime, timezone
from typing import Any, Optional


def format_world_state_context(
    entity_id: str,
    world_state: Optional[dict[str, Any]],
    composite_risk: Optional[dict[str, Any]],
    trigger_context: str,
    causal_chain: Optional[list[dict[str, Any]]] = None,
) -> str:
    lines = [
        "=== ZWM WORLD STATE CONTEXT ===",
        f"Entity:    {entity_id}",
        f"Trigger:   {trigger_context}",
        f"Retrieved: {datetime.now(timezone.utc).isoformat()}",
        "",
    ]

    if world_state:
        lines += [
            "--- Actor ---",
            f"  ID:         {world_state.get('id', 'unknown')}",
            f"  First seen: {_fmt_ts(world_state.get('created_at'))}",
            f"  Last seen:  {_fmt_ts(world_state.get('last_seen'))}",
            "",
        ]
    else:
        lines += ["--- Actor ---", "  (no actor record found in ZWM)", ""]

    if composite_risk:
        lines += [
            "--- Composite Risk ---",
            f"  Risk level:         {composite_risk.get('riskLevel', 'UNKNOWN')}",
            f"  Compliance status:  {composite_risk.get('complianceStatus') or 'N/A'}",
            f"  Compliance score:   {composite_risk.get('complianceScore') or 'N/A'}",
            f"  FitIQ score:        {composite_risk.get('fitiq') or 'N/A'}",
            f"  Compute avail:      {_fmt_pct(composite_risk.get('availability'))}",
            f"  Biological anomaly: {composite_risk.get('anomalyFlag', False)}",
            "",
        ]
    else:
        lines += ["--- Composite Risk ---", "  (no risk data available)", ""]

    if causal_chain:
        lines.append("--- Causal Chain (most recent 5) ---")
        for link in causal_chain[:5]:
            evt = link.get("event") or {}
            source = evt.get("source", "?")
            etype = evt.get("type", "?")
            effect = link.get("effect", "?")
            lag = link.get("lag_ms")
            lag_str = f"{lag:.0f} ms" if lag is not None else "?"
            lines.append(f"  [{source}] {etype} → {effect} (lag {lag_str})")
        lines.append("")

    lines.append("=== END WORLD STATE CONTEXT ===")
    return "\n".join(lines)


def _fmt_ts(ts: Any) -> str:
    if ts is None:
        return "N/A"
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return str(ts)


def _fmt_pct(val: Any) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{float(val) * 100:.2f}%"
    except Exception:
        return str(val)
