from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class ImpossibleTravelDetector(BaseDetector):
    """
    Engine #5A: Spatio-Temporal Impossible Travel Detector.
    Evaluates successive geospatial coordinates and timestamps to detect
    physically implausible transit velocities.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-SPATIAL-TRAVEL",
            name="Impossible Speed & Geodesic Displacement Detector",
            version="v2.0.0",
            detector_type=DetectorType.SPATIAL_TEMPORAL,
            domain="TELECOM",
            applicable_domains=["TELECOM", "NETWORK", "SOCIAL"],
            required_fields=["spatial.waypoints"],
            min_sample_size=2,
            description="Flags transitions whose implied speed exceeds physical transit limits."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        spat = entity_data.get("spatial", {})
        transitions = spat.get("impossible_transitions", [])
        max_speed = spat.get("max_speed_kmh", 0.0)

        if not transitions:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                raw_score=max_speed,
                normalized_score=0.0
            )

        signals = []
        for t in transitions:
            signals.append(
                f"Physically impossible velocity: {t['distance_km']} km traversed in {t['elapsed_seconds']}s (Implied speed: {t['speed_kmh']} km/h vs limit {anomaly_config.spatial.max_plausible_speed_kmh} km/h)."
            )

        # Scale score according to velocity multiplier above limit
        worst = max(transitions, key=lambda x: x.get("speed_kmh", 0))
        speed_ratio = worst["speed_kmh"] / anomaly_config.spatial.max_plausible_speed_kmh
        norm_score = min(100.0, 70.0 + (speed_ratio * 15.0))

        explanation = f"Impossible transit anomaly detected across {len(transitions)} consecutive waypoints. " + " ".join(signals[:2])

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=worst["speed_kmh"],
            normalized_score=round(norm_score, 1),
            confidence=0.95,
            title="Impossible Travel Velocity Violation",
            signals=signals,
            features={"max_speed_kmh": max_speed, "violations_count": len(transitions)},
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=[t["from_event"] for t in transitions if t.get("from_event")]
        )
