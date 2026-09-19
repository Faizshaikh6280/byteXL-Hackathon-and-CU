import os
import glob
import logging
import traceback
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Request, HTTPException
from app.services.ingestion_service import process_file
from app.core.database import get_db_context
from app.models.postgres_models import CaseModel
from app.models.iam_models import UserModel
from app.processing.canonical_reader import canonical_reader
from app.authorization.dependencies import require_permission, require_case_access, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction

logger = logging.getLogger("investigation.api.ingestion")
router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "..", "data_files")

@router.post("/trigger_all")
async def ingest_all_files(
    case_id: Optional[str] = None,
    request: Request = None,
    current_user: UserModel = Depends(require_permission(Permissions.EVIDENCE_UPLOAD))
):
    """
    Seeds sample evidence files if explicitly requested, scoped to the specified or active case.
    Does NOT wipe the warehouse.
    """
    target_case_id = case_id
    if not target_case_id:
        with get_db_context() as db:
            existing_case = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
            if existing_case:
                target_case_id = existing_case.case_id
            else:
                target_case_id = "CASE-DEFAULT-001"
                case = CaseModel(
                    case_id=target_case_id,
                    case_reference="INV-2026-0142",
                    title="Operation Shadow Syndicate",
                    description="Cross-domain investigation in Delhi NCR.",
                    created_by="SYSTEM"
                )
                db.add(case)

    files_to_ingest = [
        "bank_statements.csv",
        "cdr_records.csv",
        "ipdr_sessions.csv",
        "social_media_logs.csv"
    ]

    results = []
    for filename in files_to_ingest:
        filepath = os.path.join(DATA_DIR, filename)
        if os.path.exists(filepath):
            try:
                res = await process_file(
                    file_path=filepath,
                    domain=None,
                    case_id=target_case_id
                )
                results.append({
                    "status": "success",
                    "file": filename,
                    "detected_domain": res["detected_source"],
                    "confidence": res["confidence"],
                    "records_valid": res["valid_records"],
                    "quality_score": res["quality_score"]
                })
            except Exception as e:
                logger.error(f"[Ingestion] Failed to process {filename}: {e}\n{traceback.format_exc()}")
                results.append({"status": "error", "file": filename, "error": str(e)})

    return {"message": "Ingestion complete via new distributed pipeline", "results": results}

@router.get("/events")
async def get_events(
    case_id: Optional[str] = None,
    limit: int = 200,
    current_user: UserModel = Depends(require_permission(Permissions.EVIDENCE_VIEW))
):
    """
    Retrieves canonical events from the MinIO Parquet warehouse scoped to case_id.
    """
    target_case_id = case_id
    if not target_case_id:
        with get_db_context() as db:
            c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
            if not c:
                return []
            target_case_id = c.case_id
    return canonical_reader.read_all_events(case_id=target_case_id, limit=limit)
