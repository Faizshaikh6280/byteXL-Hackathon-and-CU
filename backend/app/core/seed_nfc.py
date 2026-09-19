"""
Seeder for Benchmark NFC Smartcards for canonical law enforcement test accounts.
Creates active cards with hashed credentials and bcrypt PIN hashes in PostgreSQL.
"""

import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.models.nfc_models import NFCOfficerCardModel
from app.models.iam_models import UserModel
from app.auth.nfc_service import hash_credential, hash_pin, utcnow

logger = logging.getLogger("investigation.nfc.seed")

SEEDED_DEV_NFC_CARDS: List[Dict[str, Any]] = [
    {
        "role": "SUPERINTENDENT",
        "email": "sp.rao@cyber.gov.in",
        "badge": "EMP-SP-001",
        "officer_name": "Superintendent of Police (SP)",
        "card_uid": "NFC-SP-001",
        "token": "nfc_c_sp_rao_2026_operational_key_77a1",
        "default_pin": "1234",
        "unit": "Special Operations Wing"
    },
    {
        "role": "IPS_OFFICER",
        "email": "ips.sen@cyber.gov.in",
        "badge": "EMP-IPS-002",
        "officer_name": "IPS Lead Investigator",
        "card_uid": "NFC-IPS-002",
        "token": "nfc_c_ips_sen_2026_operational_key_88b2",
        "default_pin": "2345",
        "unit": "Financial Cybercrime Unit"
    },
    {
        "role": "INSPECTOR",
        "email": "insp.rathore@cyber.gov.in",
        "badge": "EMP-INSP-003",
        "officer_name": "Police Inspector",
        "card_uid": "NFC-INSP-003",
        "token": "nfc_c_insp_rathore_2026_operational_key_99c3",
        "default_pin": "3456",
        "unit": "Special Operations Wing"
    },
    {
        "role": "SUB_INSPECTOR",
        "email": "si.sharma@cyber.gov.in",
        "badge": "EMP-SI-004",
        "officer_name": "Sub-Inspector (SI)",
        "card_uid": "NFC-SI-004",
        "token": "nfc_c_si_sharma_2026_operational_key_11d4",
        "default_pin": "4567",
        "unit": "Special Operations Wing"
    },
    {
        "role": "ANALYST",
        "email": "analyst.mehta@cyber.gov.in",
        "badge": "EMP-ANL-005",
        "officer_name": "Cybercrime Analyst",
        "card_uid": "NFC-ANL-005",
        "token": "nfc_c_analyst_mehta_2026_operational_key_22e5",
        "default_pin": "5678",
        "unit": "Financial Cybercrime Unit"
    },
    {
        "role": "AUDITOR",
        "email": "auditor.verma@cyber.gov.in",
        "badge": "EMP-AUD-006",
        "officer_name": "Compliance Auditor",
        "card_uid": "NFC-AUD-006",
        "token": "nfc_c_auditor_verma_2026_operational_key_33f6",
        "default_pin": "6789",
        "unit": "CCID-HQ"
    },
    {
        "role": "SYSTEM_ADMIN",
        "email": "admin@cyber.gov.in",
        "badge": "EMP-ADMIN-001",
        "officer_name": "System Administrator",
        "card_uid": "NFC-ADMIN-001",
        "token": "nfc_c_admin_hq_2026_operational_key_44a7",
        "default_pin": "9999",
        "unit": "CCID-HQ"
    }
]

def seed_nfc_benchmark_cards(db: Session):
    """Idempotently seeds NFC cards for the test accounts in PostgreSQL."""
    for item in SEEDED_DEV_NFC_CARDS:
        user = db.query(UserModel).filter_by(official_email=item["email"]).first()
        if not user:
            continue

        cred_hash = hash_credential(item["token"])
        existing_card = db.query(NFCOfficerCardModel).filter_by(credential_hash=cred_hash).first()
        
        if not existing_card:
            pin_h = hash_pin(item["default_pin"])
            card = NFCOfficerCardModel(
                user_id=user.id,
                card_uid=item["card_uid"],
                credential_hash=cred_hash,
                pin_hash=pin_h,
                status="ACTIVE",
                issued_at=utcnow(),
                activated_at=utcnow(),
                card_metadata={"seeded": True, "badge": item["badge"]}
            )
            db.add(card)
            logger.info(f"[NFC Seed] Created NFC Smartcard {item['card_uid']} for {item['email']}")

    db.commit()
