"""
NFC Card + 4-Digit PIN Authentication & Administration Router.
Handles:
- POST /api/auth/nfc/initiate      (Exchange opaque NFC token for short-lived transaction)
- POST /api/auth/nfc/verify-pin    (Verify 4-digit PIN, create session, resolve active case)
- GET  /api/admin/nfc-cards        (List all officer cards)
- POST /api/admin/nfc-cards/issue  (Provision new card with NDEF URL)
- POST /api/admin/nfc-cards/{id}/activate
- POST /api/admin/nfc-cards/{id}/suspend
- POST /api/admin/nfc-cards/{id}/revoke
- POST /api/admin/nfc-cards/{id}/replace
- GET  /api/admin/nfc-cards/dev-sim-cards (Dev sandbox credentials for one-click testing)
"""

import os
import re
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.nfc_models import NFCOfficerCardModel
from app.models.iam_models import UserModel
from app.auth.nfc_service import (
    generate_card_credential, hash_credential, hash_pin, verify_pin,
    create_login_transaction, get_login_transaction, consume_login_transaction,
    record_pin_failure, record_card_success, find_most_recent_active_case
)
from app.auth.session import (
    create_user_session, set_session_cookie
)
from app.auth.rate_limiter import (
    check_ip_rate_limit, record_successful_login
)
from app.authorization.dependencies import (
    get_current_user, require_permission, get_client_ip
)
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(tags=["NFC Card Authentication & Management"])

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

# === Request Schemas ===
class NFCInitiateRequest(BaseModel):
    credential: str

class NFCVerifyPinRequest(BaseModel):
    transaction_id: str
    pin: str

class IssueNFCCardRequest(BaseModel):
    user_id: str
    pin: str

class ReplaceNFCCardRequest(BaseModel):
    new_pin: str


# ==========================================
# 1. NFC AUTHENTICATION FLOW
# ==========================================

@router.post("/auth/nfc/initiate")
def initiate_nfc_auth(
    payload: NFCInitiateRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Factor 1: Validates the opaque NFC credential scanned from physical NDEF tag.
    Creates a 120-second single-use transaction.
    Returns transaction_id for the subsequent PIN challenge.
    Exposes ZERO sensitive officer data (enumeration-resistant).
    """
    client_ip = get_client_ip(request)
    req_id = request.headers.get("X-Request-ID")
    corr_id = request.headers.get("X-Correlation-ID")

    # 1. IP Rate Limiting Check
    allowed, retry_after = check_ip_rate_limit(client_ip)
    if not allowed:
        record_audit_event(
            action=AuditAction.RATE_LIMIT_EXCEEDED,
            result="DENIED",
            actor="NFC_AUTH",
            ip_address=client_ip,
            reason=f"IP rate limit exceeded, retry after {retry_after}s",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many authentication attempts. Please retry in {retry_after} seconds."
        )

    # 2. Validate token format (accepts raw token or full NDEF URL containing ?t= parameter)
    raw_token = payload.credential.strip()
    if "t=" in raw_token:
        import urllib.parse
        try:
            parsed = urllib.parse.urlparse(raw_token)
            params = urllib.parse.parse_qs(parsed.query)
            if "t" in params and params["t"]:
                raw_token = params["t"][0].strip()
            else:
                raw_token = raw_token.split("t=")[-1].split("&")[0].split("#")[0].strip()
        except Exception:
            raw_token = raw_token.split("t=")[-1].split("&")[0].split("#")[0].strip()

    if not raw_token or not raw_token.startswith("nfc_c_") or len(raw_token) < 20 or len(raw_token) > 128:
        record_audit_event(
            action=AuditAction.NFC_AUTH_FAILED,
            result="DENIED",
            actor="UNKNOWN_NFC",
            ip_address=client_ip,
            reason="Malformed NFC credential format",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to authenticate NFC card credential."
        )

    # 3. Hash lookup (never query raw token)
    cred_hash = hash_credential(raw_token)
    card = db.query(NFCOfficerCardModel).filter_by(credential_hash=cred_hash).first()

    if not card or card.status != "ACTIVE":
        record_audit_event(
            action=AuditAction.NFC_AUTH_FAILED,
            result="DENIED",
            actor=card.card_uid if card else "UNKNOWN_CARD",
            ip_address=client_ip,
            reason=f"Card not found or status is {card.status if card else 'NON_EXISTENT'}",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to authenticate NFC card credential."
        )

    # 4. Check Card Lockout
    now = utcnow()
    if card.locked_until and card.locked_until > now:
        remaining = int((card.locked_until - now).total_seconds())
        record_audit_event(
            action=AuditAction.NFC_AUTH_FAILED,
            result="DENIED",
            user_id=card.user_id,
            actor=card.card_uid,
            ip_address=client_ip,
            reason=f"Card temporarily locked for {remaining}s",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Card is temporarily locked due to repeated failed PIN attempts. Try again in {remaining // 60 + 1} minutes."
        )

    # 5. Check Officer Account Status
    user = db.query(UserModel).filter_by(id=card.user_id).first()
    if not user or user.status != "ACTIVE":
        record_audit_event(
            action=AuditAction.NFC_AUTH_FAILED,
            result="DENIED",
            user_id=card.user_id,
            actor=card.card_uid,
            ip_address=client_ip,
            reason=f"Officer account is {user.status if user else 'DELETED'}",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Associated officer account is not active. Contact your system administrator."
        )

    # 6. Create Short-Lived Single-Use Transaction
    tx_id = create_login_transaction(card_id=card.id, user_id=user.id, client_ip=client_ip)

    record_audit_event(
        action=AuditAction.NFC_AUTH_INITIATED,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        ip_address=client_ip,
        details={"card_uid": card.card_uid, "transaction_id": tx_id[:12] + "..."},
        request_id=req_id,
        correlation_id=corr_id,
        db=db
    )

    return {
        "status": "AWAITING_PIN",
        "transaction_id": tx_id,
        "expires_in_seconds": 120,
        "message": "NFC card credential verified. Please enter your 4-digit PIN."
    }


@router.post("/auth/nfc/verify-pin")
def verify_nfc_pin(
    payload: NFCVerifyPinRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Factor 2: Verifies the 4-digit PIN against the bcrypt hash bound to the NFC card.
    Enforces transaction expiration, attempt throttling, and temporary lockout.
    On success: issues regular HttpOnly session cookie, selects most recent active case.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent")
    req_id = request.headers.get("X-Request-ID")
    corr_id = request.headers.get("X-Correlation-ID")

    # 1. IP Rate Limiting
    allowed, retry_after = check_ip_rate_limit(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many PIN verification attempts. Retry in {retry_after} seconds."
        )

    # 2. Validate PIN format
    clean_pin = payload.pin.strip()
    if not re.match(r"^\d{4}$", clean_pin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN must be exactly 4 numeric digits."
        )

    # 3. Retrieve and validate transaction
    tx = get_login_transaction(payload.transaction_id)
    if not tx:
        record_audit_event(
            action=AuditAction.NFC_AUTH_FAILED,
            result="DENIED",
            actor="EXPIRED_TX",
            ip_address=client_ip,
            reason="Transaction expired, consumed, or invalid",
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session has expired or is invalid. Please tap your NFC card again."
        )

    # 4. Fetch Card and User
    card = db.query(NFCOfficerCardModel).filter_by(id=tx["card_id"]).first()
    user = db.query(UserModel).filter_by(id=tx["user_id"]).first()

    if not card or card.status != "ACTIVE":
        consume_login_transaction(payload.transaction_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Card is no longer active."
        )

    if not user or user.status != "ACTIVE":
        consume_login_transaction(payload.transaction_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Officer account is inactive or suspended."
        )

    # 5. Check if card was locked during the transaction
    now = utcnow()
    if card.locked_until and card.locked_until > now:
        consume_login_transaction(payload.transaction_id)
        remaining = int((card.locked_until - now).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Card is locked due to failed attempts. Try again in {remaining // 60 + 1} minutes."
        )

    # 6. Verify 4-digit PIN against bcrypt hash
    if not verify_pin(clean_pin, card.pin_hash):
        attempts_left, is_locked, lock_sec = record_pin_failure(payload.transaction_id, card, db)
        record_audit_event(
            action=AuditAction.NFC_PIN_FAILED,
            result="FAILED",
            user_id=user.id,
            actor=user.official_email,
            ip_address=client_ip,
            details={"card_uid": card.card_uid, "attempts_left": attempts_left, "is_locked": is_locked},
            reason="Incorrect 4-digit PIN" + (" - Card locked" if is_locked else ""),
            request_id=req_id,
            correlation_id=corr_id,
            db=db
        )

        if is_locked:
            consume_login_transaction(payload.transaction_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Maximum PIN attempts exceeded. Card is locked for {lock_sec // 60} minutes."
            )

        if attempts_left <= 0:
            consume_login_transaction(payload.transaction_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Transaction attempts exhausted. Please tap your NFC card again."
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect PIN. {attempts_left} attempts remaining on this session."
        )

    # 7. PIN Verified! Invalidate transaction immediately (single-use)
    consume_login_transaction(payload.transaction_id)

    # 8. Reset failed counters on card and user
    record_card_success(card, db)
    record_successful_login(db, user)

    # 9. Create standard application session and set HttpOnly cookie
    raw_session_token, session_rec = create_user_session(db, user.id, client_ip, user_agent)
    set_session_cookie(response, raw_session_token)

    # 10. Determine Most Recent Active Authorized Case
    target_case_id = find_most_recent_active_case(db, user)

    # 11. Record Successful Authentication Audit Event
    record_audit_event(
        action=AuditAction.NFC_AUTH_SUCCESS,
        result="SUCCESS",
        user_id=user.id,
        actor=user.official_email,
        role=user.role.name if user.role else None,
        organization_id=user.organization_id,
        unit_id=user.unit_id,
        ip_address=client_ip,
        user_agent=user_agent,
        details={"card_uid": card.card_uid, "target_case_id": target_case_id},
        request_id=req_id,
        correlation_id=corr_id,
        db=db
    )

    return {
        "status": "AUTHENTICATED",
        "message": "NFC authentication and PIN verified successfully.",
        "target_case_id": target_case_id,
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
        }
    }


# ==========================================
# 2. ADMINISTRATIVE CARD LIFECYCLE MANAGEMENT
# ==========================================

@router.get("/admin/nfc-cards")
def list_nfc_cards(
    current_user: UserModel = Depends(require_permission(Permissions.USER_VIEW)),
    db: Session = Depends(get_db)
):
    """Lists all registered officer NFC cards with masked identifiers and status."""
    cards = db.query(NFCOfficerCardModel).order_by(NFCOfficerCardModel.created_at.desc()).all()
    out = []
    now = utcnow()
    for c in cards:
        user = c.user
        is_locked = bool(c.locked_until and c.locked_until > now)
        out.append({
            "id": c.id,
            "user_id": c.user_id,
            "officer_name": user.full_name if user else "Unknown Officer",
            "employee_id": user.employee_id if user else "N/A",
            "officer_role": user.role.display_name if user and user.role else None,
            "officer_unit": user.unit.name if user and user.unit else None,
            "card_uid": c.card_uid,
            "status": c.status,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "activated_at": c.activated_at.isoformat() if c.activated_at else None,
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            "failed_attempt_count": c.failed_attempt_count,
            "is_locked": is_locked,
            "locked_until": c.locked_until.isoformat() if c.locked_until else None
        })
    return out


@router.post("/admin/nfc-cards/issue")
def issue_nfc_card(
    payload: IssueNFCCardRequest,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Provisions a new NFC Smartcard for an officer.
    Generates the opaque token and NDEF URL for physical card programming.
    """
    clean_pin = payload.pin.strip()
    if not re.match(r"^\d{4}$", clean_pin):
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 numeric digits.")

    user = db.query(UserModel).filter_by(id=payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Officer account not found.")

    # Check if officer already has an active card; if so, revoke it (card replacement)
    existing_active = db.query(NFCOfficerCardModel).filter_by(user_id=user.id, status="ACTIVE").all()
    for old in existing_active:
        old.status = "REVOKED"
        old.revoked_at = utcnow()
        old.revoked_by = current_user.id

    # Generate high-entropy credential and bcrypt PIN hash
    raw_token, cred_hash, masked_uid = generate_card_credential()
    pin_h = hash_pin(clean_pin)

    new_card = NFCOfficerCardModel(
        user_id=user.id,
        card_uid=masked_uid,
        credential_hash=cred_hash,
        pin_hash=pin_h,
        status="ACTIVE",
        issued_at=utcnow(),
        activated_at=utcnow()
    )
    db.add(new_card)
    db.commit()
    db.refresh(new_card)

    base_url = os.getenv("NFC_BASE_URL") or os.getenv("NEXT_PUBLIC_APP_URL") or "http://localhost:3000"
    ndef_url = f"{base_url.rstrip('/')}/nfc-login?t={raw_token}"

    record_audit_event(
        action=AuditAction.NFC_CARD_ISSUED,
        result="SUCCESS",
        user_id=user.id,
        actor=current_user.official_email,
        details={"card_uid": masked_uid, "officer": user.official_email},
        db=db
    )

    return {
        "status": "SUCCESS",
        "message": f"NFC card successfully provisioned for {user.full_name} ({user.employee_id}).",
        "card_id": new_card.id,
        "card_uid": masked_uid,
        "officer_name": user.full_name,
        "employee_id": user.employee_id,
        "raw_token": raw_token,
        "ndef_url": ndef_url,
        "instructions": "Program the physical NFC tag with the NDEF URL using an NFC writer app."
    }


@router.post("/admin/nfc-cards/{card_id}/activate")
def activate_nfc_card(
    card_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """Activates an officer NFC card and clears any locks."""
    card = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")

    card.status = "ACTIVE"
    card.activated_at = utcnow()
    card.failed_attempt_count = 0
    card.locked_until = None
    db.commit()

    record_audit_event(
        action=AuditAction.NFC_CARD_ACTIVATED,
        result="SUCCESS",
        user_id=card.user_id,
        actor=current_user.official_email,
        details={"card_uid": card.card_uid},
        db=db
    )
    return {"status": "SUCCESS", "message": f"Card {card.card_uid} activated."}


@router.post("/admin/nfc-cards/{card_id}/suspend")
def suspend_nfc_card(
    card_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """Temporarily suspends an officer NFC card."""
    card = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")

    card.status = "SUSPENDED"
    db.commit()

    record_audit_event(
        action=AuditAction.NFC_CARD_SUSPENDED,
        result="SUCCESS",
        user_id=card.user_id,
        actor=current_user.official_email,
        details={"card_uid": card.card_uid},
        db=db
    )
    return {"status": "SUCCESS", "message": f"Card {card.card_uid} suspended."}


@router.post("/admin/nfc-cards/{card_id}/revoke")
def revoke_nfc_card(
    card_id: str,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """Permanently revokes an officer NFC card (e.g. lost or stolen)."""
    card = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")

    card.status = "REVOKED"
    card.revoked_at = utcnow()
    card.revoked_by = current_user.id
    db.commit()

    record_audit_event(
        action=AuditAction.NFC_CARD_REVOKED,
        result="SUCCESS",
        user_id=card.user_id,
        actor=current_user.official_email,
        details={"card_uid": card.card_uid},
        db=db
    )
    return {"status": "SUCCESS", "message": f"Card {card.card_uid} permanently revoked."}


@router.post("/admin/nfc-cards/{card_id}/replace")
def replace_nfc_card(
    card_id: str,
    payload: ReplaceNFCCardRequest,
    current_user: UserModel = Depends(require_permission(Permissions.USER_UPDATE)),
    db: Session = Depends(get_db)
):
    """Revokes old card and issues a new card for the officer."""
    clean_pin = payload.new_pin.strip()
    if not re.match(r"^\d{4}$", clean_pin):
        raise HTTPException(status_code=400, detail="New PIN must be exactly 4 numeric digits.")

    old_card = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
    if not old_card:
        raise HTTPException(status_code=404, detail="Card not found.")

    # Revoke old
    old_card.status = "REVOKED"
    old_card.revoked_at = utcnow()
    old_card.revoked_by = current_user.id

    # Create new
    raw_token, cred_hash, masked_uid = generate_card_credential()
    pin_h = hash_pin(clean_pin)

    new_card = NFCOfficerCardModel(
        user_id=old_card.user_id,
        card_uid=masked_uid,
        credential_hash=cred_hash,
        pin_hash=pin_h,
        status="ACTIVE",
        issued_at=utcnow(),
        activated_at=utcnow()
    )
    db.add(new_card)
    db.commit()
    db.refresh(new_card)

    base_url = os.getenv("NFC_BASE_URL") or os.getenv("NEXT_PUBLIC_APP_URL") or "http://localhost:3000"
    ndef_url = f"{base_url.rstrip('/')}/nfc-login?t={raw_token}"

    user = old_card.user
    record_audit_event(
        action=AuditAction.NFC_CARD_REPLACED,
        result="SUCCESS",
        user_id=user.id,
        actor=current_user.official_email,
        details={"old_card_uid": old_card.card_uid, "new_card_uid": masked_uid},
        db=db
    )

    return {
        "status": "SUCCESS",
        "message": f"Card replaced. New card {masked_uid} issued.",
        "card_id": new_card.id,
        "card_uid": masked_uid,
        "raw_token": raw_token,
        "ndef_url": ndef_url
    }


# ==========================================
# 3. DEV / EVALUATION SANDBOX HELPER
# ==========================================

@router.get("/auth/nfc/dev-cards")
def list_dev_simulation_cards(db: Session = Depends(get_db)):
    """
    Public sandbox helper for testing and evaluation.
    Lists canonical test cards for the seeded officer ranks with simulation credentials.
    """
    from app.core.seed_nfc import SEEDED_DEV_NFC_CARDS
    return SEEDED_DEV_NFC_CARDS
