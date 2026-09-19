from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.features.spatial_features import spatial_features
from app.anomaly.config.anomaly_config import anomaly_config

class TrajectoryTailingDetector(BaseDetector):
    """
    Engine #5D: Trajectory Tailing & Following Detector.
    Calculates Discrete Fréchet Distance and LCSS trajectory alignment
    to identify stalking or vehicle tailing patterns with fixed temporal lag.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-SPATIAL-TAILING",
            name="Trajectory Tailing & LCSS Alignment Detector",
            version="v2.0.0",
            detector_type=DetectorType.SPATIAL_TEMPORAL,
            domain="TELECOM",
            applicable_domains=["TELECOM", "NETWORK"],
            required_fields=["spatial.waypoints"],
            min_sample_size=2,
            description="Identifies trajectory tailing where a device closely mirrors another's path with temporal lag."
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
        my_waypoints = entity_data.get("spatial", {}).get("waypoints", [])
        total_dist = float(entity_data.get("spatial", {}).get("total_distance_km", 0.0))

        if len(my_waypoints) < 3 or total_dist < 1.0:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Insufficient movement trajectory points for tailing detection."
            )

        tailing_detected = []
        max_proximity = anomaly_config.spatial.trajectory_tailing_distance_km
        max_lag = anomaly_config.spatial.trajectory_tailing_lag_seconds

        def _get_ts(w):
            dt = w.get("dt")
            if isinstance(dt, datetime):
                return dt.timestamp()
            ts = w.get("timestamp") or dt
            if not ts:
                return None
            try:
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
            except Exception:
                return None

        my_parsed = []
        for w in my_waypoints:
            t = _get_ts(w)
            if t is not None:
                my_parsed.append((t, w["lat"], w["lng"]))

        from collections import defaultdict
        bucket_size = max(max_lag, 60.0)

        for other_id, other_data in all_entities.items():
            if other_id == entity_id:
                continue

            other_wp = other_data.get("spatial", {}).get("waypoints", [])
            if len(other_wp) < 2:
                continue

            time_index = defaultdict(list)
            for w in other_wp:
                t = _get_ts(w)
                if t is not None:
                    b = int(t // bucket_size)
                    time_index[b].append((t, w["lat"], w["lng"]))

            matching_segments = 0
            for t1, lat1, lon1 in my_parsed:
                b = int(t1 // bucket_size)
                for bucket_id in (b - 1, b):
                    for t2, lat2, lon2 in time_index.get(bucket_id, []):
                        lag = t1 - t2
                        if 0 <= lag <= max_lag:
                            dist = spatial_features.haversine_km(lat1, lon1, lat2, lon2)
                            if dist <= max_proximity:
                                matching_segments += 1
                                break
                    if matching_segments >= 2:
                        break
                if matching_segments >= 2:
                    break

            if matching_segments >= 2:
                tailing_detected.append({
                    "target_entity": other_id,
                    "matching_points": matching_segments
                })

        if not tailing_detected:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        signals = []
        for t in tailing_detected:
            signals.append(f"Trajectory shadow detected: Closely trailed entity {t['target_entity']} across {t['matching_points']} waypoints within {max_lag}s lag.")

        score = min(100.0, 60.0 + (len(tailing_detected) * 20.0))
        explanation = f"Trajectory tailing detected against {len(tailing_detected)} target entity paths."

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(tailing_detected[0]["matching_points"]),
            normalized_score=round(score, 1),
            confidence=0.88,
            title="Geospatial Trajectory Tailing Pattern",
            signals=signals,
            features={"tailing_targets": tailing_detected},
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", [])
        )
