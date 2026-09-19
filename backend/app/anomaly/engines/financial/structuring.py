from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class StructuringSmurfingDetector(BaseDetector):
    """
    Engine #6A: Structuring / Smurfing Anomaly Detector.
    Identifies intentional structuring of transactions slightly below regulatory
    reporting thresholds (e.g. ₹4,75,000 to ₹4,99,000 against a ₹5,00,000 cap).
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-FIN-STRUCTURING",
            name="Structuring & Smurfing Detector",
            version="v2.0.0",
            detector_type=DetectorType.FINANCIAL,
            domain="BANKING",
            applicable_domains=["BANKING"],
            required_fields=["financial.transaction_count"],
            min_sample_size=1,
            description="Identifies near-threshold transaction clusters designed to evade mandatory reporting."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        bank_events = entity_data.get("events_by_domain", {}).get("BANKING", [])
        if not bank_events:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="No banking transactions recorded for this entity."
            )

        cap = anomaly_config.financial.structuring_daily_cap_inr
        lower_bound = cap * anomaly_config.financial.structuring_lower_bound_ratio

        near_threshold_txns = []
        for e in bank_events:
            amt = e.get("financial", {}).get("amount_inr", 0.0)
            if amt and lower_bound <= amt < cap:
                near_threshold_txns.append({
                    "event_id": e.get("event_id"),
                    "amount_inr": amt,
                    "counterparty": e.get("financial", {}).get("counterparty"),
                    "timestamp": e.get("timestamp")
                })

        min_txns = anomaly_config.financial.structuring_min_transactions
        if len(near_threshold_txns) < min_txns:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        total_structured = sum(t["amount_inr"] for t in near_threshold_txns)
        signals = [
            f"Structuring Pattern Detected: {len(near_threshold_txns)} transactions totaling ₹{total_structured:,.2f} occurred just below the ₹{cap:,.2f} reporting threshold (range ₹{lower_bound:,.2f} - ₹{cap:,.2f})."
        ]
        score = min(100.0, 60.0 + (len(near_threshold_txns) * 12.0))
        explanation = f"Detected {len(near_threshold_txns)} transactions systematically placed between 70% and 99% of regulatory limit."

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(len(near_threshold_txns)),
            normalized_score=round(score, 1),
            confidence=0.92,
            title="Financial Structuring / Smurfing Pattern",
            signals=signals,
            features={
                "structured_txns_count": len(near_threshold_txns),
                "structured_total_inr": round(total_structured, 2),
                "reporting_cap_inr": cap
            },
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=[t["event_id"] for t in near_threshold_txns]
        )
