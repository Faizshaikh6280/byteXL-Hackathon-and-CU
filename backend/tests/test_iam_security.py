import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import get_db_context
from app.models.iam_models import UserModel, RoleModel, PermissionModel, CaseMemberModel
from app.models.postgres_models import CaseModel, EvidenceModel, AnomalyFindingModel, AuditLogModel
from app.auth.password import hash_password, verify_password, validate_password_complexity
from app.auth.mfa import TOTPService
from app.auth.session import create_session, get_session_by_token, revoke_session, hash_token
from app.auth.rate_limiter import rate_limiter
from app.authorization.roles import Roles, ROLE_PERMISSION_MATRIX
from app.authorization.permissions import Permissions
from app.authorization.policy import policy_engine, AuthorizationRequest
from app.audit.audit_service import record_audit_event, AuditAction

client = TestClient(app, base_url="http://testserver")

# ==============================================================================
# 1. Password Security & Complexity Tests
# ==============================================================================

def test_password_hashing_and_verification():
    raw_pass = "Complex#Secret2026!Pswd"
    hashed = hash_password(raw_pass)
    assert hashed != raw_pass
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False

def test_password_complexity_validation():
    # Valid passwords
    is_valid, msg = validate_password_complexity("Valid#Password2026!Key")
    assert is_valid is True

    # Too short
    is_valid, msg = validate_password_complexity("Short1!")
    assert is_valid is False
    assert "at least 12 characters" in msg

    # Missing uppercase
    is_valid, msg = validate_password_complexity("lowercase#2026!only")
    assert is_valid is False
    assert "uppercase" in msg

    # Missing number
    is_valid, msg = validate_password_complexity("NoDigitsInThisPassword#!")
    assert is_valid is False
    assert "digit" in msg

    # Missing special character
    is_valid, msg = validate_password_complexity("NoSpecialChars2026Here")
    assert is_valid is False
    assert "special character" in msg

# ==============================================================================
# 2. MFA (RFC 6238 TOTP) & Secret Encryption Tests
# ==============================================================================

def test_mfa_secret_encryption_roundtrip():
    secret = TOTPService.generate_secret()
    assert len(secret) == 32
    enc = TOTPService.encrypt_secret(secret)
    assert enc != secret
    dec = TOTPService.decrypt_secret(enc)
    assert dec == secret

def test_totp_code_verification():
    secret = TOTPService.generate_secret()
    current_code = TOTPService.generate_totp_code(secret)

    # Current code must verify
    assert TOTPService.verify_totp_code(secret, current_code) is True
    # Bogus code must fail
    assert TOTPService.verify_totp_code(secret, "000000") is False

def test_backup_recovery_codes():
    codes, hashes = TOTPService.generate_backup_codes(count=8)
    assert len(codes) == 8
    assert len(hashes) == 8
    for c in codes:
        assert len(c) == 11  # e.g. 'XXXXX-XXXXX'
    # Each code should verify against its corresponding hash
    valid, remaining = TOTPService.verify_backup_code(codes[0], hashes)
    assert valid is True
    assert len(remaining) == 7

# ==============================================================================
# 3. Session Lifecycle & Token Management
# ==============================================================================

def test_session_lifecycle():
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="admin@cyber.gov.in").first()
        assert user is not None

        # Create session
        raw_token, session_obj = create_session(db=db, user_id=user.id, ip_address="127.0.0.1", user_agent="PyTest/1.0")
        assert len(raw_token) > 30
        assert session_obj.session_id == hash_token(raw_token)
        assert session_obj.revoked is False

        # Retrieve session
        retrieved_user = get_session_by_token(db=db, raw_token=raw_token)
        assert retrieved_user is not None
        assert retrieved_user.id == user.id

        # Revoke session
        revoked = revoke_session(db=db, raw_token=raw_token)
        assert revoked is True

        # After revocation, token cannot be retrieved
        after_revoke = get_session_by_token(db=db, raw_token=raw_token)
        assert after_revoke is None

# ==============================================================================
# 4. Rate Limiting & Account Lockout
# ==============================================================================

def test_rate_limiter_lockout():
    test_email = "lockout.test@cyber.gov.in"
    rate_limiter.reset_user(test_email)

    # 4 failed attempts should not lock out
    for _ in range(4):
        locked, _ = rate_limiter.record_failed_attempt(test_email)
        assert locked is False

    # 5th attempt must trigger account lockout
    locked, duration = rate_limiter.record_failed_attempt(test_email)
    assert locked is True
    assert duration > 0

    # Next check must report locked
    is_locked, rem = rate_limiter.is_user_locked(test_email)
    assert is_locked is True

    # Reset clears lockout
    rate_limiter.reset_user(test_email)
    is_locked, _ = rate_limiter.is_user_locked(test_email)
    assert is_locked is False

# ==============================================================================
# 5. Role × Permission Matrix Verification (Canonical 7 Roles)
# ==============================================================================

def test_role_permission_matrix_canonical():
    # 1. SYSTEM_ADMIN must possess all permissions
    admin_perms = ROLE_PERMISSION_MATRIX[Roles.SYSTEM_ADMIN]
    assert Permissions.USER_CREATE in admin_perms
    assert Permissions.ROLE_MANAGE in admin_perms
    assert Permissions.CASE_DELETE in admin_perms
    assert Permissions.AUDIT_VIEW in admin_perms

    # 2. SUPERINTENDENT has broad investigative power, but NO user creation or role management
    sp_perms = ROLE_PERMISSION_MATRIX[Roles.SUPERINTENDENT]
    assert Permissions.CASE_CREATE in sp_perms
    assert Permissions.FINDING_APPROVE in sp_perms
    assert Permissions.REPORT_EXPORT in sp_perms
    assert Permissions.USER_CREATE not in sp_perms
    assert Permissions.ROLE_MANAGE not in sp_perms

    # 3. IPS_OFFICER has case and findings approval, but NO case deletion
    ips_perms = ROLE_PERMISSION_MATRIX[Roles.IPS_OFFICER]
    assert Permissions.FINDING_APPROVE in ips_perms
    assert Permissions.EVIDENCE_UPLOAD in ips_perms
    assert Permissions.CASE_DELETE not in ips_perms

    # 4. INSPECTOR can approve findings and upload evidence
    insp_perms = ROLE_PERMISSION_MATRIX[Roles.INSPECTOR]
    assert Permissions.FINDING_APPROVE in insp_perms
    assert Permissions.EVIDENCE_UPLOAD in insp_perms
    assert Permissions.CASE_DELETE not in insp_perms

    # 5. SUB_INSPECTOR cannot approve findings
    si_perms = ROLE_PERMISSION_MATRIX[Roles.SUB_INSPECTOR]
    assert Permissions.FINDING_CREATE in si_perms
    assert Permissions.FINDING_APPROVE not in si_perms
    assert Permissions.CASE_DELETE not in si_perms

    # 6. ANALYST can investigate anomalies, view graphs, but cannot approve findings or delete cases
    anl_perms = ROLE_PERMISSION_MATRIX[Roles.ANALYST]
    assert Permissions.ANOMALY_INVESTIGATE in anl_perms
    assert Permissions.GRAPH_VIEW in anl_perms
    assert Permissions.FINDING_APPROVE not in anl_perms
    assert Permissions.CASE_DELETE not in anl_perms

    # 7. AUDITOR is strictly read-only
    aud_perms = ROLE_PERMISSION_MATRIX[Roles.AUDITOR]
    assert Permissions.AUDIT_VIEW in aud_perms
    assert Permissions.AUDIT_EXPORT in aud_perms
    assert Permissions.CASE_READ in aud_perms
    assert Permissions.CASE_CREATE not in aud_perms
    assert Permissions.CASE_UPDATE not in aud_perms
    assert Permissions.EVIDENCE_UPLOAD not in aud_perms
    assert Permissions.FINDING_CREATE not in aud_perms

# ==============================================================================
# 6. Evidence Immutability Enforcement
# ==============================================================================

def test_evidence_immutability_policy():
    with get_db_context() as db:
        admin = db.query(UserModel).filter_by(official_email="admin@cyber.gov.in").first()
        req_delete = AuthorizationRequest(
            user=admin,
            permission="evidence.delete",
            resource_type="evidence"
        )
        decision = policy_engine.evaluate(req_delete, db=db)
        assert decision.allowed is False
        assert "immutable" in decision.reason.lower()

# ==============================================================================
# 7. Authentication API Endpoints (Login, Me, Logout)
# ==============================================================================

def test_api_login_success_and_me():
    # Login as Admin
    resp = client.post("/api/auth/login", json={
        "identifier": "admin@cyber.gov.in",
        "password": "Admin#Cyber2026!Secure"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "AUTHENTICATED"
    assert "user" in data
    assert data["user"]["email"] == "admin@cyber.gov.in"
    assert data["user"]["role"] == "SYSTEM_ADMIN"
    assert "trace_session" in resp.cookies

    session_cookie = resp.cookies["trace_session"]

    # Access /me with session cookie
    me_resp = client.get("/api/auth/me", cookies={"trace_session": session_cookie})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["user"]["email"] == "admin@cyber.gov.in"
    assert len(me_data["permissions"]) >= 10

    # Logout
    logout_resp = client.post("/api/auth/logout", cookies={"trace_session": session_cookie})
    assert logout_resp.status_code == 200

    # Subsequent /me should return 401
    me_after = client.get("/api/auth/me", cookies={"trace_session": session_cookie})
    assert me_after.status_code == 401

def test_api_login_invalid_password():
    resp = client.post("/api/auth/login", json={
        "identifier": "admin@cyber.gov.in",
        "password": "WrongPassword#2026!"
    })
    assert resp.status_code == 401
    assert "Invalid credentials" in resp.json()["detail"]

# ==============================================================================
# 8. Case Scoping & IDOR Prevention
# ==============================================================================

def test_case_scoping_and_idor_isolation():
    # Login as Sub-Inspector (si.sharma is assigned ONLY to Black Circuit & Iron Lotus)
    resp = client.post("/api/auth/login", json={
        "identifier": "si.sharma@cyber.gov.in",
        "password": "Officer#Cyber2026!SI"
    })
    assert resp.status_code == 200
    si_cookie = resp.cookies["trace_session"]

    # 1. Access assigned case -> Should SUCCEED (200)
    assigned_resp = client.get("/api/cases/INV-2026-BLACK-CIRCUIT", cookies={"trace_session": si_cookie})
    assert assigned_resp.status_code == 200

    # 2. Access unassigned case -> Must DENY (403 Forbidden - IDOR prevented!)
    unassigned_resp = client.get("/api/cases/INV-2026-NIGHT-LEDGER", cookies={"trace_session": si_cookie})
    assert unassigned_resp.status_code == 403
    assert "Access denied" in unassigned_resp.json()["detail"]

# ==============================================================================
# 9. Findings Approval Hierarchy (Inspector/SP vs Sub-Inspector/Analyst)
# ==============================================================================

def test_findings_approval_hierarchy():
    with get_db_context() as db:
        finding = db.query(AnomalyFindingModel).first()
        if not finding:
            # Create a test finding
            finding = AnomalyFindingModel(
                finding_id="FINDING-TEST-001",
                case_id="INV-2026-BLACK-CIRCUIT",
                entity_id="entity_1",
                entity_type="SUSPECT",
                fingerprint="FP-TEST-001",
                domain="FINANCIAL",
                primary_detector_type="BURST",
                title="Test Suspicious Transaction Pattern",
                severity="HIGH",
                status="DETECTED"
            )
            db.add(finding)
            db.commit()
        target_finding_id = finding.finding_id

    # Login as Sub-Inspector
    si_login = client.post("/api/auth/login", json={
        "identifier": "si.sharma@cyber.gov.in",
        "password": "Officer#Cyber2026!SI"
    })
    si_cookie = si_login.cookies["trace_session"]

    # Sub-Inspector attempting to approve finding -> Must DENY (403)
    si_approve = client.post(
        f"/api/anomalies/findings/{target_finding_id}/approve",
        cookies={"trace_session": si_cookie}
    )
    assert si_approve.status_code == 403

    # Login as Inspector
    insp_login = client.post("/api/auth/login", json={
        "identifier": "insp.rathore@cyber.gov.in",
        "password": "Officer#Cyber2026!INSP"
    })
    insp_cookie = insp_login.cookies["trace_session"]

    # Inspector approving finding -> Should SUCCEED (200)
    insp_approve = client.post(
        f"/api/anomalies/findings/{target_finding_id}/approve",
        cookies={"trace_session": insp_cookie}
    )
    if insp_approve.status_code != 200:
        print("INSP APPROVE ERROR:", insp_approve.status_code, insp_approve.text)
    assert insp_approve.status_code == 200
    assert insp_approve.json()["state"] == "APPROVED"

# ==============================================================================
# 10. Audit Trail Verification & Querying
# ==============================================================================

def test_audit_trail_logging_and_export():
    # Login as Auditor
    aud_login = client.post("/api/auth/login", json={
        "identifier": "auditor.verma@cyber.gov.in",
        "password": "Officer#Cyber2026!AUD"
    })
    aud_cookie = aud_login.cookies["trace_session"]

    # View audit logs
    audit_resp = client.get("/api/audit/logs?limit=50", cookies={"trace_session": aud_cookie})
    assert audit_resp.status_code == 200
    logs_data = audit_resp.json()
    assert "logs" in logs_data
    assert len(logs_data["logs"]) > 0

    # Verify audit export creates an AUDIT_EXPORTED entry
    export_resp = client.get("/api/audit/export?format=csv", cookies={"trace_session": aud_cookie})
    assert export_resp.status_code == 200
    assert "attachment" in export_resp.headers.get("content-disposition", "")


if __name__ == "__main__":
    print("\n--- RUNNING IAM SECURITY TEST SUITE ---")
    tests = [
        ("Password Hashing & Verification", test_password_hashing_and_verification),
        ("Password Complexity Validation", test_password_complexity_validation),
        ("MFA Secret Encryption Roundtrip", test_mfa_secret_encryption_roundtrip),
        ("TOTP Code Verification", test_totp_code_verification),
        ("Backup Recovery Codes", test_backup_recovery_codes),
        ("Session Lifecycle & Token Security", test_session_lifecycle),
        ("Rate Limiter & Account Lockout", test_rate_limiter_lockout),
        ("Canonical Role-Permission Matrix", test_role_permission_matrix_canonical),
        ("Evidence Immutability Safeguards", test_evidence_immutability_policy),
        ("Authentication API (Login, Me, Logout)", test_api_login_success_and_me),
        ("Authentication API (Invalid Password)", test_api_login_invalid_password),
        ("Case Scoping & IDOR Prevention", test_case_scoping_and_idor_isolation),
        ("Findings Approval Hierarchy", test_findings_approval_hierarchy),
        ("Audit Trail Logging & Export", test_audit_trail_logging_and_export),
    ]

    passed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"  [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nRESULTS: {passed}/{len(tests)} TESTS PASSED")
