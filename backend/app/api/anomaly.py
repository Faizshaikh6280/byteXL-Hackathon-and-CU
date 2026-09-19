import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pydantic import BaseModel
from neo4j import GraphDatabase
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db, get_db_context
from app.models.postgres_models import AnomalyFindingModel, AnomalyRunModel, DetectionSignalModel
from app.models.iam_models import UserModel, CaseMemberModel
from app.authorization.dependencies import require_permission, get_client_ip, require_authenticated_user
from app.authorization.permissions import Permissions
from app.authorization.roles import Roles
from app.audit.audit_service import record_audit_event, AuditAction
from app.services.anomaly_engine import run_anomaly_detection
from app.anomaly.registry.detector_registry import detector_registry

logger = logging.getLogger("AnomalyAPI")
router = APIRouter()

def check_anomaly_access(case_id: Optional[str], current_user: UserModel, db: Session):
    if not case_id:
        return
    role_name = current_user.role.name if current_user.role else ""
    if role_name in (Roles.SYSTEM_ADMIN, Roles.SUPERINTENDENT, Roles.AUDITOR, Roles.IPS_OFFICER):
        return
    is_member = db.query(CaseMemberModel).filter_by(
        case_id=case_id, user_id=current_user.id, active=True
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail=f"Access denied: Not assigned to case {case_id}")

class AnomalyFilter(BaseModel):
    severity: List[str] = []
    entity_type: List[str] = []
    search: str = ""

@router.post("/analyze")
def trigger_analysis(
    case_id: Optional[str] = None,
    sync: bool = True,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_INVESTIGATE)),
    db: Session = Depends(get_db)
):
    """
    Triggers end-to-end multi-engine investigative anomaly analysis.
    Defaults to direct synchronous execution for guaranteed, immediate completion.
    """
    target_case_id = case_id
    if not target_case_id:
        from app.models.postgres_models import CaseModel
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active cases found. Please create a case first.")
        target_case_id = c.case_id

    check_anomaly_access(target_case_id, current_user, db)

    if sync:
        logger.info(f"Executing multi-engine anomaly analysis synchronously for case: {target_case_id}")
        result = run_anomaly_detection(case_id=target_case_id)
        record_audit_event(
            action=AuditAction.ANOMALY_INVESTIGATED,
            result="SUCCESS",
            user_id=current_user.id,
            actor=current_user.official_email,
            role=current_user.role.name if current_user.role else None,
            case_id=target_case_id,
            resource_type="anomaly_engine",
            details={"sync": True, "detectors_run": len(detector_registry.get_all_detectors())},
            db=db
        )
        return {"message": "Analysis completed", "result": result}
    try:
        task = run_anomaly_detection.delay(case_id=target_case_id)
        record_audit_event(
            action=AuditAction.ANOMALY_INVESTIGATED,
            result="SUCCESS",
            user_id=current_user.id,
            actor=current_user.official_email,
            role=current_user.role.name if current_user.role else None,
            case_id=target_case_id,
            resource_type="anomaly_engine",
            details={"sync": False, "task_id": str(task.id)},
            db=db
        )
        return {"message": "Analysis started", "task_id": task.id}
    except Exception as e:
        logger.warning(f"[Celery] Task queuing unavailable ({e}), executing synchronously...")
        result = run_anomaly_detection(case_id=target_case_id)
        record_audit_event(
            action=AuditAction.ANOMALY_INVESTIGATED,
            result="SUCCESS",
            user_id=current_user.id,
            actor=current_user.official_email,
            role=current_user.role.name if current_user.role else None,
            case_id=target_case_id,
            resource_type="anomaly_engine",
            details={"fallback_sync": True},
            db=db
        )
        return {"message": "Analysis completed (direct mode)", "result": result}

@router.get("/health")
def get_detector_health(current_user: UserModel = Depends(require_authenticated_user)):
    """Returns operational status and metadata for all 11+ registered anomaly engines."""
    detectors = detector_registry.get_all_detectors()
    return {
        "status": "HEALTHY",
        "total_detectors": len(detectors),
        "engines": [
            {
                "detector_id": d.get_metadata().detector_id,
                "name": d.get_metadata().name,
                "type": d.get_metadata().detector_type.value,
                "domain": d.get_metadata().domain,
                "version": d.get_metadata().version,
                "applicable_domains": d.get_metadata().applicable_domains,
                "description": d.get_metadata().description
            }
            for d in detectors
        ]
    }

@router.get("")
def get_anomalies(
    severity: str = "",
    entity_type: str = "",
    search: str = "",
    case_id: Optional[str] = None,
    limit: int = 100,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Retrieves synthesized, evidence-grounded investigative findings from PostgreSQL.
    Surfaces rich human-readable fields: primaryEntities, relatedEntities,
    whatHappened, whyUnusual, whyRelevant, supportingObservations, detectorSummary.
    """
    target_case_id = case_id
    if not target_case_id:
        from app.models.postgres_models import CaseModel
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {"anomalies": [], "total": 0}
        target_case_id = c.case_id

    check_anomaly_access(target_case_id, current_user, db)

    query = db.query(AnomalyFindingModel).filter(AnomalyFindingModel.case_id == target_case_id)
    if severity:
        query = query.filter(AnomalyFindingModel.severity.in_([s.strip().upper() for s in severity.split(",") if s.strip()]))
    if entity_type:
        query = query.filter(AnomalyFindingModel.entity_type.in_([e.strip() for e in entity_type.split(",") if e.strip()]))
    if search:
        query = query.filter(
            (AnomalyFindingModel.entity_id.ilike(f"%{search}%")) |
            (AnomalyFindingModel.title.ilike(f"%{search}%")) |
            (AnomalyFindingModel.what_happened.ilike(f"%{search}%"))
        )

    rows = query.order_by(AnomalyFindingModel.unified_score.desc()).limit(limit).all()
    return {
        "anomalies": [
            {
                "id": r.finding_id,
                "entityId": r.entity_id,
                "entityType": r.entity_type or "Person",
                "type": r.pattern_type or r.primary_detector_type or "Investigative Finding",
                "category": r.category or r.domain or "GENERAL",
                "patternType": r.pattern_type or r.primary_detector_type,
                "severity": r.severity,
                "score": r.unified_score,
                "status": r.status or "DETECTED",
                "title": r.title,
                "whatHappened": r.what_happened or r.explanation or "",
                "whyUnusual": r.why_unusual or "Activity differs significantly from normal citizen baseline.",
                "whyRelevant": r.why_relevant or "Directly implicated in active case investigation scope.",
                "caseRelevance": r.case_relevance or "HIGH",
                "investigativePriority": r.investigative_priority or "MEDIUM",
                "primaryEntities": r.primary_entities or [],
                "relatedEntities": r.related_entities or [],
                "supportingObservations": r.supporting_observations or [],
                "detectorSummary": r.detector_summary or [],
                "reasons": r.signals or [r.title],
                "metrics": r.metrics or {},
                "timelineContext": r.timeline_context or {},
                "graphContext": r.graph_context or {},
                "spatialContext": r.spatial_context or {},
                "supportingEvents": r.supporting_events or [],
                "detectedAt": r.created_at.isoformat() if r.created_at else None,
                "confidence": r.confidence or 0.9,
                "domain": r.domain or "CROSS_DOMAIN",
                "contributingDetectors": r.contributing_detectors or r.detectors or [],
                "evidence_refs": r.evidence_refs or [],
                "canonical_event_refs": r.canonical_event_refs or [],
                "entityInteractions": (r.technical_details or {}).get("entity_interactions", [])
            }
            for r in rows
        ],
        "total": len(rows)
    }

@router.get("/stats")
def get_anomaly_stats(
    case_id: Optional[str] = None,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Returns counts by severity band and total findings for the overview and radar dashboard.
    """
    from sqlalchemy import func, case
    from app.models.postgres_models import CaseModel
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {
                "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0,
                "total_signals": 0
            }
        target_case_id = c.case_id

    check_anomaly_access(target_case_id, current_user, db)

    query = db.query(
        func.count(AnomalyFindingModel.finding_id).label("total"),
        func.sum(case((AnomalyFindingModel.severity == 'CRITICAL', 1), else_=0)).label("critical"),
        func.sum(case((AnomalyFindingModel.severity == 'HIGH', 1), else_=0)).label("high"),
        func.sum(case((AnomalyFindingModel.severity == 'MEDIUM', 1), else_=0)).label("medium"),
        func.sum(case((AnomalyFindingModel.severity == 'LOW', 1), else_=0)).label("low")
    ).filter(AnomalyFindingModel.case_id == target_case_id)
    row = query.first()

    sig_count_query = db.query(func.count(DetectionSignalModel.signal_id)).filter(DetectionSignalModel.case_id == target_case_id)
    total_signals = sig_count_query.scalar() or 0

    return {
        "total": int(row.total or 0) if row else 0,
        "critical": int(row.critical or 0) if row else 0,
        "high": int(row.high or 0) if row else 0,
        "medium": int(row.medium or 0) if row else 0,
        "low": int(row.low or 0) if row else 0,
        "total_signals": int(total_signals)
    }

@router.get("/cases/{case_id}/summary")
def get_case_investigative_summary(
    case_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Returns an investigator-oriented summary:
    e.g., '4 investigative findings identified from 21 underlying detection signals.'
    """
    check_anomaly_access(case_id, current_user, db)
    findings = db.query(AnomalyFindingModel).filter_by(case_id=case_id).order_by(AnomalyFindingModel.unified_score.desc()).all()
    signals_count = db.query(DetectionSignalModel).filter_by(case_id=case_id).count()

    from app.anomaly.explainability.llm_reasoning_engine import llm_reasoning_engine
    return llm_reasoning_engine.generate_case_executive_summary(
        case_id=case_id,
        findings=findings,
        signals_count=signals_count
    )

@router.get("/cases/{case_id}/signals")
def get_case_signals(
    case_id: str,
    limit: int = 200,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Retrieves all raw machine-generated DetectionSignals for a case.
    Used by advanced analysts, audit logging, and model debugging.
    """
    check_anomaly_access(case_id, current_user, db)
    signals = db.query(DetectionSignalModel).filter_by(case_id=case_id).order_by(DetectionSignalModel.created_at.desc()).limit(limit).all()
    return {
        "case_id": case_id,
        "total_signals": len(signals),
        "signals": [
            {
                "signal_id": s.signal_id,
                "detector_id": s.detector_id,
                "pattern_type": s.pattern_type,
                "signal_type": s.signal_type,
                "domain": s.domain,
                "entity_refs": s.entity_refs,
                "event_refs": s.event_refs,
                "evidence_refs": s.evidence_refs,
                "observations": s.observations,
                "baseline": s.baseline,
                "metrics": s.metrics,
                "normalized_score": s.normalized_score,
                "confidence": s.detector_confidence,
                "status": s.status,
                "generated_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in signals
        ]
    }

@router.get("/cases/{case_id}/findings")
def get_case_anomaly_findings(
    case_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves all investigative findings scoped to a specific case."""
    check_anomaly_access(case_id, current_user, db)
    findings = db.query(AnomalyFindingModel).filter_by(case_id=case_id).order_by(AnomalyFindingModel.unified_score.desc()).all()
    return {
        "case_id": case_id,
        "total_findings": len(findings),
        "findings": [
            {
                "finding_id": f.finding_id,
                "entity_id": f.entity_id,
                "entity_type": f.entity_type,
                "title": f.title,
                "severity": f.severity,
                "unified_score": f.unified_score,
                "confidence": f.confidence,
                "priority": f.investigative_priority,
                "domain": f.category or f.domain,
                "what_happened": f.what_happened or f.explanation,
                "why_unusual": f.why_unusual,
                "why_relevant": f.why_relevant,
                "case_relevance": f.case_relevance,
                "signals": f.signals,
                "explanation": f.what_happened or f.explanation,
                "evidence_count": len(f.evidence_refs or []),
                "detectors": f.contributing_detectors or f.detectors or []
            }
            for f in findings
        ]
    }

@router.get("/findings/{finding_id}")
@router.get("/{finding_id}")
def get_anomaly_detail(
    finding_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Retrieves complete analytical detail, narrative layers, timeline, spatial, graph,
    and evidence provenance for an investigative finding.
    """
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Investigative finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)

    return {
        "finding_id": finding.finding_id,
        "case_id": finding.case_id,
        "entity_id": finding.entity_id,
        "entity_type": finding.entity_type,
        "fingerprint": finding.fingerprint,
        "title": finding.title,
        "category": finding.category or finding.domain,
        "pattern_type": finding.pattern_type or finding.primary_detector_type,
        "severity": finding.severity,
        "unified_score": finding.unified_score,
        "confidence": finding.confidence,
        "investigative_priority": finding.investigative_priority,
        "case_relevance": finding.case_relevance or "HIGH",
        "relevance_reasons": finding.relevance_reasons or [],
        "what_happened": finding.what_happened or finding.explanation or (finding.signals[0] if finding.signals else ""),
        "why_unusual": finding.why_unusual or "Activity departs significantly from expected baseline.",
        "why_relevant": finding.why_relevant or "Directly touches case entities and investigation scope.",
        "primary_entities": finding.primary_entities or [{"entity_id": finding.entity_id, "display_name": finding.entity_id, "entity_type": finding.entity_type}],
        "related_entities": finding.related_entities or [],
        "time_range": finding.time_range or {},
        "locations": finding.locations or [],
        "domain": finding.domain,
        "primary_detector_type": finding.primary_detector_type,
        "contributing_detectors": finding.contributing_detectors or finding.detectors or [],
        "detectors": finding.detectors or finding.contributing_detectors or [],
        "detector_summary": finding.detector_summary or [],
        "signals": finding.signals,
        "supporting_observations": finding.supporting_observations or finding.signals or [],
        "supporting_signals": finding.supporting_signals or [],
        "supporting_events": finding.supporting_events or [],
        "explanation": finding.what_happened or finding.explanation,
        "metrics": finding.metrics or {},
        "graph_context": finding.graph_context or {},
        "timeline_context": finding.timeline_context or {},
        "spatial_context": finding.spatial_context or {},
        "evidence_refs": finding.evidence_refs or [],
        "canonical_event_refs": finding.canonical_event_refs or [],
        "evidence_quality": finding.evidence_quality or "HIGH",
        "technical_details": finding.technical_details or finding.model_metadata or {},
        "provenance": finding.provenance or {},
        "status": finding.status,
        "created_at": finding.created_at.isoformat() if finding.created_at else None,
        "updated_at": finding.updated_at.isoformat() if finding.updated_at else None
    }

@router.get("/findings/{finding_id}/evidence")
def get_finding_evidence(
    finding_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves verified evidence references and canonical event links for a finding."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)

    return {
        "finding_id": finding.finding_id,
        "case_id": finding.case_id,
        "evidence_refs": finding.evidence_refs or [],
        "canonical_event_refs": finding.canonical_event_refs or [],
        "supporting_events": finding.supporting_events or [],
        "evidence_quality": finding.evidence_quality or "HIGH"
    }

@router.get("/findings/{finding_id}/timeline")
def get_finding_timeline(
    finding_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves chronological event sequence and time offsets for a finding."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)

    return {
        "finding_id": finding.finding_id,
        "timeline_context": finding.timeline_context or {},
        "supporting_events": finding.supporting_events or []
    }

@router.get("/findings/{finding_id}/graph-context")
def get_finding_graph_context(
    finding_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves focused subgraph, structural broker role, and neighborhood for a finding."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)

    return {
        "finding_id": finding.finding_id,
        "graph_context": finding.graph_context or {},
        "primary_entities": finding.primary_entities or [],
        "related_entities": finding.related_entities or []
    }

@router.get("/findings/{finding_id}/spatial-context")
def get_finding_spatial_context(
    finding_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_VIEW)),
    db: Session = Depends(get_db)
):
    """Retrieves geographic waypoints and movement analysis for a finding."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)

    return {
        "finding_id": finding.finding_id,
        "spatial_context": finding.spatial_context or {},
        "locations": finding.locations or []
    }

@router.post("/findings/{finding_id}/approve")
def approve_finding(
    finding_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.FINDING_APPROVE)),
    db: Session = Depends(get_db)
):
    """Approve an investigative finding (Inspector, IPS, Superintendent, Admin)."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)
    finding.status = "APPROVED"
    db.commit()

    record_audit_event(
        action=AuditAction.FINDING_APPROVED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=finding.case_id,
        details={"finding_id": finding_id, "title": finding.title},
        ip_address=get_client_ip(request),
        db=db
    )
    return {"status": "success", "finding_id": finding_id, "state": "APPROVED"}

@router.post("/findings/{finding_id}/dismiss")
def dismiss_finding(
    finding_id: str,
    reason: Optional[str] = None,
    request: Request = None,
    current_user: UserModel = Depends(require_permission(Permissions.ANOMALY_DISMISS)),
    db: Session = Depends(get_db)
):
    """Dismiss an anomaly / false positive signal."""
    finding = db.query(AnomalyFindingModel).filter_by(finding_id=finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found.")

    check_anomaly_access(finding.case_id, current_user, db)
    finding.status = "DISMISSED"
    db.commit()

    record_audit_event(
        action=AuditAction.FINDING_DISMISSED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=finding.case_id,
        details={"finding_id": finding_id, "reason": reason},
        ip_address=get_client_ip(request) if request else None,
        db=db
    )
    return {"status": "success", "finding_id": finding_id, "state": "DISMISSED"}

