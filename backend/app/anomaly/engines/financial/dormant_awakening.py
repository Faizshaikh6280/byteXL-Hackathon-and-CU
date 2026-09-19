from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class DormantAccountAwakeningDetector(BaseDetector):
    """
    Engine #6C: Dormant Account Sudden Awakening Detector.
    Identifies previously inactive accounts exhibiting sudden spikes in velocity or transaction volume.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-FIN-DORMANT",
            name="Dormant Account Awakening Detector",
            version="v2.0.0",
            detector_type=DetectorType.FINANCIAL,
            domain="BANKING",
            applicable_domains=["BANKING"],
            required_fields=["financial.transaction_count"],
            min_sample_size=1,
            description="Flags accounts reactivated with high volume following prolonged dormancy."
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
                not_applicable_reason="No banking transactions available."
            )

        # Parse transaction timestamps
        tx_dates = []
        for e in bank_events:
            ts = e.get("timestamp")
            amt = float(e.get("financial", {}).get("amount_inr", 0.0) or e.get("attributes", {}).get("amount", 0.0))
            if ts and amt > 0:
                try:
                    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    tx_dates.append((dt, amt, e.get("event_id")))
                except Exception:
                    pass

        tx_dates.sort(key=lambda x: x[0])
        fin = entity_data.get("financial", {})
        total_volume = fin.get("total_volume_inr", 0.0)
        txn_count = len(tx_dates)

        dormancy_gap_days = 0.0
        awakening_events = []
        awakening_volume = 0.0

        if len(tx_dates) >= 2:
            # Check maximum gap between consecutive transactions
            for i in range(len(tx_dates) - 1):
                gap = (tx_dates[i+1][0] - tx_dates[i][0]).total_seconds() / 86400.0
                if gap > dormancy_gap_days:
                    dormancy_gap_days = gap
                    # Transactions after the gap represent reactivation
                    awakening_events = [x[2] for x in tx_dates[i+1:]]
                    awakening_volume = sum(x[1] for x in tx_dates[i+1:])

        # Check for profile-level dormancy flag if present
        is_profile_dormant = entity_data.get("profile", {}).get("is_dormant", False) if entity_data.get("profile") else False

        dormancy_threshold_days = anomaly_config.financial.dormant_account_days_inactive
        is_dormant_awakened = bool(
            (dormancy_gap_days >= dormancy_threshold_days and awakening_volume >= 200000.0) or
            (is_profile_dormant and total_volume >= 200000.0)
        )

        if not is_dormant_awakened:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        signals = [
            f"Dormant Account Reactivated: Account had {int(dormancy_gap_days)} days of documented inactivity before abruptly transacting ₹{awakening_volume:,.2f} across {len(awakening_events)} transfers."
        ]
        score = min(100.0, 60.0 + (dormancy_gap_days / dormancy_threshold_days) * 20.0)

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=dormancy_gap_days,
            normalized_score=round(score, 1),
            confidence=0.88,
            title="Dormant Account Reactivation Spike",
            signals=signals,
            features={
                "dormancy_days": int(dormancy_gap_days),
                "reactivation_volume_inr": awakening_volume,
                "reactivation_txns_count": len(awakening_events)
            },
            explanation=f"Reactivation of dormant facility: Account was inactive for {int(dormancy_gap_days)} days, then transacted ₹{awakening_volume:,.2f}.",
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=awakening_events[:5]
        )
