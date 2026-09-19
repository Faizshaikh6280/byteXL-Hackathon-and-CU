from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class RapidFanOutDetector(BaseDetector):
    """
    Engine #6B: Rapid Fan-Out & Mule Pass-Through Detector.
    Identifies money laundering mule accounts receiving large inbound tranches
    which are immediately depleted across multiple outgoing counterparties within minutes.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-FIN-FANOUT",
            name="Rapid Fan-Out & Pass-Through Mule Detector",
            version="v2.0.0",
            detector_type=DetectorType.FINANCIAL,
            domain="BANKING",
            applicable_domains=["BANKING"],
            required_fields=["financial.transaction_count"],
            min_sample_size=2,
            description="Detects rapid dissipation of incoming funds across multiple outgoing recipients."
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
        if len(bank_events) < 2:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Insufficient transactions to detect fan-out."
            )

        # Parse transactions with timestamps and direction
        parsed_txns = []
        for e in bank_events:
            ts = e.get("timestamp")
            amt = e.get("financial", {}).get("amount_inr", 0.0)
            txn_type = str(e.get("financial", {}).get("txn_type", "")).upper()
            if ts and amt > 0:
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    direction = "IN" if txn_type in ("CREDIT", "DEPOSIT", "INFLOW") else "OUT"
                    parsed_txns.append({
                        "event_id": e.get("event_id"),
                        "dt": dt,
                        "amount": amt,
                        "direction": direction,
                        "counterparty": e.get("financial", {}).get("counterparty")
                    })
                except Exception:
                    pass

        parsed_txns.sort(key=lambda x: x["dt"])

        window_sec = anomaly_config.financial.rapid_fanout_window_seconds
        min_recipients = anomaly_config.financial.rapid_fanout_min_counterparties

        fanout_incidents = []

        for i, in_txn in enumerate(parsed_txns):
            if in_txn["direction"] != "IN" or in_txn["amount"] < 100000.0:
                continue

            # Look ahead for outflows within window_sec
            outflows = []
            recipients = set()
            outflow_sum = 0.0

            for out_txn in parsed_txns[i+1:]:
                delta = (out_txn["dt"] - in_txn["dt"]).total_seconds()
                if delta > window_sec:
                    break
                if out_txn["direction"] == "OUT":
                    outflows.append(out_txn)
                    outflow_sum += out_txn["amount"]
                    if out_txn["counterparty"]:
                        recipients.add(out_txn["counterparty"])

            depletion_ratio = outflow_sum / in_txn["amount"] if in_txn["amount"] > 0 else 0
            if len(recipients) >= min_recipients and depletion_ratio >= anomaly_config.financial.rapid_fanout_depletion_ratio:
                fanout_incidents.append({
                    "inflow_event": in_txn["event_id"],
                    "inflow_amount": in_txn["amount"],
                    "outflow_sum": outflow_sum,
                    "depletion_ratio": round(depletion_ratio, 2),
                    "counterparties_count": len(recipients),
                    "outflow_events": [o["event_id"] for o in outflows]
                })

        if not fanout_incidents:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        worst = fanout_incidents[0]
        signals = [
            f"Rapid Pass-Through Mule Pattern: Inflow of ₹{worst['inflow_amount']:,.2f} immediately dissipated across {worst['counterparties_count']} counterparties (₹{worst['outflow_sum']:,.2f} total, {round(worst['depletion_ratio']*100)}% depletion within 30 mins)."
        ]
        score = min(100.0, 75.0 + (worst['counterparties_count'] * 5.0))
        explanation = f"Account operated as a rapid pass-through conduit, dispersing {round(worst['depletion_ratio']*100)}% of incoming capital within 30 minutes."

        all_event_refs = [worst["inflow_event"]] + worst["outflow_events"]

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=worst["depletion_ratio"],
            normalized_score=round(score, 1),
            confidence=0.94,
            title="Rapid Account Fan-Out & Pass-Through Conduit",
            signals=signals,
            features={"fanout_incidents": fanout_incidents},
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=all_event_refs
        )
