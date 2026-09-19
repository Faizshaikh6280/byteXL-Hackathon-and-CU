from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class IncidentLocation(BaseModel):
    address: Optional[str] = "Sector 34, Chandigarh"
    sector: Optional[str] = "Sector 34"
    landmark: Optional[str] = "Sub-City Centre, Sector 34"
    latitude: float = 30.7225
    longitude: float = 76.7682
    incident_date: Optional[str] = "2026-09-06"
    incident_time: Optional[str] = "21:20"
    incident_type: Optional[str] = "CYBER_FINANCIAL_CONVERGENCE"
    notes: Optional[str] = None
    location_source: Optional[str] = "Case Context"

class CrimeSceneAnalyzeRequest(BaseModel):
    latitude: float = Field(..., description="Crime scene latitude")
    longitude: float = Field(..., description="Crime scene longitude")
    address: Optional[str] = None
    sector: Optional[str] = None
    landmark: Optional[str] = None
    incident_date: Optional[str] = None
    incident_time: Optional[str] = None
    search_radius_meters: Optional[float] = 2000.0

class CoverageGapDTO(BaseModel):
    gap_id: str
    road_name: str
    start_coord: List[float]  # [lng, lat]
    end_coord: List[float]    # [lng, lat]
    distance_meters: float
    explanation: str

class CCTVSequenceItemDTO(BaseModel):
    sequence_order: int
    source_id: str
    source_name: str
    source_type: str  # GOVERNMENT_CCTV, GOVERNMENT_DEPLOYMENT, POTENTIAL_PRIVATE, INVESTIGATOR_VERIFIED
    road_name: str
    distance_from_start_meters: float
    estimated_observation_window: str  # e.g., "21:08 – 21:13"
    why_relevant: str

class RouteHypothesisDTO(BaseModel):
    route_id: str
    route_name: str
    route_type: str  # APPROACH, DEPARTURE, BOTH
    origin_area: str
    destination: str
    direction: str
    distance_km: float
    distance_meters: float
    estimated_travel_time_min: str
    estimated_travel_time_seconds: int
    surveillance_sources_count: int
    government_count: int
    private_count: int
    coverage_score: str  # High, Medium, Low
    coverage_score_num: float
    coverage_gaps_count: int
    coverage_gaps: List[CoverageGapDTO] = []
    why_relevant: str
    relevance_score: float
    is_recommended: bool = False
    route_geometry: Dict[str, Any]  # GeoJSON LineString
    cctv_sequence: List[CCTVSequenceItemDTO] = []

class CCTVSourceDTO(BaseModel):
    id: str
    name: str
    type: str  # GOVERNMENT_CCTV, GOVERNMENT_DEPLOYMENT, POTENTIAL_PRIVATE, INVESTIGATOR_VERIFIED
    category: str  # PETROL_PUMP, BANK, ATM, MALL, HOTEL, HOSPITAL, TRAFFIC_JUNCTION, CORRIDOR, etc.
    status: str    # VERIFIED, GOVERNMENT_DEPLOYMENT_EVIDENCE, POTENTIAL, INVESTIGATOR_VERIFIED, UNKNOWN
    address: Optional[str] = None
    latitude: float
    longitude: float
    distance_meters: float
    phone: Optional[str] = None
    website: Optional[str] = None
    why_relevant: str
    source_provenance: str  # "Chandigarh ICCC", "Municipal Corporation Tender", "Google Places", "Officer Verified"
    tender_reference: Optional[str] = None
    camera_count: Optional[int] = None
    deployment_precision: Optional[str] = None
    is_verified: bool = False
    is_added_to_case: bool = False
    coverage_area_geometry: Optional[Dict[str, Any]] = None  # GeoJSON polygon for sector/corridor deployment

class CCTVIntelligenceSummary(BaseModel):
    total_sources: int = 0
    government_sources: int = 0
    private_sources: int = 0
    verified_sources: int = 0
    possible_routes: int = 0
    approach_routes: int = 0
    departure_routes: int = 0
    coverage_gaps: int = 0
    recommended_route_id: Optional[str] = None
    recommended_starting_point: Optional[str] = None

class CCTVIntelligenceResponse(BaseModel):
    case_id: str
    incident_location: IncidentLocation
    summary: CCTVIntelligenceSummary
    sources: List[CCTVSourceDTO] = []
    routes: List[RouteHypothesisDTO] = []
    deployment_polygons: List[Dict[str, Any]] = []

class VerifySourceRequest(BaseModel):
    new_status: str = Field(..., description="INVESTIGATOR_VERIFIED, CONFIRMED, ABSENT, REJECTED")
    reason: Optional[str] = None
    camera_count_confirmed: Optional[int] = None
    notes: Optional[str] = None

class ManualCCTVSourceRequest(BaseModel):
    name: str
    category: str = "COMMERCIAL"
    owner_type: str = "PRIVATE"  # PRIVATE, COMMERCIAL, RESIDENTIAL, GOVERNMENT
    address: Optional[str] = None
    latitude: float
    longitude: float
    phone: Optional[str] = None
    notes: Optional[str] = None
    cctv_present: bool = True

class AddToCaseRequest(BaseModel):
    item_type: str = "SOURCE"  # SOURCE, ROUTE
    item_id: str
    notes: Optional[str] = None
