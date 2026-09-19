import hashlib
from typing import List, Tuple, Set
from app.schemas.canonical_event import CanonicalEvent

class IngestionDeduplicator:
    """
    Performs deterministic exact and near-exact event deduplication at ingestion time.
    Collapses identical raw event transmissions without conflating with Entity Resolution.
    """

    @staticmethod
    def compute_semantic_hash(event: CanonicalEvent) -> str:
        """
        Creates a deterministic fingerprint across the core semantic dimensions of the event.
        """
        components = [
            event.source_type or "",
            event.event_type or "",
            event.timestamp or "",
            event.entities.name or "",
            event.entities.phone or "",
            event.entities.national_id or "",
            event.entities.social_handle or "",
            event.financial.account_number or "",
            str(round(event.financial.amount_inr or 0.0, 2)),
            event.financial.counterparty or "",
            event.telemetry.imei or "",
            event.telemetry.cell_tower_id or "",
            event.telemetry.assigned_ip or "",
            event.telemetry.destination_ip or "",
            str((event.attributes or {}).get("record_id", ""))
        ]
        composite_str = "|".join(components)
        return hashlib.sha256(composite_str.encode('utf-8')).hexdigest()

    def deduplicate(
        self,
        events: List[CanonicalEvent]
    ) -> Tuple[List[CanonicalEvent], int]:
        """
        Deduplicates a list of CanonicalEvent objects based on semantic hashes.
        Returns:
            (unique_events, duplicate_count)
        """
        seen_hashes: Set[str] = set()
        unique_events: List[CanonicalEvent] = []
        duplicate_count = 0

        for event in events:
            h = self.compute_semantic_hash(event)
            if h in seen_hashes:
                duplicate_count += 1
            else:
                seen_hashes.add(h)
                unique_events.append(event)

        return unique_events, duplicate_count

ingestion_deduplicator = IngestionDeduplicator()
