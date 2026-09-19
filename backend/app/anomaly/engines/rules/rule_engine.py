from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class DeterministicRuleEngine(BaseDetector):
    """
    Engine #2: Deterministic Rule Engine.
    Evaluates declarative, threshold-based intelligence rules for conditions
    that must be explicitly flagged without statistical ambiguity.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-RULE-ENGINE",
            name="Deterministic Investigation Rule Engine",
            version="v2.0.0",
            detector_type=DetectorType.RULE,
            domain="CROSS_DOMAIN",
            applicable_domains=["TELECOM", "BANKING", "NETWORK", "SOCIAL", "KYC", "CROSS_DOMAIN"],
            required_fields=["all_events"],
            min_sample_size=1,
            description="Executes rule criteria across financial, telephony, device, and network telemetry."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        triggered_rules = []
        signals = []
        features = {}

        comm = entity_data.get("communication", {})
        fin = entity_data.get("financial", {})
        spat = entity_data.get("spatial", {})
        net = entity_data.get("network", {})

        # Rule 1: High-Value Financial Transaction
        max_txn = fin.get("max_transaction_inr", 0.0)
        features["max_transaction_inr"] = max_txn
        if max_txn >= anomaly_config.financial.high_value_transaction_inr:
            triggered_rules.append("RULE-FIN-01")
            signals.append(f"High-value transaction detected: ₹{max_txn:,.2f} exceeds threshold of ₹{anomaly_config.financial.high_value_transaction_inr:,.2f}.")

        # Rule 2: Burner Phone / IMEI Hopping
        unique_imeis = comm.get("unique_imeis", 0)
        features["unique_imeis"] = unique_imeis
        if unique_imeis >= anomaly_config.network.burner_phone_imei_switch_limit:
            triggered_rules.append("RULE-DEV-01")
            observed_imeis = comm.get("observed_imeis", [])
            signals.append(f"Burner phone signature: Entity swapped across {unique_imeis} physical devices (IMEIs: {', '.join(observed_imeis[:3])}).")

        # Rule 3: Suspicious Night Activity
        night_ratio = comm.get("night_activity_ratio", 0.0)
        night_calls = comm.get("night_call_count", 0)
        features["night_activity_ratio"] = night_ratio
        features["night_call_count"] = night_calls
        if night_calls >= 2 and night_ratio >= 0.25:
            triggered_rules.append("RULE-NET-02")
            signals.append(f"Suspicious nocturnal activity: {night_calls} communications ({round(night_ratio*100, 1)}% of total) conducted during off-hours (01:00-05:00 AM).")

        # Rule 4: Impossible Travel
        impossible = spat.get("impossible_transitions", [])
        if impossible:
            triggered_rules.append("RULE-GEO-01")
            worst = max(impossible, key=lambda x: x.get("speed_kmh", 0))
            signals.append(f"Physically impossible transition: {worst['distance_km']} km traversed in {worst['elapsed_seconds']}s (Implied speed: {worst['speed_kmh']} km/h).")

        # Rule 5: VPN/Tor Port Evasion
        tor_hits = net.get("tor_port_hits", 0)
        vpn_hits = net.get("vpn_port_hits", 0)
        if tor_hits > 0 or vpn_hits > 0:
            triggered_rules.append("RULE-NET-03")
            signals.append(f"Anonymizer infrastructure detected: {tor_hits} Tor sessions and {vpn_hits} VPN tunnel ports observed.")

        # Determine normalized score based on rule severity weights
        if not triggered_rules:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        score_map = {
            "RULE-FIN-01": 35.0,
            "RULE-DEV-01": 40.0,
            "RULE-NET-02": 25.0,
            "RULE-GEO-01": 45.0,
            "RULE-NET-03": 30.0
        }
        total_score = min(100.0, sum(score_map.get(r, 20.0) for r in triggered_rules))
        explanation = f"Triggered {len(triggered_rules)} deterministic intelligence rules: {', '.join(triggered_rules)}. " + " ".join(signals)

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(len(triggered_rules)),
            normalized_score=round(total_score, 1),
            confidence=1.0,  # Deterministic rule matches carry 100% confidence
            title=f"Deterministic Rule Violation ({', '.join(triggered_rules)})",
            signals=signals,
            features=features,
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=entity_data.get("event_ids", [])[:10]
        )
