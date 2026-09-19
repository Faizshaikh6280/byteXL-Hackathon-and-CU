"""
Entity Resolution API Router.
Supports:
- Running automated Zingg / graph ER clustering pipeline
- Manual investigator entity merge with before/after state hashing and audit trail
- Manual investigator entity split with before/after state hashing and audit trail
"""

import hashlib
import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.services.zingg_er import run_entity_resolution
from app.core.database import get_db
from app.models.iam_models import UserModel
from app.models.postgres_models import GoldenProfileModel
from app.authorization.dependencies import require_permission, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import (
    record_audit_event, AuditAction, AuditResult, AuditDecision, AuditReasonCode
)

router = APIRouter()


class MergeEntitiesPayload(BaseModel):
    case_id: str
    target_cluster_id: str
    source_cluster_ids: List[str]
    reason: Optional[str] = "Investigator verified shared physical and biometric footprint"


class SplitEntitiesPayload(BaseModel):
    case_id: str
    cluster_id: str
    new_cluster_id: str
    primary_name: Optional[str] = None
    detached_phones: List[str] = []
    detached_accounts: List[str] = []
    detached_emails: List[str] = []
    reason: Optional[str] = "Erroneous algorithmic co-occurrence detached by investigator"


def hash_state(data: Any) -> str:
    """Computes SHA-256 hash over canonical JSON representation of entity states."""
    raw = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/execute")
def execute_entity_resolution(
    case_id: Optional[str] = None,
    request: Request = None,
    current_user: UserModel = Depends(require_permission(Permissions.ENTITY_RESOLVE)),
    db: Session = Depends(get_db)
):
    """
    Run full Entity Resolution pipeline on canonical events for case_id.
    """
    result = run_entity_resolution(case_id=case_id)

    record_audit_event(
        action=AuditAction.ENTITY_RESOLUTION_EXECUTED,
        result=AuditResult.SUCCESS,
        decision=AuditDecision.ALLOWED,
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=case_id,
        resource_type="entity_cluster",
        details={"case_id": case_id, "resolved_profiles": result.get("golden_profiles", 0)},
        ip_address=get_client_ip(request) if request else None,
        db=db
    )

    return result


@router.post("/merge")
def merge_entities(
    payload: MergeEntitiesPayload,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.ENTITY_MERGE)),
    db: Session = Depends(get_db)
):
    """
    Manually merges multiple golden entity clusters into one canonical profile.
    High-risk action: captures pre/post state hashes and creates immutable audit record.
    """
    target = db.query(GoldenProfileModel).filter_by(
        case_id=payload.case_id, z_cluster_id=payload.target_cluster_id
    ).first()

    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"Target cluster '{payload.target_cluster_id}' not found in case '{payload.case_id}'"
        )

    sources = (
        db.query(GoldenProfileModel)
        .filter(
            GoldenProfileModel.case_id == payload.case_id,
            GoldenProfileModel.z_cluster_id.in_(payload.source_cluster_ids)
        )
        .all()
    )

    if not sources:
        raise HTTPException(status_code=400, detail="No valid source clusters provided for merge.")

    # Record pre-merge state
    pre_state = {
        "target": {
            "cluster_id": target.z_cluster_id,
            "primary_name": target.primary_name,
            "phones": target.known_phones,
            "accounts": target.known_accounts,
            "aliases": target.known_aliases
        },
        "sources": [
            {
                "cluster_id": s.z_cluster_id,
                "primary_name": s.primary_name,
                "phones": s.known_phones,
                "accounts": s.known_accounts
            }
            for s in sources
        ]
    }
    prev_state_hash = hash_state(pre_state)

    # Perform merge into target
    merged_phones = set(target.known_phones or [])
    merged_accounts = set(target.known_accounts or [])
    merged_emails = set(target.associated_emails or [])
    merged_aliases = set(target.known_aliases or [])
    merged_national_ids = set(target.national_ids or [])

    for s in sources:
        merged_phones.update(s.known_phones or [])
        merged_accounts.update(s.known_accounts or [])
        merged_emails.update(s.associated_emails or [])
        merged_aliases.update(s.known_aliases or [])
        merged_aliases.add(s.primary_name)
        merged_national_ids.update(s.national_ids or [])
        db.delete(s)

    target.known_phones = list(merged_phones)
    target.known_accounts = list(merged_accounts)
    target.associated_emails = list(merged_emails)
    target.known_aliases = list(merged_aliases)
    target.national_ids = list(merged_national_ids)
    target.method = "manual_merge"
    db.commit()
    db.refresh(target)

    # Record post-merge state
    post_state = {
        "target_cluster_id": target.z_cluster_id,
        "primary_name": target.primary_name,
        "phones": target.known_phones,
        "accounts": target.known_accounts,
        "aliases": target.known_aliases
    }
    new_state_hash = hash_state(post_state)

    record_audit_event(
        action=AuditAction.ENTITY_MERGED,
        result=AuditResult.SUCCESS,
        decision=AuditDecision.ALLOWED,
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=payload.case_id,
        resource_type="entity_cluster",
        resource_id=payload.target_cluster_id,
        details={
            "target_cluster_id": payload.target_cluster_id,
            "source_cluster_ids": payload.source_cluster_ids,
            "reason": payload.reason
        },
        previous_state_hash=prev_state_hash,
        new_state_hash=new_state_hash,
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "message": f"Successfully merged clusters {payload.source_cluster_ids} into {payload.target_cluster_id}",
        "profile": {
            "case_id": target.case_id,
            "z_cluster_id": target.z_cluster_id,
            "primary_name": target.primary_name,
            "known_phones": target.known_phones,
            "known_accounts": target.known_accounts,
            "known_aliases": target.known_aliases
        }
    }


@router.post("/split")
def split_entities(
    payload: SplitEntitiesPayload,
    request: Request,
    current_user: UserModel = Depends(require_permission(Permissions.ENTITY_SPLIT)),
    db: Session = Depends(get_db)
):
    """
    Manually splits erroneously combined identifiers from a golden cluster into a new entity.
    High-risk action: captures pre/post state hashes and creates immutable audit record.
    """
    cluster = db.query(GoldenProfileModel).filter_by(
        case_id=payload.case_id, z_cluster_id=payload.cluster_id
    ).first()

    if not cluster:
        raise HTTPException(status_code=404, detail=f"Cluster '{payload.cluster_id}' not found.")

    pre_state = {
        "cluster_id": cluster.z_cluster_id,
        "phones": cluster.known_phones,
        "accounts": cluster.known_accounts,
        "emails": cluster.associated_emails
    }
    prev_state_hash = hash_state(pre_state)

    # Detach identifiers
    remaining_phones = [p for p in (cluster.known_phones or []) if p not in payload.detached_phones]
    remaining_accounts = [a for a in (cluster.known_accounts or []) if a not in payload.detached_accounts]
    remaining_emails = [e for e in (cluster.associated_emails or []) if e not in payload.detached_emails]

    cluster.known_phones = remaining_phones
    cluster.known_accounts = remaining_accounts
    cluster.associated_emails = remaining_emails

    # Create new detached cluster
    new_profile = GoldenProfileModel(
        case_id=payload.case_id,
        z_cluster_id=payload.new_cluster_id,
        primary_name=payload.primary_name or f"Entity {payload.new_cluster_id}",
        known_phones=payload.detached_phones,
        known_accounts=payload.detached_accounts,
        associated_emails=payload.detached_emails,
        known_aliases=[],
        national_ids=[],
        social_handles=[],
        risk_score=0.3,
        method="manual_split"
    )
    db.add(new_profile)
    db.commit()

    post_state = {
        "original_cluster": {
            "cluster_id": cluster.z_cluster_id,
            "phones": cluster.known_phones,
            "accounts": cluster.known_accounts
        },
        "new_cluster": {
            "cluster_id": new_profile.z_cluster_id,
            "phones": new_profile.known_phones,
            "accounts": new_profile.known_accounts
        }
    }
    new_state_hash = hash_state(post_state)

    record_audit_event(
        action=AuditAction.ENTITY_SPLIT,
        result=AuditResult.SUCCESS,
        decision=AuditDecision.ALLOWED,
        user_id=current_user.id,
        actor=current_user.official_email,
        role=current_user.role.name if current_user.role else None,
        case_id=payload.case_id,
        resource_type="entity_cluster",
        resource_id=payload.cluster_id,
        details={
            "source_cluster_id": payload.cluster_id,
            "new_cluster_id": payload.new_cluster_id,
            "detached_phones": payload.detached_phones,
            "detached_accounts": payload.detached_accounts,
            "reason": payload.reason
        },
        previous_state_hash=prev_state_hash,
        new_state_hash=new_state_hash,
        ip_address=get_client_ip(request),
        db=db
    )

    return {
        "status": "success",
        "message": f"Successfully split identifiers from {payload.cluster_id} into {payload.new_cluster_id}",
        "new_cluster": {
            "z_cluster_id": new_profile.z_cluster_id,
            "primary_name": new_profile.primary_name,
            "known_phones": new_profile.known_phones,
            "known_accounts": new_profile.known_accounts
        }
    }
