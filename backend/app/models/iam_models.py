import datetime
import uuid
from sqlalchemy import (
    Column, String, Integer, BigInteger, Float, DateTime, Text, JSON, ForeignKey, Index, Boolean
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def generate_uuid():
    return str(uuid.uuid4())


class OrganizationModel(Base):
    """Law enforcement organization / agency (e.g. Central Cyber Intelligence Directorate)."""
    __tablename__ = "organizations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    units = relationship("UnitModel", back_populates="organization", cascade="all, delete-orphan")
    users = relationship("UserModel", back_populates="organization")


class UnitModel(Base):
    """Operational unit / wing / division within an organization."""
    __tablename__ = "units"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    organization_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    organization = relationship("OrganizationModel", back_populates="units")
    users = relationship("UserModel", back_populates="unit")


class RoleModel(Base):
    """System and operational security roles."""
    __tablename__ = "roles"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(64), unique=True, nullable=False, index=True)  # SYSTEM_ADMIN, SUPERINTENDENT, IPS_OFFICER, etc.
    display_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    is_system_role = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    users = relationship("UserModel", back_populates="role")
    role_permissions = relationship("RolePermissionModel", back_populates="role", cascade="all, delete-orphan")


class PermissionModel(Base):
    """Canonical fine-grained system and investigation permissions."""
    __tablename__ = "permissions"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(64), unique=True, nullable=False, index=True)  # e.g., case.read, evidence.export
    category = Column(String(64), nullable=False, index=True)           # case, evidence, entity, graph, etc.
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    role_permissions = relationship("RolePermissionModel", back_populates="permission", cascade="all, delete-orphan")


class RolePermissionModel(Base):
    """Mapping between roles and fine-grained permissions."""
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(String(64), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(String(64), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)

    # Relationships
    role = relationship("RoleModel", back_populates="role_permissions")
    permission = relationship("PermissionModel", back_populates="role_permissions")


class UserModel(Base):
    """User account identity and credentials."""
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    employee_id = Column(String(64), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    official_email = Column(String(255), unique=True, nullable=False, index=True)
    phone_number = Column(String(32), nullable=True)
    password_hash = Column(String(255), nullable=False)
    
    role_id = Column(String(64), ForeignKey("roles.id"), nullable=False, index=True)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=True, index=True)
    unit_id = Column(String(64), ForeignKey("units.id"), nullable=True, index=True)
    
    # Account status: ACTIVE, INVITED, SUSPENDED, DISABLED, LOCKED
    status = Column(String(32), default="ACTIVE", index=True, nullable=False)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_count = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    role = relationship("RoleModel", back_populates="users")
    organization = relationship("OrganizationModel", back_populates="users")
    unit = relationship("UnitModel", back_populates="users")
    sessions = relationship("SessionModel", back_populates="user", cascade="all, delete-orphan")
    mfa_credential = relationship("MFACredentialModel", back_populates="user", uselist=False, cascade="all, delete-orphan")
    case_memberships = relationship("CaseMemberModel", back_populates="user", cascade="all, delete-orphan")


class CaseMemberModel(Base):
    """Case-scoped investigator assignments and access roles."""
    __tablename__ = "case_members"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    case_role = Column(String(32), default="INVESTIGATOR", nullable=False)  # OWNER, LEAD_INVESTIGATOR, INVESTIGATOR, ANALYST, REVIEWER, AUDITOR
    assigned_by = Column(String(64), nullable=False)  # user_id or employee_id
    assigned_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("UserModel", back_populates="case_memberships")


class SessionModel(Base):
    """Active user authentication sessions."""
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    session_id = Column(String(128), unique=True, nullable=False, index=True)  # SHA-256 hash or secure token
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_activity_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("UserModel", back_populates="sessions")


class MFACredentialModel(Base):
    """TOTP MFA secret and backup recovery credentials."""
    __tablename__ = "mfa_credentials"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    secret_encrypted = Column(Text, nullable=False)  # AES-256-GCM encrypted base32 secret
    backup_codes_hashed = Column(JSON, default=list, nullable=False)  # List of hashed one-time backup codes
    confirmed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("UserModel", back_populates="mfa_credential")


class InvitationModel(Base):
    """Officer onboarding invitations (no unrestricted public signup)."""
    __tablename__ = "invitations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    official_email = Column(String(255), nullable=False, index=True)
    employee_id = Column(String(64), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    role_id = Column(String(64), ForeignKey("roles.id"), nullable=False)
    organization_id = Column(String(64), ForeignKey("organizations.id"), nullable=True)
    unit_id = Column(String(64), ForeignKey("units.id"), nullable=True)
    invited_by = Column(String(64), nullable=False)  # user_id of inviting admin
    status = Column(String(32), default="PENDING", index=True, nullable=False)  # PENDING, ACCEPTED, REVOKED, EXPIRED
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class PasswordResetTokenModel(Base):
    """Expiring, single-use password reset tokens."""
    __tablename__ = "password_reset_tokens"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ReportModel(Base):
    """Investigation Dossier Reports and Export Registry."""
    __tablename__ = "reports"

    report_id = Column(String(64), primary_key=True, default=generate_uuid, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    created_by = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    sections_included = Column(JSON, default=list, nullable=False)
    evidence_references = Column(JSON, default=list, nullable=False)
    report_version = Column(String(32), default="1.0.0", nullable=False)
    approval_status = Column(String(32), default="DRAFT", index=True, nullable=False)  # DRAFT, SUBMITTED, APPROVED, REJECTED
    approved_by = Column(String(64), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    content = Column(JSON, default=dict, nullable=False)
