import uuid
import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db, get_db_context
from app.models.postgres_models import CaseModel, AuditLogModel
from app.cctv.models import (
    PrivateSurveillanceSourceModel, RouteHypothesisModel,
    CCTVCaseLinkModel, CCTVVerificationModel
)
from app.cctv.schemas import (
    IncidentLocation, CrimeSceneAnalyzeRequest, CCTVIntelligenceResponse,
    VerifySourceRequest, ManualCCTVSourceRequest, AddToCaseRequest
)
from app.cctv.services.cctv_engine import cctv_engine
from app.cctv.providers.chandigarh_geocoder import chandigarh_geocoder
from app.models.iam_models import UserModel
from app.authorization.dependencies import require_case_access, get_client_ip
from app.authorization.permissions import Permissions
from app.audit.audit_service import record_audit_event, AuditAction
from fastapi import Request

logger = logging.getLogger("investigation.api.cctv")
router = APIRouter(prefix="/cases/{case_id}/cctv", tags=["CCTV Location & Route Intelligence"])

def log_cctv_audit(case_id: str, action: str, details: dict, current_user: Optional[UserModel] = None, request: Optional[Request] = None, db: Optional[Session] = None):
    try:
        user_id = current_user.id if current_user else None
        actor = current_user.official_email if current_user else "INVESTIGATOR_LEAD"
        role = current_user.role.name if (current_user and current_user.role) else None
        ip_address = get_client_ip(request) if request else None

        record_audit_event(
            action=action,
            result="SUCCESS",
            user_id=user_id,
            actor=actor,
            role=role,
            case_id=case_id,
            details=details,
            ip_address=ip_address,
            db=db
        )
    except Exception as e:
        logger.warning(f"[CCTV-Audit] Failed to log {action}: {e}")

@router.get("/context", response_model=IncidentLocation)
def get_cctv_context(
    case_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Retrieves the crime scene location context for the requested case.
    Automatically parses case description or falls back to benchmark Chandigarh coordinates.
    """
    case = db.query(CaseModel).filter_by(case_id=case_id).first()
    if not case:
        # Return sensible Chandigarh benchmark default if case not found
        return IncidentLocation(
            address="Sub-City Centre, Sector 34, Chandigarh",
            sector="Sector 34",
            landmark="Sub-City Centre Commercial Plaza",
            latitude=30.7225,
            longitude=76.7682,
            incident_date=datetime.date.today().isoformat(),
            incident_time="21:20",
            incident_type="CYBER_FINANCIAL_CONVERGENCE",
            location_source="Default Operational Benchmark"
        )

    # Check if case description contains a known sector
    desc = (case.description or "").lower()
    for sec_name in ["sector 35", "sector 43", "manimajra", "hallomajra", "sector 34", "sector 17", "sector 22"]:
        if sec_name in desc:
            geo = chandigarh_geocoder.geocode(sec_name)
            if geo:
                return IncidentLocation(
                    address=geo["address"],
                    sector=geo["sector"],
                    landmark=geo.get("area", geo["sector"]),
                    latitude=geo["latitude"],
                    longitude=geo["longitude"],
                    incident_date=datetime.date.today().isoformat(),
                    incident_time="21:20",
                    incident_type="CYBER_FINANCIAL_CONVERGENCE",
                    location_source=f"Extracted from Case Dossier ({case.case_reference})"
                )

    # Default to Sector 34 Chandigarh (focal cyber crime hub)
    return IncidentLocation(
        address=f"Sub-City Centre, Sector 34, Chandigarh ({case.case_reference})",
        sector="Sector 34",
        landmark="Sub-City Centre Commercial Plaza",
        latitude=30.7225,
        longitude=76.7682,
        incident_date=datetime.date.today().isoformat(),
        incident_time="21:20",
        incident_type="CYBER_FINANCIAL_CONVERGENCE",
        location_source=f"Case Context: {case.title}"
    )

@router.post("/analyze", response_model=CCTVIntelligenceResponse)
def analyze_cctv(
    case_id: str,
    payload: CrimeSceneAnalyzeRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_ANALYZE)),
    db: Session = Depends(get_db)
):
    """
    Executes the complete CCTV Location & Route Intelligence analysis.
    Identifies government deployment evidence, potential commercial CCTV,
    candidate approach/departure routes, sequential time windows, and coverage gaps.
    """
    response = cctv_engine.analyze_case(
        case_id=case_id,
        incident_lat=payload.latitude,
        incident_lng=payload.longitude,
        address=payload.address,
        sector=payload.sector,
        landmark=payload.landmark,
        incident_date=payload.incident_date,
        incident_time=payload.incident_time,
        search_radius_meters=payload.search_radius_meters or 2500.0
    )

    log_cctv_audit(case_id, "CCTV_ANALYSIS_EXECUTED", {
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "sources_found": response.summary.total_sources,
        "routes_generated": response.summary.possible_routes,
        "coverage_gaps": response.summary.coverage_gaps
    }, current_user=current_user, request=request, db=db)

    return response

@router.get("/results", response_model=CCTVIntelligenceResponse)
def get_cctv_results(
    case_id: str,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_VIEW)),
    db: Session = Depends(get_db)
):
    """Fetches the latest CCTV analysis for the case."""
    context = get_cctv_context(case_id, current_user, db)
    return cctv_engine.analyze_case(
        case_id=case_id,
        incident_lat=context.latitude,
        incident_lng=context.longitude,
        address=context.address,
        sector=context.sector,
        landmark=context.landmark,
        incident_date=context.incident_date,
        incident_time=context.incident_time
    )

@router.post("/sources/manual")
def add_manual_cctv_source(
    case_id: str,
    payload: ManualCCTVSourceRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_VERIFY)),
    db: Session = Depends(get_db)
):
    """Allows an investigator to record an independently observed or manual CCTV camera."""
    source_id = f"MANUAL-{uuid.uuid4().hex[:8].upper()}"
    new_source = PrivateSurveillanceSourceModel(
        id=source_id,
        place_id=source_id,
        provider="INVESTIGATOR_MANUAL",
        place_name=payload.name,
        category=payload.category,
        address=payload.address or "Chandigarh",
        latitude=payload.latitude,
        longitude=payload.longitude,
        phone=payload.phone,
        relevance_score=0.95,
        cctv_status="INVESTIGATOR_VERIFIED" if payload.cctv_present else "ABSENT",
        why_relevant=f"✓ Manually verified and recorded by investigating officer\n✓ Notes: {payload.notes or 'Observed on site'}",
        verified_by=current_user.official_email,
        last_verified_at=datetime.datetime.now(datetime.timezone.utc),
        case_id=case_id
    )
    db.add(new_source)

    # Link to case
    db.add(CCTVCaseLinkModel(
        case_id=case_id,
        item_type="SOURCE",
        item_id=source_id,
        notes=payload.notes,
        added_by=current_user.official_email
    ))
    db.commit()

    log_cctv_audit(case_id, "CCTV_SOURCE_MANUALLY_ADDED", {
        "source_id": source_id,
        "name": payload.name,
        "latitude": payload.latitude,
        "longitude": payload.longitude
    }, current_user=current_user, request=request, db=db)

    return {"status": "success", "source_id": source_id, "message": "Manual CCTV source recorded successfully"}

@router.post("/sources/{source_id}/verify")
def verify_cctv_source(
    case_id: str,
    source_id: str,
    payload: VerifySourceRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_VERIFY)),
    db: Session = Depends(get_db)
):
    """Allows an investigator to confirm, reject, or update the verified status of a CCTV source."""
    db.add(CCTVVerificationModel(
        source_id=source_id,
        case_id=case_id,
        previous_status="POTENTIAL",
        new_status=payload.new_status,
        verified_by=current_user.official_email,
        reason=payload.reason or payload.notes,
        camera_count_confirmed=payload.camera_count_confirmed
    ))

    existing = db.query(PrivateSurveillanceSourceModel).filter_by(id=source_id).first()
    if existing:
        existing.cctv_status = payload.new_status
        existing.last_verified_at = datetime.datetime.now(datetime.timezone.utc)
        existing.verified_by = current_user.official_email
    else:
        db.add(PrivateSurveillanceSourceModel(
            id=source_id,
            place_id=source_id,
            provider="INVESTIGATOR_VERIFIED",
            place_name=f"Verified Source ({source_id})",
            category="COMMERCIAL",
            latitude=30.7225,
            longitude=76.7682,
            cctv_status=payload.new_status,
            verified_by=current_user.official_email,
            last_verified_at=datetime.datetime.now(datetime.timezone.utc),
            case_id=case_id
        ))
    db.commit()

    log_cctv_audit(case_id, "CCTV_SOURCE_VERIFIED", {
        "source_id": source_id,
        "new_status": payload.new_status,
        "reason": payload.reason
    }, current_user=current_user, request=request, db=db)

    return {"status": "success", "source_id": source_id, "new_status": payload.new_status}

@router.post("/sources/{source_id}/add-to-case")
def add_cctv_to_case(
    case_id: str,
    source_id: str,
    payload: AddToCaseRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_VERIFY)),
    db: Session = Depends(get_db)
):
    """Binds a verified CCTV source or route to the active case dossier."""
    existing = db.query(CCTVCaseLinkModel).filter_by(case_id=case_id, item_id=source_id).first()
    if not existing:
        db.add(CCTVCaseLinkModel(
            case_id=case_id,
            item_type=payload.item_type,
            item_id=source_id,
            notes=payload.notes,
            added_by=current_user.official_email
        ))
        db.commit()

    log_cctv_audit(case_id, "CCTV_ITEM_LINKED_TO_CASE", {
        "item_id": source_id,
        "item_type": payload.item_type
    }, current_user=current_user, request=request, db=db)

    return {"status": "success", "message": f"{payload.item_type} linked to case {case_id}"}

@router.patch("/location", response_model=CCTVIntelligenceResponse)
def update_cctv_location(
    case_id: str,
    payload: CrimeSceneAnalyzeRequest,
    request: Request,
    current_user: UserModel = Depends(require_case_access(Permissions.CCTV_ANALYZE)),
    db: Session = Depends(get_db)
):
    """Updates incident coordinates and triggers real-time re-analysis."""
    log_cctv_audit(case_id, "CCTV_INCIDENT_LOCATION_UPDATED", {
        "new_lat": payload.latitude,
        "new_lng": payload.longitude,
        "new_address": payload.address
    }, current_user=current_user, request=request, db=db)
    return analyze_cctv(case_id, payload, request, current_user, db)

