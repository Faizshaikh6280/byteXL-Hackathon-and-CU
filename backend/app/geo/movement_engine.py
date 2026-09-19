import math
import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict

from app.geo.schemas import (
    GeoCanonicalEvent, MovementSegment
)

logger = logging.getLogger("investigation.geo.movement_engine")

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle geodesic distance in kilometers between two geographic coordinates.
    """
    R = 6371.0088 # Earth mean radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

class MovementEngine:
    """
    Movement Reconstruction Engine.
    Sequences chronological entity telemetry into geodesic trajectory segments
    with explicit gap detection, implausible velocity bounds, and continuous/gap classification.
    """

    def __init__(
        self,
        gap_time_threshold_seconds: float = 7200.0, # 2 hours
        max_plausible_speed_kmh: float = 160.0       # Standard vehicle velocity ceiling
    ):
        self.gap_time_threshold_seconds = gap_time_threshold_seconds
        self.max_plausible_speed_kmh = max_plausible_speed_kmh

    def reconstruct_movements(
        self,
        events: List[GeoCanonicalEvent],
        entity_id_filter: Optional[List[str]] = None
    ) -> Tuple[List[MovementSegment], Dict[str, Dict[str, Any]]]:
        """
        Reconstructs chronological movement segments and trips waypoints.
        Returns:
          (movement_segments, trips_waypoints_by_entity)
        """
        # Group events by entity
        entity_events: Dict[str, List[GeoCanonicalEvent]] = defaultdict(list)
        for ev in events:
            if not ev.entity_id or ev.entity_id == "UNKNOWN":
                continue
            if entity_id_filter and ev.entity_id not in entity_id_filter and ev.entity_name not in entity_id_filter:
                continue
            entity_events[ev.entity_id].append(ev)

        segments: List[MovementSegment] = []
        trips_data: Dict[str, Dict[str, Any]] = {}

        for ent_id, ev_list in entity_events.items():
            # Sort chronologically
            sorted_evs = sorted(ev_list, key=lambda x: x.timestamp_ms)
            ent_name = sorted_evs[0].entity_name or ent_id

            # Prepare trips format
            trips_path: List[List[float]] = []
            trips_timestamps: List[int] = []

            for i in range(len(sorted_evs)):
                curr_ev = sorted_evs[i]
                trips_path.append([float(curr_ev.longitude), float(curr_ev.latitude)])
                trips_timestamps.append(int(curr_ev.timestamp_ms))

                if i == 0:
                    continue

                prev_ev = sorted_evs[i - 1]
                
                # Geodesic distance in km
                dist_km = haversine_distance_km(
                    prev_ev.latitude, prev_ev.longitude,
                    curr_ev.latitude, curr_ev.longitude
                )

                # Elapsed time in seconds
                delta_ms = curr_ev.timestamp_ms - prev_ev.timestamp_ms
                delta_sec = max(0.0, delta_ms / 1000.0)

                # Implied velocity in km/h
                if delta_sec > 0:
                    speed_kmh = (dist_km / (delta_sec / 3600.0))
                else:
                    speed_kmh = 0.0

                # Gap & Plausibility Evaluation
                is_gap = False
                gap_reason = None

                if delta_sec > self.gap_time_threshold_seconds:
                    is_gap = True
                    gap_reason = "TEMPORAL_DISCONTINUITY"
                elif speed_kmh > self.max_plausible_speed_kmh and dist_km > 1.5:
                    is_gap = True
                    gap_reason = "IMPLAUSIBLE_VELOCITY"

                segment = MovementSegment(
                    segment_id=f"SEG-{ent_id}-{i:04d}",
                    entity_id=ent_id,
                    entity_name=ent_name,
                    from_event_id=prev_ev.geo_event_id,
                    to_event_id=curr_ev.geo_event_id,
                    start_time=prev_ev.timestamp,
                    end_time=curr_ev.timestamp,
                    duration_seconds=round(delta_sec, 1),
                    start_coords=(float(prev_ev.longitude), float(prev_ev.latitude)),
                    end_coords=(float(curr_ev.longitude), float(curr_ev.latitude)),
                    distance_km=round(dist_km, 3),
                    speed_kmh=round(speed_kmh, 1),
                    is_gap=is_gap,
                    gap_reason=gap_reason,
                    path_points=[
                        [float(prev_ev.longitude), float(prev_ev.latitude)],
                        [float(curr_ev.longitude), float(curr_ev.latitude)]
                    ]
                )
                segments.append(segment)

            if len(trips_path) > 0:
                trips_data[ent_id] = {
                    "cluster_id": ent_id,
                    "entity_name": ent_name,
                    "path": trips_path,
                    "timestamps": trips_timestamps
                }

        logger.info(f"[MovementEngine] Reconstructed {len(segments)} movement segments across {len(trips_data)} entities")
        return segments, trips_data

movement_engine = MovementEngine()
