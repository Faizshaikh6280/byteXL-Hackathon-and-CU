"""
Bootstrap seed module for Identity and Access Management.
Idempotently initializes:
- Standard Organization and Operational Units
- Canonical Permissions
- Default System Roles with Permission Mappings
- Initial Admin Account
- Seed Test Officers for each Role (SP, IPS, Inspector, SI, Analyst, Auditor)
- Benchmark Case Memberships
"""

import os
import uuid
import datetime
import logging
from sqlalchemy.orm import Session

from app.models.iam_models import (
    OrganizationModel, UnitModel, RoleModel, PermissionModel,
    RolePermissionModel, UserModel, CaseMemberModel
)
from app.models.postgres_models import CaseModel
from app.authorization.permissions import PERMISSION_METADATA
from app.authorization.roles import ROLE_DEFINITIONS, Roles
from app.auth.password import hash_password

logger = logging.getLogger("investigation.iam.seed")

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def seed_iam_defaults(db: Session):
    """Idempotently seeds all IAM structures and accounts."""
    try:
        # 1. Organization
        org = db.query(OrganizationModel).filter_by(code="CCID").first()
        if not org:
            org = OrganizationModel(
                id=str(uuid.uuid4()),
                code="CCID",
                name="Central Cyber Intelligence Directorate",
                description="Apex law enforcement agency for advanced cyber forensics and intelligence operations."
            )
            db.add(org)
            db.commit()
            db.refresh(org)

        # 2. Units
        unit_sow = db.query(UnitModel).filter_by(code="SOW").first()
        if not unit_sow:
            unit_sow = UnitModel(
                id=str(uuid.uuid4()),
                organization_id=org.id,
                code="SOW",
                name="Special Operations Wing (Cyber)",
                description="Elite syndicate interdiction, forensic timeline analysis, and covert intelligence."
            )
            db.add(unit_sow)

        unit_fcu = db.query(UnitModel).filter_by(code="FCU").first()
        if not unit_fcu:
            unit_fcu = UnitModel(
                id=str(uuid.uuid4()),
                organization_id=org.id,
                code="FCU",
                name="Financial Cybercrime Unit",
                description="Mule account tracking, hawala detection, and financial layering analysis."
            )
            db.add(unit_fcu)
        db.commit()

        # 3. Canonical Permissions
        existing_perms = {p.name: p for p in db.query(PermissionModel).all()}
        for perm_name, meta in PERMISSION_METADATA.items():
            if perm_name not in existing_perms:
                new_perm = PermissionModel(
                    id=str(uuid.uuid4()),
                    name=perm_name,
                    category=meta["category"],
                    description=meta["description"]
                )
                db.add(new_perm)
                existing_perms[perm_name] = new_perm
        db.commit()

        # Refresh permissions dictionary with IDs
        db_perms = {p.name: p.id for p in db.query(PermissionModel).all()}

        # 4. Canonical Roles & Mappings
        existing_roles = {r.name: r for r in db.query(RoleModel).all()}
        for role_name, role_meta in ROLE_DEFINITIONS.items():
            role_obj = existing_roles.get(role_name)
            if not role_obj:
                role_obj = RoleModel(
                    id=str(uuid.uuid4()),
                    name=role_name,
                    display_name=role_meta["display_name"],
                    description=role_meta["description"],
                    is_system_role=role_meta.get("is_system_role", True)
                )
                db.add(role_obj)
                db.commit()
                db.refresh(role_obj)
                existing_roles[role_name] = role_obj

            # Map permissions
            curr_perm_ids = {
                rp.permission_id for rp in db.query(RolePermissionModel).filter_by(role_id=role_obj.id).all()
            }
            for p_name in role_meta["permissions"]:
                p_id = db_perms.get(p_name)
                if p_id and p_id not in curr_perm_ids:
                    db.add(RolePermissionModel(role_id=role_obj.id, permission_id=p_id))
        db.commit()

        # 5. Bootstrap Initial Admin and Test Officers for Each Role
        initial_admin_pwd = os.getenv("INITIAL_ADMIN_PASSWORD", "Admin#Cyber2026!Secure")

        seeded_accounts = [
            {
                "employee_id": "EMP-ADMIN-001",
                "full_name": "Chief Security Administrator",
                "official_email": "admin@cyber.gov.in",
                "password": initial_admin_pwd,
                "role_name": Roles.SYSTEM_ADMIN,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-SP-001",
                "full_name": "Superintendent Rajeshwar Rao, IPS",
                "official_email": "sp.rao@cyber.gov.in",
                "password": "Officer#Cyber2026!SP",
                "role_name": Roles.SUPERINTENDENT,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-IPS-002",
                "full_name": "Dr. Ananya Sen, IPS",
                "official_email": "ips.sen@cyber.gov.in",
                "password": "Officer#Cyber2026!IPS",
                "role_name": Roles.IPS_OFFICER,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-INSP-003",
                "full_name": "Inspector Vikramaditya Rathore",
                "official_email": "insp.rathore@cyber.gov.in",
                "password": "Officer#Cyber2026!INSP",
                "role_name": Roles.INSPECTOR,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-SI-004",
                "full_name": "Sub-Inspector Pooja Sharma",
                "official_email": "si.sharma@cyber.gov.in",
                "password": "Officer#Cyber2026!SI",
                "role_name": Roles.SUB_INSPECTOR,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-ANL-005",
                "full_name": "Senior Analyst Kabir Mehta",
                "official_email": "analyst.mehta@cyber.gov.in",
                "password": "Officer#Cyber2026!ANL",
                "role_name": Roles.ANALYST,
                "unit_id": unit_sow.id,
            },
            {
                "employee_id": "EMP-AUD-006",
                "full_name": "Chief Auditor Sunita Verma",
                "official_email": "auditor.verma@cyber.gov.in",
                "password": "Officer#Cyber2026!AUD",
                "role_name": Roles.AUDITOR,
                "unit_id": unit_sow.id,
            }
        ]

        created_users = {}
        for acc in seeded_accounts:
            user = db.query(UserModel).filter_by(employee_id=acc["employee_id"]).first()
            role_obj = existing_roles.get(acc["role_name"])
            if not user:
                user = UserModel(
                    id=str(uuid.uuid4()),
                    employee_id=acc["employee_id"],
                    full_name=acc["full_name"],
                    official_email=acc["official_email"],
                    password_hash=hash_password(acc["password"]),
                    role_id=role_obj.id,
                    organization_id=org.id,
                    unit_id=acc["unit_id"],
                    status="ACTIVE",
                    mfa_enabled=False
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            created_users[acc["employee_id"]] = user

        # 6. Seed Case Memberships for Benchmark Cases
        from app.api.cases import _ensure_benchmark_cases
        _ensure_benchmark_cases(db)

        benchmark_case_ids = [
            "INV-2026-BLACK-CIRCUIT",
            "INV-2026-IRON-LOTUS",
            "INV-2026-NIGHT-LEDGER",
            "INV-2026-RED-HAVEN"
        ]

        ips_user = created_users.get("EMP-IPS-002")
        insp_user = created_users.get("EMP-INSP-003")
        si_user = created_users.get("EMP-SI-004")
        anl_user = created_users.get("EMP-ANL-005")
        aud_user = created_users.get("EMP-AUD-006")

        for cid in benchmark_case_ids:
            # Check case exists, if so ensure unit_id is SOW
            case = db.query(CaseModel).filter_by(case_id=cid).first()
            if case and not case.unit_id:
                case.unit_id = unit_sow.id
                db.commit()

            # IPS is Lead Investigator on all benchmark cases
            if ips_user:
                if not db.query(CaseMemberModel).filter_by(case_id=cid, user_id=ips_user.id).first():
                    db.add(CaseMemberModel(
                        case_id=cid, user_id=ips_user.id, case_role="LEAD_INVESTIGATOR",
                        assigned_by="EMP-ADMIN-001"
                    ))

            # Inspector is Investigator on all benchmark cases
            if insp_user:
                if not db.query(CaseMemberModel).filter_by(case_id=cid, user_id=insp_user.id).first():
                    db.add(CaseMemberModel(
                        case_id=cid, user_id=insp_user.id, case_role="INVESTIGATOR",
                        assigned_by="EMP-IPS-002"
                    ))

            # Analyst is assigned on all benchmark cases
            if anl_user:
                if not db.query(CaseMemberModel).filter_by(case_id=cid, user_id=anl_user.id).first():
                    db.add(CaseMemberModel(
                        case_id=cid, user_id=anl_user.id, case_role="ANALYST",
                        assigned_by="EMP-IPS-002"
                    ))

            # Auditor has audit scope
            if aud_user:
                if not db.query(CaseMemberModel).filter_by(case_id=cid, user_id=aud_user.id).first():
                    db.add(CaseMemberModel(
                        case_id=cid, user_id=aud_user.id, case_role="AUDITOR",
                        assigned_by="EMP-ADMIN-001"
                    ))

        # Sub-Inspector is assigned strictly to INV-2026-BLACK-CIRCUIT and INV-2026-IRON-LOTUS
        # (NOT to NIGHT-LEDGER or RED-HAVEN to test case isolation and IDOR rejection!)
        if si_user:
            for cid in ["INV-2026-BLACK-CIRCUIT", "INV-2026-IRON-LOTUS"]:
                if not db.query(CaseMemberModel).filter_by(case_id=cid, user_id=si_user.id).first():
                    db.add(CaseMemberModel(
                        case_id=cid, user_id=si_user.id, case_role="INVESTIGATOR",
                        assigned_by="EMP-INSP-003"
                    ))

        db.commit()
        logger.info("[IAM Seed] Organizations, units, permissions, roles, and officer accounts seeded successfully.")
    except Exception as e:
        db.rollback()
        logger.warning(f"[IAM Seed] Warning during seeding: {e}")
