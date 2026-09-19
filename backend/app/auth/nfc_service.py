"""
NFC Officer Smartcard Security Service.
Manages high-entropy opaque tokens, bcrypt PIN verification, short-lived 2-step
authentication transactions, anti-brute-force controls, and active case resolution.
"""

import time
import re
import secrets
import hashlib
import datetime
import bcrypt
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.nfc_models import NFCOfficerCardModel
from app.models.iam_models import UserModel, CaseMemberModel
from app.models.postgres_models import CaseModel

TRANSACTION_TTL_SECONDS = 120  # 2-minute short-lived login window
MAX_TRANSACTION_ATTEMPTS = 3   # Max 3 failed PIN attempts per transaction
MAX_CUMULATIVE_FAILURES = 5    # 5 failed attempts across transactions triggers 15-minute card lock
LOCKOUT_DURATION_MINUTES = 15

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

# Thread-safe in-memory transaction registry: transaction_id -> transaction_data
_nfc_transactions: Dict[str, Dict[str, Any]] = {}

def generate_card_credential() -> Tuple[str, str, str]:
    """
    Generates a cryptographically secure, high-entropy opaque token for the physical NFC tag.
    The raw token is embedded into the NDEF URL and given to the officer.
    The server persists only its salted SHA-256 hash.
    Returns: (raw_token, credential_hash, masked_uid)
    """
    # 24 random bytes in hex -> 48 hex chars prefixed with "nfc_c_"
    raw_token = f"nfc_c_{secrets.token_hex(24)}"
    credential_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    masked_uid = f"NFC-{raw_token[-4:].upper()}-{secrets.token_hex(2).upper()}"
    return raw_token, credential_hash, masked_uid

def hash_credential(raw_token: str) -> str:
    """Computes SHA-256 digest of raw incoming token for lookup."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

def hash_pin(pin: str) -> str:
    """Validates 4-digit PIN and hashes with bcrypt (work factor 12)."""
    clean_pin = str(pin).strip()
    if not re.match(r"^\d{4}$", clean_pin):
        raise ValueError("PIN must be exactly 4 numeric digits (0000-9999).")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(clean_pin.encode("utf-8"), salt).decode("utf-8")

def verify_pin(pin: str, pin_hash: str) -> bool:
    """Verifies a 4-digit PIN against bcrypt hash in constant time."""
    clean_pin = str(pin).strip()
    if not clean_pin or not pin_hash:
        return False
    try:
        return bcrypt.checkpw(clean_pin.encode("utf-8"), pin_hash.encode("utf-8"))
    except Exception:
        return False

def purge_expired_transactions():
    """Prunes expired transactions from memory."""
    now = time.time()
    expired = [k for k, v in _nfc_transactions.items() if v["expires_at"] < now or v.get("consumed")]
    for k in expired:
        _nfc_transactions.pop(k, None)

def create_login_transaction(card_id: str, user_id: str, client_ip: Optional[str] = None) -> str:
    """Creates a short-lived, single-use authentication transaction."""
    purge_expired_transactions()
    tx_id = f"tx_{secrets.token_urlsafe(32)}"
    _nfc_transactions[tx_id] = {
        "card_id": card_id,
        "user_id": user_id,
        "attempts_left": MAX_TRANSACTION_ATTEMPTS,
        "expires_at": time.time() + TRANSACTION_TTL_SECONDS,
        "client_ip": client_ip,
        "consumed": False,
        "created_at": time.time()
    }
    return tx_id

def get_login_transaction(tx_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves an active, unexpired, unconsumed transaction."""
    if not tx_id or tx_id not in _nfc_transactions:
        return None
    tx = _nfc_transactions[tx_id]
    if tx.get("consumed") or tx["expires_at"] < time.time() or tx.get("attempts_left", 0) <= 0:
        return None
    return tx

def consume_login_transaction(tx_id: str):
    """Marks transaction consumed immediately to prevent replay attacks."""
    if tx_id in _nfc_transactions:
        _nfc_transactions[tx_id]["consumed"] = True
        _nfc_transactions.pop(tx_id, None)

def record_pin_failure(tx_id: str, card: NFCOfficerCardModel, db: Session) -> Tuple[int, bool, int]:
    """
    Decrements transaction attempts and increments card cumulative failures.
    Returns: (attempts_left, is_locked, lockout_seconds)
    """
    attempts_left = 0
    if tx_id in _nfc_transactions:
        _nfc_transactions[tx_id]["attempts_left"] = max(0, _nfc_transactions[tx_id]["attempts_left"] - 1)
        attempts_left = _nfc_transactions[tx_id]["attempts_left"]
        if attempts_left <= 0:
            _nfc_transactions[tx_id]["consumed"] = True

    card.failed_attempt_count += 1
    now = utcnow()
    
    if card.failed_attempt_count >= MAX_CUMULATIVE_FAILURES:
        card.locked_until = now + datetime.timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        db.commit()
        return attempts_left, True, LOCKOUT_DURATION_MINUTES * 60

    db.commit()
    return attempts_left, False, 0

def record_card_success(card: NFCOfficerCardModel, db: Session):
    """Resets failed attempt counters and updates last used timestamp."""
    card.failed_attempt_count = 0
    card.locked_until = None
    card.last_used_at = utcnow()
    db.commit()

def find_most_recent_active_case(db: Session, user: UserModel) -> Optional[str]:
    """
    Determines the officer's most recent ACTIVE AUTHORIZED case.
    Strictly queries cases permitted by the existing authorization policy.
    Never trusts client parameters or URL injection.
    """
    user_role = user.role.name if user.role else ""
    
    # 1. Supervisory & Compliance Roles (Access across cases)
    if user_role in ("SYSTEM_ADMIN", "SUPERINTENDENT", "IPS_OFFICER", "AUDITOR"):
        case = (
            db.query(CaseModel)
            .filter(CaseModel.status == "ACTIVE")
            .order_by(desc(CaseModel.updated_at), desc(CaseModel.created_at))
            .first()
        )
        if case:
            return case.case_id

    # 2. Case-scoped investigators (Inspector, Sub-Inspector, Analyst)
    # Check assigned cases via CaseMemberModel
    assigned_case = (
        db.query(CaseModel)
        .join(CaseMemberModel, CaseMemberModel.case_id == CaseModel.case_id)
        .filter(
            CaseMemberModel.user_id == user.id,
            CaseMemberModel.active == True,
            CaseModel.status == "ACTIVE"
        )
        .order_by(desc(CaseModel.updated_at), desc(CaseModel.created_at))
        .first()
    )
    if assigned_case:
        return assigned_case.case_id

    # 3. Unit-scoped fallback: cases belonging to officer's unit
    if user.unit_id:
        unit_case = (
            db.query(CaseModel)
            .filter(
                CaseModel.unit_id == user.unit_id,
                CaseModel.status == "ACTIVE"
            )
            .order_by(desc(CaseModel.updated_at), desc(CaseModel.created_at))
            .first()
        )
        if unit_case:
            return unit_case.case_id

    # 4. Fallback to any active case if authorized or None
    fallback_case = (
        db.query(CaseModel)
        .filter(CaseModel.status == "ACTIVE")
        .order_by(desc(CaseModel.updated_at), desc(CaseModel.created_at))
        .first()
    )
    return fallback_case.case_id if fallback_case else None
