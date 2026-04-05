"""Veyra reasoning engine — injects ZWM world state context before each Claude call."""
import logging
import os
import uuid
from typing import Any

import anthropic

from src.zwm.context_client import (
    fetch_causal_chain,
    fetch_composite_risk,
    fetch_world_state,
)
from src.zwm.context_formatter import format_world_state_context

logger = logging.getLogger(__name__)

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-6")

VEYRA_SYSTEM_PROMPT = """\
You are Veyra, the reasoning engine for the Zuup World Model (ZWM).

Your role is to analyze real-time world state data drawn from nine integrated \
Solana-deployed platforms — Civium (compliance), Aureon (procurement), QAL \
(historical recon), Symbion (biological), Relian (migration), PodX (compute), \
ZUSDC (settlement), and ZuupHQ (attestation) — and produce concise, \
actionable assessments.

Before each inference call you receive a structured ZWM World State Context block. \
Treat that block as ground truth. Reason over it carefully.

Always respond with a JSON object matching this schema exactly:
{
  "assessment": "<one-sentence summary of the situation>",
  "risk_factors": ["<factor1>", "<factor2>"],
  "recommended_actions": ["<action1>", "<action2>"],
  "confidence": <float 0.0–1.0>,
  "requires_escalation": <true|false>
}

Do not include any text outside the JSON object.\
"""


class ReasoningEngine:
    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    async def trigger_reasoning(
        self,
        action_params: dict[str, Any],
        trigger_event_id: str,
    ) -> dict[str, Any]:
        context_type: str = action_params.get("context", "UNKNOWN")
        entity_id: str | None = (
            action_params.get("subjectId")
            or action_params.get("entityId")
            or action_params.get("nodeId")
        )

        # Fetch ZWM context in parallel (best-effort — failures are soft)
        world_state = None
        composite_risk = None
        causal_chain: list[dict[str, Any]] = []

        if entity_id:
            world_state, composite_risk, causal_chain = await _fetch_all(
                entity_id, trigger_event_id
            )

        # Build context block and inject into prompt
        context_block = format_world_state_context(
            entity_id=entity_id or "unknown",
            world_state=world_state,
            composite_risk=composite_risk,
            trigger_context=context_type,
            causal_chain=causal_chain,
        )
        user_prompt = _build_prompt(context_type, context_block, action_params)

        # Call Claude (streaming to prevent HTTP timeouts on long outputs)
        with self._client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            thinking={"type": "adaptive"},
            system=VEYRA_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            final = stream.get_final_message()

        output_text = next(
            (b.text for b in final.content if b.type == "text"), ""
        )

        event_id = f"veyra-{uuid.uuid4()}"
        logger.info(
            "[veyra] reasoning complete — entity=%s trigger=%s event=%s chars=%d",
            entity_id,
            context_type,
            event_id,
            len(output_text),
        )
        return {"eventId": event_id, "status": "ok", "output": output_text}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _fetch_all(
    entity_id: str, trigger_event_id: str
) -> tuple[Any, Any, list[Any]]:
    """Fetch world state, composite risk, and causal chain concurrently."""
    import asyncio

    world_state, composite_risk, causal_chain = await asyncio.gather(
        fetch_world_state(entity_id),
        fetch_composite_risk(entity_id),
        fetch_causal_chain(trigger_event_id),
        return_exceptions=False,
    )
    return world_state, composite_risk, causal_chain


def _build_prompt(
    context_type: str,
    context_block: str,
    params: dict[str, Any],
) -> str:
    if context_type == "BIOLOGICAL_ANOMALY_HIGH":
        question = (
            f"A HIGH-severity biological anomaly has been detected for subject "
            f"'{params.get('subjectId', 'unknown')}'. "
            "Review the ZWM world state context above. Provide your assessment of the risk "
            "and the immediate actions that should be taken."
        )
    elif context_type == "COMPUTE_DEGRADATION":
        avail = params.get("availability")
        avail_str = f"{float(avail) * 100:.1f}%" if avail is not None else "unknown"
        question = (
            f"Compute node '{params.get('nodeId', 'unknown')}' has degraded to "
            f"{avail_str} availability (threshold: 90.0%). "
            "Review the ZWM world state context above. Provide your assessment and "
            "recommend how compute resources should be reallocated."
        )
    else:
        question = (
            f"A '{context_type}' event has triggered this reasoning request. "
            "Review the ZWM world state context above and provide your assessment."
        )

    return f"{context_block}\n\n{question}"
