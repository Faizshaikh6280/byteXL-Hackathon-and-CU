from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.features.spatial_features import spatial_features
from app.anomaly.config.anomaly_config import anomaly_config

class STDBSCANConvergenceDetector(BaseDetector):
    """
    Engine #5B: ST-DBSCAN Spatio-Temporal Convergence Detector.
    Identifies clandestine physical co-location and convergence gatherings
    where multiple separate entities congregate within narrow spatial and temporal bounds.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-SPATIAL-CONVERGENCE",
            name="ST-DBSCAN Multi-Entity Convergence Detector",
            version="v2.0.0",
            detector_type=DetectorType.SPATIAL_TEMPORAL,
            domain="CROSS_DOMAIN",
            applicable_domains=["TELECOM", "NETWORK", "CROSS_DOMAIN"],
            required_fields=["spatial.waypoints"],
            min_sample_size=1,
            description="Detects localized multi-device geographic convergence clusters."
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
        if not my_waypoints:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        eps_km = anomaly_config.spatial.st_dbscan_eps_km
        eps_sec = anomaly_config.spatial.st_dbscan_eps_time_sec

        co_located_entities = set()
        convergence_events = []
        evidence_event_ids = []

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

        # Build time-bucket index of other entities' waypoints
        from collections import defaultdict
        bucket_size = max(eps_sec, 60.0)
        time_index = defaultdict(list)
        for other_id, other_data in all_entities.items():
            if other_id == entity_id:
                continue
            other_name = other_data.get("display_name") or other_id
            for w in other_data.get("spatial", {}).get("waypoints", []):
                t = _get_ts(w)
                if t is None:
                    continue
                b = int(t // bucket_size)
                time_index[b].append((other_id, other_name, t, w["lat"], w["lng"], w.get("cell_tower_id"), w.get("event_id"), w.get("timestamp") or w.get("dt")))

        for w1 in my_waypoints:
            t1 = _get_ts(w1)
            if t1 is None:
                continue
            lat1, lon1 = w1["lat"], w1["lng"]
            cell1 = str(w1.get("cell_tower_id") or "").strip().upper()
            b = int(t1 // bucket_size)

            for bucket_id in (b - 1, b, b + 1):
                for other_id, other_name, t2, lat2, lon2, cell2, ev2, orig_time in time_index.get(bucket_id, []):
                    time_diff = abs(t2 - t1)
                    if time_diff <= eps_sec:
                        c2_str = str(cell2 or "").strip().upper()
                        if cell1 and c2_str and cell1 == c2_str:
                            dist = 0.0
                            matched_tower = cell1
                        else:
                            dist = spatial_features.haversine_km(lat1, lon1, lat2, lon2)
                            matched_tower = cell1 or c2_str or "GPS_PROXIMITY"

                        if dist <= eps_km:
                            co_located_entities.add(other_name)
                            convergence_events.append({
                                "peer_entity": other_name,
                                "tower_id": matched_tower,
                                "distance_km": round(dist, 2),
                                "time_delta_min": round(time_diff / 60.0, 1),
                                "at_time": str(w1.get("timestamp") or w1.get("dt"))
                            })
                            if w1.get("event_id"):
                                evidence_event_ids.append(w1["event_id"])
                            if ev2:
                                evidence_event_ids.append(ev2)

        if not co_located_entities:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        towers_seen = list({e["tower_id"] for e in convergence_events if e.get("tower_id")})
        signals = [
            f"Geographic convergence: Entity converged with {len(co_located_entities)} person(s) ({', '.join(list(co_located_entities)[:3])}) within {eps_km} km at cell tower(s) [{', '.join(towers_seen[:2])}] within {round(eps_sec/60)} minutes."
        ]
        score = min(89.0, 75.0 + (len(co_located_entities) * 5.0))
        towers_str = ", ".join(towers_seen) if towers_seen else "localized cell tower"
        explanation = f"{', '.join(list(co_located_entities))} repeatedly appear in the same {towers_str} area during overlapping windows."
        ev_refs = list(entity_data.get("evidence_ids", []))
        if not ev_refs:
            ev_refs = [f"EVID-GEO-{entity_id}"]

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(len(co_located_entities)),
            normalized_score=round(score, 1),
            confidence=0.89,
            title="Repeated Multi-Entity Spatial Convergence",
            signals=signals,
            features={
                "converging_entities": list(co_located_entities),
                "convergence_events_count": len(convergence_events),
                "towers": towers_seen
            },
            explanation=explanation,
            evidence_refs=ev_refs,
            canonical_event_refs=list(dict.fromkeys(evidence_event_ids)) or [f"GEO-CONV-{entity_id}"]
        )
