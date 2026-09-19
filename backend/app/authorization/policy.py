"""
Central Policy Engine for Fine-Grained Authorization, Role-Based Access Control (RBAC),
and Case-Scoped Access Control (ABAC).
Enforces:
- Global Role Permissions
- Case Membership and Case Roles
- Organizational Unit Scoping
- Resource Sensitivity Levels (INTERNAL, SENSITIVE, HIGHLY_SENSITIVE)
- Evidence Immutability Safeguards
"""

from typing import Optional, Set
from dataclasses import dataclass
from sqlalchemy.orm import Session

from app.models.iam_models import UserModel, RoleModel, RolePermissionModel, PermissionModel, CaseMemberModel
from app.models.postgres_models import CaseModel
from app.authorization.roles import Roles
from app.authorization.permissions import Permissions

@dataclass
class PolicyDecision:
    allowed: bool
    reason: str

def get_user_permissions(db: Session, user: UserModel) -> Set[str]:
    """Retrieves all active fine-grained permissions for a user based on their global role."""
    if not user or not user.role_id:
        return set()

    permissions = (
        db.query(PermissionModel.name)
        .join(RolePermissionModel, RolePermissionModel.permission_id == PermissionModel.id)
        .filter(RolePermissionModel.role_id == user.role_id)
        .all()
    )
    return {p[0] for p in permissions}

def authorize(
    user: UserModel,
    action: str,
    case_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    sensitivity: Optional[str] = None,
    db: Optional[Session] = None
) -> PolicyDecision:
    """
    Central authorization evaluation:
    USER -> AUTHENTICATION -> IDENTITY -> ROLE -> CASE MEMBERSHIP -> PERMISSION -> SENSITIVITY -> ACTION POLICY
    """
    if not user:
        return PolicyDecision(allowed=False, reason="Unauthenticated request")

    # 1. Account Status Enforcement
    if user.status != "ACTIVE":
        return PolicyDecision(
            allowed=False,
            reason=f"Account status '{user.status}' is not permitted to perform actions"
        )

    # 2. Evidence Immutability Safeguard
    # Original raw evidence must NEVER be editable or deletable through normal investigator workflows.
    if action in ("evidence.delete", "evidence.edit"):
        return PolicyDecision(
            allowed=False,
            reason="Original evidence is immutable and protected by law-enforcement chain-of-custody policy."
        )

    if not db:
        # Require db session for permission and case checks
        return PolicyDecision(allowed=False, reason="Database session required for policy decision")

    # 3. Global Role Permission Evaluation
    user_perms = get_user_permissions(db, user)
    role_name = user.role.name if user.role else ""

    if role_name == Roles.SYSTEM_ADMIN:
        pass  # System Administrator has universal access across all modules
    elif action not in user_perms:
        return PolicyDecision(
            allowed=False,
            reason=f"Role '{role_name}' does not possess required permission '{action}'"
        )

    # 4. Case-Scoped Access Evaluation
    if case_id:
        case = db.query(CaseModel).filter_by(case_id=case_id).first()
        if not case:
            return PolicyDecision(allowed=False, reason=f"Case '{case_id}' not found")

        # System Administrator scope
        if role_name == Roles.SYSTEM_ADMIN:
            # System Admin can perform administrative and audit operations, but cannot modify findings
            if action in (Permissions.FINDING_APPROVE, Permissions.FINDING_CREATE, Permissions.FINDING_UPDATE):
                return PolicyDecision(
                    allowed=False,
                    reason="System Administrator cannot inject or modify substantive case findings."
                )
            return PolicyDecision(allowed=True, reason="System Administrator administrative access")

        # Auditor scope
        if role_name == Roles.AUDITOR:
            # Auditors can inspect case metadata, evidence records, and reports, but cannot mutate anything
            if action in (
                Permissions.CASE_UPDATE, Permissions.CASE_CLOSE, Permissions.CASE_DELETE,
                Permissions.EVIDENCE_UPLOAD, Permissions.FINDING_CREATE, Permissions.FINDING_APPROVE
            ):
                return PolicyDecision(
                    allowed=False,
                    reason="Auditor role is restricted to non-mutating compliance inspection."
                )
            return PolicyDecision(allowed=True, reason="Authorized compliance audit scope")

        # Check explicit Case Membership
        membership = (
            db.query(CaseMemberModel)
            .filter_by(case_id=case_id, user_id=user.id, active=True)
            .first()
        )

        if membership:
            # Member is assigned to this case
            # Check case role constraints if any
            if membership.case_role == "AUDITOR":
                if action not in (Permissions.CASE_READ, Permissions.EVIDENCE_VIEW, Permissions.AUDIT_VIEW, Permissions.REPORT_VIEW):
                    return PolicyDecision(allowed=False, reason="Case-scoped auditor cannot modify case evidence or findings.")
            elif membership.case_role == "ANALYST":
                if action in (Permissions.CASE_CLOSE, Permissions.CASE_DELETE, Permissions.CASE_ASSIGN):
                    return PolicyDecision(allowed=False, reason="Case-scoped analyst cannot alter case lifecycle or assignments.")
            return PolicyDecision(allowed=True, reason=f"Authorized case member ({membership.case_role})")

        # If not explicitly assigned, evaluate Organizational Unit Scoping:
        # Superintendents and IPS Officers have supervisory visibility over cases in their operational unit
        if role_name in (Roles.SUPERINTENDENT, Roles.IPS_OFFICER):
            if not user.unit_id or not case.unit_id or user.unit_id == case.unit_id:
                # Same unit or legacy unassigned unit -> Allowed for supervisory / lead roles
                return PolicyDecision(
                    allowed=True,
                    reason=f"Authorized by supervisory unit scope ({role_name})"
                )
            else:
                return PolicyDecision(
                    allowed=False,
                    reason=f"Case belongs to an external unit. Explicit case assignment is required."
                )

        # For Inspectors, Sub-Inspectors, and Analysts: assignment is mandatory
        return PolicyDecision(
            allowed=False,
            reason=f"Access denied: User '{user.employee_id}' is not an assigned member of case '{case_id}'"
        )

    # 5. Resource Sensitivity Check
    if sensitivity in ("SENSITIVE", "HIGHLY_SENSITIVE"):
        if sensitivity == "HIGHLY_SENSITIVE" and role_name in (Roles.SUB_INSPECTOR, Roles.ANALYST):
            if action not in (Permissions.CASE_READ, Permissions.EVIDENCE_VIEW):
                return PolicyDecision(
                    allowed=False,
                    reason=f"Resource sensitivity '{sensitivity}' requires elevated officer authorization."
                )

    return PolicyDecision(allowed=True, reason="Action permitted by policy")


@dataclass
class AuthorizationRequest:
    user: UserModel
    permission: str
    case_id: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    sensitivity: Optional[str] = None


class PolicyEngine:
    @staticmethod
    def evaluate(req: AuthorizationRequest, db: Optional[Session] = None) -> PolicyDecision:
        return authorize(
            user=req.user,
            action=req.permission,
            case_id=req.case_id,
            resource_type=req.resource_type,
            resource_id=req.resource_id,
            sensitivity=req.sensitivity,
            db=db
        )


policy_engine = PolicyEngine()
