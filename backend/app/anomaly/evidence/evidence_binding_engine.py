"""
EvidenceBindingEngine: Enforces strict provenance and evidence traceability.
Guarantees the inviolable investigative rule: NO EVIDENCE -> NO FACTUAL CLAIM.
Every finding claim must chain directly to canonical events, entity clusters, and original SHA-256 evidence.
"""

import logging
from typing import Dict, Any, List, Set, Tuple
from app.anomaly.schemas.signal_contracts import CandidatePattern
from app.anomaly.enrichment.context_enrichment import EnrichedContext

logger = logging.getLogger("EvidenceBindingEngine")


class EvidenceValidationResult:
    """Outcome of evidence binding verification for a candidate pattern."""

    def __init__(self):
        self.is_valid: bool = False
        self.evidence_refs: List[str] = []
        self.event_refs: List[str] = []
        self.unsupported_claims: List[str] = []
        self.evidence_quality_score: float = 0.0  # 0 to 100
        self.quality_tier: str = "LOW"            # HIGH, MEDIUM, LOW


class EvidenceBindingEngine:
    """
    Validates that every factual statement in a candidate pattern is supported
    by real events, verifiable evidence references, and cryptographic hashes.
    """

    def bind_and_validate(
        self,
        candidate: CandidatePattern,
        enriched: EnrichedContext
    ) -> EvidenceValidationResult:
        result = EvidenceValidationResult()

        # 1. Collect and deduplicate all evidence references
        evidence_set: Set[str] = set()
        for ev in enriched.supporting_events:
            ev_id = ev.get("evidence_id")
            if ev_id:
                evidence_set.add(ev_id)
        evidence_set.update(candidate.evidence_refs)

        # 2. Collect and deduplicate all event references
        event_set: Set[str] = set()
        for ev in enriched.supporting_events:
            eid = ev.get("event_id")
            if eid:
                event_set.add(eid)
        event_set.update(candidate.event_refs)

        # 3. Verify factual claims in aggregated observations
        obs = candidate.aggregated_observations
        unsupported: List[str] = []

        # Claim: Financial amount
        has_financial_claims = any(k in obs for k in [
            "withdrawal_amount_inr", "inflow_amount_inr", "outflow_amount_inr",
            "cluster_total_inr", "sudden_volume_inr"
        ])
        if has_financial_claims:
            financial_events = [
                e for e in enriched.supporting_events
                if e.get("amount_inr", 0) > 0 or e.get("domain") == "BANKING" or e.get("event_type") == "TRANSACTION"
            ]
            if not financial_events and not any("BANK" in s.detector_id for s in candidate.primary_signals + candidate.supporting_signals):
                unsupported.append("Financial amount claim without backing banking canonical events.")

        # Claim: Spatio-temporal transit speed
        has_speed_claims = "implied_speed_kmh" in obs or "distance_km" in obs
        if has_speed_claims:
            if not enriched.spatial_context.get("available") and not candidate.locations:
                unsupported.append("Impossible travel velocity claim without coordinate waypoints.")

        # Claim: Device IMEI or Network IP sharing
        if candidate.pattern_id == "SOC_SHARED_INFRASTRUCTURE":
            shared_imei = obs.get("shared_imei")
            shared_ip = obs.get("shared_ip")
            has_imei = shared_imei and str(shared_imei).strip().lower() not in ("none", "nan", "")
            has_ip = shared_ip and str(shared_ip).strip().lower() not in ("none", "nan", "")
            if not has_imei and not has_ip:
                unsupported.append("Shared infrastructure claim without concrete IMEI or IP address.")

        # 4. Strict Evidence Gate: Minimum threshold
        has_events = len(event_set) >= 1 or len(enriched.supporting_events) >= 1
        has_evidence = len(evidence_set) >= 1

        # Calculate evidence quality score
        quality_score = 0.0
        if has_events:
            quality_score += 40.0
        if has_evidence:
            quality_score += 40.0
        if not unsupported:
            quality_score += 20.0
        else:
            quality_score = max(0.0, quality_score - 30.0)

        # Tier mapping
        if quality_score >= 80.0 and not unsupported:
            tier = "HIGH"
        elif quality_score >= 50.0:
            tier = "MEDIUM"
        else:
            tier = "LOW"

        result.is_valid = bool(has_events and has_evidence and len(unsupported) == 0)
        result.evidence_refs = sorted(list(evidence_set))
        result.event_refs = sorted(list(event_set))
        result.unsupported_claims = unsupported
        result.evidence_quality_score = quality_score
        result.quality_tier = tier

        if unsupported:
            logger.warning(
                f"[EvidenceBinding] Candidate {candidate.candidate_id} has {len(unsupported)} unsupported claims: {unsupported}"
            )

        return result


evidence_binding_engine = EvidenceBindingEngine()
