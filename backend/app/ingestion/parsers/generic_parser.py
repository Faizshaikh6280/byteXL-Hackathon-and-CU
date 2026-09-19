import io
import csv
import json
import os
import re
from typing import List, Dict, Any
from app.schemas.canonical_event import (
    CanonicalEvent, CanonicalEntities, CanonicalTelemetry, CanonicalFinancial, EventProvenance
)
from app.ingestion.synonyms import extract_canonical_fields, clean_name
from app.ingestion.parsers.base import BaseParser

class GenericTabularParser(BaseParser):
    """Fallback parser adapter for arbitrary CSV, Excel, or JSON tabular evidence files."""

    parser_version = "v1.0.0"

    def can_parse(self, detected_type: str, filename: str) -> bool:
        ext = os.path.splitext(filename)[1].lower()
        return detected_type in ("GENERAL", "UNKNOWN") or ext in (".csv", ".tsv", ".txt", ".json", ".xlsx", ".xls")

    def parse(
        self,
        content_bytes: bytes,
        case_id: str,
        evidence_id: str,
        filename: str,
        evidence_sha256: str
    ) -> List[CanonicalEvent]:
        events: List[CanonicalEvent] = []
        ext = os.path.splitext(filename)[1].lower()
        rows: List[Dict[str, Any]] = []

        if ext == ".json":
            try:
                data = json.loads(content_bytes.decode('utf-8', errors='ignore'))
                if isinstance(data, list):
                    rows = [r for r in data if isinstance(r, dict)]
                elif isinstance(data, dict):
                    for v in data.values():
                        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                            rows = v
                            break
                    if not rows:
                        rows = [data]
            except Exception:
                pass
        elif ext in (".xlsx", ".xls"):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
                ws = wb.active
                headers = []
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i == 0:
                        headers = [str(c).strip().lower() if c is not None else f"col_{j}" for j, c in enumerate(row)]
                    elif any(c is not None for c in row):
                        rows.append(dict(zip(headers, row)))
            except Exception:
                pass
        else:
            text = content_bytes.decode('utf-8', errors='ignore')
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        for idx, row in enumerate(rows, start=1):
            canon = extract_canonical_fields(row)
            name = canon["name"]
            phone = self.clean_phone(canon["phone"])
            national_id = canon["national_id"]
            email = canon["email"]
            account = canon["account"]
            addr = canon["address"]
            device_id = canon["device_id"]
            handle = canon["social_handle"]
            aliases = canon["aliases"]

            amount = 0.0
            ip = None
            lat = None
            lng = None
            cell_id = None
            timestamp = None
            imei = device_id

            for k, v in row.items():
                if v is None:
                    continue
                kl = str(k).lower().strip()
                vs = str(v).strip()

                if not name and any(x in kl for x in ("name", "user", "subscriber", "holder", "entity", "person")):
                    name = clean_name(vs)
                elif not phone and any(x in kl for x in ("phone", "mobile", "caller", "callee", "contact", "number")) and re.search(r'\d{8,}', vs):
                    phone = self.clean_phone(vs)
                elif not account and any(x in kl for x in ("account", "acc_no", "acc_num", "iban")):
                    account = vs
                elif amount == 0.0 and any(x in kl for x in ("amount", "amt", "balance", "sum", "total", "debit", "credit")):
                    amount = self.parse_float(vs)
                elif not ip and any(x in kl for x in ("ip", "host", "destination_ip", "assigned_ip")):
                    ip = vs
                elif lat is None and any(x in kl for x in ("lat", "latitude")):
                    lat = self.parse_float(vs)
                elif lng is None and any(x in kl for x in ("lng", "lon", "longitude")):
                    lng = self.parse_float(vs)
                elif not cell_id and any(x in kl for x in ("cell_id", "cell_tower_id", "tower_id", "tower", "sector_id")):
                    cell_id = vs
                elif not imei and any(x in kl for x in ("imei", "handset", "device_imei")):
                    imei = vs
                elif not device_id and any(x in kl for x in ("device_id", "hardware_id", "handset_id")):
                    device_id = vs
                elif not addr and any(x in kl for x in ("address", "location", "place", "city")):
                    addr = vs
                elif not timestamp and any(x in kl for x in ("time", "date", "created")):
                    timestamp = self.clean_date(vs)

            timestamp = timestamp or self.clean_date(None)

            entities = CanonicalEntities(
                name=name,
                phone=phone,
                national_id=national_id,
                email=email,
                social_handle=handle
            )

            telemetry = CanonicalTelemetry(
                imei=imei or device_id,
                assigned_ip=ip,
                cell_tower_id=cell_id,
                lat=lat if lat and lat != 0.0 else None,
                lng=lng if lng and lng != 0.0 else None,
                address=addr
            )

            financial = CanonicalFinancial(
                account_number=account,
                amount_inr=amount
            )

            attributes = {str(k): v for k, v in row.items() if v is not None}
            if imei:
                attributes["imei"] = imei
            if device_id:
                attributes["device_id"] = device_id
            if aliases:
                attributes["known_aliases"] = aliases


            provenance = EventProvenance(
                evidence_id=evidence_id,
                evidence_sha256=evidence_sha256,
                source_file=filename,
                row_index=idx,
                case_id=case_id
            )

            rec_id = row.get("geo_id") or row.get("record_id") or row.get("id") or f"{evidence_id}-EVT-{idx:05d}"
            attributes["geo_id"] = rec_id
            attributes["record_id"] = rec_id

            # Determine event_type based on available data
            if lat is not None and lng is not None:
                evt_type = "LOCATION_EVENT"
            elif amount > 0:
                evt_type = "TRANSACTION"
            elif ip:
                evt_type = "IP_SESSION"
            else:
                evt_type = "GENERAL_EVENT"

            events.append(CanonicalEvent(
                event_id=str(rec_id).strip(),
                case_id=case_id,
                evidence_id=evidence_id,
                event_type=evt_type,
                source_type="GENERAL",
                timestamp=timestamp,
                entities=entities,
                telemetry=telemetry,
                financial=financial,
                attributes=attributes,
                provenance=provenance
            ))

        return events
