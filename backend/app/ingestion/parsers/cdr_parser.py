import io
import csv
import json
from typing import List, Dict, Any
from app.schemas.canonical_event import (
    CanonicalEvent, CanonicalEntities, CanonicalTelemetry, CanonicalFinancial, EventProvenance
)
from app.ingestion.parsers.base import BaseParser

class CDRParser(BaseParser):
    """Parser adapter for Telecom Call Detail Records (CDR)."""

    parser_version = "v1.0.0"

    def can_parse(self, detected_type: str, filename: str) -> bool:
        return detected_type == "TELECOM"

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

        # Attempt JSON or CSV parse
        rows: List[Dict[str, Any]] = []
        if filename.lower().endswith(".json"):
            try:
                data = json.loads(text)
                rows = data if isinstance(data, list) else data.get("records", [])
            except Exception:
                pass
        else:
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        for idx, row in enumerate(rows, start=1):
            calling_phone = self.clean_phone(
                row.get("calling_number") or row.get("caller") or row.get("phone_number") or
                row.get("caller_phone") or row.get("caller_number") or row.get("source_phone") or row.get("a_party")
            )
            called_phone = self.clean_phone(
                row.get("called_number") or row.get("callee") or row.get("receiver_phone") or
                row.get("receiver_number") or row.get("destination_phone") or row.get("b_party")
            )
            timestamp = self.clean_date(row.get("start_time") or row.get("timestamp") or row.get("date_time") or row.get("date"))

            lat = self.parse_float(row.get("tower_lat") or row.get("lat"))
            lng = self.parse_float(row.get("tower_lng") or row.get("lng"))
            duration = int(self.parse_float(row.get("duration_seconds") or row.get("duration_sec") or row.get("duration") or row.get("call_duration"), 0.0))

            entities = CanonicalEntities(
                name=row.get("caller_subscriber_name") or row.get("subscriber_name"),
                phone=calling_phone,
                counterparty_name=row.get("called_subscriber_name")
            )

            cell_id_val = str(row.get("cell_id") or row.get("cell_tower_id") or row.get("tower_id") or "").strip() or None
            imei_val = str(row.get("imei") or "").strip() or None
            imsi_val = str(row.get("imsi") or row.get("sim_id") or row.get("sim_card") or "").strip() or None

            telemetry = CanonicalTelemetry(
                imei=imei_val,
                imsi=imsi_val,
                cell_tower_id=cell_id_val,
                lat=lat if lat != 0.0 else None,
                lng=lng if lng != 0.0 else None,
                address=row.get("tower_address") or row.get("address"),
                duration_seconds=duration
            )

            financial = CanonicalFinancial()

            # Store extra fields in attributes
            attributes = {
                "called_number": called_phone,
                "call_type": row.get("call_type", "VOICE_OUT"),
                "cdr_id": row.get("cdr_id") or row.get("call_id", f"CDR-{idx}"),
                "call_id": row.get("cdr_id") or row.get("call_id", f"CDR-{idx}"),
                "record_id": row.get("cdr_id") or row.get("call_id", f"CDR-{idx}"),
                "imsi": str(row.get("imsi") or "").strip() or None,
                "device_id": str(row.get("device_id") or "").strip() or None
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
                event_type="CALL",
                source_type="TELECOM",
                timestamp=timestamp,
                entities=entities,
                telemetry=telemetry,
                financial=financial,
                attributes=attributes,
                provenance=provenance
            ))

        return events
