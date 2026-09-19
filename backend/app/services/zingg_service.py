import os
import csv
import logging
from datetime import datetime
from app.core.config import settings
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel
from app.processing.canonical_reader import canonical_reader
from app.ingestion.synonyms import extract_canonical_fields, clean_name

logger = logging.getLogger("investigation.zingg")

PIPELINE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "zingg_pipeline")
EXPORT_PATH = os.path.join(PIPELINE_DIR, "normalized_evidence_export.csv")

async def export_for_zingg():
    """Exports canonical events to CSV format suitable for Zingg training."""
    events = canonical_reader.read_all_events()
    os.makedirs(PIPELINE_DIR, exist_ok=True)
    
    with open(EXPORT_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            "record_id", "full_name", "phone", "national_id", "email",
            "address", "account_number", "social_handle", "device_id"
        ])
        for idx, ev in enumerate(events, start=1):
            identity = ev.get("normalized_identity", {})
            telemetry = ev.get("telemetry", {})
            financial = ev.get("financial", {})
            attrs = ev.get("attributes", {})
            canon = extract_canonical_fields(attrs)

            name = clean_name(identity.get("name") or canon["name"])
            phone = identity.get("phone") or canon["phone"]
            nid = identity.get("national_id") or canon["national_id"]
            email = identity.get("email") or canon["email"]
            address = telemetry.get("address") or canon["address"]
            acc = financial.get("account_number") or canon["account"]
            handle = identity.get("social_handle") or canon["social_handle"]
            device = telemetry.get("imei") or canon["device_id"]

            if name or phone or nid or acc or handle or email:
                writer.writerow([
                    ev.get("event_id", f"REC-{idx:05d}"),
                    name or "",
                    phone or "",
                    nid or "",
                    email or "",
                    address or "",
                    acc or "",
                    handle or "",
                    device or ""
                ])
            
    return len(events)

async def run_zingg_pipeline(case_id: str = None):
    """Triggers Zingg model execution or high-precision fallback."""
    from app.services.zingg_er import run_entity_resolution
    return run_entity_resolution(case_id=case_id)
