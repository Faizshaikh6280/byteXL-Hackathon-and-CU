import uuid
import logging
from typing import List, Dict, Any, Set, Tuple
from app.timeline.schemas import (
    TimelineCanonicalEvent, TemporalCorrelation, StorylineSequence, StorylineStep
)
from app.timeline.correlation_engine import format_time_delta

logger = logging.getLogger("investigation.timeline.storyline")

class StorylineBuilder:
    """
    Synthesizes correlated multi-domain events into forensic storyline sequences.
    Strictly grounds every narrative transition on concrete underlying evidence events.
    """

    def build_storylines(
        self,
        events: List[TimelineCanonicalEvent],
        correlations: List[TemporalCorrelation],
        case_id: str
    ) -> List[StorylineSequence]:
        """
        Builds connected component chains from correlated event pairs.
        """
        if not events or not correlations:
            return []

        event_map = {e.event_id: e for e in events}

        # Build adjacency graph of correlated events
        adj: Dict[str, Set[str]] = {}
        corr_lookup: Dict[Tuple[str, str], TemporalCorrelation] = {}

        for c in correlations:
            u, v = c.event_a_id, c.event_b_id
            if u not in adj: adj[u] = set()
            if v not in adj: adj[v] = set()
            adj[u].add(v)
            adj[v].add(u)
            corr_lookup[(u, v)] = c
            corr_lookup[(v, u)] = c

        # Find connected components with >= 2 events
        visited: Set[str] = set()
        components: List[List[str]] = []

        for node in adj:
            if node not in visited:
                comp = []
                queue = [node]
                visited.add(node)
                while queue:
                    curr = queue.pop(0)
                    comp.append(curr)
                    for nxt in adj.get(curr, []):
                        if nxt not in visited:
                            visited.add(nxt)
                            queue.append(nxt)
                if len(comp) >= 2:
                    components.append(comp)

        storylines: List[StorylineSequence] = []

        for comp in components:
            # Filter and sort component events chronologically
            comp_events = [event_map[eid] for eid in comp if eid in event_map]
            comp_events.sort(key=lambda x: x.timestamp_ms)

            if len(comp_events) < 2:
                continue

            first_ev = comp_events[0]
            last_ev = comp_events[-1]
            start_ms = first_ev.timestamp_ms
            total_duration_sec = (last_ev.timestamp_ms - start_ms) / 1000.0

            # Gather involved domains and entities
            domains_set = set()
            actors_set = set()
            event_ids = []
            steps: List[StorylineStep] = []
            prev_ms = start_ms

            display_events = comp_events[:40] if len(comp_events) > 40 else comp_events
            for idx, ev in enumerate(display_events):
                domains_set.add(ev.domain)
                if ev.entity_name:
                    actors_set.add(ev.entity_name)
                for a in ev.actor_entities:
                    actors_set.add(a)
                event_ids.append(ev.event_id)

                delta_from_start = (ev.timestamp_ms - start_ms) / 1000.0
                delta_from_prev = (ev.timestamp_ms - prev_ms) / 1000.0
                prev_ms = ev.timestamp_ms

                # Formulate concise, grounded summary
                summary = ""
                actor_desc = ev.entity_name or (ev.actor_entities[0] if ev.actor_entities else "Entity")
                if ev.domain == "TELECOM":
                    target_desc = ev.counterparty or (ev.target_entities[0] if ev.target_entities else "contact")
                    dur_desc = f" ({ev.duration_seconds}s)" if ev.duration_seconds else ""
                    summary = f"{ev.event_type} between {actor_desc} and {target_desc}{dur_desc}"
                elif ev.domain == "FINANCIAL":
                    amt = f"₹{ev.amount_inr:,.2f}" if ev.amount_inr else "funds"
                    chn = f" via {ev.channel}" if ev.channel else ""
                    cp = f" to {ev.counterparty}" if ev.counterparty else ""
                    summary = f"{ev.event_type} of {amt}{chn}{cp}"
                elif ev.domain == "SOCIAL":
                    act = ev.attributes.get("action") or ev.attributes.get("activity") or "activity"
                    summary = f"{ev.event_type} ({act}) by {actor_desc}"
                elif ev.domain == "LOCATION":
                    loc = ev.location_name or "coordinates"
                    summary = f"Geographic observation at {loc}"
                else:
                    summary = f"{ev.event_type} observed for {actor_desc}"

                step = StorylineStep(
                    step_index=idx + 1,
                    event_id=ev.event_id,
                    timestamp=ev.normalized_timestamp,
                    time_offset_from_start=f"+{format_time_delta(delta_from_start)}" if idx > 0 else "0s",
                    time_offset_from_prev=f"+{format_time_delta(delta_from_prev)}" if idx > 0 else "0s",
                    domain=ev.domain,
                    event_type=ev.event_type,
                    summary=summary,
                    actors=ev.actor_entities[:4],
                    amount_inr=ev.amount_inr,
                    location=ev.location_name,
                    evidence_id=ev.evidence_id,
                    is_anomaly=ev.anomaly_score > 0,
                    anomaly_title=ev.anomaly_reasons[0] if ev.anomaly_reasons else None
                )
                steps.append(step)

            # Extract associated correlation IDs for this component in O(C)
            comp_set = set(comp)
            comp_corr_ids = [
                c.correlation_id for c in correlations
                if c.event_a_id in comp_set or c.event_b_id in comp_set
            ]

            domain_list = sorted(list(domains_set))
            domain_str = " -> ".join(domain_list)
            title = f"Sequential Incident ({domain_str})"
            category = "CROSS_DOMAIN_COORDINATION" if len(domain_list) >= 2 else f"{domain_list[0]}_SEQUENCE"

            # Strictly evidence-bound assessment
            actors_summary = ", ".join(list(actors_set)[:4]) if actors_set else "Monitored Entities"
            intel_assessment = (
                f"Evidence-grounded reconstruction: {len(comp_events)} linked observations spanning "
                f"{len(domain_list)} domains ({', '.join(domain_list)}) occurred over a window of "
                f"{format_time_delta(total_duration_sec)} involving {actors_summary}. "
                f"Supported by {len(comp_corr_ids)} multi-domain temporal correlation rules."
            )

            storyline = StorylineSequence(
                sequence_id=f"STORY-{uuid.uuid4().hex[:8].upper()}",
                case_id=case_id,
                title=title,
                summary=f"{len(comp_events)} events across {', '.join(domain_list)} spanning {format_time_delta(total_duration_sec)}.",
                category=category,
                domain_span=domain_list,
                start_time=first_ev.normalized_timestamp,
                end_time=last_ev.normalized_timestamp,
                total_duration_formatted=format_time_delta(total_duration_sec),
                steps=steps,
                event_ids=event_ids,
                correlation_ids=list(comp_corr_ids),
                intelligence_assessment=intel_assessment,
                confidence_score=0.92
            )
            storylines.append(storyline)

        # Sort storylines by number of events descending
        storylines.sort(key=lambda s: len(s.steps), reverse=True)
        return storylines

storyline_builder = StorylineBuilder()
