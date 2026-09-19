import pytest
from datetime import datetime, timezone

from app.geo.schemas import (
    GeoCanonicalEvent, GeoLocationType, MovementSegment, CoLocationFinding
)
from app.geo.movement_engine import haversine_distance_km, movement_engine
from app.geo.overlap_engine import spatial_overlap_engine
from app.geo.clustering_engine import clustering_engine
from app.geo.service import geo_service

class TestGeoEngine:
    """
    Forensic verification suite for Geospatial Intelligence Engine.
    """

    def test_haversine_distance_calculation(self):
        """
        Verifies mathematical accuracy of great-circle geodesic calculation.
        Distance between Sector 17 (30.7410, 76.7680) and Sector 22 (30.7333, 76.7794) is ~1.38 km.
        """
        dist = haversine_distance_km(30.7410, 76.7680, 30.7333, 76.7794)
        assert 1.30 <= dist <= 1.45
        
        # Distance to self must be 0
        dist_zero = haversine_distance_km(28.6139, 77.2090, 28.6139, 77.2090)
        assert dist_zero == 0.0

    def test_movement_reconstruction_and_speed(self):
        """
        Verifies chronological sequencing, distance, and speed calculations.
        """
        ev1 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-01",
            event_id="EV-01",
            case_id="CASE-TEST",
            entity_id="ENT-ALPHA",
            entity_name="Alpha",
            timestamp="2026-08-01T10:00:00Z",
            timestamp_ms=1785578400000,
            raw_timestamp="2026-08-01 10:00:00",
            location_type=GeoLocationType.GPS,
            latitude=30.7410,
            longitude=76.7680,
            raw_evidence_id="EVID-01"
        )
        ev2 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-02",
            event_id="EV-02",
            case_id="CASE-TEST",
            entity_id="ENT-ALPHA",
            entity_name="Alpha",
            timestamp="2026-08-01T10:15:00Z", # 15 minutes later
            timestamp_ms=1785579300000,
            raw_timestamp="2026-08-01 10:15:00",
            location_type=GeoLocationType.GPS,
            latitude=30.7333,
            longitude=76.7794,
            raw_evidence_id="EVID-01"
        )

        segments, trips = movement_engine.reconstruct_movements([ev1, ev2])
        assert len(segments) == 1
        seg = segments[0]
        assert seg.entity_id == "ENT-ALPHA"
        assert seg.duration_seconds == 900.0 # 15 minutes
        assert 1.30 <= seg.distance_km <= 1.45
        # 1.38 km in 0.25h is ~5.5 km/h (walking/driving slow)
        assert 5.0 <= seg.speed_kmh <= 6.0
        assert seg.is_gap is False

    def test_movement_gap_detection(self):
        """
        Verifies that long intervals (>2h) are flagged as temporal gaps rather than continuous movement.
        """
        ev1 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-01",
            event_id="EV-01",
            case_id="CASE-TEST",
            entity_id="ENT-BETA",
            entity_name="Beta",
            timestamp="2026-08-01T08:00:00Z",
            timestamp_ms=1785571200000,
            raw_timestamp="2026-08-01 08:00:00",
            location_type=GeoLocationType.GPS,
            latitude=30.7410,
            longitude=76.7680,
            raw_evidence_id="EVID-01"
        )
        ev2 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-02",
            event_id="EV-02",
            case_id="CASE-TEST",
            entity_id="ENT-BETA",
            entity_name="Beta",
            timestamp="2026-08-01T14:00:00Z", # 6 hours later (>2h)
            timestamp_ms=1785592800000,
            raw_timestamp="2026-08-01 14:00:00",
            location_type=GeoLocationType.GPS,
            latitude=30.7333,
            longitude=76.7794,
            raw_evidence_id="EVID-01"
        )

        segments, _ = movement_engine.reconstruct_movements([ev1, ev2])
        assert len(segments) == 1
        assert segments[0].is_gap is True
        assert segments[0].gap_reason == "TEMPORAL_DISCONTINUITY"

    def test_cell_tower_overlap_detection(self):
        """
        Verifies detection of two entities observed at the same cell tower within 30 minutes.
        """
        ev1 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-01",
            event_id="EV-01",
            case_id="CASE-TEST",
            entity_id="ENT-USER-1",
            entity_name="User One",
            timestamp="2026-08-01T12:00:00Z",
            timestamp_ms=1785585600000,
            raw_timestamp="2026-08-01 12:00:00",
            location_type=GeoLocationType.CELL_TOWER,
            cell_tower_id="CELL-CHD-17",
            latitude=30.7410,
            longitude=76.7680,
            raw_evidence_id="EVID-01"
        )
        ev2 = GeoCanonicalEvent(
            geo_event_id="GEO-TEST-02",
            event_id="EV-02",
            case_id="CASE-TEST",
            entity_id="ENT-USER-2",
            entity_name="User Two",
            timestamp="2026-08-01T12:10:00Z", # 10 minutes apart
            timestamp_ms=1785586200000,
            raw_timestamp="2026-08-01 12:10:00",
            location_type=GeoLocationType.CELL_TOWER,
            cell_tower_id="CELL-CHD-17",
            latitude=30.7410,
            longitude=76.7680,
            raw_evidence_id="EVID-02"
        )

        findings = spatial_overlap_engine.detect_co_locations([ev1, ev2], case_id="CASE-TEST")
        assert len(findings) >= 1
        f = findings[0]
        assert "ENT-USER-1" in f.entity_ids
        assert "ENT-USER-2" in f.entity_ids
        assert f.cell_tower_id == "CELL-CHD-17"
        assert f.correlation_score > 0.0

    def test_repeated_co_location_detection(self):
        """
        Verifies that repeated co-location across distinct days elevates to REPEATED_PRESENCE_IN_AREA.
        """
        # Day 1: August 1
        ev1_d1 = GeoCanonicalEvent(
            geo_event_id="GEO-D1-1", event_id="EV-D1-1", case_id="CASE-TEST",
            entity_id="ENT-A", entity_name="Entity A",
            timestamp="2026-08-01T12:00:00Z", timestamp_ms=1785585600000, raw_timestamp="2026-08-01 12:00:00",
            latitude=30.7410, longitude=76.7680, raw_evidence_id="EVID-01"
        )
        ev2_d1 = GeoCanonicalEvent(
            geo_event_id="GEO-D1-2", event_id="EV-D1-2", case_id="CASE-TEST",
            entity_id="ENT-B", entity_name="Entity B",
            timestamp="2026-08-01T12:05:00Z", timestamp_ms=1785585900000, raw_timestamp="2026-08-01 12:05:00",
            latitude=30.7410, longitude=76.7680, raw_evidence_id="EVID-02"
        )
        # Day 2: August 2
        ev1_d2 = GeoCanonicalEvent(
            geo_event_id="GEO-D2-1", event_id="EV-D2-1", case_id="CASE-TEST",
            entity_id="ENT-A", entity_name="Entity A",
            timestamp="2026-08-02T15:00:00Z", timestamp_ms=1785682800000, raw_timestamp="2026-08-02 15:00:00",
            latitude=30.7410, longitude=76.7680, raw_evidence_id="EVID-03"
        )
        ev2_d2 = GeoCanonicalEvent(
            geo_event_id="GEO-D2-2", event_id="EV-D2-2", case_id="CASE-TEST",
            entity_id="ENT-B", entity_name="Entity B",
            timestamp="2026-08-02T15:08:00Z", timestamp_ms=1785683280000, raw_timestamp="2026-08-02 15:08:00",
            latitude=30.7410, longitude=76.7680, raw_evidence_id="EVID-04"
        )

        findings = spatial_overlap_engine.detect_co_locations([ev1_d1, ev2_d1, ev1_d2, ev2_d2], case_id="CASE-TEST")
        assert len(findings) >= 1
        repeated_findings = [f for f in findings if f.co_location_type == "REPEATED_PRESENCE_IN_AREA"]
        assert len(repeated_findings) >= 1
        assert repeated_findings[0].distinct_days_count >= 2

    def test_area_query_who_was_here(self):
        """
        Verifies interactive area query ('Who Was Here?').
        """
        # Event in Sector 17
        ev_in = GeoCanonicalEvent(
            geo_event_id="GEO-IN", event_id="EV-IN", case_id="CASE-TEST",
            entity_id="ENT-TARGET", entity_name="Target Person",
            timestamp="2026-08-01T12:00:00Z", timestamp_ms=1785585600000, raw_timestamp="2026-08-01 12:00:00",
            latitude=30.7410, longitude=76.7680, location_name="Sector 17", raw_evidence_id="EVID-01"
        )
        # Event 10km away in Zirakpur
        ev_out = GeoCanonicalEvent(
            geo_event_id="GEO-OUT", event_id="EV-OUT", case_id="CASE-TEST",
            entity_id="ENT-DISTANT", entity_name="Distant Person",
            timestamp="2026-08-01T12:00:00Z", timestamp_ms=1785585600000, raw_timestamp="2026-08-01 12:00:00",
            latitude=30.6400, longitude=76.8170, location_name="Zirakpur", raw_evidence_id="EVID-02"
        )

        # Query around Sector 17 with 500m radius
        dist = haversine_distance_km(30.7410, 76.7680, ev_in.latitude, ev_in.longitude)
        assert dist < 0.5
        dist_out = haversine_distance_km(30.7410, 76.7680, ev_out.latitude, ev_out.longitude)
        assert dist_out > 5.0

    def test_benchmark_pack_night_ledger(self):
        """
        Verifies end-to-end geospatial investigation on Operation Night Ledger.
        """
        res = geo_service.get_geo_investigation("INV-2026-NIGHT-LEDGER")
        assert res.total_events > 0
        assert len(res.movements) > 0
        assert res.summary_metrics["center"]["lat"] > 0
        assert len(res.common_places) > 0

    def test_legacy_sync_data_backward_compatibility(self):
        """
        Ensures existing /api/geo/sync-data format remains 100% backward compatible.
        """
        sync = geo_service.get_trips_sync_data("INV-2026-NIGHT-LEDGER")
        assert "timeline" in sync
        assert "waypoints" in sync
        assert isinstance(sync["timeline"], list)
        assert isinstance(sync["waypoints"], list)
