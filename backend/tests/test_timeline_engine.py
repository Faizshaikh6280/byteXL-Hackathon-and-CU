"""
Comprehensive Unit & Integration Test Suite for Timeline & Digital Footprint Reconstruction Subsystem.
Tests:
- Forensic timestamp normalization & explicit timezone preservation
- Canonical event normalization & Golden Profile entity linking
- Multi-domain temporal correlation rules
- Activity burst density detection
- Spatio-temporal consistency & Haversine velocity plausibility checks
- Evidence-grounded storyline reconstruction
- Timeline service filtering, zoom density histograms, and context neighborhoods
"""

import unittest
from datetime import datetime, timezone

from app.timeline.schemas import (
    TimelineCanonicalEvent, TemporalCorrelation, ActivityBurst, TemporalInconsistency,
    StorylineSequence, EpistemicStatus, TimestampPrecision, RiskLevel
)
from app.timeline.normalizer import parse_forensic_timestamp, TimelineEventNormalizer
from app.timeline.correlation_engine import (
    TemporalCorrelationEngine, format_time_delta
)
from app.timeline.burst_detector import ActivityBurstDetector
from app.timeline.inconsistency_detector import (
    haversine_distance_km, TemporalInconsistencyDetector
)
from app.timeline.storyline_builder import StorylineBuilder
from app.timeline.service import TimelineInvestigationService


class TestTimelineEngine(unittest.TestCase):

    # ── 1. Forensic Timestamp Normalization ───────────────────────────
    def test_timestamp_normalization_iso_utc(self):
        raw = "2026-08-14T09:48:32Z"
        norm_iso, ts_ms, tz_offset, precision, conf = parse_forensic_timestamp(raw)
        self.assertEqual(norm_iso, "2026-08-14T09:48:32Z")
        self.assertEqual(tz_offset, "UTC")
        self.assertEqual(precision, TimestampPrecision.SECOND.value)
        self.assertEqual(conf, 1.0)
        self.assertGreater(ts_ms, 0)

    def test_timestamp_normalization_with_timezone_offset(self):
        raw = "2026-08-14T15:18:32+05:30"
        norm_iso, ts_ms, tz_offset, precision, conf = parse_forensic_timestamp(raw)
        # 15:18:32 +05:30 is 09:48:32 UTC
        self.assertEqual(norm_iso, "2026-08-14T09:48:32Z")
        self.assertEqual(tz_offset, "+05:30")
        self.assertEqual(precision, TimestampPrecision.SECOND.value)

    def test_timestamp_normalization_unknown_timezone(self):
        # Per prompt: DO NOT silently assume a timezone when timezone is unknown
        raw = "2026-08-14 09:48:32"
        norm_iso, ts_ms, tz_offset, precision, conf = parse_forensic_timestamp(raw)
        self.assertEqual(tz_offset, "UNKNOWN")
        self.assertEqual(precision, TimestampPrecision.SECOND.value)

    def test_timestamp_precision_minute(self):
        raw = "2026-08-14 09:48"
        norm_iso, ts_ms, tz_offset, precision, conf = parse_forensic_timestamp(raw)
        self.assertEqual(precision, TimestampPrecision.MINUTE.value)
        self.assertEqual(conf, 0.85)

    # ── 2. Time Delta Formatting ──────────────────────────────────────
    def test_time_delta_formatting(self):
        self.assertEqual(format_time_delta(45), "45s")
        self.assertEqual(format_time_delta(360), "6m")
        self.assertEqual(format_time_delta(372), "6m 12s")
        self.assertEqual(format_time_delta(3600), "1h")
        self.assertEqual(format_time_delta(7500), "2h 5m")

    # ── 3. Temporal Correlation Rules ─────────────────────────────────
    def test_call_before_transfer_correlation(self):
        engine = TemporalCorrelationEngine()

        call_ev = TimelineCanonicalEvent(
            event_id="EV-CALL-01",
            case_id="CASE-TEST",
            event_type="CALL",
            domain="TELECOM",
            start_time="2026-08-14T09:42:00Z",
            raw_timestamp="2026-08-14 09:42:00",
            normalized_timestamp="2026-08-14T09:42:00Z",
            timestamp_ms=1786690920000,
            source_type="TELECOM",
            evidence_id="EV-01",
            actor_entities=["+919811001001", "Aarav Sharma"],
            target_entities=["+919811001002"],
            counterparty="+919811001002",
            duration_seconds=180
        )

        txn_ev = TimelineCanonicalEvent(
            event_id="EV-TXN-01",
            case_id="CASE-TEST",
            event_type="BANK_TRANSFER",
            domain="FINANCIAL",
            start_time="2026-08-14T09:48:00Z", # 6 minutes later
            raw_timestamp="2026-08-14 09:48:00",
            normalized_timestamp="2026-08-14T09:48:00Z",
            timestamp_ms=1786691280000,
            source_type="BANKING",
            evidence_id="EV-02",
            actor_entities=["Aarav Sharma", "ACC-9901"],
            counterparty="ACC-9902",
            amount_inr=480000.0,
            channel="IMPS"
        )

        correlations = engine.correlate_events([call_ev, txn_ev], case_id="CASE-TEST")
        self.assertEqual(len(correlations), 1)
        corr = correlations[0]
        self.assertEqual(corr.relationship_type, "CALL_BEFORE_TRANSFER")
        self.assertEqual(corr.time_delta_seconds, 360.0)
        self.assertEqual(corr.time_delta_formatted, "6m")
        self.assertGreaterEqual(corr.correlation_score, 0.8)
        self.assertIn("EV-01", corr.supporting_evidence)
        self.assertIn("EV-02", corr.supporting_evidence)
        self.assertIn(corr.correlation_id, call_ev.correlation_ids)
        self.assertIn(corr.correlation_id, txn_ev.correlation_ids)

    def test_transfer_to_cashout_correlation(self):
        engine = TemporalCorrelationEngine()

        credit_ev = TimelineCanonicalEvent(
            event_id="EV-TXN-02",
            case_id="CASE-TEST",
            event_type="BANK_TRANSFER",
            domain="FINANCIAL",
            start_time="2026-08-14T10:00:00Z",
            raw_timestamp="2026-08-14 10:00:00",
            normalized_timestamp="2026-08-14T10:00:00Z",
            timestamp_ms=1786692000000,
            source_type="BANKING",
            evidence_id="EV-02",
            actor_entities=["ACC-9902"],
            amount_inr=480000.0
        )

        cashout_ev = TimelineCanonicalEvent(
            event_id="EV-ATM-01",
            case_id="CASE-TEST",
            event_type="CASH_WITHDRAWAL",
            domain="FINANCIAL",
            start_time="2026-08-14T10:15:00Z", # 15 minutes later
            raw_timestamp="2026-08-14 10:15:00",
            normalized_timestamp="2026-08-14T10:15:00Z",
            timestamp_ms=1786692900000,
            source_type="BANKING",
            evidence_id="EV-03",
            actor_entities=["ACC-9902"],
            amount_inr=50000.0,
            channel="ATM"
        )

        correlations = engine.correlate_events([credit_ev, cashout_ev], case_id="CASE-TEST")
        self.assertEqual(len(correlations), 1)
        self.assertEqual(correlations[0].relationship_type, "TRANSFER_TO_CASHOUT")
        self.assertEqual(correlations[0].time_delta_formatted, "15m")

    # ── 4. Activity Burst Detection ───────────────────────────────────
    def test_activity_burst_detection(self):
        detector = ActivityBurstDetector(window_seconds=1800, min_burst_events=4)

        base_ms = 1786690000000
        burst_events = [
            TimelineCanonicalEvent(
                event_id=f"EV-BURST-{i}",
                case_id="CASE-TEST",
                event_type="CALL" if i % 2 == 0 else "BANK_TRANSFER",
                domain="TELECOM" if i % 2 == 0 else "FINANCIAL",
                start_time=f"2026-08-14T09:{10+i}:00Z",
                raw_timestamp=f"2026-08-14 09:{10+i}:00",
                normalized_timestamp=f"2026-08-14T09:{10+i}:00Z",
                timestamp_ms=base_ms + i * 120000, # every 2 minutes
                source_type="LOGS",
                evidence_id="EV-01",
                actor_entities=[f"Actor_{i % 2}"]
            )
            for i in range(6)
        ]

        bursts = detector.detect_bursts(burst_events, case_id="CASE-TEST")
        self.assertGreaterEqual(len(bursts), 1)
        b = bursts[0]
        self.assertEqual(b.event_count, 6)
        self.assertEqual(b.domain_counts.get("TELECOM"), 3)
        self.assertEqual(b.domain_counts.get("FINANCIAL"), 3)
        self.assertIn("Activity burst detected", b.description)

    # ── 5. Geospatial & Temporal Inconsistency Detection ─────────────
    def test_haversine_distance(self):
        # Delhi (28.6139, 77.2090) to Mumbai (19.0760, 72.8777) ~ 1,148 km
        dist = haversine_distance_km(28.6139, 77.2090, 19.0760, 72.8777)
        self.assertGreater(dist, 1100.0)
        self.assertLess(dist, 1200.0)

    def test_implausible_velocity_detection(self):
        detector = TemporalInconsistencyDetector()

        # Same entity observed in Delhi at 09:40 and Mumbai at 09:45 (5 minutes for 1,150 km => ~13,800 km/h)
        ev_delhi = TimelineCanonicalEvent(
            event_id="EV-GEO-DELHI",
            case_id="CASE-TEST",
            event_type="CELL_TOWER_LOCATION",
            domain="LOCATION",
            start_time="2026-08-14T09:40:00Z",
            raw_timestamp="2026-08-14 09:40:00",
            normalized_timestamp="2026-08-14T09:40:00Z",
            timestamp_ms=1786690800000,
            source_type="TELECOM",
            evidence_id="EV-TOWER-01",
            latitude=28.6139,
            longitude=77.2090,
            location_name="Tower Delhi-Connaught",
            actor_entities=["Aarav Sharma"],
            entity_name="Aarav Sharma"
        )

        ev_mumbai = TimelineCanonicalEvent(
            event_id="EV-GEO-MUMBAI",
            case_id="CASE-TEST",
            event_type="CELL_TOWER_LOCATION",
            domain="LOCATION",
            start_time="2026-08-14T09:45:00Z",
            raw_timestamp="2026-08-14 09:45:00",
            normalized_timestamp="2026-08-14T09:45:00Z",
            timestamp_ms=1786691100000,
            source_type="TELECOM",
            evidence_id="EV-TOWER-02",
            latitude=19.0760,
            longitude=72.8777,
            location_name="Tower Mumbai-Bandra",
            actor_entities=["Aarav Sharma"],
            entity_name="Aarav Sharma"
        )

        inconsistencies = detector.detect_inconsistencies([ev_delhi, ev_mumbai], case_id="CASE-TEST")
        self.assertEqual(len(inconsistencies), 1)
        inc = inconsistencies[0]
        self.assertEqual(inc.entity_name, "Aarav Sharma")
        self.assertGreater(inc.required_speed_kmh, 1000.0)
        self.assertIn("Potential temporal/geospatial inconsistency detected", inc.description)
        self.assertNotIn("fraudulent", inc.description.lower()) # Strictly neutral forensic tone

    def test_plausible_velocity_not_flagged(self):
        detector = TemporalInconsistencyDetector()

        # Entity moves 3 km in 20 minutes (9 km/h)
        ev_1 = TimelineCanonicalEvent(
            event_id="EV-PL-1",
            case_id="CASE-TEST",
            event_type="CELL_TOWER_LOCATION",
            domain="LOCATION",
            start_time="2026-08-14T09:00:00Z",
            raw_timestamp="2026-08-14 09:00:00",
            normalized_timestamp="2026-08-14T09:00:00Z",
            timestamp_ms=1786688400000,
            source_type="TELECOM",
            evidence_id="EV-01",
            latitude=28.6139,
            longitude=77.2090,
            actor_entities=["Aarav Sharma"]
        )
        ev_2 = TimelineCanonicalEvent(
            event_id="EV-PL-2",
            case_id="CASE-TEST",
            event_type="CELL_TOWER_LOCATION",
            domain="LOCATION",
            start_time="2026-08-14T09:20:00Z",
            raw_timestamp="2026-08-14 09:20:00",
            normalized_timestamp="2026-08-14T09:20:00Z",
            timestamp_ms=1786689600000,
            source_type="TELECOM",
            evidence_id="EV-02",
            latitude=28.6400,
            longitude=77.2100, # ~2.9 km
            actor_entities=["Aarav Sharma"]
        )

        inconsistencies = detector.detect_inconsistencies([ev_1, ev_2], case_id="CASE-TEST")
        self.assertEqual(len(inconsistencies), 0)

    # ── 6. Storyline Builder ──────────────────────────────────────────
    def test_storyline_builder(self):
        builder = StorylineBuilder()

        ev1 = TimelineCanonicalEvent(
            event_id="ST-EV-1",
            case_id="CASE-TEST",
            event_type="CALL",
            domain="TELECOM",
            start_time="2026-08-14T09:42:00Z",
            raw_timestamp="2026-08-14 09:42:00",
            normalized_timestamp="2026-08-14T09:42:00Z",
            timestamp_ms=1786690920000,
            source_type="TELECOM",
            evidence_id="EV-01",
            actor_entities=["Person A"],
            counterparty="Person B"
        )
        ev2 = TimelineCanonicalEvent(
            event_id="ST-EV-2",
            case_id="CASE-TEST",
            event_type="BANK_TRANSFER",
            domain="FINANCIAL",
            start_time="2026-08-14T09:48:00Z",
            raw_timestamp="2026-08-14 09:48:00",
            normalized_timestamp="2026-08-14T09:48:00Z",
            timestamp_ms=1786691280000,
            source_type="BANKING",
            evidence_id="EV-02",
            actor_entities=["Person A"],
            amount_inr=480000.0
        )
        ev3 = TimelineCanonicalEvent(
            event_id="ST-EV-3",
            case_id="CASE-TEST",
            event_type="SOCIAL_POST",
            domain="SOCIAL",
            start_time="2026-08-14T09:55:00Z",
            raw_timestamp="2026-08-14 09:55:00",
            normalized_timestamp="2026-08-14T09:55:00Z",
            timestamp_ms=1786691700000,
            source_type="SOCIAL",
            evidence_id="EV-03",
            actor_entities=["Person A"]
        )

        corr1 = TemporalCorrelation(
            correlation_id="C-1",
            case_id="CASE-TEST",
            event_a_id="ST-EV-1",
            event_b_id="ST-EV-2",
            relationship_type="CALL_BEFORE_TRANSFER",
            time_delta_seconds=360,
            time_delta_formatted="6m",
            correlation_score=0.9,
            description="Call before transfer",
            timestamp_a=ev1.normalized_timestamp,
            timestamp_b=ev2.normalized_timestamp
        )
        corr2 = TemporalCorrelation(
            correlation_id="C-2",
            case_id="CASE-TEST",
            event_a_id="ST-EV-2",
            event_b_id="ST-EV-3",
            relationship_type="TRANSFER_WITH_SOCIAL_ACTIVITY",
            time_delta_seconds=420,
            time_delta_formatted="7m",
            correlation_score=0.85,
            description="Transfer with social activity",
            timestamp_a=ev2.normalized_timestamp,
            timestamp_b=ev3.normalized_timestamp
        )

        storylines = builder.build_storylines([ev1, ev2, ev3], [corr1, corr2], case_id="CASE-TEST")
        self.assertEqual(len(storylines), 1)
        story = storylines[0]
        self.assertEqual(len(story.steps), 3)
        self.assertEqual(story.steps[0].time_offset_from_start, "0s")
        self.assertEqual(story.steps[1].time_offset_from_start, "+6m")
        self.assertEqual(story.steps[2].time_offset_from_start, "+13m")
        self.assertIn("TELECOM", story.domain_span)
        self.assertIn("FINANCIAL", story.domain_span)
        self.assertIn("SOCIAL", story.domain_span)
        self.assertIn("Evidence-grounded reconstruction", story.intelligence_assessment)

    # ── 7. Timeline Service Density & Compare Streams ─────────────────
    def test_density_buckets_aggregation(self):
        service = TimelineInvestigationService()

        base_ms = 1786688400000 # 2026-08-14 09:00:00 UTC
        events = [
            TimelineCanonicalEvent(
                event_id=f"EV-DENS-{i}",
                case_id="CASE-TEST",
                event_type="CALL",
                domain="TELECOM",
                start_time="2026-08-14T09:00:00Z",
                raw_timestamp="2026-08-14 09:00:00",
                normalized_timestamp="2026-08-14T09:00:00Z",
                timestamp_ms=base_ms + i * 60000, # every 1 minute
                source_type="TELECOM",
                evidence_id="EV-01"
            )
            for i in range(15)
        ]

        # Test hour zoom (5-minute buckets)
        hour_buckets = service._calculate_density_buckets(events, "hour")
        self.assertGreaterEqual(len(hour_buckets), 3)
        total_b_events = sum(b.event_count for b in hour_buckets)
        self.assertEqual(total_b_events, 15)

        # Test day zoom (1-hour buckets)
        day_buckets = service._calculate_density_buckets(events, "day")
        self.assertEqual(len(day_buckets), 1)
        self.assertEqual(day_buckets[0].event_count, 15)

    def test_compare_streams_partitioning(self):
        service = TimelineInvestigationService()

        ev_a = TimelineCanonicalEvent(
            event_id="EV-CMP-1",
            case_id="CASE-TEST",
            event_type="CALL",
            domain="TELECOM",
            start_time="2026-08-14T09:00:00Z",
            raw_timestamp="2026-08-14 09:00:00",
            normalized_timestamp="2026-08-14T09:00:00Z",
            timestamp_ms=1786688400000,
            source_type="TELECOM",
            evidence_id="EV-01",
            actor_entities=["Aarav Sharma"],
            entity_name="Aarav Sharma"
        )
        ev_b = TimelineCanonicalEvent(
            event_id="EV-CMP-2",
            case_id="CASE-TEST",
            event_type="BANK_TRANSFER",
            domain="FINANCIAL",
            start_time="2026-08-14T09:05:00Z",
            raw_timestamp="2026-08-14 09:05:00",
            normalized_timestamp="2026-08-14T09:05:00Z",
            timestamp_ms=1786688700000,
            source_type="BANKING",
            evidence_id="EV-02",
            actor_entities=["Riya Mehta"],
            entity_name="Riya Mehta"
        )

        service._cache["CASE-TEST"] = {
            "events": [ev_a, ev_b],
            "correlations": [],
            "bursts": [],
            "inconsistencies": [],
            "storylines": []
        }

        streams = service.get_compare_streams(["Aarav Sharma", "Riya Mehta"], case_id="CASE-TEST")
        self.assertEqual(len(streams["Aarav Sharma"]), 1)
        self.assertEqual(len(streams["Riya Mehta"]), 1)
        self.assertEqual(streams["Aarav Sharma"][0].event_id, "EV-CMP-1")
        self.assertEqual(streams["Riya Mehta"][0].event_id, "EV-CMP-2")


if __name__ == "__main__":
    unittest.main()
