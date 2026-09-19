"""
Authentication, MFA, and Session Management API Router.
Handles:
- POST /api/auth/login
- POST /api/auth/mfa/verify
- POST /api/auth/mfa/setup
- POST /api/auth/mfa/confirm
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/password/change
- POST /api/auth/password/reset/request
- POST /api/auth/password/reset/confirm
- POST /api/auth/invite/accept
- GET  /api/auth/sessions
- DELETE /api/auth/sessions/{session_id}
"""

import os
import time
import secrets
import hashlib
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import (
    UserModel, RoleModel, UnitModel, OrganizationModel,
    SessionModel, MFACredentialModel, InvitationModel,
    PasswordResetTokenModel, CaseMemberModel
)
from app.auth.password import hash_password, verify_password, validate_password_complexity
from app.auth.mfa import totp_service
from app.auth.session import (
    create_user_session, revoke_session, revoke_all_user_sessions,
    set_session_cookie, clear_session_cookie, SESSION_COOKIE_NAME, hash_session_token
)
from app.auth.rate_limiter import (
    check_ip_rate_limit, check_account_lockout,
    record_failed_login, record_successful_login
)
from app.authorization.dependencies import get_current_user, require_authenticated_user, get_client_ip
from app.authorization.policy import get_user_permissions
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])

# Temporary in-memory MFA challenge storage: challenge_token -> {user_id, expires_at}
_mfa_challenges: Dict[str, Dict[str, Any]] = {}

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

# === Request Schemas ===
class LoginRequest(BaseModel):
    identifier: str  # Email or Employee ID
    password: str

class MFAVerifyRequest(BaseModel):
    challenge_token: str
    code: str

class MFAConfirmRequest(BaseModel):
    code: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class PasswordResetRequest(BaseModel):
    identifier: str

class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str

class InviteAcceptRequest(BaseModel):
    token: str
    password: str

class RegisterRequest(BaseModel):
    employee_id: str
    full_name: str
    official_email: str
    password: str
    role_name: Optional[str] = "SUB_INSPECTOR"
    unit_id: Optional[str] = None
    phone_number: Optional[str] = None


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Authenticates an officer by official email or employee ID and password.
    Returns session cookie or MFA challenge if 2FA is enabled.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    req_id = request.headers.get("X-Request-ID")
    corr_id = request.headers.get("X-Correlation-ID")

    # 1. IP Rate Limiting Check
    allowed, retry_after = check_ip_rate_limit(client_ip)
    if not allowed:
        record_audit_event(
            action=AuditAction.RATE_LIMIT_EXCEEDED,
            result="DENIED",
            actor=payload.identifier,
            ip_address=client_ip,
            reason=f"IP rate limit exceeded, retry after {retry_after}s",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please try again in {retry_after} seconds."
        )

    # 2. Look up user by email or employee ID
    ident = payload.identifier.strip()
    user = (
        db.query(UserModel)
        .filter((UserModel.official_email == ident.lower()) | (UserModel.employee_id == ident.upper()))
        .first()
    )

    if not user:
        record_audit_event(
            action=AuditAction.LOGIN_FAILURE,
            result="FAILED",
            actor=ident,
            ip_address=client_ip,
            user_agent=user_agent,
            reason="User not found",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your official email/employee ID and password."
        )

    # 3. Check Account Lockout
    is_locked, remaining_sec = check_account_lockout(user)
    if is_locked:
        record_audit_event(
            action=AuditAction.ACCESS_DENIED,
            result="DENIED",
            user_id=user.id,
            actor=user.official_email,
            role=user.role.name if user.role else None,
            ip_address=client_ip,
            reason=f"Account temporarily locked for {remaining_sec}s",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is temporarily locked due to multiple failed attempts. Try again in {remaining_sec // 60 + 1} minutes."
        )

    # 4. Check Account Status
    if user.status != "ACTIVE":
        detail_msg = f"Account is currently {user.status.lower()}. Please contact your system administrator."
        if user.status == "PENDING_APPROVAL":
            detail_msg = "Account registration is pending statutory approval by the System Administrator or Superintendent of Police (SP). Please wait for approval before signing in."
        record_audit_event(
            action=AuditAction.ACCESS_DENIED,
            result="DENIED",
            user_id=user.id,
            actor=user.official_email,
            role=user.role.name if user.role else None,
            ip_address=client_ip,
            reason=f"Account status is {user.status}",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail_msg
        )

    # 5. Verify Password
    if not verify_password(payload.password, user.password_hash):
        is_now_locked, lock_sec = record_failed_login(db, user)
        record_audit_event(
            action=AuditAction.LOGIN_FAILURE,
            result="FAILED",
            user_id=user.id,
            actor=user.official_email,
            role=user.role.name if user.role else None,
            ip_address=client_ip,
            user_agent=user_agent,
            reason="Incorrect password" + (" - Account locked" if is_now_locked else ""),
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        if is_now_locked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Too many failed login attempts. Account locked for {lock_sec // 60} minutes."
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your official email/employee ID and password."
        )

    # 6. Check if MFA is required
    if user.mfa_enabled:
        challenge_token = secrets.token_urlsafe(32)
        _mfa_challenges[challenge_token] = {
            "user_id": user.id,
            "expires_at": time.time() + 300  # 5 minutes
        }
        return {
            "mfa_required": True,
            "challenge_token": challenge_token,
            "message": "Two-Factor Authentication required. Enter the 6-digit code from your authenticator app."
        }

    # 7. MFA not required -> create session and issue cookie
    record_successful_login(db, user)
    raw_token, session_rec = create_user_session(db, user.id, client_ip, user_agent)
    set_session_cookie(response, raw_token)

    record_audit_event(
        action=AuditAction.LOGIN_SUCCESS,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        role=user.role.name if user.role else None,
        organization_id=user.organization_id,
        unit_id=user.unit_id,
        ip_address=client_ip,
        user_agent=user_agent,
        request_id=req_id,
        correlation_id=corr_id,
        db=db
    )

    # Load active case memberships
    memberships = (
        db.query(CaseMemberModel)
        .filter_by(user_id=user.id, active=True)
        .all()
    )

    return {
        "status": "AUTHENTICATED",
        "mfa_required": False,
        "user": {
            "id": user.id,
            "employee_id": user.employee_id,
            "full_name": user.full_name,
            "email": user.official_email,
            "official_email": user.official_email,
            "role": user.role.name if user.role else None,
            "role_display": user.role.display_name if user.role else None,
            "unit": user.unit.name if user.unit else None,
            "unit_code": user.unit.code if user.unit else None,
            "status": user.status,
            "mfa_enabled": user.mfa_enabled
        },
        "permissions": list(get_user_permissions(db, user)),
        "case_memberships": [{"case_id": m.case_id, "case_role": m.case_role} for m in memberships]
    }


@router.post("/register")
def register_officer(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Registers a new officer account directly from the UI.
    Validates credentials, creates user with status ACTIVE, and creates an authenticated session.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    email_clean = payload.official_email.lower().strip()
    emp_clean = payload.employee_id.upper().strip()

    if not email_clean or not emp_clean or not payload.full_name.strip():
        raise HTTPException(status_code=400, detail="Employee ID, Full Name, and Official Email are required.")

    # 1. Check for duplicates
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

    # 2. Validate password complexity
    valid, reason = validate_password_complexity(payload.password)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    # 3. Resolve Role
    target_role_name = (payload.role_name or "SUB_INSPECTOR").strip().upper()
    role = db.query(RoleModel).filter_by(name=target_role_name).first()
    if not role:
        role = db.query(RoleModel).filter_by(name="SUB_INSPECTOR").first()
    if not role:
        role = db.query(RoleModel).first()

    # 4. Resolve Unit & Organization
    unit = None
    if payload.unit_id:
        unit = db.query(UnitModel).filter_by(id=payload.unit_id).first()
    if not unit:
        unit = db.query(UnitModel).first()
    org_id = unit.organization_id if unit else None

    # 5. Create user in PENDING_APPROVAL status (requires Admin/SP approval)
    user = UserModel(
        employee_id=emp_clean,
        full_name=payload.full_name.strip(),
        official_email=email_clean,
        phone_number=payload.phone_number.strip() if payload.phone_number else None,
        password_hash=hash_password(payload.password),
        role_id=role.id if role else None,
        organization_id=org_id,
        unit_id=unit.id if unit else None,
        status="PENDING_APPROVAL",
        mfa_enabled=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    record_audit_event(
        action=AuditAction.USER_CREATED,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        role=user.role.name if user.role else None,
        organization_id=user.organization_id,
        unit_id=user.unit_id,
        ip_address=client_ip,
        user_agent=user_agent,
        details={"self_registered": True, "badge": emp_clean, "status": "PENDING_APPROVAL"},
        db=db
    )

    return {
        "status": "PENDING_APPROVAL",
        "mfa_required": False,
        "message": "Officer registration submitted successfully. Your account is pending statutory approval by the System Administrator or Superintendent of Police (SP). Once approved, you will be able to log in with your credentials.",
        "employee_id": emp_clean,
        "full_name": user.full_name,
        "official_email": user.official_email,
        "role_display": role.display_name if role else "Investigator"
    }


@router.post("/mfa/verify")
def verify_mfa(
    payload: MFAVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Verifies a 6-digit TOTP code or backup code against an active login challenge."""
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    req_id = request.headers.get("X-Request-ID")
    corr_id = request.headers.get("X-Correlation-ID")

    challenge = _mfa_challenges.get(payload.challenge_token)
    if not challenge or challenge["expires_at"] < time.time():
        if payload.challenge_token in _mfa_challenges:
            del _mfa_challenges[payload.challenge_token]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA challenge session expired. Please log in again."
        )

    user = db.query(UserModel).filter_by(id=challenge["user_id"]).first()
    if not user or user.status != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account inactive.")

    mfa_cred = db.query(MFACredentialModel).filter_by(user_id=user.id).first()
    if not mfa_cred:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA credentials not found.")

    # 1. Try TOTP code
    secret_base32 = totp_service.decrypt_secret(mfa_cred.secret_encrypted)
    is_valid = totp_service.verify_totp_code(secret_base32, payload.code)

    # 2. Try Backup code if TOTP fails
    backup_used = False
    if not is_valid and mfa_cred.backup_codes_hashed:
        is_backup_valid, remaining_hashes = totp_service.verify_backup_code(
            payload.code, mfa_cred.backup_codes_hashed
        )
        if is_backup_valid:
            is_valid = True
            backup_used = True
            mfa_cred.backup_codes_hashed = remaining_hashes
            db.commit()

    if not is_valid:
        record_audit_event(
            action=AuditAction.MFA_FAILURE,
            result="FAILED",
            user_id=user.id,
            actor=user.official_email,
            role=user.role.name if user.role else None,
            ip_address=client_ip,
            reason="Invalid TOTP / backup code",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication code. Please check your authenticator app."
        )

    # Clean up challenge
    del _mfa_challenges[payload.challenge_token]

    # Success
    mfa_cred.last_used_at = utcnow()
    record_successful_login(db, user)
    raw_token, session_rec = create_user_session(db, user.id, client_ip, user_agent)
    set_session_cookie(response, raw_token)

    record_audit_event(
        action=AuditAction.MFA_SUCCESS,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        role=user.role.name if user.role else None,
        ip_address=client_ip,
        details={"backup_code_used": backup_used},
        request_id=req_id,
        correlation_id=corr_id,
        db=db
    )

    memberships = db.query(CaseMemberModel).filter_by(user_id=user.id, active=True).all()
    return {
        "status": "AUTHENTICATED",
        "mfa_required": False,
        "user": {
            "id": user.id,
            "employee_id": user.employee_id,
            "full_name": user.full_name,
            "email": user.official_email,
            "official_email": user.official_email,
            "role": user.role.name if user.role else None,
            "role_display": user.role.display_name if user.role else None,
            "unit": user.unit.name if user.unit else None,
            "unit_code": user.unit.code if user.unit else None,
            "status": user.status,
            "mfa_enabled": user.mfa_enabled
        },
        "permissions": list(get_user_permissions(db, user)),
        "case_memberships": [{"case_id": m.case_id, "case_role": m.case_role} for m in memberships]
    }


@router.post("/mfa/setup")
def setup_mfa(
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """
    Initiates TOTP MFA setup for the authenticated officer.
    Generates a new Base32 secret, provisioning URL, and emergency backup codes.
    """
    secret = totp_service.generate_secret()
    encrypted_secret = totp_service.encrypt_secret(secret)
    plain_backup_codes, hashed_backup_codes = totp_service.generate_backup_codes()

    # Save or update unconfirmed credential
    existing = db.query(MFACredentialModel).filter_by(user_id=current_user.id).first()
    if existing:
        existing.secret_encrypted = encrypted_secret
        existing.backup_codes_hashed = hashed_backup_codes
        existing.confirmed = False
    else:
        db.add(MFACredentialModel(
            user_id=current_user.id,
            secret_encrypted=encrypted_secret,
            backup_codes_hashed=hashed_backup_codes,
            confirmed=False
        ))
    db.commit()

    provisioning_uri = totp_service.get_provisioning_uri(
        secret_base32=secret,
        account_name=current_user.official_email
    )

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "backup_codes": plain_backup_codes,
        "message": "Scan the QR code or enter the secret into your authenticator app, then confirm with a 6-digit code."
    }


@router.post("/mfa/confirm")
def confirm_mfa(
    payload: MFAConfirmRequest,
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Confirms the first TOTP code and activates MFA on the officer's account."""
    mfa_cred = db.query(MFACredentialModel).filter_by(user_id=current_user.id).first()
    if not mfa_cred:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated.")

    secret = totp_service.decrypt_secret(mfa_cred.secret_encrypted)
    if not totp_service.verify_totp_code(secret, payload.code):
        raise HTTPException(status_code=400, detail="Invalid verification code. Please try again.")

    mfa_cred.confirmed = True
    current_user.mfa_enabled = True
    db.commit()

    record_audit_event(
        action=AuditAction.USER_UPDATED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        details={"mfa_enabled": True},
        db=db
    )

    return {"status": "success", "message": "MFA has been successfully activated on your account."}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: Optional[UserModel] = Depends(get_current_user)
):
    """Revokes the current session and clears the HttpOnly cookie."""
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if raw_token:
        revoke_session(db, raw_token)
    clear_session_cookie(response)

    if user:
        record_audit_event(
            action=AuditAction.LOGOUT,
            result="SUCCESS",
            user_id=user.id,
            actor=user.official_email,
            role=user.role.name if user.role else None,
            ip_address=get_client_ip(request),
            db=db
        )

    return {"status": "success", "message": "Successfully logged out."}


@router.get("/me")
def get_me(
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Returns the authenticated officer's profile, role, unit, permissions, and case memberships."""
    memberships = db.query(CaseMemberModel).filter_by(user_id=current_user.id, active=True).all()
    permissions = list(get_user_permissions(db, current_user))

    return {
        "status": "AUTHENTICATED",
        "user": {
            "id": current_user.id,
            "employee_id": current_user.employee_id,
            "full_name": current_user.full_name,
            "email": current_user.official_email,
            "official_email": current_user.official_email,
            "phone_number": current_user.phone_number,
            "role": current_user.role.name if current_user.role else None,
            "role_display": current_user.role.display_name if current_user.role else None,
            "unit": current_user.unit.name if current_user.unit else None,
            "unit_code": current_user.unit.code if current_user.unit else None,
            "organization": current_user.organization.name if current_user.organization else None,
            "status": current_user.status,
            "mfa_enabled": current_user.mfa_enabled,
            "last_login_at": current_user.last_login_at.isoformat() if current_user.last_login_at else None
        },
        "permissions": permissions,
        "case_memberships": [{"case_id": m.case_id, "case_role": m.case_role} for m in memberships]
    }


@router.post("/password/change")
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Changes officer password, enforces complexity standards, and invalidates other sessions."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password.")

    valid, reason = validate_password_complexity(payload.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    current_user.password_hash = hash_password(payload.new_password)
    current_user.password_changed_at = utcnow()
    db.commit()

    # Revoke all other sessions
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    current_hash = hash_session_token(raw_token) if raw_token else ""
    other_sessions = db.query(SessionModel).filter(
        SessionModel.user_id == current_user.id,
        SessionModel.session_id != current_hash,
        SessionModel.revoked == False
    ).all()
    for s in other_sessions:
        s.revoked = True
        s.revoked_at = utcnow()
    db.commit()

    record_audit_event(
        action=AuditAction.PASSWORD_CHANGE,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": "Password changed successfully. Other active sessions revoked."}


@router.post("/password/reset/request")
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Requests a single-use password reset token (generic response prevents user enumeration)."""
    ident = payload.identifier.strip().lower()
    user = (
        db.query(UserModel)
        .filter((UserModel.official_email == ident) | (UserModel.employee_id == ident.upper()))
        .first()
    )

    token = None
    if user and user.status == "ACTIVE":
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        db.add(PasswordResetTokenModel(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + datetime.timedelta(hours=1),
            used=False
        ))
        db.commit()

        record_audit_event(
            action=AuditAction.PASSWORD_RESET_REQUEST,
            result="SUCCESS",
            user_id=user.id,
            actor=user.official_email,
            ip_address=get_client_ip(request),
            db=db
        )

    # In local testing, return the reset token directly for ease of verification
    response_payload = {
        "status": "success",
        "message": "If the account exists, password reset instructions have been generated."
    }
    if token and os.getenv("ENV", "development") != "production":
        response_payload["dev_reset_token"] = token
    return response_payload


@router.post("/password/reset/confirm")
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Consumes single-use reset token and sets new password."""
    token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
    reset_record = (
        db.query(PasswordResetTokenModel)
        .filter_by(token_hash=token_hash, used=False)
        .first()
    )

    if not reset_record or reset_record.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    valid, reason = validate_password_complexity(payload.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    user = db.query(UserModel).filter_by(id=reset_record.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()
    reset_record.used = True
    reset_record.used_at = utcnow()
    db.commit()

    # Revoke all sessions
    revoke_all_user_sessions(db, user.id)

    record_audit_event(
        action=AuditAction.PASSWORD_RESET_CONFIRM,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        ip_address=get_client_ip(request),
        db=db
    )

    return {"status": "success", "message": "Password has been reset successfully. Please sign in."}


@router.get("/invite/verify")
def verify_invitation(token: str, db: Session = Depends(get_db)):
    """Verifies validity of an invitation token and returns officer commissioning preview details."""
    token_clean = token.strip()
    token_hash = hashlib.sha256(token_clean.encode("utf-8")).hexdigest()
    invite = db.query(InvitationModel).filter_by(token_hash=token_hash).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invitation token was not found.")
    if invite.status == "ACCEPTED":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted. Please sign in.")
    if invite.status != "PENDING" or invite.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="This invitation link has expired or has been revoked.")

    role = db.query(RoleModel).filter_by(id=invite.role_id).first()
    unit = db.query(UnitModel).filter_by(id=invite.unit_id).first() if invite.unit_id else None

    return {
        "valid": True,
        "invitation_id": invite.id,
        "official_email": invite.official_email,
        "employee_id": invite.employee_id,
        "full_name": invite.full_name,
        "role_name": role.name if role else "INSPECTOR",
        "role_display": role.display_name if role else "Investigator",
        "unit_name": unit.name if unit else "Special Operations Wing",
        "expires_at": invite.expires_at.isoformat()
    }


@router.post("/invite/accept")
def accept_invitation(
    payload: InviteAcceptRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Allows an invited officer to establish their credentials and activate their account."""
    token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
    invite = db.query(InvitationModel).filter_by(token_hash=token_hash, status="PENDING").first()

    if not invite or invite.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="Invitation link is invalid or has expired.")

    valid, reason = validate_password_complexity(payload.password)
    if not valid:
        raise HTTPException(status_code=400, detail=reason)

    # Check if user already exists
    user = db.query(UserModel).filter_by(official_email=invite.official_email).first()
    if not user:
        user = UserModel(
            employee_id=invite.employee_id,
            full_name=invite.full_name,
            official_email=invite.official_email,
            password_hash=hash_password(payload.password),
            role_id=invite.role_id,
            organization_id=invite.organization_id,
            unit_id=invite.unit_id,
            status="ACTIVE",
            mfa_enabled=False
        )
        db.add(user)
    else:
        user.password_hash = hash_password(payload.password)
        user.status = "ACTIVE"

    invite.status = "ACCEPTED"
    invite.accepted_at = utcnow()
    db.commit()
    db.refresh(user)

    # Issue session
    client_ip = get_client_ip(request)
    raw_token, session_rec = create_user_session(db, user.id, client_ip, request.headers.get("User-Agent"))
    set_session_cookie(response, raw_token)

    record_audit_event(
        action=AuditAction.USER_ACTIVATED,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        role=user.role.name if user.role else None,
        details={"invited_by": invite.invited_by},
        db=db
    )

    return {
        "status": "AUTHENTICATED",
        "mfa_required": False,
        "message": "Account activated successfully. Welcome to TRACE Platform.",
        "user": {
            "id": user.id,
            "employee_id": user.employee_id,
            "full_name": user.full_name,
            "email": user.official_email,
            "official_email": user.official_email,
            "role": user.role.name if user.role else None,
            "role_display": user.role.display_name if user.role else None,
            "unit": user.unit.name if user.unit else None,
            "unit_code": user.unit.code if user.unit else None,
            "status": user.status,
            "mfa_enabled": user.mfa_enabled
        },
        "permissions": list(get_user_permissions(db, user)),
        "case_memberships": []
    }


@router.get("/sessions")
def list_active_sessions(
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Lists currently active sessions for the authenticated user."""
    sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.user_id == current_user.id,
            SessionModel.revoked == False,
            SessionModel.expires_at > utcnow()
        )
        .order_by(SessionModel.last_activity_at.desc())
        .all()
    )

    return [
        {
            "id": s.id,
            "ip_address": s.ip_address or "Unknown",
            "user_agent": s.user_agent or "Unknown",
            "created_at": s.created_at.isoformat(),
            "last_activity_at": s.last_activity_at.isoformat(),
            "is_current": False  # can be matched in UI
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_record_id}")
def revoke_specific_session(
    session_record_id: str,
    current_user: UserModel = Depends(require_authenticated_user),
    db: Session = Depends(get_db)
):
    """Revokes a specific active session belonging to the user."""
    session_rec = db.query(SessionModel).filter_by(id=session_record_id, user_id=current_user.id).first()
    if not session_rec:
        raise HTTPException(status_code=404, detail="Session not found.")

    session_rec.revoked = True
    session_rec.revoked_at = utcnow()
    db.commit()

    record_audit_event(
        action=AuditAction.SESSION_REVOKED,
        result="SUCCESS",
        user_id=current_user.id,
        actor=current_user.official_email,
        details={"revoked_session_id": session_record_id},
        db=db
    )

    return {"status": "success", "message": "Session terminated successfully."}
