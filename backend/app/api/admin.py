"""
Security and User Administration API Router.
Provides:
- User directory and officer provisioning
- Invitation-based onboarding (no unrestricted public signup)
- Role and unit management
- Session revocation and account suspension
- Audited administrative operations
"""

import uuid
import secrets
import hashlib
import datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import (
    UserModel, RoleModel, UnitModel, OrganizationModel,
    InvitationModel, PermissionModel, RolePermissionModel, SessionModel
)
from app.authorization.dependencies import require_permission, get_client_ip
from app.authorization.permissions import Permissions
from app.authorization.roles import Roles
from app.audit.audit_service import record_audit_event, AuditAction
from app.auth.session import revoke_all_user_sessions

router = APIRouter(prefix="/admin", tags=["Security Administration"])

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

# === Request Schemas ===
class InviteOfficerRequest(BaseModel):
    full_name: str
    employee_id: str
    official_email: str
    role_id: str
    organization_id: Optional[str] = None
    unit_id: Optional[str] = None

class UpdateUserStatusRequest(BaseModel):
    status: str  # ACTIVE, SUSPENDED, DISABLED

class UpdateUserRoleRequest(BaseModel):
    role_id: str

class UpdateUserUnitRequest(BaseModel):
    unit_id: str

class CreateUnitRequest(BaseModel):
    organization_id: str
    code: str
    name: str
    description: Optional[str] = None


@router.get("/users")
def list_users(
    role: Optional[str] = None,
    unit: Optional[str] = None,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: UserModel = Depends(require_permission(Permissions.USER_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists officers and accounts with role, unit, status, and MFA enrollment state."""
    query = db.query(UserModel)

    effective_status = status_filter or status
    if role and role.upper() != "UNDEFINED" and role.strip():
        query = query.join(RoleModel).filter(RoleModel.name == role.strip())
    if unit and unit.upper() != "UNDEFINED" and unit.strip():
        query = query.filter(UserModel.unit_id == unit.strip())
    if effective_status and effective_status.upper() != "UNDEFINED" and effective_status.strip():
        query = query.filter(UserModel.status == effective_status.strip().upper())
    if search and search.lower() != "undefined" and search.strip():
        clean_search = search.strip()
        query = query.filter(
            (UserModel.full_name.ilike(f"%{clean_search}%")) |
            (UserModel.employee_id.ilike(f"%{clean_search}%")) |
            (UserModel.official_email.ilike(f"%{clean_search}%"))
        )

    users = query.order_by(UserModel.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "employee_id": u.employee_id,
            "full_name": u.full_name,
            "official_email": u.official_email,
            "phone_number": u.phone_number,
            "role_id": u.role_id,
            "role": u.role.name if u.role else None,
            "role_display": u.role.display_name if u.role else None,
            "unit_id": u.unit_id,
            "unit": u.unit.name if u.unit else None,
            "unit_code": u.unit.code if u.unit else None,
            "status": u.status,
            "mfa_enabled": u.mfa_enabled,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "locked_until": u.locked_until.isoformat() if u.locked_until else None
        }
        for u in users
    ]


@router.post("/users/invite")
def invite_officer(
    payload: InviteOfficerRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_CREATE)),
    db: Session = Depends(get_db)
):
    """
    Invites a new law enforcement officer.
    Generates a secure, expiring single-use token.
    Public signup is prohibited.
    """
    email_clean = payload.official_email.lower().strip()
    emp_clean = payload.employee_id.upper().strip()

    # Check for duplicates
    existing_user = (
        db.query(UserModel)
        .filter((UserModel.official_email == email_clean) | (UserModel.employee_id == emp_clean))
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail=f"An officer with this email or employee ID already exists ({existing_user.employee_id})."
        )

    role = db.query(RoleModel).filter_by(id=payload.role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Selected role not found.")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = utcnow() + datetime.timedelta(hours=72)

    invitation = InvitationModel(
        token_hash=token_hash,
        official_email=email_clean,
        employee_id=emp_clean,
        full_name=payload.full_name.strip(),
        role_id=role.id,
        organization_id=payload.organization_id,
        unit_id=payload.unit_id,
        invited_by=current_user.employee_id,
        status="PENDING",
        expires_at=expires_at
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    record_audit_event(
        action=AuditAction.USER_INVITED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        details={
            "invited_email": email_clean,
            "invited_employee_id": emp_clean,
            "assigned_role": role.name
        },
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "invitation_id": invitation.id,
        "token": raw_token,
        "invite_link": f"/invite/accept?token={raw_token}",
        "expires_at": expires_at.isoformat(),
        "message": f"Invitation issued for {payload.full_name} ({role.name})."
    }


@router.get("/users/invitations")
def list_invitations(
    current_user: UserModel = Depends(require_permission(Permissions.USER_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists pending and historical invitations."""
    invitations = db.query(InvitationModel).order_by(InvitationModel.created_at.desc()).all()
    roles = {r.id: r.name for r in db.query(RoleModel).all()}
    units = {u.id: u.name for u in db.query(UnitModel).all()}

    return [
        {
            "id": inv.id,
            "official_email": inv.official_email,
            "employee_id": inv.employee_id,
            "full_name": inv.full_name,
            "role": roles.get(inv.role_id, "Unknown"),
            "unit": units.get(inv.unit_id, "None"),
            "invited_by": inv.invited_by,
            "status": inv.status,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
            "is_expired": inv.expires_at < utcnow() and inv.status == "PENDING"
        }
        for inv in invitations
    ]


@router.delete("/users/invitations/{invitation_id}")
def revoke_invitation(
    invitation_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_CREATE)),
    db: Session = Depends(get_db)
):
    """Revokes a pending invitation."""
    inv = db.query(InvitationModel).filter_by(id=invitation_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    inv.status = "REVOKED"
    inv.revoked_at = utcnow()
    db.commit()

    record_audit_event(
        action=AuditAction.USER_UPDATED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"revoked_invitation": inv.official_email},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": f"Invitation for {inv.official_email} revoked."}


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: str,
    payload: UpdateUserStatusRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_DISABLE)),
    db: Session = Depends(get_db)
):
    """Enables, suspends, or disables an officer account."""
    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_status = payload.status.upper()
    if new_status not in ("ACTIVE", "SUSPENDED", "DISABLED"):
        raise HTTPException(status_code=400, detail="Status must be ACTIVE, SUSPENDED, or DISABLED.")

    prev_status = target_user.status
    target_user.status = new_status
    if new_status in ("SUSPENDED", "DISABLED"):
        target_user.deactivated_at = utcnow()
        # Revoke all active sessions immediately
        revoke_all_user_sessions(db, target_user.id)
    else:
        target_user.deactivated_at = None
        target_user.locked_until = None
        target_user.failed_login_count = 0
    db.commit()

    record_audit_event(
        action=AuditAction.USER_DISABLED if new_status != "ACTIVE" else AuditAction.USER_ENABLED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"target_user": target_user.employee_id, "previous": prev_status, "new": new_status},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": f"User {target_user.employee_id} status updated to {new_status}."}


@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Formally approves a pending officer registration.
    Statutory authority is restricted to System Administrators and Superintendents of Police (SP).
    """
    if not current_user.role or current_user.role.name not in (Roles.SYSTEM_ADMIN, Roles.SUPERINTENDENT):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Statutory approval requires System Administrator or Superintendent (SP) clearance."
        )

    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Officer account not found.")

    if target_user.status == "ACTIVE":
        return {"status": "success", "message": f"Officer {target_user.employee_id} is already active."}

    prev_status = target_user.status
    target_user.status = "ACTIVE"
    target_user.deactivated_at = None
    target_user.locked_until = None
    target_user.failed_login_count = 0
    db.commit()

    record_audit_event(
        action=AuditAction.USER_ENABLED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        details={
            "approved_officer_id": target_user.id,
            "approved_employee_id": target_user.employee_id,
            "approved_email": target_user.official_email,
            "previous_status": prev_status,
            "action": "OFFICER_COMMISSION_APPROVED"
        },
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "message": f"Officer commission for {target_user.full_name} ({target_user.employee_id}) approved successfully."
    }


@router.post("/users/{user_id}/reject")
def reject_user(
    user_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Rejects a pending officer registration.
    Statutory authority is restricted to System Administrators and Superintendents of Police (SP).
    """
    if not current_user.role or current_user.role.name not in (Roles.SYSTEM_ADMIN, Roles.SUPERINTENDENT):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Statutory approval requires System Administrator or Superintendent (SP) clearance."
        )

    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Officer account not found.")

    prev_status = target_user.status
    target_user.status = "REJECTED"
    target_user.deactivated_at = utcnow()
    revoke_all_user_sessions(db, target_user.id)
    db.commit()

    record_audit_event(
        action=AuditAction.USER_DISABLED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        details={
            "rejected_officer_id": target_user.id,
            "rejected_employee_id": target_user.employee_id,
            "rejected_email": target_user.official_email,
            "previous_status": prev_status,
            "action": "OFFICER_COMMISSION_REJECTED"
        },
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "message": f"Officer commission for {target_user.full_name} ({target_user.employee_id}) has been rejected."
    }


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: UpdateUserRoleRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.ROLE_MANAGE)),
    db: Session = Depends(get_db)
):
    """Reassigns an officer to a new system or operational role."""
    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_role = db.query(RoleModel).filter_by(id=payload.role_id).first()
    if not new_role:
        raise HTTPException(status_code=404, detail="Role not found.")

    prev_role_name = target_user.role.name if target_user.role else "None"
    target_user.role_id = new_role.id
    db.commit()

    record_audit_event(
        action=AuditAction.ROLE_CHANGED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"target_user": target_user.employee_id, "previous_role": prev_role_name, "new_role": new_role.name},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": f"User {target_user.employee_id} role updated to {new_role.name}."}


@router.patch("/users/{user_id}/unit")
def update_user_unit(
    user_id: str,
    payload: UpdateUserUnitRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """Transfers an officer to a different operational unit."""
    target_user = db.query(UserModel).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    unit = db.query(UnitModel).filter_by(id=payload.unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found.")

    prev_unit_name = target_user.unit.name if target_user.unit else "None"
    target_user.unit_id = unit.id
    target_user.organization_id = unit.organization_id
    db.commit()

    record_audit_event(
        action=AuditAction.UNIT_CHANGED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"target_user": target_user.employee_id, "previous_unit": prev_unit_name, "new_unit": unit.name},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": f"User {target_user.employee_id} transferred to {unit.name}."}


@router.post("/users/{user_id}/revoke-sessions")
def force_revoke_sessions(
    user_id: str,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.SESSION_REVOKE)),
    db: Session = Depends(get_db)
):
    """Forcefully terminates all active sessions for an officer."""
    count = revoke_all_user_sessions(db, user_id)
    record_audit_event(
        action=AuditAction.SESSION_REVOKED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"target_user_id": user_id, "sessions_revoked": count},
        ip_address=get_client_ip(request),
        db=db
    )
    return {"status": "success", "revoked_count": count, "message": f"Terminated {count} active sessions."}


@router.get("/roles")
def list_roles(
    current_user: UserModel = Depends(require_permission(Permissions.ROLE_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists all canonical roles and their granted permissions."""
    roles = db.query(RoleModel).all()
    result = []
    for r in roles:
        perms = (
            db.query(PermissionModel.name)
            .join(RolePermissionModel, RolePermissionModel.permission_id == PermissionModel.id)
            .filter(RolePermissionModel.role_id == r.id)
            .all()
        )
        result.append({
            "id": r.id,
            "name": r.name,
            "display_name": r.display_name,
            "description": r.description,
            "permissions": [p[0] for p in perms]
        })
    return result


@router.get("/units")
def list_units(
    current_user: UserModel = Depends(require_permission(Permissions.USER_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists all operational units grouped by organization."""
    orgs = db.query(OrganizationModel).all()
    return [
        {
            "id": o.id,
            "code": o.code,
            "name": o.name,
            "units": [
                {
                    "id": u.id,
                    "code": u.code,
                    "name": u.name,
                    "description": u.description
                }
                for u in o.units
            ]
        }
        for o in orgs
    ]


@router.post("/units")
def create_unit(
    payload: CreateUnitRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_CREATE)),
    db: Session = Depends(get_db)
):
    """Creates a new operational unit within an organization."""
    org = db.query(OrganizationModel).filter_by(id=payload.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    new_unit = UnitModel(
        organization_id=org.id,
        code=payload.code.upper().strip(),
        name=payload.name.strip(),
        description=payload.description
    )
    db.add(new_unit)
    db.commit()
    db.refresh(new_unit)

    record_audit_event(
        action=AuditAction.USER_UPDATED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"created_unit": new_unit.code, "name": new_unit.name},
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "unit": {"id": new_unit.id, "code": new_unit.code, "name": new_unit.name}}
