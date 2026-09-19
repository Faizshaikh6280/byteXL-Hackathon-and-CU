from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import UserModel
from app.models.postgres_models import CaseModel
from app.services.search_engine import search_engine
from app.authorization.dependencies import get_current_user, get_client_ip
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(prefix="/api/v1/search", tags=["Investigative Search"])

class OmniSearchRequest(BaseModel):
    query: str
    case_id: Optional[str] = None
    match_mode: Optional[str] = "exact"  # "exact" or "fuzzy"
    filters: Optional[Dict[str, Any]] = None

class NLQueryRequest(BaseModel):
    prompt: str
    case_id: Optional[str] = None

@router.post("/omni")
def omni_search(
    payload: OmniSearchRequest,
    request: Request = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes unified Omni-Bar search with automatic Regex/NLP type recognition,
    dual-mode exact/fuzzy matching, and spatial-temporal / threshold filtering.
    """
    target_case_id = payload.case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active case found.")
        target_case_id = c.case_id

    user_email = current_user.official_email if current_user else "INVESTIGATOR_LEAD"
    results = search_engine.execute_omni_search(
        query=payload.query,
        case_id=target_case_id,
        match_mode=payload.match_mode or "exact",
        filters=payload.filters or {},
        user_id=user_email
    )

    record_audit_event(
        action=AuditAction.SEARCH_QUERY,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=user_email,
        case_id=target_case_id,
        resource_type="SEARCH",
        details={
            "query": payload.query,
            "detected_type": results.get("detected_type"),
            "match_mode": payload.match_mode,
            "results_count": results.get("total_results", 0)
        },
        ip_address=get_client_ip(request) if request else None,
        db=db
    )

    return results

@router.post("/nl-query")
def natural_language_query(
    payload: NLQueryRequest,
    request: Request = None,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Translates investigator natural language queries into executable Neo4j Cypher
    using the local GPU-accelerated Qwen 2.5 LLM.
    """
    target_case_id = payload.case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active case found.")
        target_case_id = c.case_id

    user_email = current_user.official_email if current_user else "INVESTIGATOR_LEAD"
    res = search_engine.execute_nl_to_cypher(
        natural_language_prompt=payload.prompt,
        case_id=target_case_id
    )

    record_audit_event(
        action=AuditAction.SEARCH_QUERY,
        result="SUCCESS",
        user_id=current_user.id if current_user else None,
        actor=user_email,
        case_id=target_case_id,
        resource_type="NL_CYPHER",
        details={
            "prompt": payload.prompt,
            "generated_cypher": res.get("generated_cypher"),
            "records_found": res.get("result_count", 0)
        },
        ip_address=get_client_ip(request) if request else None,
        db=db
    )

    return res

@router.get("/history")
def get_search_history(
    case_id: Optional[str] = None,
    current_user: Optional[UserModel] = Depends(get_current_user)
):
    """Retrieves organized, retrievable search history for the case."""
    return {"history": search_engine.get_search_history(case_id=case_id)}
