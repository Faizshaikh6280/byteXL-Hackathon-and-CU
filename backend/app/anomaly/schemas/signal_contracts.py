"""
Canonical schemas and data contracts for the Investigative Intelligence Layer.
Provides strongly typed definitions for:
- DetectionSignal: standard output of analytical detector lenses
- CandidatePattern: correlated signal groups matching declarative pattern templates
- InvestigativeFinding: fully enriched, evidence-backed, human-readable finding
"""

import datetime
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


def utcnow_str() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class SignalStatus(str, Enum):
    DETECTED = "DETECTED"
    CORRELATED = "CORRELATED"
    PROMOTED = "PROMOTED"
    REJECTED_QUALITY = "REJECTED_QUALITY"
    SUPPORTING = "SUPPORTING"
    NORMAL = "NORMAL"


class FindingStatus(str, Enum):
    DETECTED = "DETECTED"
    CORRELATED = "CORRELATED"
    PRESENTED = "PRESENTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    DISMISSED = "DISMISSED"
    CONFIRMED_AS_RELEVANT = "CONFIRMED_AS_RELEVANT"
    REOPENED = "REOPENED"


class CaseRelevanceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class InvestigativePriorityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class SeverityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class DetectionSignal(BaseModel):
    model_config = {"protected_namespaces": ()}
    """
    Standard machine-generated observation emitted by an analytical detector lens.
    A DetectionSignal represents what was observed and measured algorithmically,
    prior to multi-lens correlation, evidence binding, and contextualization.
    """
    signal_id: str
    case_id: str

    detector_id: str
    detector_version: str = "v1.0.0"

    pattern_type: str = "GENERAL"
    signal_type: str = "ANOMALY_OBSERVATION"
    domain: str = "CROSS_DOMAIN"

    entity_refs: List[str] = Field(default_factory=list)
    event_refs: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)

    timestamp_start: Optional[str] = None
    timestamp_end: Optional[str] = None

    location_refs: List[Dict[str, Any]] = Field(default_factory=list)

    # Observed facts only — never fabricated
    observations: Dict[str, Any] = Field(default_factory=dict)
    baseline: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)

    raw_score: float = 0.0
    normalized_score: float = 0.0
    detector_confidence: float = 1.0

    graph_refs: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)

    generated_at: str = Field(default_factory=utcnow_str)
    status: SignalStatus = SignalStatus.DETECTED


class CandidatePattern(BaseModel):
    model_config = {"protected_namespaces": ()}
    """
    A coherent group of correlated DetectionSignals matching a declarative pattern definition.
    """
    candidate_id: str
    case_id: str
    pattern_id: str
    category: str
    title: str

    primary_signals: List[DetectionSignal] = Field(default_factory=list)
    supporting_signals: List[DetectionSignal] = Field(default_factory=list)

    entity_refs: List[str] = Field(default_factory=list)
    event_refs: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)

    time_start: Optional[str] = None
    time_end: Optional[str] = None

    locations: List[Dict[str, Any]] = Field(default_factory=list)
    aggregated_observations: Dict[str, Any] = Field(default_factory=dict)
    baseline: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)

    primary_detector_id: str = ""
    contributing_detector_ids: List[str] = Field(default_factory=list)
    domains_involved: List[str] = Field(default_factory=list)


class InvestigativeFinding(BaseModel):
    model_config = {"protected_namespaces": ()}
    """
    The primary investigator-facing intelligence object.
    Synthesizes contextualized, evidence-grounded answers to:
    WHO, WHAT, WHEN, WHERE, WHY UNUSUAL, WHY RELEVANT, EVIDENCE, DETECTORS, CONFIDENCE, PRIORITY.
    """
    finding_id: str
    case_id: str

    title: str
    category: str
    pattern_type: str

    what_happened: str
    why_unusual: str
    why_relevant: str

    primary_entities: List[Dict[str, Any]] = Field(default_factory=list)
    related_entities: List[Dict[str, Any]] = Field(default_factory=list)

    time_range: Dict[str, Any] = Field(default_factory=dict)
    locations: List[Dict[str, Any]] = Field(default_factory=list)

    supporting_observations: List[str] = Field(default_factory=list)
    supporting_signals: List[Dict[str, Any]] = Field(default_factory=list)
    supporting_events: List[Dict[str, Any]] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)

    graph_context: Dict[str, Any] = Field(default_factory=dict)
    timeline_context: Dict[str, Any] = Field(default_factory=dict)
    spatial_context: Dict[str, Any] = Field(default_factory=dict)

    detectors: List[str] = Field(default_factory=list)
    detector_summary: List[Dict[str, Any]] = Field(default_factory=list)

    anomaly_score: float = 0.0
    detection_confidence: float = 1.0
    evidence_quality: str = "HIGH"
    case_relevance: str = "HIGH"
    relevance_reasons: List[str] = Field(default_factory=list)
    investigative_priority: str = "HIGH"

    severity: str = "MEDIUM"

    technical_details: Dict[str, Any] = Field(default_factory=dict)
    provenance: Dict[str, Any] = Field(default_factory=dict)

    status: str = "DETECTED"
    fingerprint: str = ""

    created_at: str = Field(default_factory=utcnow_str)
    updated_at: str = Field(default_factory=utcnow_str)
