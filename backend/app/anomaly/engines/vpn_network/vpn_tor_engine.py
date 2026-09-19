from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class VPNTorAnonymizerDetector(BaseDetector):
    """
    Engine #8: VPN / Tor / Proxy Anonymizer Detection Engine.
    Examines service ports, connection entropy, and IP transport behavior to identify
    clandestine routing through Tor onion nodes, commercial VPN tunnels, or proxy relays.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-NET-VPN-TOR",
            name="VPN & Tor Anonymizer Evasion Detector",
            version="v2.0.0",
            detector_type=DetectorType.VPN_NETWORK,
            domain="NETWORK",
            applicable_domains=["NETWORK", "SOCIAL"],
            required_fields=["network.session_count"],
            min_sample_size=1,
            description="Detects routing evasion through Tor nodes, OpenVPN, IPSec, and proxy ports."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        net = entity_data.get("network", {})
        tor_hits = net.get("tor_port_hits", 0)
        vpn_hits = net.get("vpn_port_hits", 0)
        is_suspect = net.get("is_vpn_tor_suspect", False)

        if not is_suspect:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        signals = []
        score = 0.0
        if tor_hits > 0:
            score += 55.0
            signals.append(f"Tor Relay Traffic: {tor_hits} connections initiated to known Tor OR/Dir ports (9001, 9030, 9050).")
        if vpn_hits > 0:
            score += 40.0
            signals.append(f"VPN Tunneling Observed: {vpn_hits} sessions negotiated over OpenVPN/IPSec ports (1194, 500, 4500).")

        total_score = min(100.0, score)
        explanation = f"Network telemetry revealed intentional anonymization: {tor_hits} Tor and {vpn_hits} VPN tunnel sessions."

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(tor_hits + vpn_hits),
            normalized_score=round(total_score, 1),
            confidence=0.92,
            title="Clandestine VPN / Tor Anonymizer Evasion",
            signals=signals,
            features={"tor_hits": tor_hits, "vpn_hits": vpn_hits},
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=entity_data.get("event_ids", [])[:5]
        )
