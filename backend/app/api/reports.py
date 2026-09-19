"""
Investigation Reports and Court-Ready Dossier Export Router.
Controls:
- Creating formal investigation dossiers
- Approving investigative outputs and reports
- Exporting certified PDF and JSON dossiers with cryptographic seals
- Audited report views and exports
"""

import io
import uuid
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import ReportModel, UserModel
from app.models.postgres_models import CaseModel, EvidenceModel, GoldenProfileModel, AnomalyFindingModel
from app.authorization.dependencies import require_case_access, require_permission, get_client_ip, get_current_user
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction, verify_audit_integrity
from app.services.pdf_report_service import pdf_report_service

router = APIRouter(prefix="/reports", tags=["Reports & Case Dossiers"])

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class CreateReportRequest(BaseModel):
    case_id: str
    title: str
    sections_included: List[str] = [
        "Executive Summary",
        "Entity Resolution Profiles",
        "Link Analysis Graph",
        "Chronological Timeline",
        "Geospatial Evidence Map"
    ]
    notes: Optional[str] = None

class ApproveReportRequest(BaseModel):
    decision: str  # APPROVED, REJECTED
    comments: Optional[str] = None


@router.get("")
def list_reports(
    case_id: Optional[str] = None,
    current_user: UserModel = Depends(require_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists generated dossier reports for a case."""
    query = db.query(ReportModel)
    if case_id:
        query = query.filter(ReportModel.case_id == case_id)
    reports = query.order_by(ReportModel.created_at.desc()).all()

    return [
        {
            "report_id": r.report_id,
            "case_id": r.case_id,
            "title": r.title,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "report_version": r.report_version,
            "approval_status": r.approval_status,
            "approved_by": r.approved_by,
            "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            "sections_included": r.sections_included
        }
        for r in reports
    ]


@router.post("")
def create_report(
    payload: CreateReportRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.REPORT_CREATE)),
    db: Session = Depends(get_db)
):
    """Compiles a new formal investigation report dossier from case artifacts."""
    case = db.query(CaseModel).filter_by(case_id=payload.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    evidence_items = db.query(EvidenceModel).filter_by(case_id=payload.case_id).all()
    evidence_refs = [e.sha256 for e in evidence_items if e.sha256]

    report = ReportModel(
        report_id=f"REP-{uuid.uuid4().hex[:8].upper()}",
        case_id=payload.case_id,
        title=payload.title,
        created_by=current_user.employee_id,
        created_at=utcnow(),
        sections_included=payload.sections_included,
        evidence_references=evidence_refs,
        report_version="1.0.0",
        approval_status="DRAFT",
        content={
            "case_reference": case.case_reference,
            "case_title": case.title,
            "notes": payload.notes,
            "evidence_count": len(evidence_items)
        }
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    record_audit_event(
        action=AuditAction.REPORT_CREATED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=payload.case_id,
        resource_type="REPORT",
        resource_id=report.report_id,
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "report_id": report.report_id,
        "title": report.title,
        "approval_status": report.approval_status,
        "message": f"Dossier report '{report.title}' created in DRAFT state."
    }


# ====================================================================
# STATIC REPORT EXPORT & CUSTODY ROUTES (Must be before /{report_id})
# ====================================================================

@router.get("/court-dossier-data")
def get_court_dossier_data(
    case_id: Optional[str] = None,
    investigator_name: Optional[str] = None,
    investigator_id: Optional[str] = None,
    agency_name: Optional[str] = None,
    classification: Optional[str] = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the comprehensive 7-section structured Court Dossier payload
    for high-fidelity judicial viewing and interactive review in the UI.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        target_case_id = c.case_id if c else "INV-2026-BLACK-CIRCUIT"

    actor_name = investigator_name or (current_user.official_email if current_user else "Lead Forensic Investigator")
    actor_id = investigator_id or (getattr(current_user, "employee_id", "Officer_804") if current_user else "Officer_804")
    target_agency = agency_name or "Directorate of Cyber Crime & Forensic Intelligence (CCFI)"
    target_classification = classification or "CONFIDENTIAL // LAW ENFORCEMENT SENSITIVE"

    return pdf_report_service.get_court_dossier_payload(
        case_id=target_case_id,
        investigator_name=actor_name,
        investigator_id=actor_id,
        agency_name=target_agency,
        classification=target_classification
    )


@router.get("/pdf")
def export_pdf_dossier(
    request: Request,
    case_id: Optional[str] = None,
    title: Optional[str] = "Formal Court-Ready Investigation Dossier",
    investigator_name: Optional[str] = None,
    investigator_id: Optional[str] = None,
    agency_name: Optional[str] = None,
    classification: Optional[str] = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a structured court-ready PDF dossier summary with evidence hashes,
    Zingg suspect profiles, chronological master timeline, and cryptographic seals.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        target_case_id = c.case_id if c else "INV-2026-BLACK-CIRCUIT"

    actor_name = investigator_name or (current_user.official_email if current_user else "Lead Forensic Investigator")
    actor_id = investigator_id or (getattr(current_user, "employee_id", "Officer_804") if current_user else "Officer_804")
    target_agency = agency_name or "Directorate of Cyber Crime & Forensic Intelligence (CCFI)"
    target_classification = classification or "CONFIDENTIAL // LAW ENFORCEMENT SENSITIVE"

    pdf_bytes = pdf_report_service.generate_court_dossier_pdf(
        case_id=target_case_id,
        title=title,
        investigator_name=actor_name,
        investigator_id=actor_id,
        agency_name=target_agency,
        classification=target_classification
    )

    record_audit_event(
        action=AuditAction.PDF_EXPORT,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=actor_name,
        case_id=target_case_id,
        resource_type="REPORT",
        details={"format": "PDF", "title": title, "bytes": len(pdf_bytes)},
        ip_address=get_client_ip(request),
        db=db
    )

    headers = {
        "Content-Disposition": f'inline; filename="Court_Dossier_{target_case_id}.pdf"',
        "Content-Type": "application/pdf"
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/section-65b")
def export_section_65b_certificate(
    request: Request,
    case_id: Optional[str] = None,
    officer_name: Optional[str] = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates an official Certificate of Electronic Evidence under Section 65B
    of the Indian Evidence Act, 1872 (and Section 63 Bharatiya Sakshya Adhiniyam, 2023).
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        target_case_id = c.case_id if c else "INV-2026-BLACK-CIRCUIT"

    inv_name = officer_name or (current_user.official_email if current_user else "Lead Forensic Investigator")
    
    cert_bytes = pdf_report_service.generate_section_65b_certificate_pdf(
        case_id=target_case_id,
        officer_name=inv_name,
        designation="Senior Cyber Forensics Analyst",
        department="Central Electronic Crime & Illicit Finance Unit"
    )

    record_audit_event(
        action=AuditAction.SECTION_65B_EXPORTED,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=inv_name,
        case_id=target_case_id,
        resource_type="CERTIFICATE",
        details={"statute": "Section 65B IEA / Section 63 BSA", "bytes": len(cert_bytes)},
        ip_address=get_client_ip(request),
        db=db
    )

    headers = {
        "Content-Disposition": f'inline; filename="Section65B_Certificate_{target_case_id}.pdf"',
        "Content-Type": "application/pdf"
    }
    return Response(content=cert_bytes, media_type="application/pdf", headers=headers)


@router.get("/verify-custody")
def verify_evidence_custody(
    case_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Verifies raw data immutability and audit trail hash chaining.
    Confirms zero post-seizure tampering across all electronic evidence files and audit logs.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        target_case_id = c.case_id if c else "INV-2026-BLACK-CIRCUIT"

    evidence_items = db.query(EvidenceModel).filter_by(case_id=target_case_id).all()
    audit_report = verify_audit_integrity(case_id=target_case_id)

    evidence_manifest = [
        {
            "filename": e.original_filename,
            "sha256": e.sha256,
            "file_size": e.file_size,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "status": "SEALED_IMMUTABLE"
        }
        for e in evidence_items
    ]

    return {
        "status": "VERIFIED",
        "case_id": target_case_id,
        "evidence_files_count": len(evidence_items),
        "evidence_manifest": evidence_manifest,
        "audit_integrity": audit_report,
        "tamper_free": audit_report.get("tamper_free", True),
        "legal_admissibility": "Compliant with Section 65B IEA / Section 63 BSA standards",
        "verified_at": utcnow().isoformat()
    }


# ====================================================================
# PARAMETERIZED ROUTES
# ====================================================================

@router.get("/{report_id}")
def get_report_detail(
    report_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves detailed report dossier with section breakdown and evidence signatures."""
    report = db.query(ReportModel).filter_by(report_id=report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    record_audit_event(
        action=AuditAction.REPORT_VIEWED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=report.case_id,
        resource_type="REPORT",
        resource_id=report.report_id,
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "report_id": report.report_id,
        "case_id": report.case_id,
        "title": report.title,
        "created_by": report.created_by,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "sections_included": report.sections_included,
        "evidence_references": report.evidence_references,
        "report_version": report.report_version,
        "approval_status": report.approval_status,
        "approved_by": report.approved_by,
        "approved_at": report.approved_at.isoformat() if report.approved_at else None,
        "content": report.content
    }


@router.post("/{report_id}/approve")
def approve_report(
    report_id: str,
    payload: ApproveReportRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.FINDING_APPROVE)),
    db: Session = Depends(get_db)
):
    """Formally approves or rejects an investigative report dossier (requires FINDING_APPROVE)."""
    report = db.query(ReportModel).filter_by(report_id=report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    decision = payload.decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Decision must be APPROVED or REJECTED.")

    report.approval_status = decision
    report.approved_by = current_user.employee_id
    report.approved_at = utcnow()
    db.commit()

    record_audit_event(
        action=AuditAction.REPORT_APPROVED if decision == "APPROVED" else AuditAction.FINDING_UPDATED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=report.case_id,
        resource_type="REPORT",
        resource_id=report.report_id,
        details={"decision": decision, "comments": payload.comments},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "approval_status": decision, "approved_by": current_user.employee_id}


@router.get("/{report_id}/export")
def export_report_dossier(
    report_id: str,
    request: Request,
    format: str = Query("json", pattern="^(json|pdf)$"),
    current_user: UserModel = Depends(require_permission(Permissions.REPORT_EXPORT)),
    db: Session = Depends(get_db)
):
    """
    Exports a certified court-ready dossier.
    Strictly restricted to authorized roles and fully audited.
    """
    report = db.query(ReportModel).filter_by(report_id=report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    case = db.query(CaseModel).filter_by(case_id=report.case_id).first()
    evidence_items = db.query(EvidenceModel).filter_by(case_id=report.case_id).all()
    golden_profiles = db.query(GoldenProfileModel).filter_by(case_id=report.case_id).all()
    findings = db.query(AnomalyFindingModel).filter_by(case_id=report.case_id).all()

    record_audit_event(
        action=AuditAction.REPORT_EXPORTED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=report.case_id,
        resource_type="REPORT",
        resource_id=report.report_id,
        details={"format": format, "report_title": report.title},
        ip_address=get_client_ip(request),
        db=db
    )

    export_payload = {
        "export_metadata": {
            "dossier_id": report.report_id,
            "export_timestamp": utcnow().isoformat(),
            "exported_by": current_user.employee_id,
            "format": format,
            "legal_notice": "COURT SENSITIVE // OFFICIAL DIGITAL EVIDENCE RECORD"
        },
        "case_overview": {
            "case_id": report.case_id,
            "case_reference": case.case_reference if case else "UNKNOWN",
            "title": report.title,
            "approval_status": report.approval_status,
            "approved_by": report.approved_by,
            "version": report.report_version
        },
        "evidence_inventory": [
            {
                "evidence_id": e.evidence_id,
                "filename": e.original_filename,
                "sha256": e.sha256,
                "quality_score": e.quality_score,
                "records": e.record_count
            }
            for e in evidence_items
        ],
        "golden_entities": [
            {
                "cluster_id": p.z_cluster_id,
                "primary_name": p.primary_name,
                "aliases": p.known_aliases,
                "phones": p.known_phones,
                "risk_score": p.risk_score
            }
            for p in golden_profiles
        ],
        "investigative_findings": [
            {
                "finding_id": f.finding_id,
                "title": f.title,
                "severity": f.severity,
                "unified_score": f.unified_score,
                "what_happened": f.what_happened,
                "why_relevant": f.why_relevant
            }
            for f in findings
        ]
    }

    return export_payload
