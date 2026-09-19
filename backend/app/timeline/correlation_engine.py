import uuid
import logging
from typing import List, Dict, Any, Optional, Tuple
from app.timeline.schemas import TimelineCanonicalEvent, TemporalCorrelation, EpistemicStatus

logger = logging.getLogger("investigation.timeline.correlation")

def format_time_delta(seconds: float) -> str:
    secs = int(abs(seconds))
    if secs < 60:
        return f"{secs}s"
    mins = secs // 60
    rem_secs = secs % 60
    if mins < 60:
        return f"{mins}m {rem_secs}s" if rem_secs > 0 else f"{mins}m"
    hours = mins // 60
    rem_mins = mins % 60
    return f"{hours}h {rem_mins}m" if rem_mins > 0 else f"{hours}h"

class TemporalCorrelationEngine:
    """
    Identifies evidence-backed proximity and sequence relationships across domains and entities.
    Supports configurable sliding windows and generates auditable correlation metadata.
    """

    def __init__(self):
        # Default rule thresholds in seconds
        self.window_call_to_transfer = 1800      # 30 minutes
        self.window_transfer_to_cashout = 3600   # 60 minutes
        self.window_call_to_location = 2700      # 45 minutes
        self.window_transfer_to_social = 1200    # 20 minutes
        self.window_rapid_fund_movement = 1800   # 30 minutes
        self.window_coordinated_activity = 600   # 10 minutes

    def correlate_events(
        self,
        events: List[TimelineCanonicalEvent],
        case_id: str,
        custom_windows: Optional[Dict[str, int]] = None
    ) -> List[TemporalCorrelation]:
        """
        Executes multi-domain correlation rules across chronologically sorted canonical events.
        """
        if not events or len(events) < 2:
            return []

        windows = {
            "call_transfer": self.window_call_to_transfer,
            "transfer_cashout": self.window_transfer_to_cashout,
            "call_location": self.window_call_to_location,
            "transfer_social": self.window_transfer_to_social,
            "rapid_funds": self.window_rapid_fund_movement,
            "coordinated": self.window_coordinated_activity
        }
        if custom_windows:
            windows.update(custom_windows)

        correlations: List[TemporalCorrelation] = []
        n = len(events)

        # Pre-extract lightweight primitive records for high-speed scanning
        class EvRecord:
            __slots__ = (
                'event', 'event_id', 'ts_sec', 'domain', 'event_type',
                'z_cluster_id', 'entity_name', 'actors', 'targets',
                'counterparty', 'location_name', 'amount_inr',
                'destination_ip', 'cell_tower_id', 'tokens', 'anomaly_score'
            )
            def __init__(self, ev: TimelineCanonicalEvent):
                self.event = ev
                self.event_id = ev.event_id
                self.ts_sec = ev.timestamp_ms / 1000.0
                self.domain = ev.domain
                self.event_type = ev.event_type
                self.z_cluster_id = ev.z_cluster_id
                self.entity_name = ev.entity_name
                self.actors = set(ev.actor_entities)
                self.targets = set(ev.target_entities)
                self.counterparty = ev.counterparty
                self.location_name = ev.location_name
                self.amount_inr = ev.amount_inr or 0.0
                self.destination_ip = ev.destination_ip
                self.cell_tower_id = ev.cell_tower_id
                self.anomaly_score = ev.anomaly_score

                toks = set()
                if ev.z_cluster_id: toks.add(ev.z_cluster_id.lower())
                if ev.entity_name: toks.add(ev.entity_name.lower())
                for a in ev.actor_entities: toks.add(a.lower())
                for t in ev.target_entities: toks.add(t.lower())
                if ev.counterparty: toks.add(ev.counterparty.lower())
                if ev.destination_ip: toks.add(ev.destination_ip)
                if ev.cell_tower_id: toks.add(ev.cell_tower_id.lower())
                if ev.location_name: toks.add(ev.location_name.lower())
                self.tokens = toks

        records = [EvRecord(e) for e in events]

        domain_max_window = {
            "FINANCIAL": windows["transfer_cashout"],
            "TELECOM": max(windows["call_transfer"], windows["call_location"]),
            "LOCATION": windows["coordinated"],
            "SOCIAL": windows["transfer_social"],
            "NETWORK": windows["coordinated"]
        }

        for i in range(n):
            rec_a = records[i]
            t_a = rec_a.ts_sec
            max_scan_window = domain_max_window.get(rec_a.domain, 1800)

            # Scan ahead within domain-specific active correlation rule window
            for j in range(i + 1, n):
                rec_b = records[j]
                delta_sec = rec_b.ts_sec - t_a

                if delta_sec < 0:
                    continue
                if delta_sec > max_scan_window:
                    break

                # Candidate pruning: must share entity/network tokens
                if not rec_a.tokens.intersection(rec_b.tokens):
                    continue

                ev_a = rec_a.event
                ev_b = rec_b.event
                matched_rule = None
                corr_score = 0.0
                description = ""
                rules_triggered = []

                # ── RULE 1: CALL -> BANK TRANSFER ──────────────────────
                if (rec_a.domain == "TELECOM" or rec_a.event_type == "CALL") and \
                   (rec_b.domain == "FINANCIAL" or "TRANSFER" in rec_b.event_type or "DEBIT" in rec_b.event_type) and \
                   delta_sec <= windows["call_transfer"]:

                    shared_actor = bool(
                        rec_a.actors.intersection(rec_b.actors) or
                        (rec_a.z_cluster_id and rec_a.z_cluster_id == rec_b.z_cluster_id) or
                        (rec_a.counterparty and rec_a.counterparty in rec_b.actors) or
                        (rec_b.counterparty and rec_b.counterparty in rec_a.actors)
                    )

                    if shared_actor:
                        matched_rule = "CALL_BEFORE_TRANSFER"
                        corr_score = min(1.0, max(0.65, 0.95 - (delta_sec / windows["call_transfer"]) * 0.3) + 0.1)
                        rules_triggered.append("RULE_CALL_BEFORE_TRANSFER")
                        actor_desc = rec_a.entity_name or (list(rec_a.actors)[0] if rec_a.actors else "Subject")
                        amount_desc = f"₹{rec_b.amount_inr:,.2f}" if rec_b.amount_inr else "funds"
                        description = f"Communication event ({rec_a.event_type}) occurred {format_time_delta(delta_sec)} prior to {rec_b.event_type} of {amount_desc} involving {actor_desc}."

                # ── RULE 2: TRANSFER -> CASH WITHDRAWAL ────────────────
                elif ("TRANSFER" in rec_a.event_type or "CREDIT" in rec_a.event_type or rec_a.event_type == "BANK_TRANSFER") and \
                     (rec_b.event_type in ("CASH_WITHDRAWAL", "ATM") or "WITHDRAWAL" in rec_b.event_type) and \
                     delta_sec <= windows["transfer_cashout"]:

                    shared_actor = bool(
                        rec_a.actors.intersection(rec_b.actors) or
                        (rec_a.z_cluster_id and rec_a.z_cluster_id == rec_b.z_cluster_id)
                    )

                    if shared_actor:
                        matched_rule = "TRANSFER_TO_CASHOUT"
                        corr_score = max(0.70, 0.96 - (delta_sec / windows["transfer_cashout"]) * 0.25)
                        rules_triggered.append("RULE_TRANSFER_TO_CASHOUT")
                        amt_a = f"₹{rec_a.amount_inr:,.2f}" if rec_a.amount_inr else "funds"
                        amt_b = f"₹{rec_b.amount_inr:,.2f}" if rec_b.amount_inr else "cash"
                        description = f"Inbound {rec_a.event_type} ({amt_a}) followed {format_time_delta(delta_sec)} later by cashout ({rec_b.event_type}: {amt_b})."

                # ── RULE 3: CALL -> LOCATION CHANGE ───────────────────
                elif (rec_a.domain == "TELECOM" or rec_a.event_type == "CALL") and \
                     (rec_b.location_name or rec_b.cell_tower_id) and \
                     (rec_a.location_name != rec_b.location_name) and \
                     delta_sec <= windows["call_location"]:

                    shared_actor = bool(
                        rec_a.actors.intersection(rec_b.actors) or
                        (rec_a.z_cluster_id and rec_a.z_cluster_id == rec_b.z_cluster_id)
                    )

                    if shared_actor:
                        matched_rule = "CALL_BEFORE_LOCATION_CHANGE"
                        corr_score = max(0.60, 0.88 - (delta_sec / windows["call_location"]) * 0.25)
                        rules_triggered.append("RULE_CALL_BEFORE_LOCATION_CHANGE")
                        description = f"Telecom communication followed {format_time_delta(delta_sec)} later by geographic relocation to {rec_b.location_name or 'new sector'}."

                # ── RULE 4: TRANSFER WITH SOCIAL ACTIVITY ─────────────
                elif ((rec_a.domain == "FINANCIAL" and rec_b.domain == "SOCIAL") or
                      (rec_a.domain == "SOCIAL" and rec_b.domain == "FINANCIAL")) and \
                     delta_sec <= windows["transfer_social"]:

                    shared_actor = bool(
                        rec_a.actors.intersection(rec_b.actors) or
                        (rec_a.z_cluster_id and rec_a.z_cluster_id == rec_b.z_cluster_id) or
                        (rec_a.counterparty and rec_a.counterparty in rec_b.actors)
                    )

                    if shared_actor:
                        matched_rule = "TRANSFER_WITH_SOCIAL_ACTIVITY"
                        corr_score = max(0.65, 0.85 - (delta_sec / windows["transfer_social"]) * 0.2)
                        rules_triggered.append("RULE_TRANSFER_WITH_SOCIAL_ACTIVITY")
                        description = f"Cross-domain correlation: Financial transaction coupled with social activity within {format_time_delta(delta_sec)}."

                # ── RULE 5: RAPID FUND MOVEMENT (CHURN) ───────────────
                elif rec_a.domain == "FINANCIAL" and rec_b.domain == "FINANCIAL" and \
                     rec_a.event_id != rec_b.event_id and \
                     delta_sec <= windows["rapid_funds"] and \
                     rec_a.amount_inr > 0 and rec_b.amount_inr > 0:

                    has_shared_party = bool(
                        (rec_a.z_cluster_id and rec_b.z_cluster_id and rec_a.z_cluster_id == rec_b.z_cluster_id) or
                        (rec_a.entity_name and rec_b.entity_name and rec_a.entity_name == rec_b.entity_name) or
                        (rec_a.counterparty and (rec_a.counterparty in rec_b.actors or (rec_b.counterparty and rec_a.counterparty == rec_b.counterparty))) or
                        bool(rec_a.actors.intersection(rec_b.actors))
                    )

                    if has_shared_party:
                        matched_rule = "RAPID_FUND_MOVEMENT"
                        corr_score = max(0.70, 0.92 - (delta_sec / windows["rapid_funds"]) * 0.2)
                        rules_triggered.append("RULE_RAPID_FUND_MOVEMENT")
                        description = f"Rapid sequential fund movement: ₹{rec_a.amount_inr:,.2f} -> ₹{rec_b.amount_inr:,.2f} in {format_time_delta(delta_sec)}."

                # ── RULE 6: COORDINATED CROSS-ENTITY ACTIVITY ─────────
                elif rec_a.z_cluster_id and rec_b.z_cluster_id and \
                     rec_a.z_cluster_id != rec_b.z_cluster_id and \
                     rec_a.domain != rec_b.domain and \
                     delta_sec <= windows["coordinated"]:

                    shared_ip = bool(rec_a.destination_ip and rec_b.destination_ip and rec_a.destination_ip == rec_b.destination_ip)
                    shared_loc = bool(
                        (rec_a.cell_tower_id and rec_b.cell_tower_id and rec_a.cell_tower_id == rec_b.cell_tower_id) or
                        (rec_a.location_name and rec_b.location_name and rec_a.location_name == rec_b.location_name)
                    )
                    is_counterparty = bool(
                        (rec_a.counterparty and rec_a.counterparty in rec_b.actors) or
                        (rec_b.counterparty and rec_b.counterparty in rec_a.actors)
                    )
                    if shared_ip or shared_loc or is_counterparty:
                        matched_rule = "COORDINATED_CROSS_ENTITY_ACTIVITY"
                        corr_score = max(0.65, 0.90 - (delta_sec / windows["coordinated"]) * 0.25)
                        if shared_ip or shared_loc:
                            corr_score = min(1.0, corr_score + 0.1)
                        rules_triggered.append("RULE_COORDINATED_CROSS_ENTITY_ACTIVITY")
                        name_a = rec_a.entity_name or "Entity A"
                        name_b = rec_b.entity_name or "Entity B"
                        anchor_desc = " on shared infrastructure" if shared_ip else (" at common location" if shared_loc else "")
                        description = f"Coordinated cross-entity action{anchor_desc}: {name_a} ({rec_a.domain}) and {name_b} ({rec_b.domain}) observed within {format_time_delta(delta_sec)}."

                if matched_rule:
                    corr_id = f"CORR-{uuid.uuid4().hex[:8].upper()}"
                    correlation = TemporalCorrelation(
                        correlation_id=corr_id,
                        case_id=case_id,
                        event_a_id=ev_a.event_id,
                        event_b_id=ev_b.event_id,
                        relationship_type=matched_rule,
                        time_delta_seconds=delta_sec,
                        time_delta_formatted=format_time_delta(delta_sec),
                        correlation_score=round(corr_score, 3),
                        rules_triggered=rules_triggered,
                        supporting_evidence=list(set([ev_a.evidence_id, ev_b.evidence_id])),
                        description=description,
                        epistemic_status=EpistemicStatus.CORRELATED.value,
                        actor_a=ev_a.entity_name or (list(rec_a.actors)[0] if rec_a.actors else None),
                        actor_b=ev_b.entity_name or (list(rec_b.actors)[0] if rec_b.actors else None),
                        domain_a=ev_a.domain,
                        domain_b=ev_b.domain,
                        timestamp_a=ev_a.normalized_timestamp,
                        timestamp_b=ev_b.normalized_timestamp
                    )
                    correlations.append(correlation)

                    # Backfill correlation_ids on events in place
                    if corr_id not in ev_a.correlation_ids:
                        ev_a.correlation_ids.append(corr_id)
                    if corr_id not in ev_b.correlation_ids:
                        ev_b.correlation_ids.append(corr_id)

        # Sort correlations by score descending and cap at 500 highest-confidence links
        correlations.sort(key=lambda x: x.correlation_score, reverse=True)
        return correlations[:500]

temporal_correlation_engine = TemporalCorrelationEngine()
