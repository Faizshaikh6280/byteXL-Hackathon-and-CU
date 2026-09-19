import io
import csv
import json
import datetime
from typing import List, Dict, Any
from app.schemas.canonical_event import (
    CanonicalEvent, CanonicalEntities, CanonicalTelemetry, CanonicalFinancial, EventProvenance
)
from app.ingestion.synonyms import extract_canonical_fields, clean_name
from app.ingestion.parsers.base import BaseParser

class KYCParser(BaseParser):
    """Parser adapter for KYC profiles, identity registries, and official record documents."""

    parser_version = "v1.0.0"

    def can_parse(self, detected_type: str, filename: str) -> bool:
        return detected_type == "KYC"

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
                rows = data if isinstance(data, list) else data.get("profiles", data.get("records", []))
            except Exception:
                pass
        else:
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        current_time = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        for idx, row in enumerate(rows, start=1):
            canon = extract_canonical_fields(row)
            phone = self.clean_phone(canon["phone"] or row.get("phone") or row.get("mobile"))
            name = canon["name"] or clean_name(row.get("full_name") or row.get("name"))
            national_id = canon["national_id"] or str(row.get("national_id") or row.get("aadhar") or row.get("id_number") or "").strip() or None
            email = canon["email"] or (str(row.get("email")).strip() if row.get("email") else None)
            address = canon["address"] or (str(row.get("address")).strip() if row.get("address") else None)
            account_num = canon["account"] or str(row.get("account") or row.get("account_number") or row.get("bank_account") or "").strip() or None
            dob = str(row.get("date_of_birth") or row.get("dob") or "").strip() or None
            aliases = canon["aliases"]

            entities = CanonicalEntities(
                name=name,
                phone=phone,
                national_id=national_id if national_id else None,
                email=email
            )

            telemetry = CanonicalTelemetry(
                address=address
            )

            financial = CanonicalFinancial(
                account_number=account_num
            )

            attributes = {
                "record_id": row.get("kyc_record_id") or row.get("record_id", f"KYC-{idx}"),
                "account": account_num,
                "date_of_birth": dob,
                "data_source": row.get("data_source", "KYC"),
                "occupation": row.get("occupation")
            }
            if aliases:
                attributes["known_aliases"] = aliases


            provenance = EventProvenance(
                case_id=case_id,
                evidence_id=evidence_id,
                source_file=filename,
                row_index=idx,
                evidence_sha256=evidence_sha256,
                parser_version=self.parser_version
            )

            rec_id = str(attributes.get("record_id", f"KYC-{idx}")).strip()
            events.append(CanonicalEvent(
                event_id=rec_id,
                case_id=case_id,
                evidence_id=evidence_id,
                event_type="IDENTITY_RECORD",
                source_type="KYC",
                timestamp=current_time,
                entities=entities,
                telemetry=telemetry,
                financial=financial,
                attributes=attributes,
                provenance=provenance
            ))

        return events
