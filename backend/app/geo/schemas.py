from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel, Field
from enum import Enum
import datetime

class GeoLocationType(str, Enum):
    GPS = "GPS"
    CELL_TOWER = "CELL_TOWER"
    ATM = "ATM"
    BANK_BRANCH = "BANK_BRANCH"
    MERCHANT = "MERCHANT"
    SOCIAL_GEOTAG = "SOCIAL_GEOTAG"
    IP_GEOLOCATION = "IP_GEOLOCATION"
    UNKNOWN = "UNKNOWN"

class EpistemicStatus(str, Enum):
    OBSERVED = "OBSERVED"
    CORRELATED = "CORRELATED"
    DERIVED = "DERIVED"
    HYPOTHESIS = "HYPOTHESIS"

class GeoCanonicalEvent(BaseModel):
    """
    Forensic Canonical Geospatial Event.
    Compatible with Timeline/CanonicalEvent models while preserving
    semantic location quality, precision bounds, and cryptographic provenance.
    """
    geo_event_id: str
    event_id: str
    case_id: str
    entity_id: Optional[str] = None         # e.g. z_cluster_id
    entity_name: Optional[str] = None       # Resolved name
    
    timestamp: str                          # ISO-8601 UTC
    timestamp_ms: int                       # Epoch milliseconds
    raw_timestamp: str                      # Unaltered evidence string
    timezone_offset: Optional[str] = None
    
    location_type: GeoLocationType = GeoLocationType.UNKNOWN
    latitude: float
    longitude: float
    accuracy_radius_meters: float = 100.0   # Precision radius (10m GPS, 500m Tower, 10km IP)
    location_confidence: float = 1.0        # 0.0 - 1.0
    location_name: Optional[str] = None     # Address / Sector / POI description
    address: Optional[str] = None
    cell_tower_id: Optional[str] = None
    device_id: Optional[str] = None         # IMEI / Phone / MAC
    
    domain: str = "LOCATION"                # TELECOM, FINANCIAL, LOCATION, SOCIAL, NETWORK
    event_type: str = "WAYPOINT"            # CALL, SMS, CASH_WITHDRAWAL, WAYPOINT, etc.
    
    raw_evidence_id: str
    evidence_filename: Optional[str] = None
    evidence_sha256: Optional[str] = None
    
    anomaly_score: float = 0.0
    anomaly_reasons: List[str] = Field(default_factory=list)
    
    epistemic_status: str = EpistemicStatus.OBSERVED.value
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class MovementSegment(BaseModel):
    """
    Reconstructed trajectory segment between two consecutive temporal observations of an entity.
    Gap-aware: flags discontinuities and implausible velocity to prevent misleading continuous tracks.
    """
    segment_id: str
    entity_id: str
    entity_name: Optional[str] = None
    from_event_id: str
    to_event_id: str
    
    start_time: str                         # ISO-8601 UTC
    end_time: str                           # ISO-8601 UTC
    duration_seconds: float
    
    start_coords: Tuple[float, float]       # [lng, lat] for Deck.gl
    end_coords: Tuple[float, float]         # [lng, lat] for Deck.gl
    distance_km: float
    speed_kmh: float
    
    is_gap: bool = False                    # True if gap threshold exceeded or impossible speed
    gap_reason: Optional[str] = None        # "TEMPORAL_DISCONTINUITY" or "IMPLAUSIBLE_VELOCITY"
    path_points: List[List[float]] = Field(default_factory=list) # [[lng, lat], ...]

class CoLocationFinding(BaseModel):
    """
    Forensic multi-entity co-location finding.
    Strictly observational: records concurrent or proximate presence without inferring conspiracy.
    """
    co_location_id: str
    case_id: str
    co_location_type: str                   # "CELL_SECTOR_OVERLAP", "PROXIMITY_OVERLAP", "REPEATED_PRESENCE_IN_AREA"
    entity_ids: List[str]
    entity_names: List[str]
    
    start_time: str
    end_time: str
    duration_seconds: float = 0.0
    
    latitude: float
    longitude: float
    location_name: Optional[str] = None
    cell_tower_id: Optional[str] = None
    distance_between_meters: float = 0.0
    
    occurrence_count: int = 1               # Number of co-occurrences in this area
    distinct_days_count: int = 1            # Distinct calendar days observed together
    correlation_score: float = 0.0          # 0.0 - 100.0 multi-factor correlation
    supporting_events: List[str] = Field(default_factory=list) # GeoCanonicalEvent IDs
    
    epistemic_note: str = "Evidence indicates concurrent spatial-temporal proximity of recorded identifiers; does not establish physical meeting or collusion."
    created_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class CommonPlace(BaseModel):
    """
    Geospatial hub or point of interest with high recurring entity activity.
    """
    place_id: str
    place_name: str
    latitude: float
    longitude: float
    location_type: GeoLocationType = GeoLocationType.UNKNOWN
    radius_meters: float = 250.0
    
    total_visits: int = 0
    unique_entities: List[str] = Field(default_factory=list)
    unique_entity_count: int = 0
    entity_visit_counts: Dict[str, int] = Field(default_factory=dict)
    time_spans: List[str] = Field(default_factory=list)
    dominant_domain: str = "LOCATION"

class AreaInvestigationResult(BaseModel):
    """
    Result of a "Who Was Here?" or "What Happened Here?" geofence query.
    """
    center: Tuple[float, float]             # (lat, lng)
    radius_meters: float
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    
    entities_present: List[Dict[str, Any]] = Field(default_factory=list) # entity_id, name, event_count, first_seen, last_seen, confidence
    events_inside: List[GeoCanonicalEvent] = Field(default_factory=list)
    domain_distribution: Dict[str, int] = Field(default_factory=dict)
    total_events: int = 0
    total_entities: int = 0

class SpatialStoryCard(BaseModel):
    """
    Sequenced narrative card reconstructing entity mobility with forensic provenance.
    """
    card_id: str
    entity_id: str
    entity_name: Optional[str] = None
    step_index: int
    timestamp: str
    time_range_formatted: str
    location_name: str
    coordinates: Tuple[float, float]        # (lat, lng)
    action_summary: str
    distance_from_previous_km: Optional[float] = None
    travel_time_from_previous_sec: Optional[float] = None
    implied_speed_kmh: Optional[float] = None
    evidence_refs: List[str] = Field(default_factory=list)
    anomalies: List[str] = Field(default_factory=list)

class ActivityDensityCell(BaseModel):
    """
    Grid or cluster aggregation for viewport activity density.
    """
    cell_id: str
    latitude: float
    longitude: float
    event_count: int
    entity_count: int
    domains: Dict[str, int] = Field(default_factory=dict)

class GeoInvestigationResponse(BaseModel):
    """
    Complete composite response for Geospatial Intelligence Workspace.
    """
    case_id: str
    total_events: int
    events: List[GeoCanonicalEvent]
    movements: List[MovementSegment]
    co_locations: List[CoLocationFinding]
    common_places: List[CommonPlace]
    density_grid: List[ActivityDensityCell]
    story_cards: List[SpatialStoryCard]
    summary_metrics: Dict[str, Any] = Field(default_factory=dict)
