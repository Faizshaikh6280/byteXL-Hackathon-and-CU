import math
import uuid
import logging
from typing import List, Dict, Any, Optional
from app.timeline.schemas import TimelineCanonicalEvent, TemporalInconsistency

logger = logging.getLogger("investigation.timeline.inconsistency")

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two decimal degree points on Earth."""
    r = 6371.0 # Earth's radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c

class TemporalInconsistencyDetector:
    """
    Evaluates physical plausibility of sequential geospatial observations for resolved entities.
    Employs strictly objective, neutral forensic language without inferring fraudulent intent.
    """

    def __init__(self, max_plausible_speed_kmh: float = 750.0, short_hop_speed_kmh: float = 200.0):
        self.max_speed = max_plausible_speed_kmh
        self.short_hop_speed = short_hop_speed_kmh

    def detect_inconsistencies(
        self,
        events: List[TimelineCanonicalEvent],
        case_id: str
    ) -> List[TemporalInconsistency]:
        """
        Scans consecutive location-bearing events per entity to detect impossible travel speeds.
        """
        # Filter for events with valid coordinates
        geo_events = [e for e in events if e.latitude is not None and e.longitude is not None]
        if len(geo_events) < 2:
            return []

        # Group by entity (z_cluster_id or entity_name or phone)
        entity_groups: Dict[str, List[TimelineCanonicalEvent]] = {}
        for ev in geo_events:
            ent_key = ev.z_cluster_id or ev.entity_name or (ev.actor_entities[0] if ev.actor_entities else None)
            if not ent_key:
                continue
            if ent_key not in entity_groups:
                entity_groups[ent_key] = []
            entity_groups[ent_key].append(ev)

        inconsistencies: List[TemporalInconsistency] = []

        for ent_key, group in entity_groups.items():
            if len(group) < 2:
                continue

            # Group is already sorted chronologically
            for i in range(len(group) - 1):
                ev_a = group[i]
                ev_b = group[i + 1]

                delta_sec = (ev_b.timestamp_ms - ev_a.timestamp_ms) / 1000.0
                if delta_sec <= 0:
                    delta_sec = 1.0 # Protect against zero-division

                dist_km = haversine_distance_km(
                    ev_a.latitude, ev_a.longitude,
                    ev_b.latitude, ev_b.longitude
                )

                # Skip negligible displacements (< 0.2 km)
                if dist_km < 0.2:
                    continue

                hours = delta_sec / 3600.0
                speed_kmh = dist_km / hours

                # Flag if travel speed is implausible
                is_inconsistent = False
                if delta_sec < 300 and speed_kmh > self.short_hop_speed:
                    is_inconsistent = True
                elif speed_kmh > self.max_speed:
                    is_inconsistent = True

                if is_inconsistent:
                    inconsistency_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
                    loc_a_name = ev_a.location_name or f"Lat {ev_a.latitude:.4f}, Lng {ev_a.longitude:.4f}"
                    loc_b_name = ev_b.location_name or f"Lat {ev_b.latitude:.4f}, Lng {ev_b.longitude:.4f}"

                    desc = (
                        f"Potential temporal/geospatial inconsistency detected: Observed displacement of "
                        f"{dist_km:.1f} km between {loc_a_name} and {loc_b_name} occurred in "
                        f"{int(delta_sec // 60)}m {int(delta_sec % 60)}s, requiring an inferred velocity "
                        f"of {speed_kmh:.0f} km/h."
                    )

                    inc = TemporalInconsistency(
                        inconsistency_id=inconsistency_id,
                        case_id=case_id,
                        entity_id=ent_key,
                        entity_name=ev_a.entity_name or ent_key,
                        event_a_id=ev_a.event_id,
                        event_b_id=ev_b.event_id,
                        start_time=ev_a.normalized_timestamp,
                        end_time=ev_b.normalized_timestamp,
                        time_delta_seconds=delta_sec,
                        location_a={
                            "name": loc_a_name,
                            "lat": ev_a.latitude,
                            "lng": ev_a.longitude,
                            "tower_id": ev_a.cell_tower_id,
                            "evidence_id": ev_a.evidence_id
                        },
                        location_b={
                            "name": loc_b_name,
                            "lat": ev_b.latitude,
                            "lng": ev_b.longitude,
                            "tower_id": ev_b.cell_tower_id,
                            "evidence_id": ev_b.evidence_id
                        },
                        distance_km=round(dist_km, 2),
                        required_speed_kmh=round(speed_kmh, 1),
                        confidence=0.92,
                        evidence_refs=list(set([ev_a.evidence_id, ev_b.evidence_id])),
                        description=desc
                    )
                    inconsistencies.append(inc)

        return inconsistencies

temporal_inconsistency_detector = TemporalInconsistencyDetector()
