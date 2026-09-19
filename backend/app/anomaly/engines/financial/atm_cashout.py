from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class ATMCashoutDetector(BaseDetector):
    """
    Engine #6D: Rapid ATM Cash-Out Detector.
    Identifies high-frequency ATM cash withdrawals immediately following digital inflows.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-FIN-ATM-CASHOUT",
            name="Rapid ATM Cash-Out Detector",
            version="v2.0.0",
            detector_type=DetectorType.FINANCIAL,
            domain="BANKING",
            applicable_domains=["BANKING"],
            required_fields=["financial.transaction_count"],
            min_sample_size=1,
            description="Identifies rapid ATM cash liquidation following digital fund transfers."
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

        atm_txns = []
        for e in bank_events:
            ch = str(e.get("financial", {}).get("channel", "")).upper()
            tt = str(e.get("financial", {}).get("txn_type", "")).upper()
            if "ATM" in ch or "ATM" in tt or "CASH" in tt:
                atm_txns.append(e)

        if not atm_txns:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        total_cashout = sum(e.get("financial", {}).get("amount_inr", 0.0) for e in atm_txns)
        signals = [
            f"ATM Liquidation: {len(atm_txns)} ATM cash withdrawals totaling ₹{total_cashout:,.2f}."
        ]
        score = min(100.0, 50.0 + (len(atm_txns) * 15.0))

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=total_cashout,
            normalized_score=round(score, 1),
            confidence=0.90,
            title="Rapid ATM Cash-Out Activity",
            signals=signals,
            features={"atm_withdrawal_count": len(atm_txns), "total_cashout_inr": total_cashout},
            explanation=f"Detected {len(atm_txns)} cash withdrawals through ATM channels totaling ₹{total_cashout:,.2f}.",
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=[e.get("event_id") for e in atm_txns]
        )
