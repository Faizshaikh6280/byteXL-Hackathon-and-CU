from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class SynchronousSocialActivityDetector(BaseDetector):
    """
    Engine #7A: Synchronous Activity & Bot-Net Coordination Detector.
    Uses time-window cosine alignment to detect coordinated actions across distinct accounts.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-SOC-SYNC",
            name="Synchronous Social Coordination Detector",
            version="v2.0.0",
            detector_type=DetectorType.SOCIAL,
            domain="SOCIAL",
            applicable_domains=["SOCIAL", "NETWORK"],
            required_fields=["all_events"],
            min_sample_size=1,
            description="Detects tightly synchronized bursts of activity between distinct social handles."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        all_entities = context.get("all_entity_store", {})
        my_social = entity_data.get("events_by_domain", {}).get("SOCIAL", [])

        if not my_social:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="No social media activity events recorded."
            )

        import bisect
        my_timestamps = []
        for e in my_social:
            ts = e.get("timestamp")
            if ts:
                try:
                    my_timestamps.append(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp())
                except Exception:
                    pass
        my_timestamps.sort()

        correlated_peers = []
        for other_id, other_data in all_entities.items():
            if other_id == entity_id:
                continue

            other_social = other_data.get("events_by_domain", {}).get("SOCIAL", [])
            other_ts = []
            for e in other_social:
                ts = e.get("timestamp")
                if ts:
                    try:
                        other_ts.append(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp())
                    except Exception:
                        pass
            other_ts.sort()

            # Count synchronous events within a 120-second delta using binary search
            sync_hits = 0
            for t1 in my_timestamps:
                idx_left = bisect.bisect_left(other_ts, t1 - 120.0)
                idx_right = bisect.bisect_right(other_ts, t1 + 120.0)
                sync_hits += (idx_right - idx_left)

            if sync_hits >= 2:
                correlated_peers.append({"peer": other_id, "synchronized_events": sync_hits})

        if not correlated_peers:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        signals = [
            f"Synchronized Coordination: Actions occurred within 120 seconds of peer entity {c['peer']} ({c['synchronized_events']} synchronous bursts)."
            for c in correlated_peers
        ]
        score = min(100.0, 60.0 + (len(correlated_peers) * 15.0))

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(correlated_peers[0]["synchronized_events"]),
            normalized_score=round(score, 1),
            confidence=0.88,
            title="Coordinated Social Activity Burst",
            signals=signals,
            features={"correlated_peers": correlated_peers},
            explanation=f"Identified {len(correlated_peers)} peer handles operating in tight temporal synchronization.",
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=[e.get("event_id") for e in my_social]
        )
