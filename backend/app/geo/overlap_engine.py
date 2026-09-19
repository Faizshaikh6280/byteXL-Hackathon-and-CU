import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
from datetime import datetime

from app.geo.schemas import (
    GeoCanonicalEvent, CoLocationFinding, GeoLocationType
)
from app.geo.movement_engine import haversine_distance_km

logger = logging.getLogger("investigation.geo.overlap_engine")

class SpatialOverlapEngine:
    """
    Forensic Spatial Overlap and Co-Location Engine.
    Detects concurrent cell sector overlaps, geodesic proximity correlations,
    and multi-day repeated co-locations with calibrated correlation scores.
    """

    def __init__(
        self,
        time_window_seconds: float = 1800.0,       # 30 minutes
        proximity_distance_km: float = 0.5,        # 500 meters
        bucket_size_seconds: float = 1800.0        # Time-bucket indexing size
    ):
        self.time_window_seconds = time_window_seconds
        self.proximity_distance_km = proximity_distance_km
        self.bucket_size_seconds = max(bucket_size_seconds, 60.0)

    def detect_co_locations(
        self,
        events: List[GeoCanonicalEvent],
        case_id: str
    ) -> List[CoLocationFinding]:
        """
        Scans all geo-events in case and detects multi-entity spatial-temporal overlaps.
        Strictly excludes coarse IP geolocations (~15km) to prevent spurious physical co-location claims.
        """
        # Exclude coarse IP geolocations (~15km city level) from physical proximity overlap
        valid_events = [
            e for e in events 
            if e.entity_id and e.entity_id != "UNKNOWN" and e.location_type != GeoLocationType.IP_GEOLOCATION
        ]
        if len(valid_events) < 2:
            return []

        # Index events by time bucket
        time_index: Dict[int, List[GeoCanonicalEvent]] = defaultdict(list)
        for ev in valid_events:
            t_sec = ev.timestamp_ms / 1000.0
            bucket_id = int(t_sec // self.bucket_size_seconds)
            time_index[bucket_id].append(ev)

        raw_pair_overlaps: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)

        # Iterate over buckets to find overlaps between different entities
        processed_pairs = set()
        bucket_ids = sorted(time_index.keys())

        for b in bucket_ids:
            # Check current bucket and next adjacent bucket for boundary-crossing events
            cand_events = time_index.get(b, []) + time_index.get(b + 1, [])
            
            for i in range(len(cand_events)):
                ev1 = cand_events[i]
                t1 = ev1.timestamp_ms / 1000.0

                for j in range(i + 1, len(cand_events)):
                    ev2 = cand_events[j]
                    if ev1.entity_id == ev2.entity_id:
                        continue

                    # Distinct pair identity key
                    pair_key = (ev1.geo_event_id, ev2.geo_event_id)
                    inv_pair_key = (ev2.geo_event_id, ev1.geo_event_id)
                    if pair_key in processed_pairs or inv_pair_key in processed_pairs:
                        continue
                    processed_pairs.add(pair_key)

                    t2 = ev2.timestamp_ms / 1000.0
                    delta_t = abs(t2 - t1)
                    if delta_t > self.time_window_seconds:
                        continue

                    # Overlap Check 1: Same Cell Tower
                    is_cell_overlap = False
                    if ev1.cell_tower_id and ev2.cell_tower_id and str(ev1.cell_tower_id).strip().upper() == str(ev2.cell_tower_id).strip().upper():
                        is_cell_overlap = True

                    # Overlap Check 2: Physical Geodesic Proximity
                    dist_km = haversine_distance_km(ev1.latitude, ev1.longitude, ev2.latitude, ev2.longitude)
                    is_prox_overlap = (dist_km <= self.proximity_distance_km)

                    if not is_cell_overlap and not is_prox_overlap:
                        continue

                    # Determine overlap classification
                    overlap_type = "CELL_SECTOR_OVERLAP" if is_cell_overlap and not is_prox_overlap else "PROXIMITY_OVERLAP"

                    # Normalize entity pair key (sorted)
                    ent_a, ent_b = sorted([ev1.entity_id, ev2.entity_id])
                    name_a = ev1.entity_name if ev1.entity_id == ent_a else ev2.entity_name
                    name_b = ev2.entity_name if ev2.entity_id == ent_b else ev1.entity_name

                    raw_pair_overlaps[(ent_a, ent_b)].append({
                        "ev1": ev1,
                        "ev2": ev2,
                        "overlap_type": overlap_type,
                        "dist_km": dist_km,
                        "delta_t": delta_t,
                        "name_a": name_a,
                        "name_b": name_b,
                        "date_str": ev1.timestamp[:10]
                    })

        # Synthesize into CoLocationFinding objects with repeated co-location analysis
        findings: List[CoLocationFinding] = []
        finding_idx = 1

        for (ent_a, ent_b), occurrences in raw_pair_overlaps.items():
            name_a = occurrences[0]["name_a"] or ent_a
            name_b = occurrences[0]["name_b"] or ent_b
            
            # Count distinct calendar days
            distinct_days = set(o["date_str"] for o in occurrences)
            occurrence_count = len(occurrences)

            # Group occurrences by day or continuous sessions to avoid single massive finding
            # For each distinct day or cluster of occurrences, create a finding
            by_day = defaultdict(list)
            for occ in occurrences:
                by_day[occ["date_str"]].append(occ)

            for date_key, day_occs in by_day.items():
                best_occ = min(day_occs, key=lambda x: (x["dist_km"], x["delta_t"]))
                ev1, ev2 = best_occ["ev1"], best_occ["ev2"]

                # Is this a repeated co-location pattern?
                is_repeated = (occurrence_count >= 2 or len(distinct_days) >= 2)
                co_type = "REPEATED_PRESENCE_IN_AREA" if is_repeated else best_occ["overlap_type"]

                # Calculate spatial-temporal correlation score (0 - 100)
                # Distance score (50%): 0 km -> 50 pts; 0.5 km -> 25 pts
                dist_score = max(0.0, 50.0 * (1.0 - (best_occ["dist_km"] / max(0.5, self.proximity_distance_km))))
                # Temporal score (30%): 0s -> 30 pts; 1800s -> 0 pts
                time_score = max(0.0, 30.0 * (1.0 - (best_occ["delta_t"] / self.time_window_seconds)))
                # Repetition score (20%): 1 day -> 10 pts; 2+ days -> 20 pts
                rep_score = min(20.0, len(distinct_days) * 10.0)

                total_score = round(min(100.0, dist_score + time_score + rep_score), 1)

                mid_lat = round((ev1.latitude + ev2.latitude) / 2.0, 6)
                mid_lng = round((ev1.longitude + ev2.longitude) / 2.0, 6)
                loc_name = ev1.location_name or ev2.location_name or f"Area near {mid_lat:.4f}, {mid_lng:.4f}"

                finding = CoLocationFinding(
                    co_location_id=f"COLOC-{case_id}-{finding_idx:04d}",
                    case_id=case_id,
                    co_location_type=co_type,
                    entity_ids=[ent_a, ent_b],
                    entity_names=[name_a, name_b],
                    start_time=min(ev1.timestamp, ev2.timestamp),
                    end_time=max(ev1.timestamp, ev2.timestamp),
                    duration_seconds=round(best_occ["delta_t"], 1),
                    latitude=mid_lat,
                    longitude=mid_lng,
                    location_name=loc_name,
                    cell_tower_id=ev1.cell_tower_id or ev2.cell_tower_id,
                    distance_between_meters=round(best_occ["dist_km"] * 1000.0, 1),
                    occurrence_count=occurrence_count,
                    distinct_days_count=len(distinct_days),
                    correlation_score=total_score,
                    supporting_events=[o["ev1"].geo_event_id for o in day_occs] + [o["ev2"].geo_event_id for o in day_occs],
                    epistemic_note="Evidence indicates concurrent spatial-temporal proximity of recorded identifiers; does not establish physical meeting or collusion."
                )
                findings.append(finding)
                finding_idx += 1

        # Sort findings by correlation score descending
        findings.sort(key=lambda x: x.correlation_score, reverse=True)
        logger.info(f"[SpatialOverlapEngine] Detected {len(findings)} co-location findings for case {case_id}")
        return findings

spatial_overlap_engine = SpatialOverlapEngine()
