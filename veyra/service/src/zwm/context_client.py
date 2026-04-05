"""ZWM GraphQL client — fetches world state from zuup-zwm-indexer."""
import os
import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

ZWM_GRAPHQL_URL = os.getenv("ZWM_GRAPHQL_URL", "http://zwm-indexer:4000/graphql")

_WORLD_STATE_QUERY = """
query WorldState($entityId: String!) {
  worldState(entityId: $entityId) {
    id
    created_at
    last_seen
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


async def fetch_world_state(entity_id: str) -> Optional[dict[str, Any]]:
    try:
        data = await _gql(_WORLD_STATE_QUERY, {"entityId": entity_id})
        return data.get("worldState")
    except Exception as exc:
        logger.warning("fetch_world_state(%s) failed: %s", entity_id, exc)
        return None


async def fetch_composite_risk(entity_id: str) -> Optional[dict[str, Any]]:
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
