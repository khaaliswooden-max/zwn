"""ZWM GraphQL client — fetches world state from zuup-zwm-indexer."""
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

ZWM_GRAPHQL_URL = os.getenv("ZWM_GRAPHQL_URL", "http://zwm-indexer:4000/graphql")

# Full substrate state — returns actor + all current state nodes in one query
_FULL_WORLD_STATE_QUERY = """
query FullWorldState($entityId: String!) {
  fullWorldState(entityId: $entityId) {
    actor {
      id
      created_at
      last_seen
    }
    compliance {
      id
      entity_id
      status
      score
      domain
      timestamp
      solana_slot
      tx_signature
    }
    procurement {
      id
      entity_id
      fitiq
      upd
      timestamp
      solana_slot
    }
    biological {
      id
      entity_id
      serotonin
      dopamine
      cortisol
      gaba
      anomaly_flag
      timestamp
    }
    historical {
      id
      entity_id
      domain
      confidence
      temporal_depth_years
      timestamp
    }
    migration {
      id
      project_id
      semantic_preservation
      test_coverage
      timestamp
    }
    compute {
      id
      entity_id
      xdop_score
      wcbi
      ddil_hours
      tops
      availability
      timestamp
    }
  }
}
"""

_COMPOSITE_RISK_QUERY = """
query CompositeRisk($entityId: String!) {
  compositeRisk(entityId: $entityId) {
    entityId
    complianceStatus
    complianceScore
    fitiq
    availability
    anomalyFlag
    riskLevel
  }
}
"""

_CAUSAL_CHAIN_QUERY = """
query CausalChain($substrateEventId: String!) {
  causalChain(substrateEventId: $substrateEventId) {
    event {
      id
      type
      source
      entity_id
      timestamp
    }
    effect
    lag_ms
  }
}
"""


async def _gql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            ZWM_GRAPHQL_URL,
            json={"query": query, "variables": variables},
        )
        resp.raise_for_status()
        payload = resp.json()
        if "errors" in payload:
            raise RuntimeError(f"GraphQL errors: {payload['errors']}")
        return payload.get("data", {})


async def fetch_full_world_state(entity_id: str) -> Optional[dict[str, Any]]:
    """Returns actor + all current substrate state nodes in one round trip."""
    try:
        data = await _gql(_FULL_WORLD_STATE_QUERY, {"entityId": entity_id})
        return data.get("fullWorldState")
    except Exception as exc:
        logger.warning("fetch_full_world_state(%s) failed: %s", entity_id, exc)
        return None


async def fetch_composite_risk(entity_id: str) -> Optional[dict[str, Any]]:
    """Aggregate risk scores — used as a fallback summary when full state is unavailable."""
    try:
        data = await _gql(_COMPOSITE_RISK_QUERY, {"entityId": entity_id})
        return data.get("compositeRisk")
    except Exception as exc:
        logger.warning("fetch_composite_risk(%s) failed: %s", entity_id, exc)
        return None


async def fetch_causal_chain(substrate_event_id: str) -> list[dict[str, Any]]:
    try:
        data = await _gql(_CAUSAL_CHAIN_QUERY, {"substrateEventId": substrate_event_id})
        return data.get("causalChain") or []
    except Exception as exc:
        logger.warning("fetch_causal_chain(%s) failed: %s", substrate_event_id, exc)
        return []


# ---------------------------------------------------------------------------
# Governance + Economics queries (Phase 4 — 100-year positioning)
# ---------------------------------------------------------------------------

_ACTIVE_OBJECTIVES_QUERY = """
query ActiveObjectives {
  activeObjectives {
    id
    objective_type
    target_metric
    target_value
    time_horizon_years
    omega_floor
    lyapunov_envelope
    status
    proposer_id
    timestamp
  }
}
"""

_TREATY_COVERAGE_QUERY = """
query TreatyCoverage {
  treatyCoverage {
    id
    jurisdiction_code
    jurisdiction_name
    treaty_type
    compliance_domain
    bilateral_partner
    effective_date
    expiry_date
    timestamp
  }
}
"""

_JURISDICTIONAL_FOOTPRINT_QUERY = """
query JurisdictionalFootprint {
  jurisdictionalFootprint {
    totalTreaties
    activeJurisdictions
    jurisdictionCodes
    coverageDomains
  }
}
"""

_SCALE_ASSESSMENT_QUERY = """
query ScaleAssessment($platform: String!) {
  scaleAssessment(platform: $platform) {
    id
    platform
    omega_rsf
    omega_max
    entropy_production
    lyapunov_exponent
    market_footprint
    jurisdictional_coverage
    assessment_status
    timestamp
  }
}
"""


async def fetch_active_objectives() -> list[dict[str, Any]]:
    """Returns current active/approved objectives from the Objective Register."""
    try:
        data = await _gql(_ACTIVE_OBJECTIVES_QUERY, {})
        return data.get("activeObjectives") or []
    except Exception as exc:
        logger.warning("fetch_active_objectives failed: %s", exc)
        return []


async def fetch_treaty_coverage() -> list[dict[str, Any]]:
    """Returns all non-expired treaty attestations."""
    try:
        data = await _gql(_TREATY_COVERAGE_QUERY, {})
        return data.get("treatyCoverage") or []
    except Exception as exc:
        logger.warning("fetch_treaty_coverage failed: %s", exc)
        return []


async def fetch_jurisdictional_footprint() -> Optional[dict[str, Any]]:
    """Returns aggregate jurisdictional coverage stats."""
    try:
        data = await _gql(_JURISDICTIONAL_FOOTPRINT_QUERY, {})
        return data.get("jurisdictionalFootprint")
    except Exception as exc:
        logger.warning("fetch_jurisdictional_footprint failed: %s", exc)
        return None


async def fetch_scale_assessment(platform: str) -> Optional[dict[str, Any]]:
    """Returns the current D7 Scale Coherence assessment for a platform."""
    try:
        data = await _gql(_SCALE_ASSESSMENT_QUERY, {"platform": platform})
        return data.get("scaleAssessment")
    except Exception as exc:
        logger.warning("fetch_scale_assessment(%s) failed: %s", platform, exc)
        return None
