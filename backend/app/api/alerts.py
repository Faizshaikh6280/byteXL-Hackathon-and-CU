from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import UserModel
from app.models.postgres_models import AlertModel, CaseModel
from app.services.cep_engine import cep_engine
from app.authorization.dependencies import require_permission, get_current_user, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(prefix="/api/v1/alerts", tags=["Automated Alerts"])

class TriageRequest(BaseModel):
    status: str  # INVESTIGATING, ASSIGNED, DISMISSED
    notes: Optional[str] = None

@router.post("/evaluate")
def evaluate_alerts(
    case_id: Optional[str] = None,
    request: Request = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes sliding-window Complex Event Processing (CEP) across CDR, Banking, and IPDR events.
    Detects Triple Collision Burst, Spatio-Temporal Jump, Pass-Through Mule, and Synchronous Bot Action.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active case found.")
        target_case_id = c.case_id

    alerts = cep_engine.evaluate_case_alerts(case_id=target_case_id)
    
    actor_name = current_user.official_email if current_user else "SYSTEM"
    record_audit_event(
        action=AuditAction.ALERT_TRIAGE,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=actor_name,
        case_id=target_case_id,
        resource_type="ALERT",
        details={"alerts_evaluated": len(alerts)},
        ip_address=get_client_ip(request) if request else None,
        db=db
    )

    return {
        "status": "success",
        "case_id": target_case_id,
        "total_alerts": len(alerts),
        "alerts": alerts
    }

@router.get("")
def list_alerts(
    case_id: Optional[str] = None,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists alerts for the given case with optional status and risk filters."""
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {"alerts": [], "total": 0}
        target_case_id = c.case_id

    # If no alerts exist yet for this case, run auto-evaluation once
    existing_count = db.query(AlertModel).filter_by(case_id=target_case_id).count()
    if existing_count == 0:
        cep_engine.evaluate_case_alerts(case_id=target_case_id)

    query = db.query(AlertModel).filter_by(case_id=target_case_id)
    if status and status.upper() != "ALL":
        query = query.filter(AlertModel.status == status.upper())
    if risk_level and risk_level.upper() != "ALL":
        query = query.filter(AlertModel.risk_level == risk_level.upper())

    alerts = query.order_by(AlertModel.risk_score.desc()).all()

    return {
        "case_id": target_case_id,
        "total": len(alerts),
        "alerts": [
            {
                "alert_id": a.alert_id,
                "case_id": a.case_id,
                "pattern_name": a.pattern_name,
                "entity_id": a.entity_id,
                "entity_name": a.entity_name,
                "risk_level": a.risk_level,
                "risk_score": a.risk_score,
                "status": a.status,
                "evidence_narrative": a.evidence_narrative,
                "micro_timeline": a.micro_timeline,
                "metadata_info": a.metadata_info,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "triaged_at": a.triaged_at.isoformat() if a.triaged_at else None,
                "triaged_by": a.triaged_by
            }
            for a in alerts
        ]
    }

@router.patch("/{alert_id}/triage")
def triage_alert(
    alert_id: str,
    payload: TriageRequest,
    request: Request,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates the triage status of an automated alert (INVESTIGATING, ASSIGNED, DISMISSED)."""
    investigator_id = current_user.official_email if current_user else "SYSTEM_INVESTIGATOR"
    res = cep_engine.update_triage_status(
        alert_id=alert_id,
        new_status=payload.status,
        investigator_id=investigator_id
    )
    if not res:
        raise HTTPException(status_code=404, detail="Alert not found.")

    record_audit_event(
        action=AuditAction.ALERT_TRIAGE,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=investigator_id,
        resource_type="ALERT",
        resource_id=alert_id,
        details={"new_status": payload.status, "notes": payload.notes},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "alert": res}
