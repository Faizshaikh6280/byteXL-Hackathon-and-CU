import re
from typing import List, Tuple, Dict, Any
from app.schemas.canonical_event import CanonicalEvent

class EventValidator:
    """
    Validates parsed canonical events against investigative domain integrity rules.
    Routes invalid records to quarantine preserving reasons and raw payloads.
    """

    IP_PATTERN = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')

    def validate_event(self, event: CanonicalEvent) -> Tuple[bool, str]:
        """
        Validates a single CanonicalEvent.
        Returns:
            (is_valid: bool, failure_reason: str)
        """
        # 1. Timestamp validity check
        if not event.timestamp or len(event.timestamp) < 10:
            return False, "INVALID_OR_MISSING_TIMESTAMP"

        # 2. Coordinates validity check
        if event.telemetry.lat is not None:
            if not (-90.0 <= event.telemetry.lat <= 90.0):
                return False, f"INVALID_LATITUDE_VALUE_{event.telemetry.lat}"
        if event.telemetry.lng is not None:
            if not (-180.0 <= event.telemetry.lng <= 180.0):
                return False, f"INVALID_LONGITUDE_VALUE_{event.telemetry.lng}"

        # 3. IP address validity check
        if event.telemetry.assigned_ip:
            if not self.IP_PATTERN.match(event.telemetry.assigned_ip):
                # Check for possible valid domain or IPv6
                if ":" not in event.telemetry.assigned_ip and "." not in event.telemetry.assigned_ip:
                    return False, f"MALFORMED_IP_ADDRESS_{event.telemetry.assigned_ip}"

        # 4. Financial amount validity check
        if event.source_type == "BANKING":
            if event.financial.amount_inr is not None and event.financial.amount_inr < 0.0:
                return False, f"NEGATIVE_TRANSACTION_AMOUNT_{event.financial.amount_inr}"

        # 5. Core identifier existence check: event must have at least one valid identity or telemetry anchor
        has_identity = bool(
            event.entities.name or event.entities.phone or event.entities.national_id or
            event.entities.social_handle or event.financial.account_number or
            event.telemetry.assigned_ip or event.telemetry.imei
        )
        if not has_identity:
            return False, "NO_IDENTIFIER_OR_TELEMETRY_ANCHOR_FOUND"

        return True, ""

    def validate_batch(
        self,
        events: List[CanonicalEvent]
    ) -> Tuple[List[CanonicalEvent], List[Dict[str, Any]]]:
        """
        Filters a list of events into valid events and quarantined records.
        Returns:
            (valid_events, quarantine_records)
        """
        valid_events: List[CanonicalEvent] = []
        quarantined: List[Dict[str, Any]] = []

        for event in events:
            is_valid, reason = self.validate_event(event)
            if is_valid:
                valid_events.append(event)
            else:
                quarantined.append({
                    "evidence_id": event.evidence_id,
                    "row_index": event.provenance.row_index,
                    "reason": reason,
                    "raw_payload": {
                        "timestamp": event.timestamp,
                        "source_type": event.source_type,
                        "entities": event.entities.dict(),
                        "telemetry": event.telemetry.dict(),
                        "financial": event.financial.dict(),
                        "attributes": event.attributes
                    }
                })

        return valid_events, quarantined

event_validator = EventValidator()
