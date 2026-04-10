"""Formats ZWM graph data into a structured prompt context block."""
from datetime import datetime, timezone
from typing import Any, Optional


def format_world_state_context(
    entity_id: str,
    full_world_state: Optional[dict[str, Any]],
    composite_risk: Optional[dict[str, Any]],
    trigger_context: str,
    causal_chain: Optional[list[dict[str, Any]]] = None,
    active_objectives: Optional[list[dict[str, Any]]] = None,
    treaty_coverage: Optional[list[dict[str, Any]]] = None,
    jurisdictional_footprint: Optional[dict[str, Any]] = None,
    scale_assessment: Optional[dict[str, Any]] = None,
) -> str:
    lines = [
        "=== ZWM WORLD STATE CONTEXT ===",
        f"Entity:    {entity_id}",
        f"Trigger:   {trigger_context}",
        f"Retrieved: {datetime.now(timezone.utc).isoformat()}",
        "",
    ]

    if full_world_state:
        _fmt_actor(lines, full_world_state.get("actor"))
        _fmt_compliance(lines, full_world_state.get("compliance"))
        _fmt_procurement(lines, full_world_state.get("procurement"))
        _fmt_biological(lines, full_world_state.get("biological"))
        _fmt_historical(lines, full_world_state.get("historical"))
        _fmt_migration(lines, full_world_state.get("migration"))
        _fmt_compute(lines, full_world_state.get("compute"))
    elif composite_risk:
        # Fallback: only aggregated risk is available
        _fmt_composite_risk_fallback(lines, composite_risk)
    else:
        lines += ["(no world state data available in ZWM)", ""]

    if causal_chain:
        lines.append("--- Causal Chain (most recent 5) ---")
        for link in causal_chain[:5]:
            evt = link.get("event") or {}
            lag = link.get("lag_ms")
            lag_str = f"{lag:.0f} ms" if lag is not None else "?"
            lines.append(
                f"  [{evt.get('source', '?')}] {evt.get('type', '?')} "
                f"→ {link.get('effect', '?')} (lag {lag_str})"
            )
        lines.append("")

    # Governance + Economics context (Phase 4 — 100-year positioning)
    _fmt_objectives(lines, active_objectives)
    _fmt_treaties(lines, treaty_coverage, jurisdictional_footprint)
    _fmt_scale(lines, scale_assessment)

    lines.append("=== END WORLD STATE CONTEXT ===")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Per-substrate formatters
# ---------------------------------------------------------------------------

def _fmt_actor(lines: list[str], actor: Optional[dict[str, Any]]) -> None:
    lines.append("--- Actor ---")
    if actor:
        lines += [
            f"  ID:         {actor.get('id', 'unknown')}",
            f"  First seen: {_fmt_ts(actor.get('created_at'))}",
            f"  Last seen:  {_fmt_ts(actor.get('last_seen'))}",
        ]
    else:
        lines.append("  (no actor record found in ZWM)")
    lines.append("")


def _fmt_compliance(lines: list[str], cs: Optional[dict[str, Any]]) -> None:
    lines.append("--- Compliance (Civium) ---")
    if cs:
        lines += [
            f"  Status:         {cs.get('status', 'N/A')}",
            f"  Score:          {cs.get('score', 'N/A')}",
            f"  Domain:         {cs.get('domain', 'N/A')}",
            f"  As of:          {_fmt_ts(cs.get('timestamp'))}",
            f"  Solana slot:    {cs.get('solana_slot', 'N/A')}",
        ]
    else:
        lines.append("  (no compliance state on record)")
    lines.append("")


def _fmt_procurement(lines: list[str], ps: Optional[dict[str, Any]]) -> None:
    lines.append("--- Procurement (Aureon) ---")
    if ps:
        lines += [
            f"  FitIQ score:    {ps.get('fitiq', 'N/A')}",
            f"  UPD score:      {ps.get('upd', 'N/A')}",
            f"  As of:          {_fmt_ts(ps.get('timestamp'))}",
        ]
    else:
        lines.append("  (no procurement state on record)")
    lines.append("")


def _fmt_biological(lines: list[str], bs: Optional[dict[str, Any]]) -> None:
    lines.append("--- Biological (Symbion) ---")
    if bs:
        anomaly = bs.get("anomaly_flag", False)
        lines += [
            f"  Anomaly flag:   {anomaly}",
            f"  Serotonin:      {_fmt_nm(bs.get('serotonin'))}",
            f"  Dopamine:       {_fmt_nm(bs.get('dopamine'))}",
            f"  Cortisol:       {_fmt_nm(bs.get('cortisol'))}",
            f"  GABA:           {_fmt_nm(bs.get('gaba'))}",
            f"  As of:          {_fmt_ts(bs.get('timestamp'))}",
        ]
    else:
        lines.append("  (no biological state on record)")
    lines.append("")


def _fmt_historical(lines: list[str], hr: Optional[dict[str, Any]]) -> None:
    lines.append("--- Historical Recon (QAL) ---")
    if hr:
        lines += [
            f"  Domain:         {hr.get('domain', 'N/A')}",
            f"  Confidence:     {_fmt_float(hr.get('confidence'))}",
            f"  Temporal depth: {hr.get('temporal_depth_years', 'N/A')} years",
            f"  As of:          {_fmt_ts(hr.get('timestamp'))}",
        ]
    else:
        lines.append("  (no historical recon on record)")
    lines.append("")


def _fmt_migration(lines: list[str], ms: Optional[dict[str, Any]]) -> None:
    lines.append("--- Migration (Relian) ---")
    if ms:
        lines += [
            f"  Semantic pres.: {_fmt_pct(ms.get('semantic_preservation'))}",
            f"  Test coverage:  {_fmt_pct(ms.get('test_coverage'))}",
            f"  As of:          {_fmt_ts(ms.get('timestamp'))}",
        ]
    else:
        lines.append("  (no migration state on record)")
    lines.append("")


def _fmt_compute(lines: list[str], cs: Optional[dict[str, Any]]) -> None:
    lines.append("--- Compute (PodX) ---")
    if cs:
        lines += [
            f"  Availability:   {_fmt_pct(cs.get('availability'))}",
            f"  XdoP score:     {cs.get('xdop_score', 'N/A')}",
            f"  WCBI score:     {cs.get('wcbi', 'N/A')}",
            f"  DDIL hours:     {cs.get('ddil_hours', 'N/A')}",
            f"  TOPS:           {cs.get('tops', 'N/A')}",
            f"  As of:          {_fmt_ts(cs.get('timestamp'))}",
        ]
    else:
        lines.append("  (no compute state on record)")
    lines.append("")


def _fmt_composite_risk_fallback(
    lines: list[str], risk: dict[str, Any]
) -> None:
    """Used when fullWorldState is unavailable — aggregated risk only."""
    lines += [
        "--- Risk Summary (aggregated) ---",
        f"  Risk level:         {risk.get('riskLevel', 'UNKNOWN')}",
        f"  Compliance status:  {risk.get('complianceStatus') or 'N/A'}",
        f"  Compliance score:   {risk.get('complianceScore') or 'N/A'}",
        f"  FitIQ score:        {risk.get('fitiq') or 'N/A'}",
        f"  Compute avail:      {_fmt_pct(risk.get('availability'))}",
        f"  Biological anomaly: {risk.get('anomalyFlag', False)}",
        "",
    ]


# ---------------------------------------------------------------------------
# Governance + Economics formatters (Phase 4)
# ---------------------------------------------------------------------------

def _fmt_objectives(lines: list[str], objectives: Optional[list[dict[str, Any]]]) -> None:
    lines.append("--- Active Objectives (Objective Register) ---")
    if objectives:
        for obj in objectives[:5]:
            lines += [
                f"  [{obj.get('objective_type', '?')}] {obj.get('target_metric', '?')} "
                f"= {obj.get('target_value', '?')} "
                f"(horizon: {obj.get('time_horizon_years', '?')}yr, "
                f"omega floor: {_fmt_float(obj.get('omega_floor'))}, "
                f"status: {obj.get('status', '?')})",
            ]
    else:
        lines.append("  (no active objectives in Objective Register)")
    lines.append("")


def _fmt_treaties(
    lines: list[str],
    treaties: Optional[list[dict[str, Any]]],
    footprint: Optional[dict[str, Any]],
) -> None:
    lines.append("--- Treaty Coverage (Jurisdictional Footprint) ---")
    if footprint:
        lines += [
            f"  Total treaties:       {footprint.get('totalTreaties', 0)}",
            f"  Active jurisdictions: {footprint.get('activeJurisdictions', 0)}",
            f"  Coverage domains:     {', '.join(footprint.get('coverageDomains') or ['none'])}",
        ]
    if treaties:
        lines.append("  Recent treaties:")
        for t in treaties[:5]:
            lines.append(
                f"    [{t.get('jurisdiction_code', '?')}] {t.get('jurisdiction_name', '?')} "
                f"— {t.get('treaty_type', '?')} ({t.get('compliance_domain', '?')}) "
                f"effective {_fmt_ts(t.get('effective_date'))}"
            )
    elif not footprint:
        lines.append("  (no treaty attestations on record)")
    lines.append("")


def _fmt_scale(lines: list[str], scale: Optional[dict[str, Any]]) -> None:
    lines.append("--- Scale Coherence (D7) ---")
    if scale:
        lines += [
            f"  Platform:       {scale.get('platform', '?')}",
            f"  omega_rsf:      {_fmt_float(scale.get('omega_rsf'))}",
            f"  omega_max:      {_fmt_float(scale.get('omega_max'))}",
            f"  Entropy prod.:  {_fmt_float(scale.get('entropy_production'))}",
            f"  Lyapunov exp.:  {_fmt_float(scale.get('lyapunov_exponent'))}",
            f"  Assessment:     {scale.get('assessment_status', '?')}",
            f"  As of:          {_fmt_ts(scale.get('timestamp'))}",
        ]
    else:
        lines.append("  (no scale assessment available)")
    lines.append("")


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

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


def _fmt_nm(val: Any) -> str:
    """Format nanomolar biomarker value."""
    if val is None:
        return "N/A"
    try:
        return f"{float(val):.3f} nM"
    except Exception:
        return str(val)


def _fmt_float(val: Any) -> str:
    if val is None:
        return "N/A"
    try:
        return f"{float(val):.4f}"
    except Exception:
        return str(val)
