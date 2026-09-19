"""
Enterprise Audit Trail Inspection, Forensic Verification, and Certified Export Router.
Allows compliance officers, superintendents, and investigators to query the tamper-evident audit store.
Provides:
- Multi-filter audit querying with strict pagination
- Role-based case scoping (preventing IDOR)
- Cryptographic hash chain verification endpoint
- Dedicated Case Activity / Audit Timeline endpoint
- User activity inspection endpoint
- Dashboard KPI statistical summaries
- Certified export in CSV and JSON
"""

import io
import csv
import json
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, func, or_, and_

from app.core.database import get_db
from app.models.postgres_models import AuditLogModel
from app.models.iam_models import UserModel, CaseMemberModel
from app.authorization.dependencies import require_permission, require_authenticated_user, get_client_ip
from app.authorization.permissions import Permissions
from app.authorization.roles import Roles
from app.audit.audit_service import (
    record_audit_event, AuditAction, AuditResult, AuditDecision,
    verify_audit_chain, apply_retention_policy
)

router = APIRouter(prefix="/audit", tags=["Audit Trail"])

def apply_role_audit_scoping(query, current_user: UserModel, db: Session):
    """
    Enforces Role-Based Audit Visibility:
    - SYSTEM_ADMIN, AUDITOR: Full visibility across all cases and security events.
    - SUPERINTENDENT: Full visibility within unit or all operational cases.
    - IPS_OFFICER, INSPECTOR, SUB_INSPECTOR, ANALYST:
      Strictly restricted to cases they are assigned to, or actions they personally performed.
    """
    role_name = current_user.role.name if current_user.role else ""
    if role_name in (Roles.SYSTEM_ADMIN, Roles.AUDITOR, Roles.SUPERINTENDENT):
        return query

    # Get assigned case_ids for this officer
    assigned_cases = (
        db.query(CaseMemberModel.case_id)
        .filter(CaseMemberModel.user_id == current_user.id, CaseMemberModel.active == True)
        .all()
    )
    case_ids = [c[0] for c in assigned_cases]

    # Allow viewing audit records where:
    # 1. The record belongs to an assigned case, OR
    # 2. The record was performed by the officer themselves
    return query.filter(
        or_(
            AuditLogModel.case_id.in_(case_ids),
            AuditLogModel.user_id == current_user.id
        )
    )


@router.get("/logs")
def list_audit_logs(
    case_id: Optional[str] = None,
    user_id: Optional[str] = None,
    actor: Optional[str] = None,
    role: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    decision: Optional[str] = None,
    reason_code: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    session_id: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    search: Optional[str] = None,
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves filtered tamper-evident audit records.
    Applies strict role-based visibility: field officers only see assigned-case actions.
    """
    query = db.query(AuditLogModel)
    query = apply_role_audit_scoping(query, current_user, db)

    if case_id and case_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.case_id == case_id)
    if user_id and user_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.user_id == user_id)
    if actor and actor not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.actor.ilike(f"%{actor}%"))
    if role and role not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.role == role)
    if action and action not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.action == action)
    if result and result not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.result == result.upper())
    if decision and decision not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.decision == decision.upper())
    if reason_code and reason_code not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.reason_code == reason_code)
    if resource_type and resource_type not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.resource_type == resource_type)
    if resource_id and resource_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.resource_id == resource_id)
    if unit_id and unit_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.unit_id == unit_id)
    if request_id and request_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.request_id == request_id)
    if correlation_id and correlation_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.correlation_id == correlation_id)
    if session_id and session_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.session_id == session_id)
    if start_time and start_time not in ("undefined", "null", ""):
        try:
            dt_start = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            query = query.filter(AuditLogModel.timestamp >= dt_start)
        except Exception:
            pass
    if end_time and end_time not in ("undefined", "null", ""):
        try:
            dt_end = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00"))
            query = query.filter(AuditLogModel.timestamp <= dt_end)
        except Exception:
            pass
    if search and search.strip() and search not in ("undefined", "null"):
        query = query.filter(
            or_(
                AuditLogModel.actor.ilike(f"%{search}%"),
                AuditLogModel.action.ilike(f"%{search}%"),
                AuditLogModel.case_id.ilike(f"%{search}%"),
                AuditLogModel.reason.ilike(f"%{search}%"),
                AuditLogModel.audit_event_id.ilike(f"%{search}%"),
                AuditLogModel.audit_id.ilike(f"%{search}%")
            )
        )

    total = query.count()
    
    order_col = desc(AuditLogModel.timestamp) if sort_order == "desc" else asc(AuditLogModel.timestamp)
    logs = query.order_by(order_col).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [
            {
                "id": l.id,
                "audit_id": l.audit_event_id or l.audit_id or f"AUD-{l.id}",
                "audit_event_id": l.audit_event_id or l.audit_id or f"AUD-{l.id}",
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "user_id": l.user_id,
                "actor": l.actor,
                "actor_type": l.actor_type or "HUMAN_USER",
                "role": l.role,
                "organization_id": l.organization_id,
                "unit_id": l.unit_id,
                "case_id": l.case_id,
                "evidence_id": l.evidence_id,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "result": l.result or "SUCCESS",
                "decision": l.decision or "ALLOWED",
                "reason_code": l.reason_code,
                "reason": l.reason,
                "session_id": l.session_id,
                "ip_address": l.ip_address,
                "user_agent": l.user_agent,
                "endpoint": l.endpoint,
                "http_method": l.http_method,
                "details": l.details or {},
                "previous_state_hash": l.previous_state_hash,
                "new_state_hash": l.new_state_hash,
                "event_hash": l.event_hash,
                "previous_event_hash": l.previous_event_hash,
                "request_id": l.request_id,
                "correlation_id": l.correlation_id
            }
            for l in logs
        ]
    }


@router.get("/logs/{audit_id}")
def get_audit_log_detail(
    audit_id: str,
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Retrieves complete forensic detail for a single audit event."""
    log = (
        db.query(AuditLogModel)
        .filter(
            or_(
                AuditLogModel.audit_event_id == audit_id,
                AuditLogModel.audit_id == audit_id
            )
        )
        .first()
    )
    if not log:
        # Try integer ID fallback
        try:
            int_id = int(audit_id.replace("AUD-", ""))
            log = db.query(AuditLogModel).filter(AuditLogModel.id == int_id).first()
        except Exception:
            pass

    if not log:
        raise HTTPException(status_code=404, detail="Audit record not found.")

    # Enforce case membership check if applicable
    role_name = current_user.role.name if current_user.role else ""
    if role_name not in (Roles.SYSTEM_ADMIN, Roles.AUDITOR, Roles.SUPERINTENDENT):
        if log.case_id:
            is_member = db.query(CaseMemberModel).filter_by(
                case_id=log.case_id, user_id=current_user.id, active=True
            ).first()
            if not is_member and log.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="Access denied: Not authorized to inspect audit log for this case.")

    return {
        "id": log.id,
        "audit_id": log.audit_event_id or log.audit_id or f"AUD-{log.id}",
        "audit_event_id": log.audit_event_id or log.audit_id or f"AUD-{log.id}",
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        "user_id": log.user_id,
        "actor": log.actor,
        "actor_type": log.actor_type or "HUMAN_USER",
        "role": log.role,
        "organization_id": log.organization_id,
        "unit_id": log.unit_id,
        "case_id": log.case_id,
        "evidence_id": log.evidence_id,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "result": log.result or "SUCCESS",
        "decision": log.decision or "ALLOWED",
        "reason_code": log.reason_code,
        "reason": log.reason,
        "session_id": log.session_id,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "endpoint": log.endpoint,
        "http_method": log.http_method,
        "details": log.details or {},
        "previous_state_hash": log.previous_state_hash,
        "new_state_hash": log.new_state_hash,
        "event_hash": log.event_hash,
        "previous_event_hash": log.previous_event_hash,
        "audit_schema_version": log.audit_schema_version or 1,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "request_id": log.request_id,
        "correlation_id": log.correlation_id
    }


@router.get("/stats")
def get_audit_statistics(
    current_user: UserModel = Depends(require_permission(Permissions.AUDIT_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Returns dashboard overview statistics derived from actual audit logs:
    - Total actions
    - Denied actions
    - Evidence exports
    - Finding approvals
    - Administrative changes
    - Authentication failures
    - Recent security events
    """
    query = db.query(AuditLogModel)
    query = apply_role_audit_scoping(query, current_user, db)

    total_events = query.count()
    denied_actions = query.filter(or_(AuditLogModel.result == "DENIED", AuditLogModel.decision == "DENIED")).count()
    
    evidence_exports = query.filter(
        AuditLogModel.action.in_([AuditAction.EVIDENCE_EXPORTED, AuditAction.EVIDENCE_EXPORT])
    ).count()

    evidence_downloads = query.filter(
        AuditLogModel.action.in_([AuditAction.EVIDENCE_DOWNLOADED, AuditAction.EVIDENCE_DOWNLOAD])
    ).count()

    finding_approvals = query.filter(
        AuditLogModel.action == AuditAction.FINDING_APPROVED
    ).count()

    admin_changes = query.filter(
        AuditLogModel.action.in_([
            AuditAction.USER_INVITED, AuditAction.USER_UPDATED, AuditAction.USER_DISABLED,
            AuditAction.USER_ROLE_CHANGED, AuditAction.ROLE_UPDATED, AuditAction.UNIT_CHANGED
        ])
    ).count()

    auth_failures = query.filter(
        AuditLogModel.action.in_([
            AuditAction.LOGIN_FAILURE, AuditAction.MFA_FAILURE, AuditAction.NFC_AUTH_FAILED
        ])
    ).count()

    # Recent security events (latest 5 denied or failed events)
    recent_security_records = (
        query.filter(or_(AuditLogModel.result.in_(["DENIED", "FAILED"]), AuditLogModel.decision == "DENIED"))
        .order_by(desc(AuditLogModel.timestamp))
        .limit(5)
        .all()
    )

    return {
        "total_events": total_events,
        "denied_actions": denied_actions,
        "evidence_exports": evidence_exports,
        "evidence_downloads": evidence_downloads,
        "finding_approvals": finding_approvals,
        "admin_changes": admin_changes,
        "auth_failures": auth_failures,
        "recent_security_events": [
            {
                "audit_id": r.audit_event_id or r.audit_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "actor": r.actor,
                "role": r.role,
                "action": r.action,
                "case_id": r.case_id,
                "result": r.result,
                "reason": r.reason or r.reason_code,
                "ip_address": r.ip_address
            }
            for r in recent_security_records
        ]
    }


@router.get("/verify")
def verify_audit_integrity(
    limit: int = Query(5000, ge=10, le=10000),
    current_user: UserModel = Depends(require_permission(Permissions.AUDIT_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Internal Verification Engine endpoint.
    Recalculates SHA-256 cryptographic hash chaining across all persisted audit events.
    Detects any database tampering, record injection, or unauthorized modifications.
    """
    verification_result = verify_audit_chain(db, limit=limit)
    return verification_result


@router.get("/cases/{case_id}/timeline")
def get_case_activity_timeline(
    case_id: str,
    action_filter: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """
    Dedicated Case Activity / Audit Timeline endpoint.
    Returns chronological platform operations performed on the case dossier.
    Strictly distinct from the evidence investigative timeline.
    """
    # Enforce case authorization
    role_name = current_user.role.name if current_user.role else ""
    if role_name not in (Roles.SYSTEM_ADMIN, Roles.AUDITOR, Roles.SUPERINTENDENT):
        is_member = db.query(CaseMemberModel).filter_by(
            case_id=case_id, user_id=current_user.id, active=True
        ).first()
        if not is_member and role_name != Roles.IPS_OFFICER:
            raise HTTPException(status_code=403, detail=f"Access denied: Not authorized for case '{case_id}'")

    query = db.query(AuditLogModel).filter(AuditLogModel.case_id == case_id)
    if action_filter and action_filter not in ("undefined", "null", "all", ""):
        query = query.filter(AuditLogModel.action == action_filter)

    records = query.order_by(desc(AuditLogModel.timestamp)).limit(limit).all()

    return {
        "case_id": case_id,
        "total_records": len(records),
        "activities": [
            {
                "audit_id": r.audit_event_id or r.audit_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "actor": r.actor,
                "actor_type": r.actor_type or "HUMAN_USER",
                "role": r.role,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "result": r.result,
                "decision": r.decision,
                "reason": r.reason,
                "details": r.details or {},
                "ip_address": r.ip_address
            }
            for r in records
        ]
    }


@router.get("/users/{user_id}/activity")
def get_user_activity(
    user_id: str,
    limit: int = Query(100, ge=1, le=500),
    current_user: UserModel = Depends(require_permission(Permissions.AUDIT_VIEW)),
    db: Session = Depends(get_db)
):
    """
    User Activity View:
    Returns recent actions, cases accessed, evidence accessed, exports, and denied attempts for an officer.
    """
    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    records = (
        db.query(AuditLogModel)
        .filter(AuditLogModel.user_id == user_id)
        .order_by(desc(AuditLogModel.timestamp))
        .limit(limit)
        .all()
    )

    cases_accessed = set()
    evidence_accessed = set()
    exports_count = 0
    denied_count = 0

    for r in records:
        if r.case_id:
            cases_accessed.add(r.case_id)
        if r.evidence_id:
            evidence_accessed.add(r.evidence_id)
        if "EXPORT" in r.action:
            exports_count += 1
        if r.result in ("DENIED", "FAILED") or r.decision == "DENIED":
            denied_count += 1

    return {
        "user": {
            "id": target_user.id,
            "employee_id": target_user.employee_id,
            "full_name": target_user.full_name,
            "official_email": target_user.official_email,
            "role": target_user.role.name if target_user.role else None,
            "status": target_user.status
        },
        "metrics": {
            "total_actions": len(records),
            "unique_cases_accessed": len(cases_accessed),
            "unique_evidence_accessed": len(evidence_accessed),
            "exports_performed": exports_count,
            "denied_attempts": denied_count
        },
        "recent_actions": [
            {
                "audit_id": r.audit_event_id or r.audit_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "action": r.action,
                "case_id": r.case_id,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "result": r.result,
                "reason": r.reason
            }
            for r in records[:30]
        ]
    }


@router.get("/export")
def export_audit_logs(
    request: Request,
    format: str = Query("csv", pattern="^(csv|json)$"),
    case_id: Optional[str] = None,
    action: Optional[str] = None,
    current_user: UserModel = Depends(require_permission(Permissions.AUDIT_EXPORT)),
    db: Session = Depends(get_db)
):
    """
    Exports audit records with cryptographic chain of custody references.
    This sensitive operation is strictly audited.
    """
    query = db.query(AuditLogModel)
    query = apply_role_audit_scoping(query, current_user, db)

    if case_id and case_id not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.case_id == case_id)
    if action and action not in ("undefined", "null", ""):
        query = query.filter(AuditLogModel.action == action)

    records = query.order_by(desc(AuditLogModel.timestamp)).limit(5000).all()

    # Record the export itself in the audit store
    record_audit_event(
        action=AuditAction.AUDIT_EXPORTED,
        result=AuditResult.SUCCESS,
        decision=AuditDecision.ALLOWED,
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=case_id,
        details={"record_count": len(records), "format": format},
        ip_address=get_client_ip(request),
        db=db
    )

    if format == "json":
        return [
            {
                "audit_event_id": r.audit_event_id or r.audit_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "actor": r.actor,
                "actor_type": r.actor_type or "HUMAN_USER",
                "role": r.role,
                "action": r.action,
                "case_id": r.case_id,
                "result": r.result,
                "decision": r.decision or "ALLOWED",
                "reason_code": r.reason_code,
                "reason": r.reason,
                "ip_address": r.ip_address,
                "request_id": r.request_id,
                "event_hash": r.event_hash,
                "details": r.details or {}
            }
            for r in records
        ]

    # Return CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Audit Event ID", "Timestamp (UTC)", "Actor", "Actor Type", "Role", "Action",
        "Case ID", "Resource Type", "Resource ID", "Result", "Decision", "Reason Code", "Reason", "IP Address", "Request ID", "Event Hash"
    ])
    for r in records:
        writer.writerow([
            r.audit_event_id or r.audit_id or f"AUD-{r.id}",
            r.timestamp.isoformat() if r.timestamp else "",
            r.actor,
            r.actor_type or "HUMAN_USER",
            r.role or "",
            r.action,
            r.case_id or "",
            r.resource_type or "",
            r.resource_id or "",
            r.result or "SUCCESS",
            r.decision or "ALLOWED",
            r.reason_code or "",
            r.reason or "",
            r.ip_address or "",
            r.request_id or "",
            r.event_hash or ""
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=trace_certified_audit_trail.csv"}
    )


@router.post("/retention/apply")
def apply_retention(
    request: Request,
    retention_days: int = Query(365, ge=30, le=3650),
    current_user: UserModel = Depends(require_permission(Permissions.ROLE_MANAGE)),
    db: Session = Depends(get_db)
):
    """
    Applies statutory audit retention policy: prunes records older than specified days.
    Strictly restricted to System Administrator.
    This operation is itself permanently logged.
    """
    result = apply_retention_policy(db, retention_days=retention_days, admin_user=current_user.official_email)
    return {
        "status": "success",
        "message": f"Retention policy applied. Pruned records older than {retention_days} days.",
        "details": result
    }
