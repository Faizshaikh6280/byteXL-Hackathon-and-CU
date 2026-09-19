import math
import logging
from typing import List, Dict, Any, Optional, Tuple

from app.timeline.schemas import (
    TimelineCanonicalEvent, TemporalCorrelation, ActivityBurst, TemporalInconsistency,
    StorylineSequence, TimeBucketDensity, TimelineSummaryStats, TimelineQueryResponse
)
from app.timeline.normalizer import timeline_normalizer
from app.timeline.correlation_engine import temporal_correlation_engine
from app.timeline.burst_detector import activity_burst_detector
from app.timeline.inconsistency_detector import temporal_inconsistency_detector
from app.timeline.storyline_builder import storyline_builder
from app.processing.canonical_reader import canonical_reader
from app.core.database import get_db_context
from app.models.postgres_models import CaseModel

logger = logging.getLogger("investigation.timeline.service")

class TimelineInvestigationService:
    """
    Unified Temporal Investigation Engine service.
    Coordinates warehouse retrieval, normalization, correlation, burst detection,
    inconsistency checks, zoom density histograms, and query filtering.
    """

    def __init__(self):
        # In-memory cache keyed by case_id for high-speed sub-millisecond query filtering
        self._cache: Dict[str, Dict[str, Any]] = {}

    def _resolve_case_id(self, case_id: Optional[str]) -> Optional[str]:
        if case_id and case_id.strip():
            return case_id.strip()
        try:
            with get_db_context() as db:
                latest = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
                if latest:
                    return latest.case_id
        except Exception:
            pass
        return "INV-2026-IRON-LOTUS"

    def get_or_build_timeline_artifacts(self, case_id: str) -> Dict[str, Any]:
        """
        Builds or returns cached timeline artifacts (normalized events, correlations, bursts, inconsistencies).
        """
        if case_id in self._cache and self._cache[case_id].get("events"):
            return self._cache[case_id]

        logger.info(f"[TimelineService] Building full timeline dataset for Case: {case_id}")
        raw_events = []
        try:
            raw_events = canonical_reader.read_all_events(case_id=case_id)
        except Exception as e:
            logger.warning(f"[TimelineService] Warehouse read failed, checking test packs: {e}")

        if not raw_events:
            from app.timeline.test_pack_loader import test_pack_loader
            raw_events = test_pack_loader.load_case_events(case_id)

        # 1. Normalize
        normalized_events = timeline_normalizer.normalize_warehouse_events(raw_events, case_id=case_id)

        # 1b. Add NFC Evidence Acquisition Timeline Events from PostgreSQL
        try:
            from app.models.nfc_evidence_models import NFCEvidenceAcquisitionModel
            from app.timeline.schemas import TimelineCanonicalEvent, EpistemicStatus, RiskLevel
            with get_db_context() as db:
                nfc_acqs = db.query(NFCEvidenceAcquisitionModel).filter_by(case_id=case_id).all()
                for acq in nfc_acqs:
                    dt = acq.acquired_at or acq.created_at
                    ts_iso = dt.isoformat() if dt else "2026-01-01T00:00:00Z"
                    ts_ms = int(dt.timestamp() * 1000) if dt else 0
                    
                    er_res = acq.entity_resolution_result or {}
                    matched_name = er_res.get("matched_name") or "Subject"
                    matched_cid = er_res.get("matched_cluster_id")
                    
                    loc = acq.location_metadata or {}
                    loc_name = loc.get("location_name") or "Crime Scene"
                    
                    actors = [{"role": "OFFICER", "identifier": acq.acquired_by}]
                    if matched_cid:
                        actors.append({"role": "CANDIDATE_ENTITY", "identifier": matched_name, "cluster_id": matched_cid})

                    nfc_event = TimelineCanonicalEvent(
                        event_id=f"EVT-{acq.acquisition_id}",
                        case_id=case_id,
                        event_type="NFC_ACQUISITION",
                        domain="LOCATION",
                        start_time=ts_iso,
                        raw_timestamp=ts_iso,
                        normalized_timestamp=ts_iso,
                        timestamp_ms=ts_ms,
                        source_type="NFC",
                        evidence_id=acq.evidence_id,
                        evidence_filename=f"{acq.acquisition_id}_raw.json",
                        evidence_sha256=acq.raw_sha256,
                        actor_entities=[acq.acquired_by] + ([matched_cid] if matched_cid else []),
                        z_cluster_id=matched_cid,
                        entity_name=matched_name if matched_cid else None,
                        narration=f"Physical NFC smartcard ({acq.acquisition_id}) acquired by {acq.acquired_by} at {loc_name}. Extracted {len(acq.derived_identifiers or [])} identifiers.",
                        risk_level=RiskLevel.MEDIUM.value if matched_cid else RiskLevel.LOW.value,
                        epistemic_status=EpistemicStatus.OBSERVED.value,
                        confidence_score=1.0,
                        tags=["NFC", "PHYSICAL_EVIDENCE", "CRIME_SCENE"]
                    )
                    normalized_events.append(nfc_event)
            normalized_events.sort(key=lambda x: x.timestamp_ms)
        except Exception as nfc_tl_err:
            logger.warning(f"[TimelineService] Error adding NFC timeline events: {nfc_tl_err}")

        # 2. Correlate
        correlations = temporal_correlation_engine.correlate_events(normalized_events, case_id=case_id)

        # 3. Bursts
        bursts = activity_burst_detector.detect_bursts(normalized_events, case_id=case_id)

        # 4. Inconsistencies
        inconsistencies = temporal_inconsistency_detector.detect_inconsistencies(normalized_events, case_id=case_id)

        # 5. Storylines
        storylines = storyline_builder.build_storylines(normalized_events, correlations, case_id=case_id)

        payload = {
            "events": normalized_events,
            "correlations": correlations,
            "bursts": bursts,
            "inconsistencies": inconsistencies,
            "storylines": storylines,
            "timestamp": normalized_events[-1].timestamp_ms if normalized_events else 0
        }
        if normalized_events:
            self._cache[case_id] = payload
        return payload

    def invalidate_cache(self, case_id: Optional[str] = None):
        if case_id:
            self._cache.pop(case_id, None)
        else:
            self._cache.clear()

    def query_timeline(
        self,
        case_id: Optional[str] = None,
        entity_ids: Optional[List[str]] = None,
        domains: Optional[List[str]] = None,
        event_types: Optional[List[str]] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        risk_levels: Optional[List[str]] = None,
        only_anomalies: bool = False,
        min_confidence: Optional[float] = None,
        search: Optional[str] = None,
        zoom_level: str = "minute", # month, day, hour, minute
        limit: int = 250,
        offset: int = 0
    ) -> TimelineQueryResponse:
        """
        Executes fast in-memory filtered query against normalized timeline events.
        """
        target_case_id = self._resolve_case_id(case_id)
        if not target_case_id:
            return TimelineQueryResponse(
                case_id="",
                summary=TimelineSummaryStats(),
                events=[],
                correlations=[],
                bursts=[],
                inconsistencies=[],
                density_buckets=[],
                entities=[]
            )

        data = self.get_or_build_timeline_artifacts(target_case_id)
        all_events: List[TimelineCanonicalEvent] = data["events"]
        all_correlations: List[TemporalCorrelation] = data["correlations"]
        all_bursts: List[ActivityBurst] = data["bursts"]
        all_inconsistencies: List[TemporalInconsistency] = data["inconsistencies"]

        # Parse start/end limits to ms
        start_ms = None
        end_ms = None
        if start_time:
            from app.timeline.normalizer import parse_forensic_timestamp
            _, start_ms, _, _, _ = parse_forensic_timestamp(start_time)
        if end_time:
            from app.timeline.normalizer import parse_forensic_timestamp
            _, end_ms, _, _, _ = parse_forensic_timestamp(end_time)

        # Filtering
        filtered_events: List[TimelineCanonicalEvent] = []
        domain_counts: Dict[str, int] = {}
        unique_entities_map: Dict[str, Dict[str, Any]] = {}

        norm_entity_filter = [e.strip().lower() for e in (entity_ids or []) if e.strip()]
        norm_domains = [d.strip().upper() for d in (domains or []) if d.strip()]
        norm_types = [t.strip().upper() for t in (event_types or []) if t.strip()]
        norm_risks = [r.strip().upper() for r in (risk_levels or []) if r.strip()]
        search_term = search.strip().lower() if search and search.strip() else None

        for ev in all_events:
            # Time window filter
            if start_ms is not None and ev.timestamp_ms < start_ms:
                continue
            if end_ms is not None and ev.timestamp_ms > end_ms:
                continue

            # Domain filter
            if norm_domains and ev.domain.upper() not in norm_domains:
                continue

            # Event type filter
            if norm_types and ev.event_type.upper() not in norm_types:
                continue

            # Risk level filter
            if norm_risks and ev.risk_level.upper() not in norm_risks:
                continue

            # Anomaly filter
            if only_anomalies and ev.anomaly_score <= 0:
                continue

            # Confidence filter
            if min_confidence is not None and ev.confidence_score < min_confidence:
                continue

            # Entity filter
            if norm_entity_filter:
                match_ent = False
                if ev.z_cluster_id and ev.z_cluster_id.lower() in norm_entity_filter:
                    match_ent = True
                if ev.entity_name and ev.entity_name.lower() in norm_entity_filter:
                    match_ent = True
                for actor in ev.actor_entities:
                    if actor and actor.lower() in norm_entity_filter:
                        match_ent = True
                        break
                for target in ev.target_entities:
                    if target and target.lower() in norm_entity_filter:
                        match_ent = True
                        break
                if not match_ent:
                    continue

            # Free-text search filter
            if search_term:
                search_blob = f"{ev.event_type} {ev.domain} {ev.entity_name or ''} {' '.join(ev.actor_entities)} {' '.join(ev.target_entities)} {ev.location_name or ''} {ev.narration or ''} {ev.client_ip or ''} {ev.cell_tower_id or ''}".lower()
                if search_term not in search_blob:
                    continue

            # Collect domain stats
            domain_counts[ev.domain] = domain_counts.get(ev.domain, 0) + 1

            # Collect entity stats
            ent_key = ev.z_cluster_id or ev.entity_name or (ev.actor_entities[0] if ev.actor_entities else "Unknown Entity")
            if ent_key not in unique_entities_map:
                unique_entities_map[ent_key] = {
                    "id": ent_key,
                    "name": ev.entity_name or ent_key,
                    "cluster_id": ev.z_cluster_id,
                    "event_count": 0,
                    "risk_score": ev.anomaly_score
                }
            unique_entities_map[ent_key]["event_count"] += 1

            filtered_events.append(ev)

        # Build Density Buckets for Time Zoom
        density_buckets = self._calculate_density_buckets(filtered_events, zoom_level)

        # Filter active correlations that connect visible events
        visible_event_ids = set(e.event_id for e in filtered_events)
        active_correlations = [
            c for c in all_correlations
            if c.event_a_id in visible_event_ids or c.event_b_id in visible_event_ids
        ]

        # Filter bursts and inconsistencies
        active_bursts = [
            b for b in all_bursts
            if any(eid in visible_event_ids for eid in b.event_ids)
        ]
        active_inconsistencies = [
            inc for inc in all_inconsistencies
            if inc.event_a_id in visible_event_ids or inc.event_b_id in visible_event_ids
        ]

        # Calculate Summary Stats
        total_anomalies = sum(1 for e in filtered_events if e.anomaly_score > 0)
        summary = TimelineSummaryStats(
            total_events=len(filtered_events),
            total_entities=len(unique_entities_map),
            total_anomalies=total_anomalies,
            total_correlations=len(active_correlations),
            total_bursts=len(active_bursts),
            total_inconsistencies=len(active_inconsistencies),
            domain_breakdown=domain_counts,
            min_timestamp=filtered_events[0].normalized_timestamp if filtered_events else None,
            max_timestamp=filtered_events[-1].normalized_timestamp if filtered_events else None
        )

        # Pagination / Windowing
        paginated_events = filtered_events[offset:offset + limit]
        has_more = (offset + limit) < len(filtered_events)
        next_cursor = str(offset + limit) if has_more else None

        return TimelineQueryResponse(
            case_id=target_case_id,
            summary=summary,
            events=paginated_events,
            correlations=active_correlations[:100],
            bursts=active_bursts[:50],
            inconsistencies=active_inconsistencies[:50],
            density_buckets=density_buckets,
            entities=list(unique_entities_map.values()),
            has_more=has_more,
            next_cursor=next_cursor
        )

    def _calculate_density_buckets(
        self,
        events: List[TimelineCanonicalEvent],
        zoom_level: str
    ) -> List[TimeBucketDensity]:
        """
        Aggregates events into time-bucket histograms to render density views at higher zoom levels.
        """
        if not events:
            return []

        # Bucket interval in milliseconds based on zoom level
        if zoom_level == "month":
            interval_ms = 86400 * 1000 # 1 day buckets
        elif zoom_level == "day":
            interval_ms = 3600 * 1000  # 1 hour buckets
        elif zoom_level == "hour":
            interval_ms = 300 * 1000   # 5 minute buckets
        else: # minute
            interval_ms = 60 * 1000    # 1 minute buckets

        span_ms = max(1000, events[-1].timestamp_ms - events[0].timestamp_ms)
        if span_ms // interval_ms > 150:
            interval_ms = max(interval_ms, span_ms // 100)

        buckets: Dict[int, TimeBucketDensity] = {}

        for ev in events:
            b_start = (ev.timestamp_ms // interval_ms) * interval_ms
            if b_start not in buckets:
                import datetime
                dt = datetime.datetime.fromtimestamp(b_start / 1000.0, tz=datetime.timezone.utc)
                if zoom_level == "month":
                    key = dt.strftime("%d %b")
                elif zoom_level == "day":
                    key = dt.strftime("%H:00")
                elif zoom_level == "hour":
                    key = dt.strftime("%H:%M")
                else:
                    key = dt.strftime("%H:%M:%S")

                buckets[b_start] = TimeBucketDensity(
                    bucket_key=key,
                    start_ms=b_start,
                    end_ms=b_start + interval_ms,
                    event_count=0,
                    domain_counts={},
                    anomaly_count=0
                )

            b = buckets[b_start]
            b.event_count += 1
            b.domain_counts[ev.domain] = b.domain_counts.get(ev.domain, 0) + 1
            if ev.anomaly_score > 0:
                b.anomaly_count += 1

        sorted_buckets = [buckets[k] for k in sorted(buckets.keys())]
        return sorted_buckets

    def get_event_context(
        self,
        event_id: str,
        case_id: Optional[str] = None,
        window_minutes: int = 15
    ) -> Dict[str, Any]:
        """
        Extracts immediate temporal neighborhood events (e.g. ±5m, ±15m, ±30m, ±1h).
        """
        target_case_id = self._resolve_case_id(case_id)
        if not target_case_id:
            return {"target_event": None, "context_events": []}

        data = self.get_or_build_timeline_artifacts(target_case_id)
        all_events = data["events"]

        target_ev = next((e for e in all_events if e.event_id == event_id), None)
        if not target_ev:
            return {"target_event": None, "context_events": []}

        target_ms = target_ev.timestamp_ms
        window_ms = window_minutes * 60 * 1000

        context_events = [
            e for e in all_events
            if abs(e.timestamp_ms - target_ms) <= window_ms
        ]

        return {
            "target_event": target_ev,
            "window_minutes": window_minutes,
            "context_events": context_events
        }

    def get_storylines(self, case_id: Optional[str] = None) -> List[StorylineSequence]:
        target_case_id = self._resolve_case_id(case_id)
        if not target_case_id:
            return []
        data = self.get_or_build_timeline_artifacts(target_case_id)
        return data.get("storylines", [])

    def get_compare_streams(
        self,
        entity_keys: List[str],
        case_id: Optional[str] = None
    ) -> Dict[str, List[TimelineCanonicalEvent]]:
        """
        Returns synchronized temporal streams for side-by-side entity comparison.
        """
        target_case_id = self._resolve_case_id(case_id)
        if not target_case_id:
            return {}

        data = self.get_or_build_timeline_artifacts(target_case_id)
        all_events = data["events"]

        streams: Dict[str, List[TimelineCanonicalEvent]] = {k: [] for k in entity_keys}

        for ev in all_events:
            for k in entity_keys:
                k_lower = k.lower().strip()
                if (ev.z_cluster_id and ev.z_cluster_id.lower() == k_lower) or \
                   (ev.entity_name and ev.entity_name.lower() == k_lower) or \
                   any(a and a.lower() == k_lower for a in ev.actor_entities) or \
                   any(t and t.lower() == k_lower for t in ev.target_entities):
                    streams[k].append(ev)

        return streams

timeline_service = TimelineInvestigationService()
