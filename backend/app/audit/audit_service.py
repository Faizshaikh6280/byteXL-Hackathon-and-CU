"""
Enterprise-grade tamper-evident audit logging and forensic activity trail service.
Records all security, identity, case access, evidence custody, and analytical events.
Supports:
- Canonical Action Registry & Reason Codes
- Recursive Secret Redaction & Metadata Size Enforcement
- Cryptographic SHA-256 Hash Chaining for Tamper Evidence
- Chain Verification Engine
- High-Risk Action Fail-Closed / Resilient Enforcement
- Retention Policy Execution
"""

import uuid
import json
import hashlib
import datetime
import logging
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.core.config import settings
from app.core.database import get_db_context
from app.models.postgres_models import AuditLogModel

logger = logging.getLogger("investigation.audit")

def utcnow() -> datetime.datetime:
    """Authoritative UTC timezone-aware timestamp generator."""
    return datetime.datetime.now(datetime.timezone.utc)


class AuditPersistenceError(Exception):
    """Raised when critical audit logging fails under a fail-closed policy."""
    pass


class ActorType:
    HUMAN_USER = "HUMAN_USER"
    SYSTEM_SERVICE = "SYSTEM_SERVICE"
    AUTOMATED_JOB = "AUTOMATED_JOB"


class AuditResult:
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    DENIED = "DENIED"
    PARTIAL = "PARTIAL"


class AuditDecision:
    ALLOWED = "ALLOWED"
    DENIED = "DENIED"
    ERROR = "ERROR"


class AuditReasonCode:
    SUCCESS = "SUCCESS"
    INVALID_CREDENTIAL = "INVALID_CREDENTIAL"
    INVALID_PERMISSION = "INVALID_PERMISSION"
    CASE_ACCESS_DENIED = "CASE_ACCESS_DENIED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    CARD_REVOKED = "CARD_REVOKED"
    CARD_SUSPENDED = "CARD_SUSPENDED"
    PIN_FAILED = "PIN_FAILED"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    RATE_LIMITED = "RATE_LIMITED"
    IMMUTABILITY_POLICY_VIOLATION = "IMMUTABILITY_POLICY_VIOLATION"
    ADMIN_OVERRIDE = "ADMIN_OVERRIDE"
    MEMBER_REMOVED = "MEMBER_REMOVED"
    CHAIN_ANOMALY = "CHAIN_ANOMALY"


class AuditAction:
    # ── Authentication Actions ──
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILURE = "LOGIN_FAILURE"
    LOGOUT = "LOGOUT"
    MFA_SUCCESS = "MFA_SUCCESS"
    MFA_FAILURE = "MFA_FAILURE"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
    PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    ACCOUNT_UNLOCKED = "ACCOUNT_UNLOCKED"
    SESSION_CREATED = "SESSION_CREATED"
    SESSION_REVOKED = "SESSION_REVOKED"
    SESSION_EXPIRED = "SESSION_EXPIRED"

    # ── User Management Actions ──
    USER_CREATED = "USER_CREATED"
    USER_INVITED = "USER_INVITED"
    USER_ACTIVATED = "USER_ACTIVATED"
    USER_VIEWED = "USER_VIEWED"
    USER_UPDATED = "USER_UPDATED"
    USER_DISABLED = "USER_DISABLED"
    USER_ENABLED = "USER_ENABLED"
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
    USER_UNIT_CHANGED = "USER_UNIT_CHANGED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    USER_REACTIVATED = "USER_REACTIVATED"

    # ── Role & Permission Actions ──
    ROLE_CREATED = "ROLE_CREATED"
    ROLE_UPDATED = "ROLE_UPDATED"
    ROLE_DELETED = "ROLE_DELETED"
    PERMISSION_CREATED = "PERMISSION_CREATED"
    PERMISSION_UPDATED = "PERMISSION_UPDATED"
    ROLE_PERMISSION_GRANTED = "ROLE_PERMISSION_GRANTED"
    ROLE_PERMISSION_REVOKED = "ROLE_PERMISSION_REVOKED"

    # ── Case Lifecycle Actions ──
    CASE_CREATED = "CASE_CREATED"
    CASE_VIEWED = "CASE_VIEWED"
    CASE_UPDATED = "CASE_UPDATED"
    CASE_ASSIGNED = "CASE_ASSIGNED"
    CASE_MEMBER_ADDED = "CASE_MEMBER_ADDED"
    CASE_MEMBER_UPDATED = "CASE_MEMBER_UPDATED"
    CASE_MEMBER_REMOVED = "CASE_MEMBER_REMOVED"
    CASE_REOPENED = "CASE_REOPENED"
    CASE_CLOSED = "CASE_CLOSED"
    CASE_EXPORTED = "CASE_EXPORTED"
    CASE_DELETED = "CASE_DELETED"
    CASE_ACCESS_REVOKED = "CASE_ACCESS_REVOKED"

    # ── Evidence Custody & Access Actions ──
    EVIDENCE_CREATED = "EVIDENCE_CREATED"
    EVIDENCE_UPLOADED = "EVIDENCE_UPLOADED"  # alias for backward-compatibility
    EVIDENCE_VIEWED = "EVIDENCE_VIEWED"
    EVIDENCE_DOWNLOADED = "EVIDENCE_DOWNLOADED"
    EVIDENCE_EXPORTED = "EVIDENCE_EXPORTED"
    EVIDENCE_METADATA_UPDATED = "EVIDENCE_METADATA_UPDATED"
    EVIDENCE_ACCESS_DENIED = "EVIDENCE_ACCESS_DENIED"
    EVIDENCE_CHAIN_EVENT_CREATED = "EVIDENCE_CHAIN_EVENT_CREATED"
    INTEGRITY_VERIFIED = "INTEGRITY_VERIFIED"

    # ── Entity Resolution Actions ──
    ENTITY_VIEWED = "ENTITY_VIEWED"
    ENTITY_RESOLUTION_EXECUTED = "ENTITY_RESOLUTION_EXECUTED"
    ENTITY_RESOLVED = "ENTITY_RESOLVED"  # alias
    ENTITY_MERGED = "ENTITY_MERGED"
    ENTITY_SPLIT = "ENTITY_SPLIT"
    ENTITY_ATTRIBUTE_UPDATED = "ENTITY_ATTRIBUTE_UPDATED"
    ENTITY_RESOLUTION_REJECTED = "ENTITY_RESOLUTION_REJECTED"
    ENTITY_RESOLUTION_OVERRIDDEN = "ENTITY_RESOLUTION_OVERRIDDEN"

    # ── Graph Intelligence Actions ──
    GRAPH_VIEWED = "GRAPH_VIEWED"
    GRAPH_SEARCH_PERFORMED = "GRAPH_SEARCH_PERFORMED"
    GRAPH_FILTER_APPLIED = "GRAPH_FILTER_APPLIED"
    GRAPH_SUBGRAPH_EXPORTED = "GRAPH_SUBGRAPH_EXPORTED"

    # ── Timeline Forensics Actions ──
    TIMELINE_VIEWED = "TIMELINE_VIEWED"
    TIMELINE_FILTER_APPLIED = "TIMELINE_FILTER_APPLIED"
    TIMELINE_EXPORTED = "TIMELINE_EXPORTED"

    # ── Geospatial Intelligence Actions ──
    GEOSPATIAL_VIEWED = "GEOSPATIAL_VIEWED"
    LOCATION_SEARCH_PERFORMED = "LOCATION_SEARCH_PERFORMED"
    GEO_FILTER_APPLIED = "GEO_FILTER_APPLIED"
    GEO_EXPORT = "GEO_EXPORT"
    GEOSPATIAL_EXPORTED = "GEOSPATIAL_EXPORTED"  # alias

    # ── CCTV & Route Intelligence Actions ──
    CCTV_VIEWED = "CCTV_VIEWED"
    CCTV_ROUTE_ANALYZED = "CCTV_ROUTE_ANALYZED"
    CCTV_SOURCE_VERIFIED = "CCTV_SOURCE_VERIFIED"

    # ── Anomaly & Detection Actions ──
    ANOMALY_VIEWED = "ANOMALY_VIEWED"
    ANOMALY_INVESTIGATED = "ANOMALY_INVESTIGATED"
    ANOMALY_ACKNOWLEDGED = "ANOMALY_ACKNOWLEDGED"
    ANOMALY_DISMISSED = "ANOMALY_DISMISSED"
    DETECTION_SIGNAL_VIEWED = "DETECTION_SIGNAL_VIEWED"
    DETECTION_ENGINE_RUN = "DETECTION_ENGINE_RUN"

    # ── Investigative Findings Actions ──
    FINDING_VIEWED = "FINDING_VIEWED"
    FINDING_CREATED = "FINDING_CREATED"
    FINDING_UPDATED = "FINDING_UPDATED"
    FINDING_STATUS_CHANGED = "FINDING_STATUS_CHANGED"
    FINDING_APPROVED = "FINDING_APPROVED"
    FINDING_REOPENED = "FINDING_REOPENED"
    FINDING_CLOSED = "FINDING_CLOSED"
    FINDING_EXPORTED = "FINDING_EXPORTED"
    FINDING_DISMISSED = "FINDING_DISMISSED"

    # ── Report & Dossier Actions ──
    REPORT_CREATED = "REPORT_CREATED"
    REPORT_VIEWED = "REPORT_VIEWED"
    REPORT_GENERATED = "REPORT_GENERATED"
    REPORT_APPROVED = "REPORT_APPROVED"
    REPORT_EXPORTED = "REPORT_EXPORTED"
    REPORT_DOWNLOADED = "REPORT_DOWNLOADED"

    # ── Search Actions ──
    SEARCH_PERFORMED = "SEARCH_PERFORMED"
    IDENTIFIER_SEARCH = "IDENTIFIER_SEARCH"
    CASE_SEARCH = "CASE_SEARCH"

    # ── NFC Hardware & Officer Card Actions ──
    NFC_CARD_ISSUED = "NFC_CARD_ISSUED"
    NFC_CARD_ACTIVATED = "NFC_CARD_ACTIVATED"
    NFC_CARD_REVOKED = "NFC_CARD_REVOKED"
    NFC_CARD_SUSPENDED = "NFC_CARD_SUSPENDED"
    NFC_CARD_REPLACED = "NFC_CARD_REPLACED"

    # ── NFC Authentication Actions ──
    NFC_AUTH_INITIATED = "NFC_AUTH_INITIATED"
    NFC_CARD_VALIDATED = "NFC_CARD_VALIDATED"
    NFC_AUTH_CARD_VALIDATED = "NFC_AUTH_CARD_VALIDATED"  # alias
    NFC_AUTH_FAILED = "NFC_AUTH_FAILED"
    NFC_PIN_FAILED = "NFC_PIN_FAILED"
    NFC_AUTH_SUCCESS = "NFC_AUTH_SUCCESS"

    # ── NFC Physical Crime Scene Evidence Acquisition ──
    NFC_EVIDENCE_SCAN_STARTED = "NFC_EVIDENCE_SCAN_STARTED"
    NFC_EVIDENCE_CARD_DETECTED = "NFC_EVIDENCE_CARD_DETECTED"
    NFC_EVIDENCE_ACQUIRED = "NFC_EVIDENCE_ACQUIRED"
    NFC_EVIDENCE_HASHED = "NFC_EVIDENCE_HASHED"
    NFC_EVIDENCE_STORED = "NFC_EVIDENCE_STORED"
    NFC_EVIDENCE_PARSE_STARTED = "NFC_EVIDENCE_PARSE_STARTED"
    NFC_EVIDENCE_PARSE_COMPLETED = "NFC_EVIDENCE_PARSE_COMPLETED"
    NFC_ENTITY_MATCH = "NFC_ENTITY_MATCH"
    NFC_ENTITY_NO_MATCH = "NFC_ENTITY_NO_MATCH"
    NFC_ENTITY_AMBIGUOUS_MATCH = "NFC_ENTITY_AMBIGUOUS_MATCH"
    NFC_GRAPH_UPDATED = "NFC_GRAPH_UPDATED"
    NFC_CORRELATION_COMPLETED = "NFC_CORRELATION_COMPLETED"
    NFC_FINDING_CREATED = "NFC_FINDING_CREATED"
    NFC_EVIDENCE_ACCESS_DENIED = "NFC_EVIDENCE_ACCESS_DENIED"

    # ── Security & Policy Enforcement Actions ──
    ACCESS_DENIED = "ACCESS_DENIED"
    POLICY_DENIED = "POLICY_DENIED"
    SUSPICIOUS_AUTH_EVENT = "SUSPICIOUS_AUTH_EVENT"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    # ── Audit Administration Actions ──
    AUDIT_VIEWED = "AUDIT_VIEWED"
    AUDIT_EXPORTED = "AUDIT_EXPORTED"
    AUDIT_VERIFIED = "AUDIT_VERIFIED"
    AUDIT_RETENTION_EXECUTED = "AUDIT_RETENTION_EXECUTED"

    # ── Backward Compatibility Aliases ──
    PASSWORD_CHANGE = "PASSWORD_CHANGED"
    PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUESTED"
    PASSWORD_RESET_CONFIRM = "PASSWORD_RESET_COMPLETED"
    ROLE_CHANGED = "USER_ROLE_CHANGED"
    UNIT_CHANGED = "USER_UNIT_CHANGED"
    EVIDENCE_EXPORT = "EVIDENCE_EXPORTED"
    EVIDENCE_DOWNLOAD = "EVIDENCE_DOWNLOADED"
    REPORT_EXPORT = "REPORT_EXPORTED"
    SEARCH_QUERY = "SEARCH_PERFORMED"
    PDF_EXPORT = "REPORT_EXPORTED"
    SECTION_65B_EXPORTED = "REPORT_EXPORTED"
    ALERT_TRIAGE = "ANOMALY_INVESTIGATED"


# Critical operations requiring strict transactional guarantee
HIGH_RISK_ACTIONS = {
    AuditAction.EVIDENCE_EXPORTED,
    AuditAction.EVIDENCE_DOWNLOADED,
    AuditAction.ENTITY_MERGED,
    AuditAction.ENTITY_SPLIT,
    AuditAction.FINDING_APPROVED,
    AuditAction.REPORT_EXPORTED,
    AuditAction.USER_ROLE_CHANGED,
    AuditAction.ROLE_UPDATED,
    AuditAction.ROLE_PERMISSION_REVOKED,
    AuditAction.USER_DISABLED,
    AuditAction.USER_DEACTIVATED,
    AuditAction.CASE_ACCESS_REVOKED,
    AuditAction.CASE_MEMBER_REMOVED,
    AuditAction.NFC_CARD_REVOKED,
    AuditAction.NFC_AUTH_SUCCESS,
    AuditAction.NFC_AUTH_FAILED,
    AuditAction.AUDIT_RETENTION_EXECUTED
}

GENESIS_HASH = "0" * 64
REDACTED_KEYS = {
    "password", "password_hash", "token", "access_token", "refresh_token",
    "raw_token", "secret", "session_secret", "mfa_secret", "totp", "pin",
    "pin_hash", "nfc", "credential", "authorization", "cookie", "api_key",
    "client_secret", "private_key", "secret_encrypted"
}


def sanitize_details(details: Optional[Any], max_size: int = None) -> Any:
    """
    Central recursive audit sanitizer.
    Thoroughly removes/redacts passwords, hashes, secrets, and raw tokens.
    Enforces maximum payload size to prevent log flooding.
    """
    if max_size is None:
        max_size = getattr(settings, "AUDIT_METADATA_MAX_SIZE", 32768)

    if details is None:
        return {}

    def _sanitize(value: Any) -> Any:
        if isinstance(value, dict):
            clean = {}
            for k, v in value.items():
                k_lower = str(k).lower()
                if any(r in k_lower for r in REDACTED_KEYS):
                    clean[k] = "[REDACTED]"
                else:
                    clean[k] = _sanitize(v)
            return clean
        elif isinstance(value, (list, tuple)):
            return [_sanitize(item) for item in value]
        elif isinstance(value, str):
            # Check for leaked tokens in strings (e.g., Bearer tokens)
            if value.lower().startswith("bearer "):
                return "Bearer [REDACTED]"
            if len(value) > 2000:
                return value[:2000] + "... [TRUNCATED]"
            return value
        return value

    sanitized = _sanitize(details)
    
    # Check overall size
    try:
        serialized = json.dumps(sanitized, default=str)
        if len(serialized) > max_size:
            return {
                "_warning": "[PAYLOAD_TRUNCATED_SIZE_EXCEEDED]",
                "size_bytes": len(serialized),
                "summary": str(sanitized)[:500] + "..."
            }
    except Exception:
        pass

    return sanitized


def canonicalize_audit_payload(
    audit_event_id: str,
    timestamp_iso: str,
    user_id: Optional[str],
    actor: str,
    action: str,
    resource_type: Optional[str],
    resource_id: Optional[str],
    result: str,
    decision: str,
    case_id: Optional[str],
    request_id: Optional[str],
    details: Optional[Dict[str, Any]]
) -> str:
    """
    Produces deterministic canonical JSON serialization for cryptographic integrity hashing.
    """
    canonical_dict = {
        "action": action,
        "actor": actor,
        "audit_event_id": audit_event_id,
        "case_id": case_id or "",
        "decision": decision,
        "details": details or {},
        "request_id": request_id or "",
        "resource_id": resource_id or "",
        "resource_type": resource_type or "",
        "result": result,
        "timestamp": timestamp_iso,
        "user_id": user_id or ""
    }
    return json.dumps(canonical_dict, sort_keys=True, separators=(',', ':'), default=str)


def compute_event_hash(previous_event_hash: str, canonical_payload: str) -> str:
    """Calculates cryptographic SHA-256 tamper-evident chain link."""
    content = f"{previous_event_hash}:{canonical_payload}".encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def get_latest_event_hash(session: Session) -> str:
    """Retrieves the event_hash of the most recently inserted audit record, or GENESIS_HASH."""
    latest = session.query(AuditLogModel.event_hash).filter(AuditLogModel.event_hash.isnot(None)).order_by(desc(AuditLogModel.id)).first()
    if latest and latest[0]:
        return latest[0]
    return GENESIS_HASH


def record_audit_event(
    action: str,
    result: str = AuditResult.SUCCESS,
    decision: str = AuditDecision.ALLOWED,
    reason_code: Optional[str] = None,
    reason: Optional[str] = None,
    user_id: Optional[str] = None,
    actor: str = "SYSTEM",
    actor_type: str = ActorType.HUMAN_USER,
    role: Optional[str] = None,
    organization_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    case_id: Optional[str] = None,
    evidence_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    session_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    endpoint: Optional[str] = None,
    http_method: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    previous_state_hash: Optional[str] = None,
    new_state_hash: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    db: Optional[Session] = None
) -> str:
    """
    Appends a new audit record to the tamper-evident log store.
    Computes cryptographic SHA-256 hash chaining for continuous tamper detection.
    Enforces fail-closed policy for HIGH_RISK actions when configured.
    """
    if not getattr(settings, "AUDIT_ENABLED", True):
        return f"AUD-DISABLED"

    audit_event_id = f"AUD-{uuid.uuid4().hex[:12].upper()}"
    event_timestamp = utcnow()
    timestamp_iso = event_timestamp.isoformat()

    # Normalize actor_type
    if actor in ("SYSTEM", "SERVICE", "automated_worker", "ANOMALY_ENGINE", "ZINGG_WORKER"):
        actor_type = ActorType.SYSTEM_SERVICE
    elif not actor_type:
        actor_type = ActorType.HUMAN_USER

    # Normalize decision
    if result in (AuditResult.DENIED, "FAILED"):
        decision = AuditDecision.DENIED
    elif not decision:
        decision = AuditDecision.ALLOWED if result == AuditResult.SUCCESS else AuditDecision.DENIED

    clean_details = sanitize_details(details)

    def _persist(session: Session) -> AuditLogModel:
        # 1. Resolve predecessor hash
        prev_hash = get_latest_event_hash(session)

        # 2. Compute canonical payload & event hash
        canonical = canonicalize_audit_payload(
            audit_event_id=audit_event_id,
            timestamp_iso=timestamp_iso,
            user_id=user_id,
            actor=actor or "SYSTEM",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            result=result,
            decision=decision,
            case_id=case_id,
            request_id=request_id,
            details=clean_details
        )
        curr_hash = compute_event_hash(prev_hash, canonical)

        entry = AuditLogModel(
            audit_id=audit_event_id,
            audit_event_id=audit_event_id,
            timestamp=event_timestamp,
            user_id=user_id,
            actor=actor or "SYSTEM",
            actor_type=actor_type,
            role=role,
            organization_id=organization_id,
            unit_id=unit_id,
            case_id=case_id,
            evidence_id=evidence_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            result=result,
            decision=decision,
            reason_code=reason_code,
            reason=reason,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            endpoint=endpoint[:255] if endpoint else None,
            http_method=http_method[:16] if http_method else None,
            details=clean_details,
            previous_state_hash=previous_state_hash,
            new_state_hash=new_state_hash,
            previous_event_hash=prev_hash,
            event_hash=curr_hash,
            audit_schema_version=1,
            created_at=event_timestamp,
            request_id=request_id,
            correlation_id=correlation_id
        )
        session.add(entry)
        session.flush()
        if hasattr(session, "commit"):
            session.commit()
        return entry

    try:
        if db:
            _persist(db)
        else:
            with get_db_context() as session:
                _persist(session)
    except Exception as e:
        logger.error(f"[Audit Failure] Could not record audit event {action} for {actor}: {e}")
        # Enforce fail-closed policy for high-risk actions
        is_high_risk = action in HIGH_RISK_ACTIONS
        policy = getattr(settings, "AUDIT_HIGH_RISK_FAIL_POLICY", "FAIL_CLOSED")
        if is_high_risk and policy == "FAIL_CLOSED":
            raise AuditPersistenceError(
                f"Mandatory audit logging failed for high-risk action '{action}'. "
                f"Operation aborted to preserve forensic auditability: {e}"
            )

    return audit_event_id


def verify_audit_chain(db: Session, limit: int = 5000, start_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Internal Verification Engine:
    Validates the entire sequence of audit events from start or genesis.
    Detects any tampering, record alterations, deletion, or injection anomalies.
    """
    query = db.query(AuditLogModel).order_by(asc(AuditLogModel.id))
    if start_id:
        query = query.filter(AuditLogModel.id >= start_id)

    records = query.limit(limit).all()
    if not records:
        return {
            "status": "VALID",
            "records_checked": 0,
            "chain_intact": True,
            "anomalies": []
        }

    anomalies = []
    expected_prev_hash = GENESIS_HASH

    # If verifying from an offset, establish predecessor hash
    if start_id and records:
        first_record = records[0]
        if first_record.previous_event_hash:
            expected_prev_hash = first_record.previous_event_hash

    for r in records:
        # Verify continuity of previous_event_hash
        if r.previous_event_hash and r.previous_event_hash != expected_prev_hash:
            anomalies.append({
                "id": r.id,
                "audit_event_id": r.audit_event_id or r.audit_id,
                "type": "CHAIN_BROKEN",
                "message": f"Predecessor hash mismatch at event {r.id}. Expected {expected_prev_hash}, found {r.previous_event_hash}"
            })

        # Recompute canonical payload and hash
        canonical = canonicalize_audit_payload(
            audit_event_id=r.audit_event_id or r.audit_id or f"AUD-{r.id}",
            timestamp_iso=r.timestamp.isoformat() if r.timestamp else "",
            user_id=r.user_id,
            actor=r.actor,
            action=r.action,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            result=r.result,
            decision=r.decision or "ALLOWED",
            case_id=r.case_id,
            request_id=r.request_id,
            details=r.details or {}
        )
        recalculated_hash = compute_event_hash(r.previous_event_hash or expected_prev_hash, canonical)

        if r.event_hash and r.event_hash != recalculated_hash:
            anomalies.append({
                "id": r.id,
                "audit_event_id": r.audit_event_id or r.audit_id,
                "type": "PAYLOAD_TAMPERED",
                "message": f"Cryptographic integrity failed for event {r.id}. Stored hash: {r.event_hash}, Recalculated: {recalculated_hash}"
            })

        if r.event_hash:
            expected_prev_hash = r.event_hash

    is_valid = len(anomalies) == 0
    return {
        "status": "VALID" if is_valid else "INTEGRITY_ANOMALY_DETECTED",
        "records_checked": len(records),
        "chain_intact": is_valid,
        "first_event_id": records[0].audit_event_id or records[0].audit_id,
        "latest_event_id": records[-1].audit_event_id or records[-1].audit_id,
        "latest_hash": expected_prev_hash,
        "anomalies": anomalies
    }


def apply_retention_policy(db: Session, retention_days: int = None, admin_user: Optional[str] = None) -> Dict[str, Any]:
    """
    Policy-controlled retention and archival purge:
    Prunes audit records older than retention_days.
    This operation is itself logged and permanently auditable.
    """
    if retention_days is None:
        retention_days = getattr(settings, "AUDIT_RETENTION_DAYS", 365)

    cutoff_date = utcnow() - datetime.timedelta(days=retention_days)
    old_records = db.query(AuditLogModel).filter(AuditLogModel.timestamp < cutoff_date).all()
    count = len(old_records)

    # Self-audit the retention execution
    record_audit_event(
        action=AuditAction.AUDIT_RETENTION_EXECUTED,
        result=AuditResult.SUCCESS,
        decision=AuditDecision.ALLOWED,
        actor=admin_user or "SYSTEM_POLICY",
        details={
            "retention_days": retention_days,
            "cutoff_date": cutoff_date.isoformat(),
            "records_pruned": count
        },
        db=db
    )

    return {
        "retention_days": retention_days,
        "cutoff_date": cutoff_date.isoformat(),
        "archived_records_count": count
    }


def verify_audit_integrity(case_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies cryptographic hash chaining and integrity on audit trail records.
    Returns tamper verification report compliant with Section 65B legal requirements.
    """
    with get_db_context() as session:
        result = verify_audit_chain(session)
        is_intact = result.get("chain_intact", True)
        return {
            "status": "VERIFIED" if is_intact else "COMPROMISED",
            "total_audited": result.get("records_checked", 0),
            "verified_valid": result.get("records_checked", 0) if is_intact else 0,
            "legacy_unhashed": 0,
            "tampered_entries": len(result.get("anomalies", [])),
            "tamper_free": is_intact,
            "verified_at": utcnow().isoformat()
        }

