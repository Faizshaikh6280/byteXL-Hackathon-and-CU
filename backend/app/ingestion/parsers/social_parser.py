import io
import csv
import json
from typing import List, Dict, Any
from app.schemas.canonical_event import (
    CanonicalEvent, CanonicalEntities, CanonicalTelemetry, CanonicalFinancial, EventProvenance
)
from app.ingestion.parsers.base import BaseParser

class SocialParser(BaseParser):
    """Parser adapter for Social Media activity and session logs (Telegram, WhatsApp, Instagram)."""

    parser_version = "v1.0.0"

    def can_parse(self, detected_type: str, filename: str) -> bool:
        return detected_type == "SOCIAL"

    def parse(
        self,
        content_bytes: bytes,
        case_id: str,
        evidence_id: str,
        filename: str,
        evidence_sha256: str
    ) -> List[CanonicalEvent]:
        events: List[CanonicalEvent] = []
        text = content_bytes.decode('utf-8', errors='ignore')

        rows: List[Dict[str, Any]] = []
        if filename.lower().endswith(".json"):
            try:
                data = json.loads(text)
                rows = data if isinstance(data, list) else data.get("logs", data.get("records", []))
            except Exception:
                pass
        else:
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        for idx, row in enumerate(rows, start=1):
            phone = self.clean_phone(row.get("registered_phone") or row.get("phone"))
            timestamp = self.clean_date(row.get("timestamp") or row.get("created_at") or row.get("date"))

            entities = CanonicalEntities(
                name=str(row.get("name") or "").strip() or None,
                social_handle=str(row.get("user_handle") or row.get("handle") or "").strip(),
                social_platform=str(row.get("platform") or "SocialMedia").strip(),
                phone=phone
            )

            location_str = str(row.get("location") or "").strip() or None

            telemetry = CanonicalTelemetry(
                assigned_ip=str(row.get("client_ip") or "").strip() if row.get("client_ip") else None,
                destination_ip=str(row.get("ip") or row.get("destination_ip") or "").strip() or None,
                address=location_str
            )

            financial = CanonicalFinancial()

            attributes = {
                "social_id": row.get("social_id") or row.get("post_id") or row.get("log_id", f"SOC-{idx}"),
                "record_id": row.get("social_id") or row.get("post_id") or row.get("log_id", f"SOC-{idx}"),
                "log_id": row.get("social_id") or row.get("post_id") or row.get("log_id", f"SOC-{idx}"),
                "post_id": row.get("social_id") or row.get("post_id") or row.get("log_id"),
                "action": row.get("activity") or row.get("action_type") or row.get("action", "ACTIVITY"),
                "activity": row.get("activity") or row.get("action_type") or row.get("action", "ACTIVITY"),
                "action_type": row.get("activity") or row.get("action_type") or row.get("action", "ACTIVITY"),
                "device_id": str(row.get("device") or row.get("device_id") or "").strip() or None,
                "group_id": str(row.get("group_id") or "").strip() or None,
                "ip": str(row.get("ip") or "").strip() or None,
                "location": location_str,
                "content_metadata": row.get("content_metadata")
            }

            provenance = EventProvenance(
                case_id=case_id,
                evidence_id=evidence_id,
                source_file=filename,
                row_index=idx,
                evidence_sha256=evidence_sha256,
                parser_version=self.parser_version
            )

            events.append(CanonicalEvent(
                event_id=str(attributes["record_id"]).strip(),
                case_id=case_id,
                evidence_id=evidence_id,
                event_type="SOCIAL_ACTIVITY",
                source_type="SOCIAL",
                timestamp=timestamp,
                entities=entities,
                telemetry=telemetry,
                financial=financial,
                attributes=attributes,
                provenance=provenance
            ))

        return events
