"""
PatternMatcher: Evaluates CorrelatedSignalGroups against the declarative PatternLibrary.
Emits CandidatePattern instances ready for context enrichment and evidence binding.
"""

import uuid
import logging
from typing import Dict, Any, List, Optional
from app.anomaly.correlation.correlation_engine import CorrelatedSignalGroup
from app.anomaly.schemas.signal_contracts import CandidatePattern, DetectionSignal
from app.anomaly.patterns.pattern_library import pattern_library, PatternDefinition

logger = logging.getLogger("PatternMatcher")


class PatternMatcher:
    """
    Evaluates correlated signal clusters to determine whether they satisfy
    declarative pattern definitions, aggregating observations and metrics.
    """

    def __init__(self):
        self.library = pattern_library

    def match(
        self,
        group: CorrelatedSignalGroup
    ) -> Optional[CandidatePattern]:
        """
        Determines the most accurate pattern describing the correlated signals.
        Returns a CandidatePattern if matching criteria are met.
        """
        all_signals = [group.primary_signal] + group.supporting_signals
        detector_ids = {s.detector_id for s in all_signals}
        pattern_types = {s.pattern_type for s in all_signals}

        best_pattern = None

        # Priority 0: Primary signal's direct pattern match
        prim_pat = self.library.get_pattern(group.primary_signal.pattern_type)
        if not prim_pat:
            for p in self.library.get_all_patterns():
                if group.primary_signal.detector_id in p.required_detectors_or_types:
                    prim_pat = p
                    break

        if prim_pat:
            best_pattern = prim_pat

        # Check multi-stage patterns if primary signal is not an explicit core pattern
        if not best_pattern:
            if "DET-FIN-ATM-CASHOUT" in detector_ids and "DET-FIN-FANOUT" in detector_ids:
                best_pattern = self.library.get_pattern("FIN_RAPID_TRANSFER_TO_CASH")

        # Fallback to specific pattern match based on detectors
        if not best_pattern:
            for pattern in self.library.get_all_patterns():
                all_req_present = all(req in detector_ids or req in pattern_types for req in pattern.required_detectors_or_types)
                if all_req_present:
                    best_pattern = pattern
                    break

        if not best_pattern:
            return None

        # Aggregate observations across signals
        aggregated_obs: Dict[str, Any] = {}
        for s in all_signals:
            aggregated_obs.update(s.observations)

        # Aggregate baseline info
        aggregated_baseline: Dict[str, Any] = {}
        for s in all_signals:
            aggregated_baseline.update(s.baseline)

        # Aggregate metrics
        aggregated_metrics: Dict[str, Any] = {}
        for s in all_signals:
            aggregated_metrics.update(s.metrics)

        # Collect domains and detectors
        domains = list({s.domain for s in all_signals})
        contributing_detectors = list(dict.fromkeys([s.detector_id for s in all_signals]))

        # Separate primary vs supporting signals for this candidate
        primary_signals = [group.primary_signal]
        supporting_signals = [s for s in group.supporting_signals if s.signal_id != group.primary_signal.signal_id]

        entity_refs = list(group.entities)
        for ce in aggregated_obs.get("converging_entities", []):
            if ce and ce not in entity_refs:
                entity_refs.append(ce)

        CORE_DETECTOR_IDS = {
            "DET-FIN-COORDINATED-FLOW",
            "DET-FIN-HIGH-VALUE-BURST",
            "DET-COMM-SYNC-EPISODE",
            "DET-SPATIAL-CONVERGENCE",
            "DET-SOC-INFRA",
            "DET-SOC-SYNC",
            "DET-CROSS-COLLISION",
            "DET-ID-DISCREPANCY",
            "DET-GEO-TRAJECTORY",
            "DET-SPATIAL-TAILING",
            "DET-SPATIAL-DARKPERIOD"
        }
        if group.primary_signal.detector_id in CORE_DETECTOR_IDS:
            core_det_id = group.primary_signal.detector_id
            pattern_events = []
            seen_evs = set()
            pattern_evidences = []
            seen_evi = set()
            for s in all_signals:
                if s.detector_id == core_det_id:
                    for eid in s.event_refs:
                        if eid and eid not in seen_evs:
                            seen_evs.add(eid)
                            pattern_events.append(eid)
                    for evi in s.evidence_refs:
                        if evi and evi not in seen_evi:
                            seen_evi.add(evi)
                            pattern_evidences.append(evi)
        else:
            pattern_events = list(group.events)
            pattern_evidences = list(group.evidence)

        candidate_id = f"CAN-{uuid.uuid4().hex[:8].upper()}"
        return CandidatePattern(
            candidate_id=candidate_id,
            case_id=group.case_id,
            pattern_id=best_pattern.pattern_id,
            category=best_pattern.category,
            title=best_pattern.title_template,
            primary_signals=primary_signals,
            supporting_signals=supporting_signals,
            entity_refs=entity_refs,
            event_refs=pattern_events,
            evidence_refs=pattern_evidences,
            time_start=group.time_start,
            time_end=group.time_end,
            locations=group.locations,
            aggregated_observations=aggregated_obs,
            baseline=aggregated_baseline,
            metrics=aggregated_metrics,
            primary_detector_id=group.primary_signal.detector_id,
            contributing_detector_ids=contributing_detectors,
            domains_involved=domains
        )


pattern_matcher = PatternMatcher()
