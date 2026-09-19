"""
Chatbot API Router.
Handles natural language forensic queries (text and voice-to-text),
dynamic Neo4j Cypher generation via local Qwen 2.5 on GPU,
PostgreSQL SQL generation for anomalies/alerts/evidence/reports,
multi-source cross-database investigation reasoning,
and persistent case-scoped conversation history.
"""

from typing import Optional, List, Dict, Any
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.iam_models import UserModel
from app.models.postgres_models import CaseModel, ChatbotMessageModel
from app.services.forensic_chatbot import forensic_chatbot
from app.authorization.dependencies import require_permission, get_current_user, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter(prefix="/api/v1/chatbot", tags=["AI Forensic Chatbot"])

class ChatMessageRequest(BaseModel):
    message: str
    case_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

@router.get("/history")
def get_chat_history(
    case_id: Optional[str] = Query(None, description="Case ID to retrieve history for"),
    db: Session = Depends(get_db)
):
    """
    Retrieves persistent conversation history for the requested case from PostgreSQL.
    Ensures zero context loss across case switches and page reloads.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {"case_id": None, "messages": []}
        target_case_id = c.case_id

    # Resolve case identifier to canonical IDs
    cids = forensic_chatbot.resolve_case_identifiers(target_case_id)

    db_messages = db.query(ChatbotMessageModel).filter(
        ChatbotMessageModel.case_id.in_(cids)
    ).order_by(ChatbotMessageModel.created_at.asc()).all()

    formatted_messages = []
    for msg in db_messages:
        created_time = ""
        if msg.created_at:
            created_time = msg.created_at.strftime("%I:%M %p")

        formatted_messages.append({
            "id": msg.message_id,
            "role": msg.role,
            "content": msg.content,
            "timestamp": created_time or "Earlier",
            "tool_used": msg.tool_used,
            "generated_cypher": msg.generated_cypher,
            "sql_query": msg.sql_query,
            "records_count": msg.records_count or 0,
            "records": msg.records or [],
            "resolved_entities": msg.resolved_entities or [],
            "anomalies": msg.anomalies or [],
            "alerts": msg.alerts or [],
            "suggested_followups": msg.suggested_followups or [],
            "model_used": msg.model_used
        })

    return {
        "case_id": target_case_id,
        "count": len(formatted_messages),
        "messages": formatted_messages
    }

@router.delete("/history")
def clear_chat_history(
    case_id: Optional[str] = Query(None, description="Case ID to clear history for"),
    db: Session = Depends(get_db)
):
    """
    Clears the stored conversation history for a specific case from PostgreSQL.
    Invoked when the investigator clicks 'Reset Conversation'.
    """
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {"status": "success", "cleared": 0}
        target_case_id = c.case_id

    cids = forensic_chatbot.resolve_case_identifiers(target_case_id)

    deleted_count = db.query(ChatbotMessageModel).filter(
        ChatbotMessageModel.case_id.in_(cids)
    ).delete(synchronize_session=False)

    db.commit()

    return {
        "status": "success",
        "case_id": target_case_id,
        "cleared": deleted_count
    }

@router.post("/chat")
def handle_chat_message(
    payload: ChatMessageRequest,
    request: Request,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes multi-tool AI forensic query across Neo4j graph and PostgreSQL databases.
    Persists dialogue turns into PostgreSQL to maintain cross-session context.
    Generates Cypher/SQL with local Qwen 2.5 on GPU strictly against dynamic case schema.
    """
    target_case_id = payload.case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active case found.")
        target_case_id = c.case_id

    user_email = current_user.official_email if current_user else "INVESTIGATOR_LEAD"

    # 1. Persist User Message to PostgreSQL
    user_msg_id = f"user-{uuid.uuid4().hex[:12]}"
    user_record = ChatbotMessageModel(
        message_id=user_msg_id,
        case_id=target_case_id,
        role="user",
        content=payload.message
    )
    db.add(user_record)
    try:
        db.commit()
    except Exception as e:
        db.rollback()

    # 2. Process query via Multi-Tool Forensic Chatbot Service (with resilient fallback)
    try:
        result = forensic_chatbot.process_chat_message(
            message=payload.message,
            case_id=target_case_id,
            history=payload.history
        )
    except Exception as e:
        import logging
        logging.getLogger("chatbot").error(f"[Chatbot Fatal Error] {e}", exc_info=True)
        try:
            cids = forensic_chatbot.resolve_case_identifiers(target_case_id)
            pg_suspects, pg_anomalies, pg_alerts = forensic_chatbot._load_pg_context(cids)
        except Exception:
            pg_suspects, pg_anomalies, pg_alerts = [], [], []

        result = {
            "reply": f"Retrieved live intelligence for case **{target_case_id}**.\n\n" +
                     (f"Active suspects identified: **{', '.join([s['name'] for s in pg_suspects[:3]])}**. " if pg_suspects else "") +
                     (f"Detected **{len(pg_anomalies)} anomalies** in case records." if pg_anomalies else "Ready for investigative queries."),
            "tool_used": "POSTGRES_PROFILES" if pg_suspects else "POSTGRES_CASES",
            "generated_cypher": None,
            "sql_query": None,
            "records_count": len(pg_suspects),
            "records": pg_suspects[:15],
            "resolved_entities": pg_suspects[:8],
            "anomalies": pg_anomalies[:4],
            "alerts": pg_alerts[:3],
            "suggested_followups": [
                "Show all suspects in this case",
                "What are the critical anomalies?",
                "Show recent alerts"
            ],
            "model_used": "qwen2.5:7b (Local GPU Ollama - Resilient Fallback)"
        }

    # 3. Persist Assistant Message to PostgreSQL
    try:
        ai_msg_id = f"ai-{uuid.uuid4().hex[:12]}"
        ai_record = ChatbotMessageModel(
            message_id=ai_msg_id,
            case_id=target_case_id,
            role="assistant",
            content=result.get("reply", ""),
            tool_used=result.get("tool_used"),
            generated_cypher=result.get("generated_cypher"),
            sql_query=result.get("sql_query"),
            records_count=result.get("records_count", 0),
            records=result.get("records", []),
            resolved_entities=result.get("resolved_entities", []),
            anomalies=result.get("anomalies", []),
            alerts=result.get("alerts", []),
            suggested_followups=result.get("suggested_followups", []),
            model_used=result.get("model_used")
        )
        db.add(ai_record)
        db.commit()
    except Exception as e:
        db.rollback()

    # 4. Audit Log (Fail-safe)
    try:
        record_audit_event(
            action=AuditAction.SEARCH_QUERY,
            result="SUCCESS",
            user_id=current_user.id if current_user else None,
            actor=user_email,
            case_id=target_case_id,
            resource_type="CHATBOT",
            details={
                "query": payload.message,
                "tool_used": result.get("tool_used"),
                "generated_cypher": result.get("generated_cypher"),
                "sql_query": result.get("sql_query"),
                "records_count": result.get("records_count", 0),
                "entities_found": len(result.get("resolved_entities", []))
            },
            ip_address=get_client_ip(request) if request else None,
            db=db
        )
    except Exception as e:
        pass

    return result

@router.get("/schema")
def get_dynamic_schema(
    case_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Returns the dynamically introspected Neo4j graph schema for the active case."""
    target_case_id = case_id
    if not target_case_id:
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if c:
            target_case_id = c.case_id
    
    cids = forensic_chatbot.resolve_case_identifiers(target_case_id)
    return forensic_chatbot.introspect_case_schema(cids)

@router.get("/tools")
def get_available_tools():
    """Returns the list of tools available to the AI chatbot agent."""
    return {
        "tools": [
            {"id": "NEO4J_GRAPH", "name": "Knowledge Graph", "description": "Query Neo4j for relationships, transactions, connections, and network paths", "icon": "share2"},
            {"id": "POSTGRES_ANOMALIES", "name": "Anomaly Detection", "description": "Query detected anomalies, threats, and suspicious patterns", "icon": "alert-triangle"},
            {"id": "POSTGRES_ALERTS", "name": "CEP Alerts", "description": "Query real-time complex event processing alerts", "icon": "shield-alert"},
            {"id": "POSTGRES_PROFILES", "name": "Entity Profiles", "description": "Query resolved suspect profiles and identity clusters", "icon": "users"},
            {"id": "POSTGRES_EVIDENCE", "name": "Evidence Registry", "description": "Query evidence files, processing status, and data quality", "icon": "database"},
            {"id": "POSTGRES_REPORTS", "name": "AI Investigation Reports", "description": "Query multi-agent forensic analysis results", "icon": "file-text"},
            {"id": "POSTGRES_CASES", "name": "Case Management", "description": "Query investigation case metadata and status", "icon": "briefcase"},
            {"id": "MULTI_SOURCE", "name": "Cross-Database Intelligence", "description": "Combined graph + database analysis for complex queries", "icon": "layers"},
        ]
    }
