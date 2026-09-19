"""
Authentication rate limiting and progressive account lockout management.
Protects against credential stuffing and brute-force attacks.
"""

import time
import datetime
from typing import Dict, Tuple, Optional
from sqlalchemy.orm import Session
from app.models.iam_models import UserModel

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
IP_RATE_LIMIT_WINDOW_SECONDS = 60
IP_MAX_REQUESTS_PER_WINDOW = 20

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

# Thread-safe in-memory IP tracker
_ip_attempts: Dict[str, list] = {}

def check_ip_rate_limit(ip_address: Optional[str]) -> Tuple[bool, int]:
    """
    Checks if client IP has exceeded the request threshold.
    Returns (is_allowed, retry_after_seconds).
    """
    if not ip_address:
        return True, 0

    now = time.time()
    attempts = _ip_attempts.get(ip_address, [])
    # Filter attempts within window
    recent = [t for t in attempts if now - t < IP_RATE_LIMIT_WINDOW_SECONDS]
    _ip_attempts[ip_address] = recent

    if len(recent) >= IP_MAX_REQUESTS_PER_WINDOW:
        retry_after = int(IP_RATE_LIMIT_WINDOW_SECONDS - (now - recent[0]))
        return False, max(1, retry_after)

    recent.append(now)
    _ip_attempts[ip_address] = recent
    return True, 0

def check_account_lockout(user: UserModel) -> Tuple[bool, int]:
    """
    Checks if user account is currently temporarily locked.
    Returns (is_locked, remaining_seconds).
    """
    if not user.locked_until:
        return False, 0

    now = utcnow()
    if user.locked_until > now:
        remaining = int((user.locked_until - now).total_seconds())
        return True, max(1, remaining)

    # Lock has expired, reset
    user.locked_until = None
    user.failed_login_count = 0
    return False, 0

def record_failed_login(db: Session, user: UserModel) -> Tuple[bool, int]:
    """
    Increments failed login count for user.
    If threshold reached, locks account for LOCKOUT_DURATION_MINUTES.
    Returns (is_now_locked, lockout_seconds).
    """
    user.failed_login_count += 1
    now = utcnow()

    if user.failed_login_count >= MAX_FAILED_ATTEMPTS:
        user.locked_until = now + datetime.timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        db.commit()
        return True, LOCKOUT_DURATION_MINUTES * 60

    db.commit()
    return False, 0

def record_successful_login(db: Session, user: UserModel):
    """Resets failed login counter and updates last_login_at timestamp."""
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    db.commit()


class RateLimiter:
    """In-memory rate limiter and lockout tracker for IP and identifier requests."""
    def __init__(self):
        self._user_attempts: Dict[str, list] = {}
        self._user_locks: Dict[str, float] = {}

    def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]:
        now = time.time()
        attempts = self._user_attempts.get(identifier, [])
        attempts = [t for t in attempts if now - t < LOCKOUT_DURATION_MINUTES * 60]
        attempts.append(now)
        self._user_attempts[identifier] = attempts

        if len(attempts) >= MAX_FAILED_ATTEMPTS:
            self._user_locks[identifier] = now + (LOCKOUT_DURATION_MINUTES * 60)
            return True, LOCKOUT_DURATION_MINUTES * 60
        return False, 0

    def is_user_locked(self, identifier: str) -> Tuple[bool, int]:
        now = time.time()
        lock_until = self._user_locks.get(identifier, 0)
        if lock_until > now:
            return True, int(lock_until - now)
        return False, 0

    def reset_user(self, identifier: str):
        self._user_attempts.pop(identifier, None)
        self._user_locks.pop(identifier, None)


rate_limiter = RateLimiter()
