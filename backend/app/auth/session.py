"""
Secure Session Lifecycle and Management.
Uses cryptographically secure random session tokens, SHA-256 token hashing,
and HttpOnly, SameSite, Secure cookie lifecycle management.
"""

import os
import hashlib
import secrets
import datetime
from typing import Optional, Tuple
from fastapi import Response, Request
from sqlalchemy.orm import Session

from app.models.iam_models import SessionModel, UserModel

SESSION_COOKIE_NAME = "trace_session"
DEFAULT_SESSION_HOURS = 12
INACTIVITY_TIMEOUT_MINUTES = 120

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def hash_session_token(token: str) -> str:
    """Returns SHA-256 digest of the raw session token for storage and lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_user_session(
    db: Session,
    user_id: str,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    duration_hours: int = DEFAULT_SESSION_HOURS
) -> Tuple[str, SessionModel]:
    """
    Creates a new authenticated session in database.
    Returns: (raw_session_token, session_record)
    The raw_session_token is given to the client in an HttpOnly cookie.
    The database only stores its SHA-256 hash.
    """
    raw_token = secrets.token_urlsafe(36)
    hashed_token = hash_session_token(raw_token)
    now = utcnow()
    expires_at = now + datetime.timedelta(hours=duration_hours)

    session_rec = SessionModel(
        session_id=hashed_token,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        created_at=now,
        expires_at=expires_at,
        last_activity_at=now,
        revoked=False
    )
    db.add(session_rec)
    db.commit()
    db.refresh(session_rec)
    return raw_token, session_rec

def validate_session(db: Session, raw_token: str) -> Optional[UserModel]:
    """
    Validates a session token from cookie or header.
    Checks expiration, revocation, inactivity window, and user account status.
    Updates sliding last_activity_at timestamp.
    """
    if not raw_token:
        return None

    hashed_token = hash_session_token(raw_token)
    session_rec = db.query(SessionModel).filter_by(session_id=hashed_token).first()
    if not session_rec:
        return None

    now = utcnow()

    # Check revoked
    if session_rec.revoked:
        return None

    # Check hard expiry
    if session_rec.expires_at <= now:
        session_rec.revoked = True
        session_rec.revoked_at = now
        db.commit()
        return None

    # Check inactivity timeout
    inactive_limit = session_rec.last_activity_at + datetime.timedelta(minutes=INACTIVITY_TIMEOUT_MINUTES)
    if inactive_limit <= now:
        session_rec.revoked = True
        session_rec.revoked_at = now
        db.commit()
        return None

    # Retrieve user
    user = db.query(UserModel).filter_by(id=session_rec.user_id).first()
    if not user or user.status != "ACTIVE":
        return None

    # Update activity timestamp (sliding session)
    session_rec.last_activity_at = now
    db.commit()
    return user

def revoke_session(db: Session, raw_token: str) -> bool:
    """Revokes a specific session."""
    if not raw_token:
        return False
    hashed_token = hash_session_token(raw_token)
    session_rec = db.query(SessionModel).filter_by(session_id=hashed_token).first()
    if session_rec and not session_rec.revoked:
        session_rec.revoked = True
        session_rec.revoked_at = utcnow()
        db.commit()
        return True
    return False

def revoke_all_user_sessions(db: Session, user_id: str) -> int:
    """Revokes all active sessions for a user (e.g. password change, account lock)."""
    now = utcnow()
    sessions = db.query(SessionModel).filter(
        SessionModel.user_id == user_id,
        SessionModel.revoked == False
    ).all()
    count = len(sessions)
    for s in sessions:
        s.revoked = True
        s.revoked_at = now
    db.commit()
    return count

def set_session_cookie(response: Response, raw_token: str, max_age_seconds: int = DEFAULT_SESSION_HOURS * 3600):
    """Attaches secure HttpOnly cookie to response."""
    # Allow SECURE override via ENV (default False for localhost/dev, True in production)
    is_secure = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age_seconds,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/"
    )

def clear_session_cookie(response: Response):
    """Deletes session cookie from client."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/"
    )

# Convenience aliases
create_session = create_user_session
get_session_by_token = validate_session
hash_token = hash_session_token
