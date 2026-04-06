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
