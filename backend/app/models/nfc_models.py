"""
NFC Officer Smartcard Model for Two-Factor Law Enforcement Authentication.
Stores cryptographic credential hashes, bcrypt PIN hashes, attempt counters,
and card lifecycle states (ACTIVE, SUSPENDED, REVOKED, EXPIRED).
"""

import datetime
import uuid
from sqlalchemy import (
    Column, String, Integer, DateTime, JSON, ForeignKey, Index, Boolean, Text
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.iam_models import UserModel

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def generate_uuid():
    return str(uuid.uuid4())

class NFCOfficerCardModel(Base):
    """
    Physical NFC Smartcard credentials bound to police officers.
    Raw NFC tokens are NEVER stored; only salted SHA-256 hashes are persisted.
    PINs are hashed using bcrypt with work factor 12.
    """
    __tablename__ = "nfc_officer_cards"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    card_uid = Column(String(64), nullable=False, index=True)  # Masked admin reference e.g. NFC-****-4A2F
    credential_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA-256 of raw opaque token
    pin_hash = Column(String(255), nullable=False)  # Bcrypt work factor 12 hash of 4-digit PIN
    
    # Lifecycle status: ACTIVE, SUSPENDED, REVOKED, EXPIRED
    status = Column(String(32), default="ACTIVE", index=True, nullable=False)
    
    issued_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    activated_at = Column(DateTime(timezone=True), default=utcnow, nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(String(64), nullable=True)
    
    failed_attempt_count = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    card_metadata = Column(JSON, default=dict, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    user = relationship("UserModel", backref="nfc_cards")
