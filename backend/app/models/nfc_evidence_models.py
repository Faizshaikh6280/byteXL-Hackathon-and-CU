import datetime
from sqlalchemy import (
    Column, String, Integer, BigInteger, Float, DateTime, Text, JSON, ForeignKey, Index, Boolean
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class NFCEvidenceAcquisitionModel(Base):
    """
    Forensic NFC Evidence Acquisition Registry.
    Connects the raw NFC capture, canonical SHA-256 hash, encrypted MinIO storage,
    derived normalized records, entity resolution outcomes, and multi-domain correlations.
    """
    __tablename__ = "nfc_evidence_acquisitions"

    acquisition_id = Column(String(64), primary_key=True, index=True)
    evidence_id = Column(String(64), ForeignKey("evidence.evidence_id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    
    acquired_by = Column(String(128), nullable=False)  # Officer employee_id or email
    acquired_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    
    card_uid = Column(String(64), nullable=True)  # Hardware serial if exposed by tag/reader
    nfc_format = Column(String(32), default="NDEF", nullable=False)
    record_count = Column(Integer, default=0, nullable=False)
    
    raw_payload_uri = Column(String(512), nullable=False)  # MinIO object path
    raw_sha256 = Column(String(64), nullable=False, index=True)
    
    hardware_metadata = Column(JSON, default=dict, nullable=False)  # Device, browser, technology
    location_metadata = Column(JSON, default=dict, nullable=False)  # Crime scene latitude, longitude, accuracy, location name
    
    acquisition_status = Column(String(32), default="ACQUIRED", index=True, nullable=False)
    # ACQUIRED, STORED, PARSED, ER_COMPLETED, CORRELATED, COMPLETED, FAILED
    
    derived_identifiers = Column(JSON, default=list, nullable=False)
    # Array of { field, value, source_record_index, extraction_method, confidence, status }
    
    entity_resolution_result = Column(JSON, default=dict, nullable=False)
    # { matched_cluster_id, match_tier, confidence, reasons, candidate_entities, discrepancy }
    
    case_correlations = Column(JSON, default=dict, nullable=False)
    # { telecom_cdr, financial_banking, network_ipdr, social, timeline, geospatial, anomaly_signals, findings }
    
    finding_id = Column(String(64), nullable=True)  # Referenced finding if synthesized
    investigator_assessment = Column(Text, nullable=True)  # Neutral investigative summary
    provenance_info = Column(JSON, default=dict, nullable=False)
    
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    evidence = relationship("EvidenceModel", backref="nfc_acquisition")
    case = relationship("CaseModel", backref="nfc_acquisitions")
