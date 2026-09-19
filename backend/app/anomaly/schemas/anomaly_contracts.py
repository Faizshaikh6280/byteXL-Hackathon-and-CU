from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum
import datetime

class DetectorType(str, Enum):
    BEHAVIORAL = "BEHAVIORAL"
    RULE = "RULE"
    STATISTICAL = "STATISTICAL"
    NETWORK = "NETWORK"
    SPATIAL_TEMPORAL = "SPATIAL_TEMPORAL"
    FINANCIAL = "FINANCIAL"
    SOCIAL = "SOCIAL"
    VPN_NETWORK = "VPN_NETWORK"
    CROSS_DOMAIN = "CROSS_DOMAIN"
    IDENTITY_DISCREPANCY = "IDENTITY_DISCREPANCY"
    ADVANCED_ML = "ADVANCED_ML"
    COMMUNICATION = "COMMUNICATION"

class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class DetectorStatus(str, Enum):
    FLAGGED = "FLAGGED"
    NORMAL = "NORMAL"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    ERROR = "ERROR"

class DetectorMetadata(BaseModel):
    detector_id: str
    name: str
    version: str = "v1.0.0"
    detector_type: DetectorType
    domain: str
    applicable_domains: List[str]
    required_fields: List[str]
    min_sample_size: int = 1
    description: str = ""

class DetectorExecutionResult(BaseModel):
    """Output emitted by an individual detector lens."""
    detector_id: str
    detector_version: str = "v1.0.0"
    detector_type: DetectorType
    status: DetectorStatus = DetectorStatus.NORMAL
    
    entity_id: str
    entity_type: str = "Person"
    case_id: str
    domain: str
    
    raw_score: float = 0.0          # Unscaled native detector metric
    normalized_score: float = 0.0   # Calibrated 0.0 to 100.0 score
    confidence: float = 1.0         # 0.0 to 1.0 based on data quality & sample size
    
    title: str = ""
    signals: List[str] = Field(default_factory=list)
    features: Dict[str, Any] = Field(default_factory=dict)
    explanation: str = ""
    
    evidence_refs: List[str] = Field(default_factory=list)
    canonical_event_refs: List[str] = Field(default_factory=list)
    graph_refs: List[str] = Field(default_factory=list)
    
    missing_fields: List[str] = Field(default_factory=list)
    not_applicable_reason: Optional[str] = None
    error_info: Optional[str] = None

class UnifiedFindingContract(BaseModel):
    model_config = {"protected_namespaces": ()}
    """
    Consolidated finding synthesized by the Unified Scoring Engine.
    Combines corroborating detectors into a single deduplicated finding.
    """
    finding_id: str
    case_id: str
    entity_id: str
    entity_type: str
    fingerprint: str

    title: str
    severity: SeverityLevel
    unified_score: float            # 0.0 to 100.0
    confidence: float               # 0.0 to 1.0
    investigative_priority: str     # LOW, MEDIUM, HIGH, VERY_HIGH

    domain: str
    primary_detector_type: str
    contributing_detectors: List[str] = Field(default_factory=list)

    signals: List[str] = Field(default_factory=list)
    features: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    explanation: str

    evidence_refs: List[str] = Field(default_factory=list)
    canonical_event_refs: List[str] = Field(default_factory=list)
    graph_refs: List[str] = Field(default_factory=list)

    model_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    status: str = "DETECTED"
    provenance: Dict[str, Any] = Field(default_factory=dict)
