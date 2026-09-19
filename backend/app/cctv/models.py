import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, JSON, ForeignKey, Index, Boolean
)
from app.core.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class CameraModel(Base):
    """
    Authoritative camera inventory registry.
    Designed to store future government, ICCC, or ITMS camera-level data without schema changes.
    All camera-specific telemetry fields are nullable.
    """
    __tablename__ = "cameras"

    id = Column(String(64), primary_key=True, index=True)
    source_id = Column(String(64), nullable=True, index=True)
    camera_id = Column(String(64), nullable=True, index=True)
    owner_type = Column(String(32), default="GOVERNMENT", nullable=False)  # GOVERNMENT, POLICE, COMMERCIAL, PRIVATE
    owner_name = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True, index=True)
    longitude = Column(Float, nullable=True, index=True)
    geometry = Column(JSON, nullable=True)  # GeoJSON Point
    camera_type = Column(String(32), default="FIXED", nullable=True)  # FIXED, PTZ, 360_DEGREE, DOME
    azimuth = Column(Float, nullable=True)  # Compass heading in degrees 0-360
    horizontal_fov = Column(Float, nullable=True)
    vertical_fov = Column(Float, nullable=True)
    road_segment_id = Column(String(128), nullable=True)
    junction_id = Column(String(128), nullable=True)
    status = Column(String(32), default="OPERATIONAL", nullable=False)  # OPERATIONAL, FAULTY, UNKNOWN
    verified = Column(Boolean, default=True, nullable=False)
    confidence = Column(Float, default=1.0, nullable=False)
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_cameras_lat_lng", "latitude", "longitude"),
    )


class CCTVDeploymentEvidenceModel(Base):
    """
    Documented government deployment evidence derived from public procurement,
    tenders, ICCC projects, and municipal development works.
    Represents area-, sector-, ward-, facility-, or corridor-level CCTV installations.
    """
    __tablename__ = "cctv_deployment_evidence"

    id = Column(String(64), primary_key=True, index=True)
    source_id = Column(String(64), nullable=True, index=True)
    project_name = Column(String(255), nullable=False)
    tender_id = Column(String(128), nullable=True, index=True)
    tender_reference = Column(String(128), nullable=True, index=True)
    department = Column(String(255), nullable=False)
    publication_date = Column(DateTime(timezone=True), nullable=True)
    area = Column(String(128), nullable=True, index=True)
    sector = Column(String(64), nullable=True, index=True)
    ward = Column(String(64), nullable=True, index=True)
    road_name = Column(String(255), nullable=True)
    corridor_start = Column(String(255), nullable=True)
    corridor_end = Column(String(255), nullable=True)
    facility_name = Column(String(255), nullable=True)
    camera_count = Column(Integer, nullable=True)
    camera_type = Column(String(64), nullable=True)
    deployment_precision = Column(String(32), default="SECTOR", nullable=False)  # CITY, SECTOR, WARD, AREA, FACILITY, ROAD, CORRIDOR, JUNCTION, CAMERA
    source_document_url = Column(String(512), nullable=True)
    source_document_hash = Column(String(64), nullable=True)
    evidence_text = Column(Text, nullable=True)
    confidence = Column(Float, default=0.9, nullable=False)
    verified = Column(Boolean, default=True, nullable=False)
    latitude = Column(Float, nullable=True, index=True)
    longitude = Column(Float, nullable=True, index=True)
    coverage_geometry = Column(JSON, nullable=True)  # GeoJSON Polygon or MultiPoint
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_deployment_evidence_lat_lng", "latitude", "longitude"),
        Index("idx_deployment_sector", "sector"),
    )


class PrivateSurveillanceSourceModel(Base):
    """
    Commercial and public establishments discovered as potential private CCTV sources.
    Defaults to POTENTIAL. Never marked CONFIRMED unless independently verified by an investigator.
    """
    __tablename__ = "private_surveillance_sources"

    id = Column(String(64), primary_key=True, index=True)
    place_id = Column(String(128), nullable=True, index=True)
    provider = Column(String(64), default="CHANDIGARH_DIRECTORY", nullable=False)  # GOOGLE_PLACES, CHANDIGARH_DIRECTORY, INVESTIGATOR_MANUAL
    place_name = Column(String(255), nullable=False, index=True)
    category = Column(String(64), default="COMMERCIAL", nullable=False, index=True)  # PETROL_PUMP, BANK, ATM, MALL, HOTEL, HOSPITAL, MARKET, PHARMACY, RESTAURANT, WAREHOUSE, OFFICE, TRANSPORT
    address = Column(String(512), nullable=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    phone = Column(String(64), nullable=True)
    website = Column(String(512), nullable=True)
    distance_to_incident = Column(Float, nullable=True)  # meters
    distance_to_route = Column(Float, nullable=True)     # meters
    road_segment_id = Column(String(128), nullable=True)
    junction_id = Column(String(128), nullable=True)
    relevance_score = Column(Float, default=0.5, nullable=False)
    cctv_status = Column(String(32), default="POTENTIAL", nullable=False, index=True)  # POTENTIAL, CONFIRMED, INVESTIGATOR_VERIFIED, ABSENT, UNKNOWN
    why_relevant = Column(Text, nullable=True)
    source_timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(String(128), nullable=True)
    confidence = Column(Float, default=0.7, nullable=False)
    case_id = Column(String(64), nullable=True, index=True)
    incident_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_private_sources_lat_lng", "latitude", "longitude"),
        Index("idx_private_sources_category", "category"),
    )


class RouteHypothesisModel(Base):
    """
    Candidate investigative approach and departure routes generated around the crime scene.
    Categorized strictly as investigative hypotheses, with CCTV sequences and coverage gap metrics.
    """
    __tablename__ = "route_hypotheses"

    id = Column(String(64), primary_key=True, index=True)
    route_id = Column(String(64), nullable=False, index=True)
    case_id = Column(String(64), nullable=False, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    route_type = Column(String(32), default="APPROACH", nullable=False, index=True)  # APPROACH, DEPARTURE, BOTH
    origin_area = Column(String(255), nullable=True)
    destination = Column(String(255), nullable=True)
    direction = Column(String(64), nullable=True)  # INBOUND_EAST, OUTBOUND_SOUTH, etc.
    distance_meters = Column(Float, nullable=False)
    estimated_travel_time_seconds = Column(Integer, nullable=False)
    route_geometry = Column(JSON, nullable=False)  # GeoJSON LineString
    waypoints = Column(JSON, default=list, nullable=False)
    cctv_sequence = Column(JSON, default=list, nullable=False)  # Ordered sequence of CCTV sources with observation windows
    surveillance_source_count = Column(Integer, default=0, nullable=False)
    government_source_count = Column(Integer, default=0, nullable=False)
    private_source_count = Column(Integer, default=0, nullable=False)
    coverage_score = Column(Float, default=0.0, nullable=False)  # 0.0 to 1.0
    coverage_gaps = Column(JSON, default=list, nullable=False)  # Sections > 300m without CCTV
    time_plausibility = Column(Float, default=1.0, nullable=False)
    relevance_score = Column(Float, default=0.8, nullable=False)  # Investigative Route Relevance
    confidence = Column(Float, default=0.85, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_route_case_type", "case_id", "route_type"),
    )


class CCTVAnalysisJobModel(Base):
    """Execution lifecycle and progress tracking for CCTV intelligence jobs."""
    __tablename__ = "cctv_analysis_jobs"

    id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), nullable=False, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    status = Column(String(32), default="QUEUED", nullable=False, index=True)  # QUEUED, RUNNING, PARTIAL, COMPLETED, FAILED
    progress = Column(Float, default=0.0, nullable=False)
    current_stage = Column(String(64), default="QUEUED", nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    created_by = Column(String(128), default="INVESTIGATOR", nullable=False)
    parameters = Column(JSON, default=dict, nullable=False)
    results_summary = Column(JSON, default=dict, nullable=False)


class CCTVCaseLinkModel(Base):
    """Binds verified CCTV sources or selected route hypotheses directly to the investigation dossier."""
    __tablename__ = "cctv_case_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(64), nullable=False, index=True)
    incident_id = Column(String(64), nullable=True, index=True)
    item_type = Column(String(32), nullable=False)  # SOURCE, ROUTE, DEPLOYMENT_EVIDENCE
    item_id = Column(String(64), nullable=False, index=True)
    notes = Column(Text, nullable=True)
    added_by = Column(String(128), default="INVESTIGATOR", nullable=False)
    added_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CCTVVerificationModel(Base):
    """Audit log of manual investigator verifications and status corrections."""
    __tablename__ = "cctv_verifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(String(64), nullable=False, index=True)
    case_id = Column(String(64), nullable=False, index=True)
    previous_status = Column(String(32), nullable=False)
    new_status = Column(String(32), nullable=False)
    verified_by = Column(String(128), default="INVESTIGATOR", nullable=False)
    reason = Column(Text, nullable=True)
    camera_count_confirmed = Column(Integer, nullable=True)
    verified_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
