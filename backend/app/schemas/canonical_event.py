from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid
import datetime

class CanonicalEntities(BaseModel):
    """Normalized real-world identifiers."""
    name: Optional[str] = None
    phone: Optional[str] = None            # E.164 international standard (+91...)
    national_id: Optional[str] = None      # Govt ID (Aadhar, PAN, SSN)
    email: Optional[str] = None
    social_handle: Optional[str] = None    # Platform username (@vicky_shooter_007)
    social_platform: Optional[str] = None  # Telegram, WhatsApp, Instagram
    counterparty_name: Optional[str] = None

class CanonicalTelemetry(BaseModel):
    """Geospatial, cellular, and network telemetry."""
    imei: Optional[str] = None             # 15-digit handset identifier
    imsi: Optional[str] = None             # 15-digit SIM identifier
    cell_tower_id: Optional[str] = None    # Tower/sector code
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None          # Tower street address
    assigned_ip: Optional[str] = None      # Leased client IP
    destination_ip: Optional[str] = None   # Target server IP
    source_port: Optional[int] = None      # Source NAT port (Critical for IPDR resolution)
    service_port: Optional[int] = None     # Destination TCP/UDP port
    duration_seconds: Optional[int] = None # Call or session duration
    bytes_transferred: Optional[int] = None

class CanonicalFinancial(BaseModel):
    """Monetary transaction and banking attributes."""
    account_number: Optional[str] = None
    ifsc: Optional[str] = None             # Bank IFSC routing code
    amount_inr: Optional[float] = 0.0
    txn_type: Optional[str] = None         # DEBIT, CREDIT, TRANSFER, ATM
    channel: Optional[str] = None          # UPI, RTGS, IMPS, POS, ATM
    counterparty: Optional[str] = None     # Counterparty account number or UPI VPA
    narration: Optional[str] = None

class EventProvenance(BaseModel):
    """End-to-end lineage tracing an event back to raw evidence and byte hash."""
    case_id: str
    evidence_id: str
    source_file: str
    row_index: int
    evidence_sha256: str
    parser_version: str = "v1.0.0"
    processed_at: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

class CanonicalEvent(BaseModel):
    """
    Unified canonical event representation across all investigative domains.
    Preserves specialized telemetry while enabling unified timeline, graph, and ML processing.
    """
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str
    evidence_id: str
    event_type: str                        # CALL, TRANSACTION, IP_SESSION, SOCIAL_ACTIVITY, IDENTITY_RECORD, LOCATION_EVENT
    source_type: str                       # TELECOM, BANKING, NETWORK, SOCIAL, KYC
    timestamp: str                         # Strict ISO-8601 UTC (e.g. 2026-03-02T09:15:22Z)
    
    entities: CanonicalEntities = Field(default_factory=CanonicalEntities)
    telemetry: CanonicalTelemetry = Field(default_factory=CanonicalTelemetry)
    financial: CanonicalFinancial = Field(default_factory=CanonicalFinancial)
    
    # Preserves unmapped raw source fields so no data is destroyed
    attributes: Dict[str, Any] = Field(default_factory=dict)
    provenance: EventProvenance
    
    # Resolved identity cluster linkage (backfilled by Entity Resolution)
    z_cluster_id: Optional[str] = None
