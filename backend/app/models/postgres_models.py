import datetime
from sqlalchemy import (
    Column, String, Integer, BigInteger, Float, DateTime, Text, JSON, ForeignKey, Index, Boolean
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.iam_models import (
    OrganizationModel, UnitModel, RoleModel, PermissionModel,
    RolePermissionModel, UserModel, CaseMemberModel, SessionModel,
    MFACredentialModel, InvitationModel, PasswordResetTokenModel, ReportModel
)
from app.models.nfc_models import NFCOfficerCardModel
from app.models.nfc_evidence_models import NFCEvidenceAcquisitionModel

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class CaseModel(Base):
    """Investigation Case metadata registry."""
    __tablename__ = "cases"

    case_id = Column(String(64), primary_key=True, index=True)
    case_reference = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)  # Written case context / investigator notes
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_by = Column(String(128), default="INVESTIGATOR_LEAD", nullable=False)
    status = Column(String(32), default="ACTIVE", index=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    unit_id = Column(String(64), nullable=True, index=True)
    sensitivity = Column(String(32), default="INTERNAL", nullable=False)

    # Relationships
    evidence_items = relationship("EvidenceModel", back_populates="case", cascade="all, delete-orphan")


class EvidenceModel(Base):
    """Raw evidence registration, checksums, and processing lifecycle metadata."""
    __tablename__ = "evidence"

    evidence_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(128), nullable=True)
    file_size = Column(BigInteger, nullable=False)
    sha256 = Column(String(64), nullable=False, index=True)
    sensitivity = Column(String(32), default="SENSITIVE", nullable=False)
    
    # Encryption parameters (algorithm, nonce, key reference) - never plaintext keys
    encryption_metadata = Column(JSON, nullable=True)
    storage_path = Column(String(512), nullable=False)  # S3/MinIO key (e.g. cases/CASE-001/evidence/EV-001/original/data.enc)
    
    received_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    received_by = Column(String(128), default="SYSTEM", nullable=False)
    
    # Observable Processing Status
    processing_status = Column(String(64), default="RECEIVED", index=True, nullable=False)
    
    # Source Detection Information
    detected_source_type = Column(String(32), default="UNKNOWN", index=True, nullable=True)
    detected_source_confidence = Column(Float, default=0.0, nullable=True)
    detector_version = Column(String(32), default="v1.0.0", nullable=True)
    parser_version = Column(String(32), default="v1.0.0", nullable=True)
    schema_version = Column(String(32), default="v1.0.0", nullable=True)
    
    # Pipeline Timings
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Ingestion & Quality Metrics
    record_count = Column(Integer, default=0)
    valid_record_count = Column(Integer, default=0)
    invalid_record_count = Column(Integer, default=0)
    duplicate_record_count = Column(Integer, default=0)
    quality_score = Column(Float, default=100.0)
    
    error_info = Column(Text, nullable=True)
    provenance_info = Column(JSON, nullable=True)

    # Relationships
    case = relationship("CaseModel", back_populates="evidence_items")
    quarantine_records = relationship("QuarantineRecordModel", back_populates="evidence", cascade="all, delete-orphan")


class QuarantineRecordModel(Base):
    """Preserves invalid/malformed records with explicit reasons for provenance."""
    __tablename__ = "quarantine_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evidence_id = Column(String(64), ForeignKey("evidence.evidence_id", ondelete="CASCADE"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=False)
    raw_payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    evidence = relationship("EvidenceModel", back_populates="quarantine_records")


class DataQualityReportModel(Base):
    """Evidence and Case level data quality metrics and missing field summaries."""
    __tablename__ = "data_quality_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evidence_id = Column(String(64), nullable=False, index=True)
    case_id = Column(String(64), nullable=False, index=True)
    total_records = Column(Integer, default=0)
    valid_records = Column(Integer, default=0)
    invalid_records = Column(Integer, default=0)
    duplicate_records = Column(Integer, default=0)
    missing_field_ratios = Column(JSON, nullable=True)
    quality_score = Column(Float, default=100.0)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class GoldenProfileModel(Base):
    """
    Resolved canonical entity profiles (PostgreSQL replacement for MongoDB golden_profiles).
    Stores deduplicated, synthesized real-world identities produced by Entity Resolution (Zingg/Union-Find).
    """
    __tablename__ = "golden_profiles"

    case_id = Column(String(64), primary_key=True, index=True, default="CASE-DEFAULT-001")
    z_cluster_id = Column(String(64), primary_key=True, index=True)  # e.g., "CLUSTER_001"
    primary_name = Column(String(255), nullable=False, index=True)
    known_aliases = Column(JSON, default=list, nullable=False)       # List of alias strings
    known_phones = Column(JSON, default=list, nullable=False)        # E.164 phone numbers
    known_accounts = Column(JSON, default=list, nullable=False)      # Bank account numbers
    associated_emails = Column(JSON, default=list, nullable=False)   # Email addresses
    known_addresses = Column(JSON, default=list, nullable=False)     # Physical addresses
    national_ids = Column(JSON, default=list, nullable=False)        # Aadhar / Govt IDs
    social_handles = Column(JSON, default=list, nullable=False)      # Array of {handle, platform}
    merged_node_ids = Column(JSON, default=list, nullable=True)      # Base Node IDs merged into this cluster
    risk_score = Column(Float, default=0.3, nullable=False)
    method = Column(String(64), default="zingg_docker", nullable=False)
    last_updated = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AuditLogModel(Base):
    """Tamper-evident, cryptographically verifiable audit log for chain of custody, security, and investigative actions."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    audit_id = Column(String(64), unique=True, nullable=True, index=True)
    audit_event_id = Column(String(64), unique=True, nullable=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    
    # Actor identity
    user_id = Column(String(64), nullable=True, index=True)
    actor = Column(String(128), default="SYSTEM", nullable=False, index=True)
    actor_type = Column(String(32), default="HUMAN_USER", nullable=False, index=True)  # HUMAN_USER, SYSTEM_SERVICE, AUTOMATED_JOB
    role = Column(String(64), nullable=True, index=True)
    organization_id = Column(String(64), nullable=True, index=True)
    unit_id = Column(String(64), nullable=True, index=True)
    
    # Case & Resource Scope
    case_id = Column(String(64), nullable=True, index=True)
    evidence_id = Column(String(64), nullable=True, index=True)
    action = Column(String(128), nullable=False, index=True)
    resource_type = Column(String(64), nullable=True, index=True)
    resource_id = Column(String(128), nullable=True, index=True)
    
    # Outcome & Evaluation
    result = Column(String(32), default="SUCCESS", nullable=False, index=True)  # SUCCESS, DENIED, FAILED, PARTIAL
    decision = Column(String(32), default="ALLOWED", nullable=False, index=True)  # ALLOWED, DENIED, ERROR
    reason_code = Column(String(64), nullable=True, index=True)
    reason = Column(Text, nullable=True)
    
    # Session & HTTP Request Traceability
    request_id = Column(String(64), nullable=True, index=True)
    correlation_id = Column(String(64), nullable=True, index=True)
    session_id = Column(String(128), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    endpoint = Column(String(255), nullable=True)
    http_method = Column(String(16), nullable=True)
    
    # Payload & Forensic Integrity
    details = Column(JSON, nullable=True)
    previous_state_hash = Column(String(64), nullable=True)
    new_state_hash = Column(String(64), nullable=True)
    
    # Cryptographic Hash Chain
    event_hash = Column(String(64), nullable=True, index=True)
    previous_event_hash = Column(String(64), nullable=True, index=True)
    audit_schema_version = Column(Integer, default=1, nullable=False)
    hash_signature = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DetectionSignalModel(Base):
    """
    Standard machine-generated detection signal table.
    Stores raw observations from all 11+ analytical engines prior to correlation and synthesis.
    """
    __tablename__ = "detection_signals"

    signal_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    detector_id = Column(String(64), nullable=False, index=True)
    detector_version = Column(String(32), default="v1.0.0", nullable=False)

    pattern_type = Column(String(64), default="GENERAL", index=True, nullable=False)
    signal_type = Column(String(128), default="ANOMALY_OBSERVATION", nullable=False)
    domain = Column(String(64), default="CROSS_DOMAIN", index=True, nullable=False)

    entity_refs = Column(JSON, default=list, nullable=False)
    event_refs = Column(JSON, default=list, nullable=False)
    evidence_refs = Column(JSON, default=list, nullable=False)

    timestamp_start = Column(DateTime(timezone=True), nullable=True)
    timestamp_end = Column(DateTime(timezone=True), nullable=True)
    location_refs = Column(JSON, default=list, nullable=False)

    observations = Column(JSON, default=dict, nullable=False)
    baseline = Column(JSON, default=dict, nullable=False)
    metrics = Column(JSON, default=dict, nullable=False)

    raw_score = Column(Float, default=0.0, nullable=False)
    normalized_score = Column(Float, default=0.0, nullable=False)
    detector_confidence = Column(Float, default=1.0, nullable=False)

    graph_refs = Column(JSON, default=list, nullable=False)
    provenance = Column(JSON, default=dict, nullable=False)
    status = Column(String(32), default="DETECTED", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class AnomalyFindingModel(Base):
    """
    Unified multi-engine anomaly and investigative finding registry.
    Combines behavioral, statistical, deterministic rules, network topology,
    spatio-temporal, financial, social, and cross-domain investigative findings.
    """
    __tablename__ = "anomaly_findings"

    finding_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    entity_id = Column(String(128), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    fingerprint = Column(String(64), index=True, nullable=False)

    title = Column(Text, nullable=False)
    severity = Column(String(32), default="MEDIUM", index=True, nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    unified_score = Column(Float, default=0.0, index=True, nullable=False)
    confidence = Column(Float, default=1.0, nullable=False)
    investigative_priority = Column(String(32), default="MEDIUM", index=True, nullable=False)

    domain = Column(String(64), nullable=False, index=True)
    primary_detector_type = Column(String(64), nullable=False, index=True)
    contributing_detectors = Column(JSON, default=list, nullable=False)

    signals = Column(JSON, default=list, nullable=False)
    explanation = Column(Text, nullable=True)
    metrics = Column(JSON, default=dict, nullable=False)

    evidence_refs = Column(JSON, default=list, nullable=False)
    canonical_event_refs = Column(JSON, default=list, nullable=False)
    graph_refs = Column(JSON, default=list, nullable=False)
    model_metadata = Column(JSON, default=dict, nullable=False)

    # Rich Investigative Finding Fields
    category = Column(String(64), default="GENERAL", index=True, nullable=True)
    pattern_type = Column(String(64), nullable=True, index=True)
    what_happened = Column(Text, nullable=True)
    why_unusual = Column(Text, nullable=True)
    why_relevant = Column(Text, nullable=True)

    primary_entities = Column(JSON, default=list, nullable=False)
    related_entities = Column(JSON, default=list, nullable=False)
    time_range = Column(JSON, default=dict, nullable=False)
    locations = Column(JSON, default=list, nullable=False)

    supporting_observations = Column(JSON, default=list, nullable=False)
    supporting_signals = Column(JSON, default=list, nullable=False)
    supporting_events = Column(JSON, default=list, nullable=False)

    graph_context = Column(JSON, default=dict, nullable=False)
    timeline_context = Column(JSON, default=dict, nullable=False)
    spatial_context = Column(JSON, default=dict, nullable=False)

    detectors = Column(JSON, default=list, nullable=False)
    detector_summary = Column(JSON, default=list, nullable=False)

    evidence_quality = Column(String(32), default="HIGH", nullable=False)
    case_relevance = Column(String(32), default="HIGH", index=True, nullable=False)
    relevance_reasons = Column(JSON, default=list, nullable=False)
    technical_details = Column(JSON, default=dict, nullable=False)
    provenance = Column(JSON, default=dict, nullable=False)

    status = Column(String(32), default="DETECTED", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# Backward and forward compatibility aliases
InvestigativeFindingModel = AnomalyFindingModel


class AnomalyRunModel(Base):
    """Execution lifecycle and audit state for anomaly analysis runs."""
    __tablename__ = "anomaly_runs"

    run_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), default="QUEUED", index=True, nullable=False)  # QUEUED, RUNNING, COMPLETED, PARTIAL_FAILURE, FAILED
    current_stage = Column(String(64), default="QUEUED", nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    detectors_executed = Column(JSON, default=list, nullable=False)
    detectors_failed = Column(JSON, default=list, nullable=False)
    total_findings = Column(Integer, default=0, nullable=False)
    summary_stats = Column(JSON, default=dict, nullable=False)
    error_message = Column(Text, nullable=True)


class DetectorRegistryModel(Base):
    """Metadata registry of all anomaly detectors and configuration profiles."""
    __tablename__ = "detector_registry"

    detector_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    version = Column(String(32), default="v1.0.0", nullable=False)
    detector_type = Column(String(64), nullable=False, index=True)
    domain = Column(String(64), nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    description = Column(Text, nullable=True)
    config = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class InvestigationReportModel(Base):
    """Stores the JSON-based intelligence reports from the Agentic Forensics multi-agent pipeline."""
    __tablename__ = "investigation_reports"

    report_id = Column(Integer, primary_key=True, autoincrement=True)
    community_id = Column(Integer, nullable=False, index=True)
    financial_json = Column(JSON, nullable=True)
    geographic_json = Column(JSON, nullable=True)
    temporal_json = Column(JSON, nullable=True)
    lead_json = Column(JSON, nullable=True)
    status = Column(String(32), default="processing", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AlertModel(Base):
    """
    Stateful CEP Alerts generated by sliding-window multi-modal correlation engine.
    Stores explainable evidence narratives, micro-timelines, and triage statuses.
    """
    __tablename__ = "investigation_alerts"

    alert_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    pattern_name = Column(String(128), nullable=False, index=True)  # e.g., 'Triple Collision Burst'
    entity_id = Column(String(128), nullable=False, index=True)     # Resolved Zingg entity or primary identifier
    entity_name = Column(String(255), nullable=True)
    risk_level = Column(String(32), default="HIGH", index=True, nullable=False)  # CRITICAL, HIGH, MEDIUM
    risk_score = Column(Integer, default=80, nullable=False)
    status = Column(String(32), default="PENDING", index=True, nullable=False)    # PENDING, INVESTIGATING, ASSIGNED, DISMISSED
    evidence_narrative = Column(Text, nullable=False)
    micro_timeline = Column(JSON, default=list, nullable=False)
    metadata_info = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    triaged_at = Column(DateTime(timezone=True), nullable=True)
    triaged_by = Column(String(128), nullable=True)


class SearchHistoryModel(Base):
    """
    Investigative query history and retrievable case search records.
    """
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(64), nullable=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)
    query_text = Column(Text, nullable=False)
    query_type = Column(String(32), default="OMNI", nullable=False)
    detected_type = Column(String(32), default="UNKNOWN", nullable=False)
    filters = Column(JSON, default=dict, nullable=False)
    result_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class ChatbotMessageModel(Base):
    """
    Persistent conversation history for the AI Forensic Chatbot.
    Strictly scoped per case_id so switching cases loads the relevant dialogue.
    """
    __tablename__ = "chatbot_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String(64), unique=True, index=True, nullable=False)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    tool_used = Column(String(64), nullable=True)
    generated_cypher = Column(Text, nullable=True)
    sql_query = Column(Text, nullable=True)
    records_count = Column(Integer, default=0, nullable=True)
    records = Column(JSON, default=list, nullable=True)
    resolved_entities = Column(JSON, default=list, nullable=True)
    anomalies = Column(JSON, default=list, nullable=True)
    alerts = Column(JSON, default=list, nullable=True)
    suggested_followups = Column(JSON, default=list, nullable=True)
    model_used = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

