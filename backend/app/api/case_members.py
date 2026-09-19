"""
Case-Scoped Investigator Access and Membership API Router.
Controls:
- Listing assigned investigators on a case
- Assigning investigators and analysts with granular case roles
- Modifying and revoking case memberships
- Full audit logging for chain-of-custody compliance
"""

import datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import CaseMemberModel, UserModel, RoleModel
from app.models.postgres_models import CaseModel
from app.authorization.dependencies import require_case_access, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(prefix="/cases/{case_id}/members", tags=["Case Access Management"])

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class AssignMemberRequest(BaseModel):
    user_id: str  # user UUID or employee_id
    case_role: str = "INVESTIGATOR"  # OWNER, LEAD_INVESTIGATOR, INVESTIGATOR, ANALYST, REVIEWER, AUDITOR

class UpdateMemberRoleRequest(BaseModel):
    case_role: str

@router.get("")
def list_case_members(
    case_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.CASE_READ)),
    db: Session = Depends(get_db)
):
    """Lists all investigators and analysts assigned to the case dossier."""
    members = (
        db.query(CaseMemberModel)
        .filter_by(case_id=case_id)
        .all()
    )

    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "employee_id": m.user.employee_id if m.user else "Unknown",
            "full_name": m.user.full_name if m.user else "Unknown",
            "official_email": m.user.official_email if m.user else "Unknown",
            "system_role": m.user.role.name if m.user and m.user.role else "Unknown",
            "unit": m.user.unit.name if m.user and m.user.unit else "Unknown",
            "case_role": m.case_role,
            "assigned_by": m.assigned_by,
            "assigned_at": m.assigned_at.isoformat() if m.assigned_at else None,
            "active": m.active,
            "revoked_at": m.revoked_at.isoformat() if m.revoked_at else None
        }
        for m in members
    ]


@router.post("")
def assign_member_to_case(
    case_id: str,
    payload: AssignMemberRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CASE_ASSIGN)),
    db: Session = Depends(get_db)
):
    """Assigns an officer to the case with an operational role."""
    target_user = (
        db.query(UserModel)
        .filter((UserModel.id == payload.user_id) | (UserModel.employee_id == payload.user_id.upper()))
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="Target officer not found.")

    valid_roles = {"OWNER", "LEAD_INVESTIGATOR", "INVESTIGATOR", "ANALYST", "REVIEWER", "AUDITOR"}
    if payload.case_role.upper() not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Case role must be one of {valid_roles}")

    existing = (
        db.query(CaseMemberModel)
        .filter_by(case_id=case_id, user_id=target_user.id)
        .first()
    )

    if existing:
        existing.case_role = payload.case_role.upper()
        existing.active = True
        existing.revoked_at = None
        existing.assigned_by = current_user.employee_id
        existing.assigned_at = utcnow()
    else:
        member = CaseMemberModel(
            case_id=case_id,
            user_id=target_user.id,
            case_role=payload.case_role.upper(),
            assigned_by=current_user.employee_id,
            assigned_at=utcnow(),
            active=True
        )
        db.add(member)

    db.commit()

    record_audit_event(
        action=AuditAction.CASE_ASSIGNED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=case_id,
        details={
            "assigned_officer": target_user.employee_id,
            "case_role": payload.case_role.upper()
        },
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "message": f"Officer {target_user.full_name} ({target_user.employee_id}) assigned to case {case_id} as {payload.case_role.upper()}."
    }


@router.delete("/{target_user_id}")
def revoke_case_membership(
    case_id: str,
    target_user_id: str,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CASE_ASSIGN)),
    db: Session = Depends(get_db)
):
    """Revokes an officer's access to this case dossier."""
    member = (
        db.query(CaseMemberModel)
        .filter(
            CaseMemberModel.case_id == case_id,
            (CaseMemberModel.user_id == target_user_id) |
            (CaseMemberModel.id == target_user_id)
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Membership record not found.")

    member.active = False
    member.revoked_at = utcnow()
    db.commit()

    record_audit_event(
        action=AuditAction.CASE_ACCESS_REVOKED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=case_id,
        details={"revoked_user_id": target_user_id},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": f"Access to case {case_id} revoked for officer."}
