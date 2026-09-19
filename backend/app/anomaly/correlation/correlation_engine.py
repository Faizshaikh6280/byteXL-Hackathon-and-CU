"""
SignalCorrelationEngine: Multi-dimensional correlation and deduplication of DetectionSignals.
Correlates machine-generated signals across entity, event, temporal, spatial, graph,
and domain dimensions into coherent signal clusters, preventing alert fatigue and duplication.
"""

import uuid
import logging
from typing import Dict, Any, List, Set, Optional
from datetime import datetime
from app.anomaly.schemas.signal_contracts import DetectionSignal, SignalStatus

logger = logging.getLogger("SignalCorrelationEngine")


class CorrelatedSignalGroup:
    """
    A clustered set of detection signals representing one underlying investigative episode.
    """

    def __init__(self, group_id: str, case_id: str, primary_signal: DetectionSignal):
        self.group_id = group_id
        self.case_id = case_id
        self.primary_signal = primary_signal
        self.supporting_signals: List[DetectionSignal] = []

        self.entities: Set[str] = set(primary_signal.entity_refs)
        self.events: Set[str] = set(primary_signal.event_refs)
        self.evidence: Set[str] = set(primary_signal.evidence_refs)
        self.domains: Set[str] = {primary_signal.domain}
        self.detectors: Set[str] = {primary_signal.detector_id}
        self.locations: List[Dict[str, Any]] = list(primary_signal.location_refs)

        self.time_start = primary_signal.timestamp_start
        self.time_end = primary_signal.timestamp_end
        self.correlation_reasons: List[str] = [f"Anchor signal established by {primary_signal.detector_id}"]

    def add_signal(self, signal: DetectionSignal, reason: str):
        self.supporting_signals.append(signal)
        self.entities.update(signal.entity_refs)
        self.events.update(signal.event_refs)
        self.evidence.update(signal.evidence_refs)
        self.domains.add(signal.domain)
        self.detectors.add(signal.detector_id)
        if signal.location_refs:
            self.locations.extend(signal.location_refs)
        self.correlation_reasons.append(reason)

        # Update time window
        if signal.timestamp_start:
            if not self.time_start or signal.timestamp_start < self.time_start:
                self.time_start = signal.timestamp_start
        if signal.timestamp_end:
            if not self.time_end or signal.timestamp_end > self.time_end:
                self.time_end = signal.timestamp_end

        # Upgrade primary signal if the new signal is more specialized
        if self._is_more_specific(signal, self.primary_signal):
            prev_primary = self.primary_signal
            self.primary_signal = signal
            self.supporting_signals.remove(signal)
            self.supporting_signals.append(prev_primary)

    @staticmethod
    def _is_more_specific(new_sig: DetectionSignal, current_primary: DetectionSignal) -> bool:
        # Specialized deterministic and domain-specific detectors outrank generic statistical/behavioral ones
        detector_priority = {
            "DET-FIN-COORDINATED-FLOW": 100,
            "DET-SPATIAL-CONVERGENCE": 95,
            "DET-COMM-SYNC-EPISODE": 90,
            "DET-SOC-INFRA": 85,
            "DET-ID-DISCREPANCY": 80,
            "DET-CROSS-COLLISION": 75,
            "DET-FIN-ATM-CASHOUT": 70,
            "DET-FIN-FANOUT": 65,
            "DET-FIN-STRUCTURING": 60,
            "DET-SPATIAL-TRAVEL": 55,
            "DET-NET-VPN-TOR": 50,
            "DET-FIN-DORMANT": 45,
            "DET-RULE-ENGINE": 35,
            "DET-GRAPH-NETWORK": 30,
            "DET-GDS-CENTRALITY": 25,
            "DET-STATISTICAL": 20,
            "DET-BEHAVIORAL-IF": 15,
            "DET-ADV-AUTOENCODER": 10,
            "DET-ADV-NODE2VEC": 10
        }
        return detector_priority.get(new_sig.detector_id, 1) > detector_priority.get(current_primary.detector_id, 1)


class SignalCorrelationEngine:
    """
    Correlates and deduplicates normalized DetectionSignals.
    Prevents multiple detector outputs from creating separate findings when they describe
    the same underlying physical or financial event sequence.
    """

    CORE_DETECTORS = {
        "DET-FIN-COORDINATED-FLOW",
        "DET-FIN-HIGH-VALUE-BURST",
        "DET-SPATIAL-CONVERGENCE",
        "DET-COMM-SYNC-EPISODE",
        "DET-SOC-INFRA",
        "DET-ID-DISCREPANCY",
        "DET-CROSS-COLLISION",
        "DET-GEO-TRAJECTORY"
    }

    def correlate(
        self,
        case_id: str,
        signals: List[DetectionSignal]
    ) -> List[CorrelatedSignalGroup]:
        """
        Groups DetectionSignals into non-overlapping, coherent CorrelatedSignalGroups.
        """
        # Filter only flagged/detected signals
        active_signals = [s for s in signals if s.status == SignalStatus.DETECTED]
        if not active_signals:
            return []

        # Sort signals so core anchor patterns are considered as anchors first
        priority_map = {
            "DET-FIN-COORDINATED-FLOW": 100,
            "DET-FIN-HIGH-VALUE-BURST": 98,
            "DET-SPATIAL-CONVERGENCE": 95,
            "DET-GEO-TRAJECTORY": 92,
            "DET-COMM-SYNC-EPISODE": 90,
            "DET-SOC-INFRA": 85,
            "DET-ID-DISCREPANCY": 80,
            "DET-CROSS-COLLISION": 75,
            "DET-FIN-ATM-CASHOUT": 70,
            "DET-FIN-FANOUT": 65,
            "DET-FIN-STRUCTURING": 60,
            "DET-SPATIAL-TRAVEL": 55,
            "DET-NET-VPN-TOR": 50,
            "DET-FIN-DORMANT": 45,
            "DET-RULE-ENGINE": 35,
            "DET-GRAPH-NETWORK": 30,
            "DET-GDS-CENTRALITY": 25,
            "DET-STATISTICAL": 20,
            "DET-BEHAVIORAL-IF": 15,
            "DET-ADV-AUTOENCODER": 10,
            "DET-ADV-NODE2VEC": 10
        }
        sorted_signals = sorted(
            active_signals,
            key=lambda s: (priority_map.get(s.detector_id, 1), len(s.event_refs), s.normalized_score),
            reverse=True
        )

        groups: List[CorrelatedSignalGroup] = []

        for signal in sorted_signals:
            assigned = False

            for group in groups:
                should_correlate, reason = self._should_correlate(signal, group)
                if should_correlate:
                    group.add_signal(signal, reason)
                    signal.status = SignalStatus.CORRELATED
                    assigned = True
                    break

            if not assigned:
                group_id = f"GRP-{uuid.uuid4().hex[:8].upper()}"
                new_group = CorrelatedSignalGroup(
                    group_id=group_id,
                    case_id=case_id,
                    primary_signal=signal
                )
                signal.status = SignalStatus.CORRELATED
                groups.append(new_group)

        logger.info(
            f"[Correlation] Consolidated {len(active_signals)} detection signals into {len(groups)} correlated groups for case {case_id}."
        )
        return groups

    def _should_correlate(
        self,
        signal: DetectionSignal,
        group: CorrelatedSignalGroup
    ) -> tuple[bool, str]:
        """
        Evaluates whether a signal belongs to an existing CorrelatedSignalGroup:
        - Core vs Core: Identical core patterns consolidate into multi-entity episodes.
          Different core patterns NEVER merge.
        - Core vs Generic: Generic signal can support a core group if entity/time aligned.
        - Generic vs Generic: Consolidate supporting analytical duplicate signals on same entity.
        """
        sig_is_core = signal.detector_id in self.CORE_DETECTORS
        grp_is_core = group.primary_signal.detector_id in self.CORE_DETECTORS

        # 1. Core vs Core Rule:
        if sig_is_core and grp_is_core:
            if signal.detector_id != group.primary_signal.detector_id:
                # NEVER merge different core patterns (e.g. Financial Flow vs Synchronized Comm vs Collision)
                return (False, "")

            # SAME core pattern across different entities -> Consolidate into multi-entity episode!
            if signal.detector_id == "DET-SPATIAL-CONVERGENCE":
                return (True, "Consolidated multi-entity spatial convergence episode.")
            elif signal.detector_id == "DET-SOC-INFRA":
                return (True, "Consolidated shared digital infrastructure co-occurrence across entities.")
            elif signal.detector_id == "DET-FIN-COORDINATED-FLOW":
                return (True, "Consolidated coordinated circular financial flow across network accounts.")
            elif signal.detector_id == "DET-FIN-HIGH-VALUE-BURST":
                return (True, "Consolidated high-value transaction burst across entities.")
            elif signal.detector_id == "DET-COMM-SYNC-EPISODE":
                return (True, "Consolidated synchronized multi-party communication episode.")
            elif signal.detector_id == "DET-CROSS-COLLISION":
                return (True, "Consolidated cross-domain activity burst across entities.")
            elif signal.detector_id == "DET-ID-DISCREPANCY":
                common_ents = set(signal.entity_refs).intersection(group.entities)
                if common_ents:
                    return (True, "Consolidated device/identity discrepancy on entity.")
                return (False, "")
            elif signal.detector_id == "DET-GEO-TRAJECTORY":
                common_ents = set(signal.entity_refs).intersection(group.entities)
                if common_ents:
                    return (True, "Consolidated progressive multi-location trajectory route on entity.")
                return (False, "")

        # 2. Core Signal arriving at Generic Group:
        if sig_is_core and not grp_is_core:
            # Core detector must never be absorbed into a generic group
            return (False, "")

        # 3. Generic Signal arriving at Core Group:
        if grp_is_core and not sig_is_core:
            common_events = set(signal.event_refs).intersection(group.events)
            if common_events:
                return (True, f"Corroborating signal {signal.detector_id} shares canonical event(s) with primary pattern.")
            return (False, "")

        # 4. Both are Generic / Supporting:
        common_events = set(signal.event_refs).intersection(group.events)
        if common_events:
            return (True, f"Shared canonical event(s) across generic detectors.")

        common_entities = set(signal.entity_refs).intersection(group.entities)
        if common_entities and self._check_time_proximity(signal, group, max_delta_minutes=60.0):
            return (True, f"Consolidated supporting analytical signals on entity {list(common_entities)[0]}.")

        return (False, "")

    @staticmethod
    def _check_time_proximity(
        sig: DetectionSignal,
        grp: CorrelatedSignalGroup,
        max_delta_minutes: float = 60.0
    ) -> bool:
        """Verifies if two signal windows occur within max_delta_minutes of each other."""
        t1_str = sig.timestamp_start or sig.timestamp_end
        t2_str = grp.time_start or grp.time_end

        if not t1_str or not t2_str:
            return False

        try:
            dt1 = datetime.fromisoformat(t1_str.replace("Z", "+00:00"))
            dt2 = datetime.fromisoformat(t2_str.replace("Z", "+00:00"))
            delta_min = abs((dt1 - dt2).total_seconds()) / 60.0
            return delta_min <= max_delta_minutes
        except Exception:
            return False

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        import math
        r = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r * c


signal_correlation_engine = SignalCorrelationEngine()
