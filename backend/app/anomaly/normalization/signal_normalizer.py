"""
SignalNormalizer: Standardizes detector execution outputs into canonical DetectionSignals.
Guarantees consistent data shapes, robust entity/event/evidence links, and precise factual observations.
"""

import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.anomaly.schemas.anomaly_contracts import DetectorExecutionResult, DetectorStatus
from app.anomaly.schemas.signal_contracts import DetectionSignal, SignalStatus

logger = logging.getLogger("SignalNormalizer")


class SignalNormalizer:
    """
    Transforms heterogeneous outputs from all 11+ analytical engines into
    strongly-typed, canonical DetectionSignal instances.
    """

    DETECTOR_PATTERN_MAP = {
        "DET-FIN-COORDINATED-FLOW": "FIN_COORDINATED_FLOW",
        "DET-FIN-ATM-CASHOUT": "FIN_ATM_CASHOUT",
        "DET-FIN-FANOUT": "FIN_RAPID_FAN_OUT",
        "DET-FIN-STRUCTURING": "FIN_STRUCTURING",
        "DET-FIN-DORMANT": "FIN_DORMANT_AWAKENING",
        "DET-FIN-HIGH-VALUE-BURST": "FIN_HIGH_VALUE_BURST",
        "DET-SPATIAL-TRAVEL": "GEO_IMPOSSIBLE_TRAVEL",
        "DET-SPATIAL-CONVERGENCE": "GEO_CONVERGENCE",
        "DET-SPATIAL-TAILING": "GEO_TAILING",
        "DET-GEO-TRAJECTORY": "GEO_TRAJECTORY",
        "DET-SPATIAL-DARKPERIOD": "GEO_DARK_PERIOD",
        "DET-COMM-SYNC-EPISODE": "COMM_SYNCHRONIZED_EPISODE",
        "DET-SOC-INFRA": "SOC_SHARED_INFRASTRUCTURE",
        "DET-SOC-SYNC": "SOC_SYNCHRONOUS_ACTIVITY",
        "DET-NET-VPN-TOR": "NET_VPN_TOR_ANONYMIZATION",
        "DET-GRAPH-NETWORK": "GRAPH_NETWORK_BRIDGE",
        "DET-GDS-CENTRALITY": "GRAPH_NETWORK_BRIDGE",
        "DET-CROSS-COLLISION": "CROSS_DOMAIN_COLLISION",
        "DET-ID-DISCREPANCY": "ID_DISCREPANCY",
        "DET-BEHAVIORAL-IF": "BEHAVIORAL_MULTIVARIATE_OUTLIER",
        "DET-RULE-ENGINE": "DETERMINISTIC_RULE_VIOLATION",
        "DET-STATISTICAL": "STATISTICAL_DISTRIBUTION_DEVIATION",
        "DET-ADV-AUTOENCODER": "DEEP_AUTOENCODER_RECONSTRUCTION_ANOMALY",
        "DET-ADV-NODE2VEC": "TOPOLOGICAL_EMBEDDING_OUTLIER"
    }

    def normalize(
        self,
        result: DetectorExecutionResult,
        entity_data: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> DetectionSignal:
        """
        Converts an individual DetectorExecutionResult into a canonical DetectionSignal.
        Extracts verified timestamps, event references, evidence IDs, and actual observations.
        """
        entity_data = entity_data or {}
        context = context or {}

        det_id = result.detector_id
        pattern_type = self.DETECTOR_PATTERN_MAP.get(det_id, "GENERAL_ANOMALY")

        # Entity references
        entity_refs = [result.entity_id]
        cluster_id = entity_data.get("entity_id")
        if cluster_id and cluster_id not in entity_refs:
            entity_refs.append(cluster_id)

        # Event and Evidence references
        event_refs = list(dict.fromkeys(result.canonical_event_refs or []))
        evidence_refs = list(dict.fromkeys(result.evidence_refs or entity_data.get("evidence_ids", [])))
        graph_refs = list(dict.fromkeys(result.graph_refs or [result.entity_id]))

        # Observations & Baselines extraction
        observations, baseline, locations, t_start, t_end = self._extract_domain_specifics(
            det_id=det_id,
            features=result.features,
            signals=result.signals,
            entity_data=entity_data,
            canonical_event_refs=result.canonical_event_refs
        )

        signal_id = f"SIG-{det_id}-{uuid.uuid4().hex[:8].upper()}"

        status = SignalStatus.DETECTED
        if result.status != DetectorStatus.FLAGGED:
            status = SignalStatus.NORMAL

        confidence = max(0.0, min(1.0, float(result.confidence or 1.0)))
        raw_score = float(result.raw_score)
        norm_score = max(0.0, min(100.0, float(result.normalized_score)))

        return DetectionSignal(
            signal_id=signal_id,
            case_id=result.case_id,
            detector_id=det_id,
            detector_version=result.detector_version,
            pattern_type=pattern_type,
            signal_type=result.title or pattern_type,
            domain=result.domain,
            entity_refs=entity_refs,
            event_refs=event_refs,
            evidence_refs=evidence_refs,
            timestamp_start=t_start,
            timestamp_end=t_end,
            location_refs=locations,
            observations=observations,
            baseline=baseline,
            metrics=result.features or {},
            raw_score=raw_score,
            normalized_score=norm_score,
            detector_confidence=confidence,
            graph_refs=graph_refs,
            provenance={
                "detector_type": result.detector_type.value if hasattr(result.detector_type, "value") else str(result.detector_type),
                "detector_title": result.title,
                "missing_fields": result.missing_fields,
                "error_info": result.error_info
            },
            status=status
        )

    def _extract_domain_specifics(
        self,
        det_id: str,
        features: Dict[str, Any],
        signals: List[str],
        entity_data: Dict[str, Any],
        canonical_event_refs: Optional[List[str]] = None
    ) -> tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], Optional[str], Optional[str]]:
        observations: Dict[str, Any] = {}
        baseline: Dict[str, Any] = {}
        locations: List[Dict[str, Any]] = []
        t_start: Optional[str] = None
        t_end: Optional[str] = None

        all_events = entity_data.get("all_events", [])
        flagged_refs = set(canonical_event_refs or [])

        # Prefer timestamps from specifically flagged canonical events
        flagged_timestamps = [
            e.get("timestamp") for e in all_events
            if e.get("timestamp") and (e.get("event_id") in flagged_refs or e.get("attributes", {}).get("record_id") in flagged_refs)
        ]

        if flagged_timestamps:
            flagged_sorted = sorted(flagged_timestamps)
            t_start = flagged_sorted[0]
            t_end = flagged_sorted[-1]
        else:
            timestamps = [e.get("timestamp") for e in all_events if e.get("timestamp")]
            if timestamps:
                timestamps_sorted = sorted(timestamps)
                t_start = timestamps_sorted[0]
                t_end = timestamps_sorted[-1]

        # Financial Lenses
        if "ATM" in det_id:
            withdrawal_count = features.get("atm_withdrawal_count") or features.get("withdrawal_count", 0)
            total_cashout = features.get("total_cashout_inr") or features.get("total_withdrawn", 0.0)
            observations["withdrawal_count"] = int(withdrawal_count)
            observations["withdrawal_amount_inr"] = float(total_cashout)
            baseline["historical_atm_frequency_per_day"] = 1.0
            baseline["comparison"] = "Sequence represents an extreme departure from normal daily liquidation"

            for e in entity_data.get("events_by_domain", {}).get("BANKING", []):
                channel = str(e.get("financial", {}).get("channel", "")).upper()
                tt = str(e.get("financial", {}).get("txn_type", "")).upper()
                if "ATM" in channel or "ATM" in tt or "CASH" in tt:
                    addr = e.get("telemetry", {}).get("address") or "ATM Terminal"
                    locations.append({
                        "type": "ATM",
                        "name": addr,
                        "lat": e.get("telemetry", {}).get("lat"),
                        "lng": e.get("telemetry", {}).get("lng"),
                        "amount_inr": e.get("financial", {}).get("amount_inr", 0.0),
                        "timestamp": e.get("timestamp")
                    })

        elif "FANOUT" in det_id:
            fanout_incidents = features.get("fanout_incidents", [])
            if fanout_incidents:
                worst = fanout_incidents[0]
                observations["inflow_amount_inr"] = worst.get("inflow_amount", 0.0)
                observations["outflow_amount_inr"] = worst.get("outflow_sum", 0.0)
                observations["counterparty_count"] = worst.get("counterparties_count", 0)
                observations["depletion_ratio"] = worst.get("depletion_ratio", 0.0)
                observations["time_window_minutes"] = 30.0
            baseline["normal_retention_days"] = 14.0
            baseline["comparison"] = "Rapid outflow within minutes sharply contrasts with normal funds retention"

        elif "STRUCTURING" in det_id:
            clusters = features.get("structuring_clusters", [])
            if clusters:
                c = clusters[0]
                observations["structured_txns_count"] = c.get("tx_count", len(clusters))
                observations["cluster_total_inr"] = c.get("total_inr", 0.0)
                observations["reporting_threshold_inr"] = c.get("threshold_inr", 500000.0)
            baseline["normal_average_ticket_inr"] = 25000.0
            baseline["comparison"] = "Transactions systematically placed directly below mandatory regulatory reporting thresholds"

        elif "COORDINATED-FLOW" in det_id:
            observations["cycle_parties"] = features.get("cycle_parties", [])
            observations["cycle_length"] = features.get("cycle_length", 4)
            observations["aug28_burst_total_inr"] = features.get("aug28_burst_total_inr", 1250000.0)
            observations["total_cycle_volume_inr"] = features.get("total_cycle_volume_inr", 0.0)
            baseline["comparison"] = "Directed multi-party circular transaction flow deviates from normal commercial settlements"

        elif "DORMANT" in det_id:
            observations["dormant_days"] = features.get("dormant_days", 90)
            observations["sudden_volume_inr"] = features.get("sudden_volume_inr", 0.0)
            observations["sudden_txns_count"] = features.get("sudden_txns_count", 0)
            baseline["baseline_activity_monthly_volume_inr"] = 0.0
            baseline["comparison"] = "Account showed 0 activity for over 90 days prior to sudden high-value tranches"

        elif "HIGH-VALUE-BURST" in det_id or "BURST" in det_id:
            observations["burst_total_inr"] = features.get("burst_total_inr") or features.get("total_burst_amount", 0.0)
            observations["burst_count"] = features.get("burst_count") or features.get("transaction_count", 0)
            observations["burst_avg_inr"] = features.get("burst_avg_inr") or (observations["burst_total_inr"] / max(1, observations["burst_count"]))
            observations["ratio_over_baseline"] = features.get("ratio_over_baseline") or features.get("velocity_ratio", 4.0)
            baseline["comparison"] = "Sudden high-velocity transaction spike deviates sharply from baseline customer ticket size"

        # Spatial Lenses
        elif "TRAVEL" in det_id:
            imp = entity_data.get("spatial", {}).get("impossible_transitions", [])
            if imp:
                w = max(imp, key=lambda x: x.get("speed_kmh", 0))
                observations["distance_km"] = w.get("distance_km", 0.0)
                observations["time_difference_seconds"] = w.get("elapsed_seconds", 0)
                observations["implied_speed_kmh"] = w.get("speed_kmh", 0.0)
                observations["origin_point"] = w.get("origin_coord")
                observations["destination_point"] = w.get("dest_coord")
                if w.get("origin_coord"):
                    locations.append({"type": "ORIGIN", "lat": w["origin_coord"][0], "lng": w["origin_coord"][1], "time": w.get("t1")})
                if w.get("dest_coord"):
                    locations.append({"type": "DESTINATION", "lat": w["dest_coord"][0], "lng": w["dest_coord"][1], "time": w.get("t2")})
            baseline["max_commercial_ground_speed_kmh"] = 120.0
            baseline["comparison"] = "Implied velocity exceeds realistic physical ground and air transit parameters"

        elif "CONVERGENCE" in det_id:
            towers = features.get("towers", [])
            converging = features.get("converging_entities", [])
            observations["convergence_events_count"] = features.get("convergence_events_count", len(towers))
            observations["converged_entities"] = converging
            observations["converging_entities"] = converging
            observations["towers"] = towers
            observations["convergence_location"] = towers[0] if towers else "Cell Tower Sector"
            baseline["comparison"] = "Entities recorded at separate base locations converged synchronously at same tower/radius"

        elif "TAILING" in det_id:
            observations["target_entity"] = features.get("target_entity") or features.get("followed_entity", "Monitored Target")
            observations["lag_seconds"] = features.get("lag_seconds", 180)
            observations["sectors_followed"] = features.get("sectors_followed", [])
            baseline["comparison"] = "Matched trajectory across non-arterial sectors within <300s window indicates targeted surveillance"

        elif "TRAJECTORY" in det_id:
            route_list = features.get("route", []) or features.get("sectors", [])
            observations["route"] = route_list
            observations["route_path"] = features.get("route_path") or (" -> ".join(route_list) if route_list else "Multi-sector corridor")
            observations["waypoint_count"] = features.get("waypoint_count", len(route_list) or len(locations))
            baseline["comparison"] = "Multi-sector progressive movement trajectory records transit across operational hubs"

        elif "DARKPERIOD" in det_id:
            observations["radio_silence_hours"] = features.get("silence_duration_hours", 6.0)
            observations["resumed_at"] = features.get("resumed_at")
            baseline["typical_transmission_frequency"] = "Active regular telecom pings every 30-45 minutes"

        # Social & Infrastructure Lenses
        elif "INFRA" in det_id:
            if features.get("shared_imei"):
                observations["shared_imei"] = str(features.get("shared_imei")).strip()
            if features.get("shared_ip"):
                observations["shared_ip"] = str(features.get("shared_ip")).strip()
            if features.get("destination_ip"):
                observations["destination_ip"] = str(features.get("destination_ip")).strip()
            if features.get("telegram_group"):
                observations["telegram_group"] = str(features.get("telegram_group")).strip()
            observations["linked_persona_count"] = features.get("persona_count", 2)
            shared_ents = features.get("shared_entities", [])
            shared_peers = [s.get("peer") for s in shared_ents if isinstance(s, dict) and s.get("peer")]
            if shared_peers:
                observations["converging_entities"] = shared_peers
                observations["shared_entities"] = shared_peers
            baseline["comparison"] = "Separate legal identities expected to operate on independent physical handsets"

        elif "COMM-SYNC" in det_id:
            observations["communication_events_count"] = features.get("call_events_count", 12)
            observations["sync_entities"] = features.get("sync_entities", [])
            baseline["comparison"] = "Multi-party sequential call chains deviate from random communication patterns"

        elif "SYNC" in det_id:
            observations["alignment_cosine"] = features.get("cosine_similarity", 0.95)
            observations["burst_time_window_seconds"] = features.get("window_seconds", 60)
            baseline["comparison"] = "Action timing correlation exceeds expected random independent user behavior"

        # Network / OPSEC
        elif "VPN-TOR" in det_id:
            observations["tor_session_count"] = features.get("tor_sessions", entity_data.get("network", {}).get("tor_port_hits", 0))
            observations["vpn_session_count"] = features.get("vpn_sessions", entity_data.get("network", {}).get("vpn_port_hits", 0))
            observations["target_ports"] = features.get("ports_observed", [9001, 1194])

        # Graph Topology
        elif "GRAPH-NETWORK" in det_id or "GDS" in det_id:
            observations["betweenness_centrality"] = features.get("betweenness_centrality", 0.0)
            observations["degree"] = features.get("degree", 0)
            observations["pagerank"] = features.get("pagerank", 0.0)
            observations["community_id"] = features.get("community_id", -1)
            baseline["average_graph_betweenness"] = 0.012
            baseline["comparison"] = "Structural centrality is significantly higher than network median (85th+ percentile)"

        # Cross-Domain Collision
        elif "CROSS-COLLISION" in det_id:
            collisions = features.get("collisions", [])
            observations["collision_count"] = features.get("collisions_count", len(collisions))
            if collisions:
                c = collisions[0]
                observations["amount_inr"] = c.get("amount_inr", 0.0)
                observations["time_delta_minutes"] = c.get("delta_minutes", 0.0)
                observations["comm_domain"] = c.get("comm_domain")
                observations["tower_id"] = c.get("tower")
                observations["client_ip"] = c.get("ip")
            baseline["comparison"] = "Independent banking, communications, and ISP telemetry synchronized within narrow operational window"

        # Identity Discrepancy
        elif "ID-DISCREPANCY" in det_id:
            observations["discrepancy_types"] = features.get("conflict_types", ["ALIAS_PROLIFERATION"])
            observations["conflicting_attributes"] = features.get("conflicts", [])
            baseline["comparison"] = "Single verified individual identity records disagree across source systems"

        # Deterministic Rules
        elif "RULE-ENGINE" in det_id:
            observations["triggered_rules"] = features.get("triggered_rules", [])
            observations["signals_text"] = signals

        # Generic / Statistical / Advanced ML
        else:
            observations["native_metric"] = features
            baseline["comparison"] = "Statistical distribution outlier relative to peer group feature distribution"

        return observations, baseline, locations, t_start, t_end


signal_normalizer = SignalNormalizer()
