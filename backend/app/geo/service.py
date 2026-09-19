import os
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
from datetime import datetime

from app.geo.schemas import (
    GeoCanonicalEvent, MovementSegment, CoLocationFinding,
    CommonPlace, AreaInvestigationResult, SpatialStoryCard,
    ActivityDensityCell, GeoInvestigationResponse, GeoLocationType
)
from app.geo.normalizer import geo_normalizer
from app.geo.movement_engine import movement_engine, haversine_distance_km
from app.geo.overlap_engine import spatial_overlap_engine
from app.geo.clustering_engine import clustering_engine

logger = logging.getLogger("investigation.geo.service")

class GeoService:
    """
    Unified Geospatial Intelligence Orchestrator.
    Coordinates evidence normalization, trajectory reconstruction, multi-entity overlap analysis,
    geofence investigations, before/after movement context, and legacy Deck.gl synchronization.
    """

    def __init__(self):
        self._cache: Dict[Tuple, GeoInvestigationResponse] = {}

    def invalidate_cache(self, case_id: Optional[str] = None):
        geo_normalizer.clear_cache(case_id)
        if case_id:
            keys_to_remove = [k for k in self._cache.keys() if k[0] == case_id]
            for k in keys_to_remove:
                self._cache.pop(k, None)
        else:
            self._cache.clear()

    def get_geo_investigation(
        self,
        case_id: str,
        entity_ids: Optional[List[str]] = None,
        domains: Optional[List[str]] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        min_confidence: Optional[float] = None,
        bbox: Optional[List[float]] = None # [min_lng, min_lat, max_lng, max_lat]
    ) -> GeoInvestigationResponse:
        """
        Retrieves the complete geospatial intelligence dataset for a case with filtering.
        """
        cache_key = (
            case_id,
            tuple(sorted(entity_ids)) if entity_ids else None,
            tuple(sorted(domains)) if domains else None,
            start_time,
            end_time,
            min_confidence,
            tuple(bbox) if bbox else None
        )
        if cache_key in self._cache:
            return self._cache[cache_key]

        all_events = geo_normalizer.normalize_case_geo_events(case_id)

        # Apply filters
        filtered_events: List[GeoCanonicalEvent] = []
        for ev in all_events:
            if entity_ids and ev.entity_id not in entity_ids and ev.entity_name not in entity_ids:
                continue
            if domains and ev.domain.upper() not in [d.upper() for d in domains]:
                continue
            if min_confidence is not None and ev.location_confidence < min_confidence:
                continue
            if start_time and ev.timestamp < start_time:
                continue
            if end_time and ev.timestamp > end_time:
                continue
            if bbox and len(bbox) == 4:
                min_lng, min_lat, max_lng, max_lat = bbox
                if not (min_lng <= ev.longitude <= max_lng and min_lat <= ev.latitude <= max_lat):
                    continue
            filtered_events.append(ev)

        # Reconstruct movements
        movements, _ = movement_engine.reconstruct_movements(filtered_events, entity_id_filter=entity_ids)

        # Detect co-locations
        co_locations = spatial_overlap_engine.detect_co_locations(filtered_events, case_id)

        # Extract common places
        common_places = clustering_engine.extract_common_places(filtered_events, case_id)

        # Compute activity density grid
        density_grid = clustering_engine.compute_density_grid(filtered_events)

        # Build spatial story cards
        story_cards = self._build_spatial_story_cards(filtered_events, movements)

        # Calculate bounding box and center for camera positioning
        lats = [e.latitude for e in filtered_events]
        lngs = [e.longitude for e in filtered_events]
        if lats and lngs:
            min_lat, max_lat = min(lats), max(lats)
            min_lng, max_lng = min(lngs), max(lngs)
            center = {"lat": round((min_lat + max_lat) / 2.0, 5), "lng": round((min_lng + max_lng) / 2.0, 5)}
            bounds = {"min_lat": min_lat, "min_lng": min_lng, "max_lat": max_lat, "max_lng": max_lng}
        else:
            center = {"lat": 28.6139, "lng": 77.2090} # Default Delhi
            bounds = {"min_lat": 28.5, "min_lng": 77.0, "max_lat": 28.8, "max_lng": 77.4}

        # Calculate summary metrics
        domain_counts = defaultdict(int)
        unique_entities = set()
        for e in filtered_events:
            domain_counts[e.domain] += 1
            if e.entity_id:
                unique_entities.add(e.entity_name or e.entity_id)

        summary_metrics = {
            "total_events": len(filtered_events),
            "total_entities": len(unique_entities),
            "total_movement_segments": len(movements),
            "gap_segments_count": sum(1 for m in movements if m.is_gap),
            "total_co_locations": len(co_locations),
            "repeated_presence_count": sum(1 for c in co_locations if c.co_location_type == "REPEATED_PRESENCE_IN_AREA"),
            "total_common_places": len(common_places),
            "domain_distribution": dict(domain_counts),
            "center": center,
            "bounds": bounds
        }

        response = GeoInvestigationResponse(
            case_id=case_id,
            total_events=len(filtered_events),
            events=filtered_events,
            movements=movements,
            co_locations=co_locations,
            common_places=common_places,
            density_grid=density_grid,
            story_cards=story_cards,
            summary_metrics=summary_metrics
        )
        self._cache[cache_key] = response
        return response

    def run_area_query(
        self,
        case_id: str,
        center_lat: float,
        center_lng: float,
        radius_meters: float = 500.0,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None
    ) -> AreaInvestigationResult:
        """
        Executes an interactive Area Investigation ("Who Was Here?" and "What Happened Here?").
        """
        all_events = geo_normalizer.normalize_case_geo_events(case_id)
        radius_km = radius_meters / 1000.0

        events_inside: List[GeoCanonicalEvent] = []
        entity_records: Dict[str, List[GeoCanonicalEvent]] = defaultdict(list)
        domain_counts: Dict[str, int] = defaultdict(int)

        for ev in all_events:
            if start_time and ev.timestamp < start_time:
                continue
            if end_time and ev.timestamp > end_time:
                continue

            dist = haversine_distance_km(center_lat, center_lng, ev.latitude, ev.longitude)
            if dist <= radius_km:
                events_inside.append(ev)
                domain_counts[ev.domain] += 1
                key = ev.entity_name or ev.entity_id or "Unknown"
                entity_records[key].append(ev)

        # Summarize entities present
        entities_present = []
        for ent_name, ev_list in entity_records.items():
            ev_list_sorted = sorted(ev_list, key=lambda x: x.timestamp_ms)
            ent_id = ev_list_sorted[0].entity_id or ent_name
            avg_conf = sum(e.location_confidence for e in ev_list) / len(ev_list)
            entities_present.append({
                "entity_id": ent_id,
                "name": ent_name,
                "event_count": len(ev_list),
                "first_seen": ev_list_sorted[0].timestamp,
                "last_seen": ev_list_sorted[-1].timestamp,
                "confidence": round(avg_conf, 2),
                "primary_domains": list(set(e.domain for e in ev_list))
            })

        entities_present.sort(key=lambda x: x["event_count"], reverse=True)
        events_inside.sort(key=lambda x: x.timestamp_ms)

        return AreaInvestigationResult(
            center=(center_lat, center_lng),
            radius_meters=radius_meters,
            start_time=start_time,
            end_time=end_time,
            entities_present=entities_present,
            events_inside=events_inside,
            domain_distribution=dict(domain_counts),
            total_events=len(events_inside),
            total_entities=len(entities_present)
        )

    def get_movement_context(
        self,
        case_id: str,
        event_id: str,
        window_seconds: float = 1800.0 # 30 mins
    ) -> Dict[str, Any]:
        """
        Retrieves Before and After contextual activity around a movement segment or waypoint.
        Answers: What happened directly before departure and immediately upon arrival?
        """
        all_events = geo_normalizer.normalize_case_geo_events(case_id)
        target_ev = next((e for e in all_events if e.event_id == event_id or e.geo_event_id == event_id), None)
        
        if not target_ev:
            return {
                "target_event": None,
                "prior_events": [],
                "posterior_events": [],
                "context_summary": "Event not found."
            }

        target_t = target_ev.timestamp_ms / 1000.0
        prior_events = []
        posterior_events = []

        for ev in all_events:
            if ev.event_id == target_ev.event_id:
                continue
            ev_t = ev.timestamp_ms / 1000.0
            delta = ev_t - target_t

            if -window_seconds <= delta < 0:
                prior_events.append(ev)
            elif 0 < delta <= window_seconds:
                posterior_events.append(ev)

        prior_events.sort(key=lambda x: x.timestamp_ms)
        posterior_events.sort(key=lambda x: x.timestamp_ms)

        # Context summary formulation
        prior_telecom = sum(1 for e in prior_events if e.domain == "TELECOM")
        prior_fin = sum(1 for e in prior_events if e.domain == "FINANCIAL")
        post_telecom = sum(1 for e in posterior_events if e.domain == "TELECOM")
        post_fin = sum(1 for e in posterior_events if e.domain == "FINANCIAL")

        summary_parts = []
        if prior_telecom > 0 or prior_fin > 0:
            summary_parts.append(f"Pre-transition activity ({int(window_seconds//60)}m prior): {prior_telecom} telecom signals, {prior_fin} financial records observed.")
        if post_telecom > 0 or post_fin > 0:
            summary_parts.append(f"Post-transition activity ({int(window_seconds//60)}m after): {post_telecom} telecom signals, {post_fin} financial records observed.")
        if not summary_parts:
            summary_parts.append(f"No concurrent signals recorded within +/- {int(window_seconds//60)} minutes.")

        return {
            "target_event": target_ev,
            "prior_events": prior_events,
            "posterior_events": posterior_events,
            "context_summary": " ".join(summary_parts)
        }

    def get_trips_sync_data(self, case_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Maintains 100% backward compatibility for the legacy /api/geo/sync-data endpoint.
        Returns:
          { "timeline": [...], "waypoints": [...] }
        """
        target_case_id = case_id
        if not target_case_id:
            from app.core.database import get_db_context
            from app.models.postgres_models import CaseModel
            try:
                with get_db_context() as db:
                    c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
                    if c:
                        target_case_id = c.case_id
            except Exception:
                target_case_id = "INV-2026-BLACK-CIRCUIT"

        all_events = geo_normalizer.normalize_case_geo_events(target_case_id or "INV-2026-BLACK-CIRCUIT")
        _, trips_data = movement_engine.reconstruct_movements(all_events)

        timeline_data = []
        for ev in all_events:
            timeline_data.append({
                "id": ev.event_id,
                "domain": ev.domain,
                "event_type": ev.event_type,
                "timestamp": ev.timestamp,
                "time_ms": ev.timestamp_ms,
                "identity": {"name": ev.entity_name, "id": ev.entity_id},
                "financial": ev.metadata.get("financial", {}),
                "telemetry": {
                    "lat": ev.latitude,
                    "lng": ev.longitude,
                    "address": ev.location_name,
                    "cell_tower_id": ev.cell_tower_id
                }
            })

        timeline_data.sort(key=lambda x: x["time_ms"])

        return {
            "timeline": timeline_data,
            "waypoints": list(trips_data.values())
        }

    def export_geo_dossier(self, case_id: str, export_format: str = "geojson") -> Dict[str, Any]:
        """
        Exports geospatial intelligence into forensic GeoJSON or JSON format.
        """
        investigation = self.get_geo_investigation(case_id)

        if export_format.lower() == "geojson":
            features = []
            
            # 1. Point features for events
            for ev in investigation.events:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [ev.longitude, ev.latitude]
                    },
                    "properties": {
                        "event_id": ev.event_id,
                        "geo_event_id": ev.geo_event_id,
                        "entity_name": ev.entity_name,
                        "timestamp": ev.timestamp,
                        "location_name": ev.location_name,
                        "location_type": ev.location_type.value if hasattr(ev.location_type, "value") else str(ev.location_type),
                        "accuracy_radius_meters": ev.accuracy_radius_meters,
                        "domain": ev.domain,
                        "evidence_id": ev.raw_evidence_id,
                        "evidence_sha256": ev.evidence_sha256
                    }
                })

            # 2. LineString features for movements
            for seg in investigation.movements:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": seg.path_points
                    },
                    "properties": {
                        "segment_id": seg.segment_id,
                        "entity_name": seg.entity_name,
                        "start_time": seg.start_time,
                        "end_time": seg.end_time,
                        "distance_km": seg.distance_km,
                        "speed_kmh": seg.speed_kmh,
                        "is_gap": seg.is_gap,
                        "gap_reason": seg.gap_reason
                    }
                })

            return {
                "type": "FeatureCollection",
                "case_id": case_id,
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "features": features
            }

        return investigation.dict()

    def _build_spatial_story_cards(
        self,
        events: List[GeoCanonicalEvent],
        movements: List[MovementSegment]
    ) -> List[SpatialStoryCard]:
        """
        Builds sequential narrative cards reconstructing entity mobility across key milestones.
        """
        cards: List[SpatialStoryCard] = []
        if not events:
            return []

        # Find top 3 most active entities
        ent_counts = defaultdict(list)
        for ev in events:
            if ev.entity_id and ev.entity_id != "UNKNOWN":
                ent_counts[ev.entity_id].append(ev)

        top_entities = sorted(ent_counts.keys(), key=lambda k: len(ent_counts[k]), reverse=True)[:3]
        card_idx = 1

        for ent_id in top_entities:
            ent_evs = sorted(ent_counts[ent_id], key=lambda x: x.timestamp_ms)
            ent_name = ent_evs[0].entity_name or ent_id

            # Sample key transition points (initial, movements, and terminal)
            milestones = []
            if len(ent_evs) <= 5:
                milestones = ent_evs
            else:
                step = len(ent_evs) // 4
                milestones = [ent_evs[0], ent_evs[step], ent_evs[step*2], ent_evs[step*3], ent_evs[-1]]

            for i, ev in enumerate(milestones):
                prev_ev = milestones[i - 1] if i > 0 else None
                dist_km = None
                travel_sec = None
                speed_kmh = None

                if prev_ev:
                    dist_km = round(haversine_distance_km(prev_ev.latitude, prev_ev.longitude, ev.latitude, ev.longitude), 2)
                    travel_sec = round((ev.timestamp_ms - prev_ev.timestamp_ms) / 1000.0, 1)
                    if travel_sec > 0:
                        speed_kmh = round(dist_km / (travel_sec / 3600.0), 1)

                action_desc = f"{ev.event_type} registered via {ev.domain} at {ev.location_name or 'Recorded Sector'}."
                if ev.anomaly_score > 0:
                    action_desc += f" [Flagged Anomaly: Score {ev.anomaly_score}]"

                card = SpatialStoryCard(
                    card_id=f"STORY-{ent_id}-{card_idx:03d}",
                    entity_id=ent_id,
                    entity_name=ent_name,
                    step_index=card_idx,
                    timestamp=ev.timestamp,
                    time_range_formatted=ev.timestamp.replace("T", " ")[:19],
                    location_name=ev.location_name or "Area Sector",
                    coordinates=(ev.latitude, ev.longitude),
                    action_summary=action_desc,
                    distance_from_previous_km=dist_km,
                    travel_time_from_previous_sec=travel_sec,
                    implied_speed_kmh=speed_kmh,
                    evidence_refs=[ev.raw_evidence_id] if ev.raw_evidence_id else [],
                    anomalies=ev.anomaly_reasons
                )
                cards.append(card)
                card_idx += 1

        return cards

geo_service = GeoService()
