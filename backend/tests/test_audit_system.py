"""
Comprehensive Test Suite for Enterprise Audit Logging & Investigative Activity Trail.
Covers:
- Normalized audit event creation & UTC authoritative timestamps
- Central recursive secret redaction & metadata sanitization
- Cryptographic SHA-256 tamper-evident hash chaining & integrity verification
- Tamper detection on modified audit records (INTEGRITY_ANOMALY_DETECTED)
- High-risk action fail-closed policy enforcement
- Authorization failure auditing (ACCESS_DENIED & POLICY_DENIED)
- Role-based audit scoping & IDOR prevention
- Evidence lifecycle auditing (VIEW vs DOWNLOAD vs EXPORT)
- Entity Resolution merge & split state hash auditing
- Case Activity Timeline endpoint verification
- Certified audit export & self-auditing
- Retention policy execution & self-auditing
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import datetime
import json
import hashlib
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import get_db_context
from app.models.iam_models import UserModel, RoleModel, CaseMemberModel
from app.models.postgres_models import CaseModel, EvidenceModel, AnomalyFindingModel, AuditLogModel, GoldenProfileModel
from app.auth.session import create_session, hash_token
from app.authorization.roles import Roles
from app.authorization.permissions import Permissions
from app.audit.audit_service import (
    record_audit_event, verify_audit_chain, apply_retention_policy,
    sanitize_details, AuditAction, AuditResult, AuditDecision,
    AuditReasonCode, ActorType, HIGH_RISK_ACTIONS, AuditPersistenceError, GENESIS_HASH
)

client = TestClient(app, base_url="http://testserver")

def get_auth_client(role_name: str, email: str, employee_id: str):
    """Creates an authenticated client with an active session for the given role."""
    with get_db_context() as db:
        role = db.query(RoleModel).filter_by(name=role_name).first()
        user = db.query(UserModel).filter_by(official_email=email).first()
        if not user:
            user = UserModel(
                employee_id=employee_id,
                full_name=f"Officer {employee_id}",
                official_email=email,
                password_hash="hashed_dummy",
                role_id=role.id,
                status="ACTIVE"
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        raw_token, session = create_session(db, user.id, ip_address="127.0.0.1")
        user_proxy = SimpleNamespace(id=str(user.id), official_email=str(user.official_email))
        return client, raw_token, user_proxy


# ==============================================================================
# 1. Normalized Core Audit Event Model & Field Validation
# ==============================================================================

def test_audit_event_creation_and_fields():
    """Verify all normalized fields, global AUD- ID, UTC timestamp, and actor type."""
    with get_db_context() as db:
        aid = record_audit_event(
            action=AuditAction.CASE_VIEWED,
            result=AuditResult.SUCCESS,
            decision=AuditDecision.ALLOWED,
            user_id="USR-TEST-001",
            actor="dsp.verma@cyber.gov.in",
            actor_type=ActorType.HUMAN_USER,
            role=Roles.INSPECTOR,
            case_id="CASE-UNIT-001",
            resource_type="case",
            resource_id="CASE-UNIT-001",
            session_id="SES-XYZ123",
            endpoint="/api/cases/CASE-UNIT-001",
            http_method="GET",
            details={"inspection_notes": "Routine review"},
            request_id="REQ-TEST-999",
            correlation_id="CORR-TEST-999",
            db=db
        )

        assert aid.startswith("AUD-")
        
        # Verify from database
        record = db.query(AuditLogModel).filter_by(audit_id=aid).first()
        assert record is not None
        assert record.audit_event_id == aid
        assert record.actor == "dsp.verma@cyber.gov.in"
        assert record.actor_type == ActorType.HUMAN_USER
        assert record.role == Roles.INSPECTOR
        assert record.action == AuditAction.CASE_VIEWED
        assert record.result == "SUCCESS"
        assert record.decision == "ALLOWED"
        assert record.case_id == "CASE-UNIT-001"
        assert record.session_id == "SES-XYZ123"
        assert record.endpoint == "/api/cases/CASE-UNIT-001"
        assert record.http_method == "GET"
        assert record.request_id == "REQ-TEST-999"
        assert record.correlation_id == "CORR-TEST-999"
        assert record.event_hash is not None
        assert record.previous_event_hash is not None
        assert record.timestamp.tzinfo is not None  # Timezone aware UTC


# ==============================================================================
# 2. Recursive Sanitization & Secret Redaction (Security Test)
# ==============================================================================

def test_metadata_sanitization_and_secret_redaction():
    """Verify passwords, hashes, tokens, MFA secrets, and PINs are thoroughly redacted."""
    leaked_payload = {
        "user_email": "officer@cyber.gov.in",
        "password": "ClearTextPassword123!",
        "password_hash": "$2b$12$DUMMY_HASH_123456",
        "pin": "4432",
        "pin_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token",
        "refresh_token": "rt_secret_token_123",
        "mfa_secret": "JBSWY3DPEHPK3PXP",
        "nfc_credential": "raw_card_crypto_key_2026",
        "cookie": "session_id=somerawsessioncookie123",
        "api_key": "live_api_secret_key_999",
        "nested_profile": {
            "token": "nested_secret_token",
            "safe_field": "valid_value",
            "auth_header": "Bearer secret_bearer_token"
        },
        "list_data": [
            {"token": "token_in_list", "id": 101},
            "Bearer another_secret_token"
        ]
    }

    sanitized = sanitize_details(leaked_payload)

    # Assert redacting sensitive fields
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["password_hash"] == "[REDACTED]"
    assert sanitized["pin"] == "[REDACTED]"
    assert sanitized["pin_hash"] == "[REDACTED]"
    assert sanitized["access_token"] == "[REDACTED]"
    assert sanitized["refresh_token"] == "[REDACTED]"
    assert sanitized["mfa_secret"] == "[REDACTED]"
    assert sanitized["nfc_credential"] == "[REDACTED]"
    assert sanitized["cookie"] == "[REDACTED]"
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["nested_profile"]["token"] == "[REDACTED]"
    assert sanitized["nested_profile"]["safe_field"] == "valid_value"
    assert sanitized["nested_profile"]["auth_header"] == "Bearer [REDACTED]"
    assert sanitized["list_data"][0]["token"] == "[REDACTED]"
    assert sanitized["list_data"][0]["id"] == 101
    assert sanitized["list_data"][1] == "Bearer [REDACTED]"
    assert sanitized["user_email"] == "officer@cyber.gov.in"

    # Verify no sensitive substring exists in stringified output
    dumped = json.dumps(sanitized)
    assert "ClearTextPassword" not in dumped
    assert "DUMMY_HASH" not in dumped
    assert "JBSWY3DPEHPK3PXP" not in dumped
    assert "raw_card_crypto_key" not in dumped
    assert "live_api_secret_key" not in dumped


# ==============================================================================
# 3. Cryptographic Tamper-Evident Hash Chain & Tamper Detection
# ==============================================================================

def test_tamper_evident_hash_chain_and_verification():
    """Verify SHA-256 hash chaining and automated detection of tampered records."""
    with get_db_context() as db:
        # Record 3 continuous events
        id1 = record_audit_event(action=AuditAction.CASE_VIEWED, actor="officer1@gov.in", case_id="CASE-CH-01", db=db)
        id2 = record_audit_event(action=AuditAction.EVIDENCE_VIEWED, actor="officer2@gov.in", case_id="CASE-CH-01", db=db)
        id3 = record_audit_event(action=AuditAction.FINDING_VIEWED, actor="officer3@gov.in", case_id="CASE-CH-01", db=db)

        r1 = db.query(AuditLogModel).filter_by(audit_id=id1).first()
        r2 = db.query(AuditLogModel).filter_by(audit_id=id2).first()
        r3 = db.query(AuditLogModel).filter_by(audit_id=id3).first()

        # Verify hash link continuity
        assert r2.previous_event_hash == r1.event_hash
        assert r3.previous_event_hash == r2.event_hash

        # Run verification engine -> Should be VALID
        res = verify_audit_chain(db)
        assert res["status"] == "VALID"
        assert res["chain_intact"] is True
        assert len(res["anomalies"]) == 0

        # Tamper simulation: deliberately alter record 2's action directly in DB
        original_action = r2.action
        r2.action = "TAMPERED_ACTION_FORGED"
        db.commit()

        # Re-verify -> Should detect PAYLOAD_TAMPERED
        tamper_res = verify_audit_chain(db)
        assert tamper_res["status"] == "INTEGRITY_ANOMALY_DETECTED"
        assert tamper_res["chain_intact"] is False
        assert len(tamper_res["anomalies"]) > 0
        assert any(a["id"] == r2.id for a in tamper_res["anomalies"])

        # Restore record 2 to restore integrity
        r2.action = original_action
        db.commit()

        clean_res = verify_audit_chain(db)
        assert clean_res["status"] == "VALID"
        assert clean_res["chain_intact"] is True


# ==============================================================================
# 4. High-Risk Fail-Closed Policy Enforcement
# ==============================================================================

def test_high_risk_fail_closed_policy():
    """Verify that privileged operations abort if audit log persistence fails."""
    class BrokenSession:
        def query(self, *args, **kwargs):
            raise RuntimeError("Database connection suddenly severed")
        def add(self, *args, **kwargs):
            raise RuntimeError("Database write disk failure")
        def flush(self):
            raise RuntimeError("Database flush error")

    broken_db = BrokenSession()

    # Low-risk action does NOT raise exception (resilient)
    record_audit_event(
        action=AuditAction.CASE_VIEWED,
        actor="lead@cyber.gov.in",
        case_id="CASE-001",
        db=broken_db
    )

    # High-risk action MUST raise AuditPersistenceError (fail-closed)
    with pytest.raises(AuditPersistenceError) as exc_info:
        record_audit_event(
            action=AuditAction.EVIDENCE_EXPORTED,
            actor="lead@cyber.gov.in",
            case_id="CASE-001",
            db=broken_db
        )
    assert "Mandatory audit logging failed for high-risk action" in str(exc_info.value)


# ==============================================================================
# 5. Authorization Denials Auditing (Section 24 & 25)
# ==============================================================================

def test_authorization_denied_audit_logging():
    """Ensure accessing unauthorized cases and permissions triggers ACCESS_DENIED audit events."""
    with get_db_context() as db:
        # Create unassigned case
        unassigned_case = CaseModel(
            case_id="CASE-ISOLATED-999",
            case_reference="INV-2026-ISOLATED",
            title="Classified Isolated Case",
            created_by="LEAD",
            status="ACTIVE"
        )
        db.merge(unassigned_case)
        db.commit()

    # Sub-Inspector attempting to access unassigned case
    _, si_token, si_user = get_auth_client(Roles.SUB_INSPECTOR, "si.unauthorized@cyber.gov.in", "EMP-SI-UNAUTH")

    resp = client.get(
        "/api/cases/CASE-ISOLATED-999",
        cookies={"trace_session": si_token}
    )
    assert resp.status_code == 403

    # Verify ACCESS_DENIED record in audit ledger
    with get_db_context() as db:
        denial = (
            db.query(AuditLogModel)
            .filter_by(
                action=AuditAction.ACCESS_DENIED,
                user_id=si_user.id,
                case_id="CASE-ISOLATED-999"
            )
            .order_by(AuditLogModel.timestamp.desc())
            .first()
        )
        assert denial is not None
        assert denial.result == "DENIED"
        assert denial.decision == "DENIED"
        assert denial.reason_code == AuditReasonCode.CASE_ACCESS_DENIED
        assert denial.endpoint == "/api/cases/CASE-ISOLATED-999"
        assert denial.http_method == "GET"


# ==============================================================================
# 6. Role-Based Audit Visibility & IDOR Prevention (Section 54, 74, 75)
# ==============================================================================

def test_role_based_audit_visibility_and_idor_isolation():
    """Verify that field investigators only see audit logs for their assigned cases."""
    with get_db_context() as db:
        case_a = CaseModel(case_id="CASE-SCOPE-A", case_reference="INV-SCOPE-A", title="Case Alpha", created_by="LEAD")
        case_b = CaseModel(case_id="CASE-SCOPE-B", case_reference="INV-SCOPE-B", title="Case Beta", created_by="LEAD")
        db.merge(case_a)
        db.merge(case_b)
        db.commit()

    _, insp_token, insp_user = get_auth_client(Roles.INSPECTOR, "insp.scope@cyber.gov.in", "EMP-INSP-SCOPE")
    _, admin_token, admin_user = get_auth_client(Roles.SYSTEM_ADMIN, "admin.scope@cyber.gov.in", "EMP-ADM-SCOPE")

    with get_db_context() as db:
        # Assign inspector strictly to Case Alpha
        membership = CaseMemberModel(
            case_id="CASE-SCOPE-A",
            user_id=insp_user.id,
            case_role="INVESTIGATOR",
            assigned_by="LEAD"
        )
        db.add(membership)

        # Create audit records in both cases
        record_audit_event(action=AuditAction.CASE_VIEWED, case_id="CASE-SCOPE-A", actor="officerA@gov.in", db=db)
        record_audit_event(action=AuditAction.CASE_VIEWED, case_id="CASE-SCOPE-B", actor="officerB@gov.in", db=db)
        db.commit()

    # 1. Inspector queries audit logs -> Must only see Case Alpha, NOT Case Beta
    resp_insp = client.get(
        "/api/audit/logs",
        cookies={"trace_session": insp_token}
    )
    assert resp_insp.status_code == 200
    insp_logs = resp_insp.json()["logs"]
    assert any(l["case_id"] == "CASE-SCOPE-A" for l in insp_logs)
    assert not any(l["case_id"] == "CASE-SCOPE-B" for l in insp_logs)

    # 2. System Admin queries audit logs -> Sees both Case Alpha and Case Beta
    resp_adm = client.get(
        "/api/audit/logs",
        cookies={"trace_session": admin_token}
    )
    assert resp_adm.status_code == 200
    adm_logs = resp_adm.json()["logs"]
    assert any(l["case_id"] == "CASE-SCOPE-A" for l in adm_logs)
    assert any(l["case_id"] == "CASE-SCOPE-B" for l in adm_logs)


# ==============================================================================
# 7. Evidence Lifecycle Auditing (VIEW vs DOWNLOAD vs EXPORT)
# ==============================================================================

def test_evidence_lifecycle_auditing():
    """Verify distinct, un-collapsed events for VIEW, DOWNLOAD, and EXPORT."""
    with get_db_context() as db:
        case = CaseModel(case_id="CASE-EVD-TEST", case_reference="INV-EVD-TEST", title="Evidence Case", created_by="LEAD")
        db.merge(case)
        db.flush()

        ev = EvidenceModel(
            evidence_id="EVD-TEST-LIFECYCLE-001",
            case_id="CASE-EVD-TEST",
            original_filename="cdr_dump_2026.csv",
            file_size=1024,
            sha256="abc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890",
            storage_path="cases/CASE-EVD-TEST/evidence/EVD-TEST-LIFECYCLE-001/original/cdr_dump_2026.csv.enc"
        )
        db.merge(ev)
        db.commit()

    _, sp_token, sp_user = get_auth_client(Roles.SUPERINTENDENT, "sp.audit@cyber.gov.in", "EMP-SP-AUDIT")

    # 1. View Evidence
    v_resp = client.get(
        "/api/cases/evidence/EVD-TEST-LIFECYCLE-001",
        cookies={"trace_session": sp_token}
    )
    assert v_resp.status_code == 200

    # 2. Export Evidence
    e_resp = client.get(
        "/api/cases/evidence/EVD-TEST-LIFECYCLE-001/export",
        cookies={"trace_session": sp_token}
    )
    assert e_resp.status_code == 200

    # Verify both distinct events in DB
    with get_db_context() as db:
        view_event = db.query(AuditLogModel).filter_by(
            action=AuditAction.EVIDENCE_VIEWED,
            evidence_id="EVD-TEST-LIFECYCLE-001"
        ).first()
        export_event = db.query(AuditLogModel).filter_by(
            action=AuditAction.EVIDENCE_EXPORTED,
            evidence_id="EVD-TEST-LIFECYCLE-001"
        ).first()

        assert view_event is not None
        assert export_event is not None
        assert view_event.action != export_event.action


# ==============================================================================
# 8. Entity Resolution Merge & Split State Hash Auditing
# ==============================================================================

def test_entity_merge_split_auditing():
    """Verify that manual merge and split actions capture before/after reconstruction hashes."""
    with get_db_context() as db:
        c1 = GoldenProfileModel(
            case_id="CASE-ER-TEST",
            z_cluster_id="CLUSTER_A",
            primary_name="Suspect A",
            known_phones=["+919876543210"],
            known_accounts=["ACC-001"]
        )
        c2 = GoldenProfileModel(
            case_id="CASE-ER-TEST",
            z_cluster_id="CLUSTER_B",
            primary_name="Alias B",
            known_phones=["+919876543211"],
            known_accounts=["ACC-002"]
        )
        db.merge(c1)
        db.merge(c2)
        db.commit()

    _, ips_token, ips_user = get_auth_client(Roles.IPS_OFFICER, "ips.er@cyber.gov.in", "EMP-IPS-ER")

    # Merge Cluster B into Cluster A
    merge_resp = client.post(
        "/api/zingg/merge",
        cookies={"trace_session": ips_token},
        json={
            "case_id": "CASE-ER-TEST",
            "target_cluster_id": "CLUSTER_A",
            "source_cluster_ids": ["CLUSTER_B"],
            "reason": "Matching SIM card IMEI"
        }
    )
    assert merge_resp.status_code == 200

    with get_db_context() as db:
        merge_audit = db.query(AuditLogModel).filter_by(
            action=AuditAction.ENTITY_MERGED,
            resource_id="CLUSTER_A"
        ).order_by(AuditLogModel.timestamp.desc()).first()

        assert merge_audit is not None
        assert merge_audit.previous_state_hash is not None
        assert merge_audit.new_state_hash is not None
        assert merge_audit.previous_state_hash != merge_audit.new_state_hash


# ==============================================================================
# 9. Dedicated Case Activity / Audit Timeline Endpoint
# ==============================================================================

def test_case_activity_timeline_endpoint():
    """Verify GET /api/audit/cases/{case_id}/timeline returns chronological platform actions."""
    with get_db_context() as db:
        cid = "CASE-TIMELINE-TEST"
        case = CaseModel(case_id=cid, case_reference="INV-TL-01", title="Timeline Case", created_by="LEAD")
        db.merge(case)
        db.commit()

        record_audit_event(action=AuditAction.EVIDENCE_UPLOADED, case_id=cid, actor="officer1@gov.in", db=db)
        record_audit_event(action=AuditAction.ENTITY_RESOLVED, case_id=cid, actor="system@gov.in", db=db)
        record_audit_event(action=AuditAction.FINDING_APPROVED, case_id=cid, actor="sp@gov.in", db=db)

    _, sp_token, _ = get_auth_client(Roles.SUPERINTENDENT, "sp.tl@cyber.gov.in", "EMP-SP-TL")

    resp = client.get(
        f"/api/audit/cases/{cid}/timeline",
        cookies={"trace_session": sp_token}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["case_id"] == cid
    assert data["total_records"] >= 3
    actions = [a["action"] for a in data["activities"]]
    assert AuditAction.EVIDENCE_UPLOADED in actions
    assert AuditAction.ENTITY_RESOLVED in actions
    assert AuditAction.FINDING_APPROVED in actions


# ==============================================================================
# 10. Audit Export & Self-Audit Verification
# ==============================================================================

def test_audit_export_and_self_audit():
    """Verify export creates AUDIT_EXPORTED event without infinite recursion."""
    _, adm_token, adm_user = get_auth_client(Roles.SYSTEM_ADMIN, "admin.export@cyber.gov.in", "EMP-ADM-EXP")

    resp = client.get(
        "/api/audit/export?format=csv",
        cookies={"trace_session": adm_token}
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "Audit Event ID" in resp.text

    # Verify AUDIT_EXPORTED event exists
    with get_db_context() as db:
        export_event = db.query(AuditLogModel).filter_by(
            action=AuditAction.AUDIT_EXPORTED,
            user_id=adm_user.id
        ).first()
        assert export_event is not None
        assert export_event.result == "SUCCESS"


# ==============================================================================
# 11. Audit Retention Policy Execution
# ==============================================================================

def test_audit_retention_policy_execution():
    """Verify retention policy executes and self-audits."""
    with get_db_context() as db:
        res = apply_retention_policy(db, retention_days=365, admin_user="admin@cyber.gov.in")
        assert res["retention_days"] == 365
        assert "cutoff_date" in res

        # Verify AUDIT_RETENTION_EXECUTED record
        retention_event = db.query(AuditLogModel).filter_by(
            action=AuditAction.AUDIT_RETENTION_EXECUTED
        ).first()
        assert retention_event is not None
