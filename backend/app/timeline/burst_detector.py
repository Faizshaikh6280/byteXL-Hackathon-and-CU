import uuid
import logging
from typing import List, Dict, Any
from app.timeline.schemas import TimelineCanonicalEvent, ActivityBurst, RiskLevel

logger = logging.getLogger("investigation.timeline.burst")

class ActivityBurstDetector:
    """
    Identifies statistically concentrated activity periods (bursts) across multi-domain streams.
    """

    def __init__(self, window_seconds: int = 1500, min_burst_events: int = 4):
        self.window_seconds = window_seconds
        self.min_burst_events = min_burst_events

    def detect_bursts(
        self,
        events: List[TimelineCanonicalEvent],
        case_id: str
    ) -> List[ActivityBurst]:
        """
        Uses an adaptive sliding-window algorithm to discover temporal density bursts.
        """
        if not events or len(events) < self.min_burst_events:
            return []

        bursts: List[ActivityBurst] = []
        n = len(events)

        # Adaptive threshold: if dataset is dense and spans multiple windows, require higher event concentration
        total_time_sec = max(1.0, (events[-1].timestamp_ms - events[0].timestamp_ms) / 1000.0)
        if total_time_sec > self.window_seconds * 2:
            expected_per_window = n / (total_time_sec / self.window_seconds)
            effective_min_events = max(self.min_burst_events, int(expected_per_window * 2.2))
        else:
            effective_min_events = self.min_burst_events

        i = 0
        while i < n:
            window_start_ev = events[i]
            window_start_sec = window_start_ev.timestamp_ms / 1000.0
            window_events = [window_start_ev]

            j = i + 1
            while j < n:
                curr_ev = events[j]
                curr_sec = curr_ev.timestamp_ms / 1000.0
                if curr_sec - window_start_sec <= self.window_seconds:
                    window_events.append(curr_ev)
                    j += 1
                else:
                    break

            if len(window_events) >= effective_min_events:
                # Count domains and entities
                domain_counts: Dict[str, int] = {}
                entities_set = set()
                event_ids = []

                for ev in window_events:
                    domain_counts[ev.domain] = domain_counts.get(ev.domain, 0) + 1
                    if ev.entity_name:
                        entities_set.add(ev.entity_name)
                    for actor in ev.actor_entities:
                        entities_set.add(actor)
                    event_ids.append(ev.event_id)

                duration_sec = (window_events[-1].timestamp_ms - window_events[0].timestamp_ms) / 1000.0
                duration_sec = max(1.0, duration_sec)

                # Assign severity based on density and domain dispersion
                domain_span = len(domain_counts)
                count = len(window_events)
                if count >= 12 and domain_span >= 3:
                    severity = RiskLevel.CRITICAL.value
                elif count >= 8 or domain_span >= 3:
                    severity = RiskLevel.HIGH.value
                elif count >= 5 or domain_span >= 2:
                    severity = RiskLevel.MEDIUM.value
                else:
                    severity = RiskLevel.LOW.value

                domain_str = ", ".join([f"{d}: {c}" for d, c in sorted(domain_counts.items())])
                desc = (
                    f"Activity burst detected: {count} events across {domain_span} domains "
                    f"({domain_str}) within {int(duration_sec // 60)}m {int(duration_sec % 60)}s."
                )

                burst = ActivityBurst(
                    burst_id=f"BURST-{uuid.uuid4().hex[:8].upper()}",
                    case_id=case_id,
                    start_time=window_events[0].normalized_timestamp,
                    end_time=window_events[-1].normalized_timestamp,
                    duration_seconds=duration_sec,
                    event_count=count,
                    entity_count=len(entities_set),
                    domain_counts=domain_counts,
                    entities=list(entities_set)[:10],
                    event_ids=event_ids,
                    severity=severity,
                    description=desc
                )
                bursts.append(burst)

                # Skip ahead past this clustered window to avoid duplicate reporting
                i = j
            else:
                i += 1

        # Sort bursts by event_count descending and cap at top 100 most significant bursts
        bursts.sort(key=lambda b: b.event_count, reverse=True)
        return bursts[:100]

activity_burst_detector = ActivityBurstDetector()
