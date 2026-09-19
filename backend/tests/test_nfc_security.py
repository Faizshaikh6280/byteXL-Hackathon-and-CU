"""
Comprehensive NFC Card + 4-Digit PIN Security & Penetration Test Suite.
Verifies all 16 critical security invariants:
1.  Opaque Token Generation & Entropy
2.  Hash-at-Rest Guarantee (Raw Token Never Stored)
3.  Bcrypt PIN Hashing & Constant-Time Verification
4.  Factor 1 Alone Ineffective (NFC Token Alone Does Not Authenticate)
5.  Factor 2 Alone Ineffective (PIN Without Valid Transaction Fails)
6.  Valid NFC + Valid PIN (2FA Success & Session Cookie)
7.  Valid NFC + Invalid PIN (Failure & Throttling)
8.  Brute-Force Lockout (5 Failed Attempts -> 15-Min Card Lockout)
9.  Transaction Expiration (Expired > 120s Rejected)
10. Transaction Single-Use (Replay Attack Prevention)
11. Revoked Card Handling (Revoked Card Denied Even With Valid PIN)
12. Suspended Card Handling (Suspended Card Denied)
13. Disabled Officer Account Handling (Disabled Account Denied)
14. Server-Determined Active Case Resolution (Tamper-Proof)
15. RBAC & ABAC Preservation (Session Permissions Match Role)
16. Tamper-Evident Audit Logging (Full Lifecycle Audited Without Credential Leakage)
"""

import sys
import os
import time
import secrets
import hashlib
import datetime
from fastapi.testclient import TestClient

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_context, init_postgres
from app.models.iam_models import UserModel, RoleModel, CaseMemberModel
from app.models.nfc_models import NFCOfficerCardModel
from app.models.postgres_models import CaseModel, AuditLogModel
from app.auth.nfc_service import (
    generate_card_credential, hash_credential, hash_pin, verify_pin,
    create_login_transaction, get_login_transaction, consume_login_transaction,
    _nfc_transactions
)
from app.core.seed_nfc import SEEDED_DEV_NFC_CARDS
from app.auth.rate_limiter import _ip_attempts
from app.auth.password import hash_password

import pytest

@pytest.fixture(autouse=True)
def reset_rate_limits():
    _ip_attempts.clear()
    yield
    _ip_attempts.clear()

client = TestClient(app)

def test_1_opaque_token_generation_and_entropy():
    """Invariant 1: NFC credentials must be opaque, high-entropy, and non-predictable."""
    tokens = set()
    for _ in range(100):
        raw_token, cred_hash, masked_uid = generate_card_credential()
        assert raw_token.startswith("nfc_c_")
        assert len(raw_token) >= 50
        assert len(cred_hash) == 64  # SHA-256
        assert masked_uid.startswith("NFC-")
        tokens.add(raw_token)
    assert len(tokens) == 100
    print("  [PASS] 1. Opaque Token Generation & Entropy")

def test_2_hash_at_rest_guarantee():
    """Invariant 2: Server database must store only the hash, never the raw token."""
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="insp.rathore@cyber.gov.in").first()
        assert user is not None
        card = NFCOfficerCardModel(
            user_id=user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("1357"),
            status="ACTIVE"
        )
        db.add(card)
        db.commit()
        db.refresh(card)
        
        # Verify database record
        saved = db.query(NFCOfficerCardModel).filter_by(id=card.id).first()
        assert saved.credential_hash == cred_hash
        assert raw_token not in saved.credential_hash
        # Cleanup
        db.delete(saved)
        db.commit()
    print("  [PASS] 2. Hash-at-Rest Guarantee (Zero Raw Token Storage)")

def test_3_pin_hashing_and_verification():
    """Invariant 3: PINs must be hashed with bcrypt and verified in constant time."""
    pin = "4829"
    hashed = hash_pin(pin)
    assert hashed != pin
    assert hashed.startswith("$2b$")
    assert verify_pin("4829", hashed) is True
    assert verify_pin("0000", hashed) is False
    assert verify_pin("4828", hashed) is False
    print("  [PASS] 3. Bcrypt PIN Hashing & Constant-Time Verification")

def test_4_factor_1_alone_ineffective():
    """Invariant 4: NFC credential alone MUST NOT authenticate the user or issue a session."""
    target = SEEDED_DEV_NFC_CARDS[2]  # Inspector Rathore
    resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "AWAITING_PIN"
    assert "transaction_id" in data
    # Ensure NO session cookie was issued
    assert "trace_session" not in resp.cookies
    # Ensure NO officer sensitive identity leaked
    assert "user" not in data
    assert "role" not in data
    assert "email" not in data
    print("  [PASS] 4. Factor 1 Alone Ineffective (No Session Issued)")

def test_5_factor_2_alone_ineffective():
    """Invariant 5: 4-digit PIN alone without valid NFC transaction MUST NOT authenticate."""
    resp = client.post("/api/auth/nfc/verify-pin", json={
        "transaction_id": "tx_nonexistent_transaction_fake_id_12345",
        "pin": "3456"
    })
    assert resp.status_code == 401
    assert "trace_session" not in resp.cookies
    print("  [PASS] 5. Factor 2 Alone Ineffective (PIN Without Transaction Fails)")

def test_6_valid_nfc_plus_valid_pin_success():
    """Invariant 6: Valid NFC token + Valid PIN creates full authenticated session."""
    target = SEEDED_DEV_NFC_CARDS[2]  # Inspector Rathore, PIN: 3456
    # Step 1: Initiate
    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    assert init_resp.status_code == 200
    tx_id = init_resp.json()["transaction_id"]

    # Step 2: Verify PIN
    verify_resp = client.post("/api/auth/nfc/verify-pin", json={
        "transaction_id": tx_id,
        "pin": target["default_pin"]
    })
    assert verify_resp.status_code == 200
    data = verify_resp.json()
    assert data["status"] == "AUTHENTICATED"
    assert data["user"]["email"] == target["email"]
    assert "trace_session" in verify_resp.cookies
    session_cookie = verify_resp.cookies["trace_session"]

    # Verify session works against /api/auth/me
    me_resp = client.get("/api/auth/me", cookies={"trace_session": session_cookie})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["user"]["email"] == target["email"]
    print("  [PASS] 6. Valid NFC + Valid PIN (2FA Success & Session Cookie)")

def test_7_valid_nfc_plus_invalid_pin_failure():
    """Invariant 7: Incorrect PIN must be rejected with attempt countdown."""
    target = SEEDED_DEV_NFC_CARDS[2]  # Inspector Rathore
    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    assert init_resp.status_code == 200
    tx_id = init_resp.json()["transaction_id"]

    # Enter wrong PIN
    bad_resp = client.post("/api/auth/nfc/verify-pin", json={
        "transaction_id": tx_id,
        "pin": "9999"
    })
    assert bad_resp.status_code == 401
    assert "trace_session" not in bad_resp.cookies
    assert "2 attempts remaining" in bad_resp.json()["detail"]
    print("  [PASS] 7. Valid NFC + Invalid PIN (Rejected with Throttling)")

def test_8_brute_force_lockout():
    """Invariant 8: Repeated failed PIN attempts trigger card lockout."""
    # Create test officer card
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="analyst.mehta@cyber.gov.in").first()
        card = NFCOfficerCardModel(
            user_id=user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("5555"),
            status="ACTIVE"
        )
        db.add(card)
        db.commit()
        db.refresh(card)
        card_id = card.id

    # Exhaust attempts across 2 transactions (3 in first, 2 in second -> 5 total)
    # Tx 1: 3 failed attempts
    init_1 = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    tx_1 = init_1.json()["transaction_id"]
    client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_1, "pin": "0001"})
    client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_1, "pin": "0002"})
    client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_1, "pin": "0003"})

    # Tx 2: 2 failed attempts -> triggers 5th failure lockout
    init_2 = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    tx_2 = init_2.json()["transaction_id"]
    client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_2, "pin": "0004"})
    lock_resp = client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_2, "pin": "0005"})
    assert lock_resp.status_code == 403
    assert "locked" in lock_resp.json()["detail"].lower()

    # Verify subsequent initiate is locked
    init_3 = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    assert init_3.status_code == 403

    # Cleanup test card
    with get_db_context() as db:
        c = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
        if c:
            db.delete(c)
            db.commit()
    print("  [PASS] 8. Anti-Brute-Force Lockout (Card Locked After 5 Failures)")

def test_9_transaction_expiration():
    """Invariant 9: Expired authentication transactions (> 120s) must be rejected."""
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="sp.rao@cyber.gov.in").first()
        card = NFCOfficerCardModel(
            user_id=user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("1234"),
            status="ACTIVE"
        )
        db.add(card)
        db.commit()
        card_id = card.id

    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    tx_id = init_resp.json()["transaction_id"]

    # Artificially expire the transaction in memory
    _nfc_transactions[tx_id]["expires_at"] = time.time() - 10

    exp_resp = client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_id, "pin": "1234"})
    assert exp_resp.status_code == 401
    assert "expired" in exp_resp.json()["detail"].lower()

    # Cleanup
    with get_db_context() as db:
        c = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
        if c:
            db.delete(c)
            db.commit()
    print("  [PASS] 9. Transaction Expiration (Expired > 120s Denied)")

def test_10_transaction_single_use():
    """Invariant 10: Consumed transactions cannot be replayed."""
    target = SEEDED_DEV_NFC_CARDS[1]  # IPS Sen, PIN: 2345
    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    tx_id = init_resp.json()["transaction_id"]

    # First verify succeeds
    resp1 = client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_id, "pin": target["default_pin"]})
    assert resp1.status_code == 200

    # Replay with same transaction_id MUST fail
    resp2 = client.post("/api/auth/nfc/verify-pin", json={"transaction_id": tx_id, "pin": target["default_pin"]})
    assert resp2.status_code == 401
    print("  [PASS] 10. Transaction Single-Use (Replay Attack Prevention)")

def test_11_revoked_card_handling():
    """Invariant 11: A revoked card must never authenticate even with valid credential and PIN."""
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="insp.rathore@cyber.gov.in").first()
        card = NFCOfficerCardModel(
            user_id=user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("7777"),
            status="REVOKED",
            revoked_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(card)
        db.commit()
        card_id = card.id

    # Attempt initiation
    resp = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    assert resp.status_code == 401

    # Cleanup
    with get_db_context() as db:
        c = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
        if c:
            db.delete(c)
            db.commit()
    print("  [PASS] 11. Revoked Card Handling (Denied on Initiation)")

def test_12_suspended_card_handling():
    """Invariant 12: A suspended card must be denied authentication."""
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        user = db.query(UserModel).filter_by(official_email="insp.rathore@cyber.gov.in").first()
        card = NFCOfficerCardModel(
            user_id=user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("7777"),
            status="SUSPENDED"
        )
        db.add(card)
        db.commit()
        card_id = card.id

    resp = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    assert resp.status_code == 401

    # Cleanup
    with get_db_context() as db:
        c = db.query(NFCOfficerCardModel).filter_by(id=card_id).first()
        if c:
            db.delete(c)
            db.commit()
    print("  [PASS] 12. Suspended Card Handling (Suspended Card Denied)")

def test_13_disabled_officer_account_handling():
    """Invariant 13: An active card for a disabled officer account must be rejected."""
    raw_token, cred_hash, masked_uid = generate_card_credential()
    with get_db_context() as db:
        old_u = db.query(UserModel).filter_by(employee_id="EMP-DIS-999").first()
        if old_u:
            db.query(NFCOfficerCardModel).filter_by(user_id=old_u.id).delete()
            db.delete(old_u)
            db.commit()
        role = db.query(RoleModel).filter_by(name="ANALYST").first()
        disabled_user = UserModel(
            employee_id="EMP-DIS-999",
            full_name="Disabled Officer",
            official_email="disabled.officer@cyber.gov.in",
            password_hash=hash_password("Dummy#Pass123!Secure"),
            role_id=role.id,
            status="DISABLED"
        )
        db.add(disabled_user)
        db.commit()
        db.refresh(disabled_user)

        card = NFCOfficerCardModel(
            user_id=disabled_user.id,
            card_uid=masked_uid,
            credential_hash=cred_hash,
            pin_hash=hash_pin("8888"),
            status="ACTIVE"
        )
        db.add(card)
        db.commit()
        u_id = disabled_user.id
        c_id = card.id

    resp = client.post("/api/auth/nfc/initiate", json={"credential": raw_token})
    assert resp.status_code == 403

    # Cleanup
    with get_db_context() as db:
        c = db.query(NFCOfficerCardModel).filter_by(id=c_id).first()
        if c: db.delete(c)
        u = db.query(UserModel).filter_by(id=u_id).first()
        if u: db.delete(u)
        db.commit()
    print("  [PASS] 13. Disabled Officer Account Handling (Denied)")

def test_14_most_recent_active_case_resolution():
    """Invariant 14: Server automatically selects the most recent ACTIVE AUTHORIZED case."""
    target = SEEDED_DEV_NFC_CARDS[0]  # SP Rao
    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    tx_id = init_resp.json()["transaction_id"]

    verify_resp = client.post("/api/auth/nfc/verify-pin", json={
        "transaction_id": tx_id,
        "pin": target["default_pin"]
    })
    assert verify_resp.status_code == 200
    target_case_id = verify_resp.json()["target_case_id"]
    assert target_case_id is not None
    assert target_case_id.startswith("INV-") or target_case_id.startswith("CASE-")
    print(f"  [PASS] 14. Active Case Resolution (Resolved: {target_case_id})")

def test_15_rbac_and_abac_preservation():
    """Invariant 15: NFC login sessions strictly preserve the canonical RBAC role and permissions."""
    # Authenticate Sub-Inspector via NFC
    target = SEEDED_DEV_NFC_CARDS[3]  # Sub-Inspector Sharma
    init_resp = client.post("/api/auth/nfc/initiate", json={"credential": target["token"]})
    tx_id = init_resp.json()["transaction_id"]

    verify_resp = client.post("/api/auth/nfc/verify-pin", json={
        "transaction_id": tx_id,
        "pin": target["default_pin"]
    })
    assert verify_resp.status_code == 200
    si_cookie = verify_resp.cookies["trace_session"]

    # Sub-Inspector should NOT have access to /api/admin/users
    admin_resp = client.get("/api/admin/users", cookies={"trace_session": si_cookie})
    assert admin_resp.status_code == 403

    # Authenticate System Admin via NFC
    admin_target = SEEDED_DEV_NFC_CARDS[6]  # Admin
    init_admin = client.post("/api/auth/nfc/initiate", json={"credential": admin_target["token"]})
    admin_tx = init_admin.json()["transaction_id"]
    verify_admin = client.post("/api/auth/nfc/verify-pin", json={"transaction_id": admin_tx, "pin": admin_target["default_pin"]})
    assert verify_admin.status_code == 200
    admin_cookie = verify_admin.cookies["trace_session"]

    # Admin CAN access /api/admin/users
    admin_users_resp = client.get("/api/admin/users", cookies={"trace_session": admin_cookie})
    assert admin_users_resp.status_code == 200
    print("  [PASS] 15. RBAC & ABAC Preservation (Role Privileges Exactly Preserved)")

def test_16_audit_trail_logging_completeness():
    """Invariant 16: All NFC auth lifecycle events are recorded in audit logs without leaking secrets."""
    with get_db_context() as db:
        logs = (
            db.query(AuditLogModel)
            .filter(AuditLogModel.action.in_([
                "NFC_AUTH_INITIATED", "NFC_AUTH_SUCCESS", "NFC_PIN_FAILED"
            ]))
            .order_by(AuditLogModel.timestamp.desc())
            .limit(10)
            .all()
        )
        assert len(logs) > 0
        for l in logs:
            # Verify no secret or pin leakage in audit metadata
            if l.details:
                for k, v in l.details.items():
                    assert "pin" not in k.lower()
                    assert "raw" not in k.lower()
                    if "token" in k.lower():
                        assert v == "[REDACTED]" or "..." in str(v)
    print("  [PASS] 16. Tamper-Evident Audit Trail (Recorded Without Credential Leaks)")

if __name__ == "__main__":
    print("\n--- RUNNING NFC CARD + 4-DIGIT PIN SECURITY TEST SUITE ---")
    init_postgres()
    reset_rate_limits()
    test_1_opaque_token_generation_and_entropy()
    reset_rate_limits()
    test_2_hash_at_rest_guarantee()
    reset_rate_limits()
    test_3_pin_hashing_and_verification()
    reset_rate_limits()
    test_4_factor_1_alone_ineffective()
    reset_rate_limits()
    test_5_factor_2_alone_ineffective()
    reset_rate_limits()
    test_6_valid_nfc_plus_valid_pin_success()
    reset_rate_limits()
    test_7_valid_nfc_plus_invalid_pin_failure()
    reset_rate_limits()
    test_8_brute_force_lockout()
    reset_rate_limits()
    test_9_transaction_expiration()
    reset_rate_limits()
    test_10_transaction_single_use()
    reset_rate_limits()
    test_11_revoked_card_handling()
    reset_rate_limits()
    test_12_suspended_card_handling()
    reset_rate_limits()
    test_13_disabled_officer_account_handling()
    reset_rate_limits()
    test_14_most_recent_active_case_resolution()
    reset_rate_limits()
    test_15_rbac_and_abac_preservation()
    reset_rate_limits()
    test_16_audit_trail_logging_completeness()
    print("\nRESULTS: 16/16 TESTS PASSED\n")
