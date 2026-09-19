from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class GeospatialTrajectoryDetector(BaseDetector):
    """
    Engine #5E: Progressive Geospatial Multi-Location Trajectory Engine.
    Identifies sequential route movements where an entity traverses multiple
    distinct municipal sectors/locations within a focused operational window.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-GEO-TRAJECTORY",
            name="Geospatial Multi-Location Trajectory Engine",
            version="v1.0.0",
            detector_type=DetectorType.SPATIAL_TEMPORAL,
            domain="TELECOM",
            applicable_domains=["TELECOM", "GENERAL", "CROSS_DOMAIN"],
            required_fields=["spatial.waypoints"],
            min_sample_size=3,
            description="Identifies multi-location sequential routes traversing distinct sectors or locations."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        my_waypoints = entity_data.get("spatial", {}).get("waypoints", [])

        if len(my_waypoints) < 3:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Insufficient waypoints for trajectory route analysis."
            )

        # Group waypoints by date
        wp_by_date = {}
        for wp in my_waypoints:
            ts = wp.get("timestamp") or ""
            d = str(ts)[:10]
            loc = wp.get("location")
            if loc and d:
                wp_by_date.setdefault(d, []).append(wp)

        best_route = []
        best_route_date = None
        best_ev_ids = []

        # Inspect chronologically ordered routes per date
        for d in sorted(wp_by_date.keys(), reverse=True):
            day_wps = sorted(wp_by_date[d], key=lambda x: str(x.get("timestamp") or ""))
            seen_locs = []
            ev_ids = []
            for w in day_wps:
                loc_name = str(w.get("location") or "").strip()
                if loc_name and (not seen_locs or seen_locs[-1] != loc_name):
                    seen_locs.append(loc_name)
                    if w.get("event_id"):
                        ev_ids.append(w["event_id"])

            if len(seen_locs) >= 4:
                best_route = seen_locs
                best_route_date = d
                best_ev_ids = ev_ids
                break

        if not best_route:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        display_name = entity_data.get("display_name") or entity_id
        route_str = " -> ".join(best_route)
        signals = [
            f"Multi-Location Trajectory Route on {best_route_date}: Traversed {len(best_route)} consecutive distinct locations: {route_str}."
        ]

        title = f"{display_name} Multi-Location Trajectory"
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
            raw_score=float(len(best_route)),
            normalized_score=90.0,
            confidence=0.92,
            title=title,
            signals=signals,
            features={
                "route": best_route,
                "route_date": best_route_date,
                "location_count": len(best_route),
                "route_path": route_str
            },
            explanation=f"Recorded trajectory route across distinct locations: {route_str}.",
            evidence_refs=ev_refs,
            canonical_event_refs=best_ev_ids or [f"GEO-ROUTE-{entity_id}"]
        )
