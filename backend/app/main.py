from typing import Optional
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.ingestion import router as ingestion_router
from app.api.graph import router as graph_router
from app.api.zingg import router as zingg_router
from app.api.geo_timeline import router as geo_timeline_router
from app.api.anomaly import router as anomaly_router
from app.api.cases import router as cases_router
from app.api.investigation import router as investigation_router
from app.api.timeline import router as timeline_router
from app.cctv.api.router import router as cctv_router

from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.audit import router as audit_router
from app.api.case_members import router as case_members_router
from app.api.reports import router as reports_router
from app.api.nfc import router as nfc_router
from app.api.nfc_evidence import router as nfc_evidence_router
from app.api.alerts import router as alerts_router
from app.api.search import router as search_router
from app.api.chatbot import router as chatbot_router


from app.core.middleware import SecurityHeadersMiddleware, CorrelationIdMiddleware
from app.core.database import init_postgres, get_db_context
from app.models.postgres_models import GoldenProfileModel
from app.authorization.dependencies import require_case_access, require_permission
from app.authorization.permissions import Permissions

app = FastAPI(title="Unified Investigative Analytics Platform", version="2.0.0")

# Security and Tracing Middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# Cross-Origin Resource Sharing with Cookie Credentials
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Correlation-ID"],
)

@app.on_event("startup")
async def startup_event():
    # Initialize PostgreSQL tables (graceful — server starts even if DB is down)
    try:
        init_postgres()
    except Exception as e:
        print(f"[PostgreSQL] DB init warning (non-fatal): {e}")
    # MinIO bucket init skipped at startup — called on-demand when evidence is uploaded
    print("[Startup] Backend ready. MinIO/PostgreSQL errors above are non-fatal.")

# Register IAM & Core Security Routers
app.include_router(auth_router, prefix="/api", tags=["Authentication & Identity"])
app.include_router(admin_router, prefix="/api", tags=["Security Administration"])
app.include_router(audit_router, prefix="/api", tags=["Audit Trail"])
app.include_router(case_members_router, prefix="/api", tags=["Case Access Management"])
app.include_router(reports_router, prefix="/api", tags=["Reports & Case Dossiers"])
app.include_router(nfc_router, prefix="/api", tags=["NFC Card Authentication"])

# Register Investigation API Routers
app.include_router(cases_router, prefix="/api", tags=["Cases & Evidence"])
app.include_router(nfc_evidence_router, prefix="/api", tags=["NFC Crime Scene Evidence"])
app.include_router(cctv_router, prefix="/api", tags=["CCTV Location & Route Intelligence"])
app.include_router(ingestion_router, prefix="/api/ingest", tags=["Ingestion"])
app.include_router(zingg_router, prefix="/api/zingg", tags=["Zingg ML"])
app.include_router(graph_router, prefix="/api/graph", tags=["Graph Sync"])
app.include_router(geo_timeline_router, prefix="/api/geo", tags=["Geo Timeline"])
app.include_router(anomaly_router, prefix="/api/anomalies", tags=["Anomalies"])
app.include_router(timeline_router, prefix="/api/timeline", tags=["Timeline & Digital Footprint"])
app.include_router(investigation_router)
app.include_router(alerts_router)
app.include_router(search_router)
app.include_router(chatbot_router)


@app.post("/api/system/reset")
async def reset_all(
    current_user = Depends(require_permission(Permissions.ROLE_MANAGE))
):
    from app.services.reset import clear_and_reset
    return await clear_and_reset()

@app.get("/api/system/golden_profiles")
async def get_golden_profiles(
    case_id: Optional[str] = None,
    current_user = Depends(require_case_access(Permissions.ENTITY_VIEW))
):
    """
    Retrieves resolved golden entity profiles from PostgreSQL for the requested case_id.
    Replaces MongoDB collection with identical JSON response structure.
    """
    with get_db_context() as db:
        target_case_id = case_id
        if not target_case_id:
            from app.models.postgres_models import CaseModel
            c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
            if not c:
                return []
            target_case_id = c.case_id

        profiles = db.query(GoldenProfileModel).filter(GoldenProfileModel.case_id == target_case_id).all()
        if not profiles:
            from app.processing.canonical_reader import canonical_reader
            events = canonical_reader.read_all_events(case_id=target_case_id)
            if events:
                from app.services.zingg_er import run_entity_resolution
                run_entity_resolution(case_id=target_case_id)
                profiles = db.query(GoldenProfileModel).filter(GoldenProfileModel.case_id == target_case_id).all()

        return [{
            "z_cluster_id": p.z_cluster_id,
            "case_id": p.case_id,
            "primary_name": p.primary_name,
            "known_aliases": p.known_aliases or [],
            "known_phones": p.known_phones or [],
            "known_accounts": p.known_accounts or [],
            "associated_emails": p.associated_emails or [],
            "known_addresses": p.known_addresses or [],
            "national_ids": p.national_ids or [],
            "social_handles": p.social_handles or [],
            "risk_score": p.risk_score,
            "method": p.method,
            "last_updated": p.last_updated.isoformat() if p.last_updated else ""
        } for p in profiles]

@app.get("/")
def read_root():
    return {"status": "Investigative Core Online"}
