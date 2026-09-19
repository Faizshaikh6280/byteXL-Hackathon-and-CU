from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class NormalizedIdentity(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    national_id: Optional[str] = None
    email: Optional[str] = None
    social_handle: Optional[str] = None
    social_platform: Optional[str] = None

class Telemetry(BaseModel):
    imei: Optional[str] = None
    cell_tower_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    assigned_ip: Optional[str] = None
    destination_ip: Optional[str] = None

class Financial(BaseModel):
    account_number: Optional[str] = None
    amount_inr: Optional[float] = None
    txn_type: Optional[str] = None
    counterparty: Optional[str] = None

class NormalizedEvent(BaseModel):
    source_file: str
    domain: str # TELECOM, BANKING, SOCIAL, KYC
    event_type: str
    timestamp: str # ISO-8601 UTC string
    normalized_identity: NormalizedIdentity
    telemetry: Telemetry
    financial: Financial
    z_cluster_id: Optional[str] = None

class GoldenProfile(BaseModel):
    z_cluster_id: str
    primary_name: str
    known_aliases: List[str] = []
    known_phones: List[str] = []
    known_accounts: List[str] = []
    associated_emails: List[str] = []
    risk_score: float = 0.0
    last_updated: str
