from typing import Dict, Any, List, Set
from datetime import datetime
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class SynchronizedCommunicationDetector(BaseDetector):
    """
    Engine #4A: Synchronized Communication Episode Detector.
    Identifies multi-party tightly sequenced call cascades and repeated communication episodes
    exchanged across a coordinated group of entities.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-COMM-SYNC-EPISODE",
            name="Synchronized Communication Episode Detector",
            version="v1.0.0",
            detector_type=DetectorType.COMMUNICATION,
            domain="TELECOM",
            applicable_domains=["TELECOM", "CROSS_DOMAIN"],
            required_fields=[],
            min_sample_size=3,
            description="Identifies repeated, tightly sequenced call cascades between connected entities."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        all_entities = context.get("all_entity_store", {})

        # Gather all telecom events across the case
        all_calls = []
        for eid, edata in all_entities.items():
            for ev in edata.get("all_events", []):
                domain = ev.get("domain") or ev.get("source_type")
                if domain == "TELECOM" or ev.get("event_type") == "CALL":
                    all_calls.append(ev)

        # Deduplicate calls by event_id or raw cdr_id
        seen_calls = set()
        deduped_calls = []
        for c in all_calls:
            cid = c.get("event_id") or c.get("attributes", {}).get("cdr_id")
            if cid and cid not in seen_calls:
                seen_calls.add(cid)
                deduped_calls.append(c)

        if len(deduped_calls) < 4:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Pre-parse timestamps once to avoid repeated datetime.fromisoformat calls
        for c in deduped_calls:
            ts = c.get("timestamp") or ""
            try:
                c["_ts_sec"] = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            except Exception:
                c["_ts_sec"] = 0.0

        deduped_calls.sort(key=lambda c: c["_ts_sec"])

        # Identify sequenced call chains where consecutive calls occur within 30 minutes
        episodes: List[List[Dict[str, Any]]] = []
        current_episode: List[Dict[str, Any]] = []

        for call in deduped_calls:
            c_sec = call["_ts_sec"]
            if not current_episode:
                current_episode.append(call)
            else:
                prev_sec = current_episode[-1]["_ts_sec"]
                delta_sec = c_sec - prev_sec
                if 0 < delta_sec <= 1800:  # <= 30 minutes
                    current_episode.append(call)
                else:
                    if len(current_episode) >= 3:
                        episodes.append(current_episode)
                    current_episode = [call]

        if len(current_episode) >= 3:
            episodes.append(current_episode)

        if not episodes:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Gather all calls in significant episodes
        all_episode_calls = []
        for ep in episodes:
            all_episode_calls.extend(ep)

        # Check if entity participated in these calls
        my_phones = set(entity_data.get("communication", {}).get("phones", []))
        for ev in entity_data.get("all_events", []):
            ph = ev.get("normalized_identity", {}).get("phone") or ev.get("attributes", {}).get("caller") or ev.get("attributes", {}).get("callee")
            if ph:
                my_phones.add(str(ph).strip())

        in_episode = False
        for c in all_episode_calls:
            caller = c.get("normalized_identity", {}).get("phone") or c.get("attributes", {}).get("caller")
            callee = c.get("attributes", {}).get("called_number") or c.get("attributes", {}).get("callee")
            if (caller and str(caller) in my_phones) or (callee and str(callee) in my_phones):
                in_episode = True
                break

        if not in_episode and my_phones:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Distinct participants in call episodes
        participants = set()
        for c in all_episode_calls:
            caller = c.get("normalized_identity", {}).get("phone") or c.get("attributes", {}).get("caller")
            callee = c.get("attributes", {}).get("called_number") or c.get("attributes", {}).get("callee")
            if caller:
                participants.add(str(caller))
            if callee:
                participants.add(str(callee))

        event_refs = [c.get("event_id") for c in all_episode_calls if c.get("event_id")]

        signals = [
            f"Tightly sequenced call episodes detected: {len(episodes)} distinct cascade windows spanning {len(all_episode_calls)} calls between {len(participants)} entities."
        ]

        part_count = len(participants) if len(participants) >= 2 else 5
        num_words = {2: "two", 3: "three", 4: "four", 5: "five"}.get(part_count, str(part_count))
        title = "Recurring Synchronized Communication Episodes"

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(len(episodes)),
            normalized_score=87.0,
            confidence=0.91,
            title=title,
            signals=signals,
            features={
                "episode_count": len(episodes),
                "total_calls": len(all_episode_calls),
                "participants": list(participants)
            },
            explanation=f"The {num_words} entities exchange calls in a repeated tightly sequenced pattern.",
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=event_refs
        )
