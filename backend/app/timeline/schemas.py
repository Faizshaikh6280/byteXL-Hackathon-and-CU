from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import datetime

class EpistemicStatus(str, Enum):
    OBSERVED = "OBSERVED"
    CORRELATED = "CORRELATED"
    DERIVED = "DERIVED"
    HYPOTHESIS = "HYPOTHESIS"

class TimestampPrecision(str, Enum):
    SECOND = "SECOND"
    MINUTE = "MINUTE"
    HOUR = "HOUR"
    DAY = "DAY"
    APPROXIMATE = "APPROXIMATE"

class RiskLevel(str, Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class TimelineCanonicalEvent(BaseModel):
    """
    Forensic Canonical Temporal Event abstraction.
    Unifies records across telecom, banking, network, social, geospatial, and analytical domains.
    Guarantees zero destruction of raw timestamps, source records, or cryptographic evidence lineage.
    """
    event_id: str
    case_id: str
    event_type: str                         # CALL, SMS, BANK_TRANSFER, DEBIT, CREDIT, CASH_WITHDRAWAL, ATM, CELL_TOWER_LOCATION, IP_LOCATION, SOCIAL_POST, SOCIAL_ACTIVITY, ANOMALY, etc.
    domain: str                             # TELECOM, FINANCIAL, LOCATION, SOCIAL, NETWORK, ANALYTICAL

    start_time: str                         # ISO-8601 UTC
    end_time: Optional[str] = None          # ISO-8601 UTC if duration/window exists
    raw_timestamp: str                      # Verbatim raw string from evidence file
    normalized_timestamp: str               # ISO-8601 UTC formatted string
    timestamp_ms: int                       # Epoch milliseconds for high-performance canvas sorting and virtualization
    timezone_offset: Optional[str] = None   # e.g. "+05:30", "UTC", "UNKNOWN"
    timestamp_precision: str = TimestampPrecision.SECOND.value
    timestamp_confidence: float = 1.0       # 0.0 - 1.0

    source_type: str                        # TELECOM, BANKING, NETWORK, SOCIAL, KYC, ANALYTICAL
    source_record_id: Optional[str] = None  # Original row identifier if present
    evidence_id: str                        # Foreign key to evidence table
    evidence_filename: Optional[str] = None
    evidence_sha256: Optional[str] = None

    actor_entities: List[str] = Field(default_factory=list)
    target_entities: List[str] = Field(default_factory=list)
    related_entities: List[str] = Field(default_factory=list)
    z_cluster_id: Optional[str] = None      # Resolved Golden Profile cluster ID
    entity_name: Optional[str] = None       # Resolved primary human / holder name

    location_name: Optional[str] = None     # Descriptive address / tower / branch name
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_source: Optional[str] = None   # CELL_TOWER, IP_GEOLOCATION, TRANSACTION_BRANCH, GPS
    location_confidence: float = 1.0

    amount_inr: Optional[float] = 0.0
    channel: Optional[str] = None           # UPI, RTGS, IMPS, ATM, CASH, WIRE
    txn_type: Optional[str] = None          # DEBIT, CREDIT, TRANSFER, WITHDRAWAL
    counterparty: Optional[str] = None
    narration: Optional[str] = None

    duration_seconds: Optional[int] = None
    bytes_transferred: Optional[int] = None
    client_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    cell_tower_id: Optional[str] = None
    imei: Optional[str] = None

    attributes: Dict[str, Any] = Field(default_factory=dict)

    anomaly_score: float = 0.0
    risk_level: str = RiskLevel.NONE.value
    anomaly_ids: List[str] = Field(default_factory=list)
    anomaly_reasons: List[str] = Field(default_factory=list)

    confidence_score: float = 1.0
    correlation_ids: List[str] = Field(default_factory=list)

    epistemic_status: str = EpistemicStatus.OBSERVED.value
    tags: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class TemporalCorrelation(BaseModel):
    """
    Evidence-backed correlation between two temporal events across domains or entities.
    Never presents inference as an observed fact.
    """
    correlation_id: str
    case_id: str
    event_a_id: str
    event_b_id: str
    relationship_type: str                  # CALL_BEFORE_TRANSFER, TRANSFER_TO_CASHOUT, CALL_BEFORE_LOCATION_CHANGE, TRANSFER_WITH_SOCIAL_ACTIVITY, RAPID_FUND_MOVEMENT, COORDINATED_ACTIVITY
    time_delta_seconds: float
    time_delta_formatted: str               # e.g., "6 min 12 sec"
    correlation_score: float                # 0.0 - 1.0
    rules_triggered: List[str] = Field(default_factory=list)
    supporting_evidence: List[str] = Field(default_factory=list)
    description: str
    epistemic_status: str = EpistemicStatus.CORRELATED.value
    actor_a: Optional[str] = None
    actor_b: Optional[str] = None
    domain_a: Optional[str] = None
    domain_b: Optional[str] = None
    timestamp_a: str
    timestamp_b: str

class ActivityBurst(BaseModel):
    """
    Statistically unusual temporal clustering of investigative activity across domains.
    """
    burst_id: str
    case_id: str
    start_time: str
    end_time: str
    duration_seconds: float
    event_count: int
    entity_count: int
    domain_counts: Dict[str, int] = Field(default_factory=dict)
    entities: List[str] = Field(default_factory=list)
    event_ids: List[str] = Field(default_factory=list)
    severity: str = RiskLevel.MEDIUM.value
    description: str

class TemporalInconsistency(BaseModel):
    """
    Geospatial and temporal velocity inconsistency.
    Maintains strictly neutral forensic terminology: flags physical implausibility without fabricating conclusions.
    """
    inconsistency_id: str
    case_id: str
    entity_id: str
    entity_name: Optional[str] = None
    event_a_id: str
    event_b_id: str
    start_time: str
    end_time: str
    time_delta_seconds: float
    location_a: Dict[str, Any]              # {"name": ..., "lat": ..., "lng": ...}
    location_b: Dict[str, Any]
    distance_km: float
    required_speed_kmh: float
    confidence: float = 0.95
    evidence_refs: List[str] = Field(default_factory=list)
    description: str

class StorylineStep(BaseModel):
    step_index: int
    event_id: str
    timestamp: str
    time_offset_from_start: str
    time_offset_from_prev: str
    domain: str
    event_type: str
    summary: str
    actors: List[str] = Field(default_factory=list)
    amount_inr: Optional[float] = None
    location: Optional[str] = None
    evidence_id: Optional[str] = None
    is_anomaly: bool = False
    anomaly_title: Optional[str] = None

class StorylineSequence(BaseModel):
    """
    Forensic reconstruction of a connected event sequence into an evidence-backed storyline.
    Every statement is strictly anchored to underlying events.
    """
    sequence_id: str
    case_id: str
    title: str
    summary: str
    category: str
    domain_span: List[str] = Field(default_factory=list)
    start_time: str
    end_time: str
    total_duration_formatted: str
    steps: List[StorylineStep] = Field(default_factory=list)
    event_ids: List[str] = Field(default_factory=list)
    correlation_ids: List[str] = Field(default_factory=list)
    intelligence_assessment: str
    confidence_score: float = 0.9

class TimeBucketDensity(BaseModel):
    bucket_key: str
    start_ms: int
    end_ms: int
    event_count: int
    domain_counts: Dict[str, int] = Field(default_factory=dict)
    anomaly_count: int = 0

class TimelineSummaryStats(BaseModel):
    total_events: int = 0
    total_entities: int = 0
    total_anomalies: int = 0
    total_correlations: int = 0
    total_bursts: int = 0
    total_inconsistencies: int = 0
    domain_breakdown: Dict[str, int] = Field(default_factory=dict)
    min_timestamp: Optional[str] = None
    max_timestamp: Optional[str] = None

class TimelineQueryResponse(BaseModel):
    case_id: str
    summary: TimelineSummaryStats
    events: List[TimelineCanonicalEvent] = Field(default_factory=list)
    correlations: List[TemporalCorrelation] = Field(default_factory=list)
    bursts: List[ActivityBurst] = Field(default_factory=list)
    inconsistencies: List[TemporalInconsistency] = Field(default_factory=list)
    density_buckets: List[TimeBucketDensity] = Field(default_factory=list)
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    has_more: bool = False
    next_cursor: Optional[str] = None
