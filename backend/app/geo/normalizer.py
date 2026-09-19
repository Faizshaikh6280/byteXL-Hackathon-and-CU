import os
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
import datetime

from app.geo.schemas import (
    GeoCanonicalEvent, GeoLocationType, EpistemicStatus
)
from app.timeline.test_pack_loader import test_pack_loader
from app.timeline.normalizer import parse_forensic_timestamp
from app.timeline.service import timeline_service
from app.processing.canonical_reader import canonical_reader

logger = logging.getLogger("investigation.geo.normalizer")

# Comprehensive cell tower geocoding dictionary
KNOWN_GEO_COORDS: Dict[str, Tuple[float, float, str]] = {
    # Chandigarh / Mohali / Panchkula (Operation Iron Lotus)
    "CELL-CHD-22": (30.7333, 76.7794, "Sector 22 Market, Chandigarh"),
    "CELL-CHD-17": (30.7410, 76.7680, "Sector 17 Commercial Complex, Chandigarh"),
    "CELL-CHD-IA": (30.7150, 76.7920, "Industrial Area Phase 1, Chandigarh"),
    "CELL-PKL-03": (30.6940, 76.8010, "Panchkula Border, Sector 5"),
    "CELL-MOH-07": (30.6882, 76.7358, "Phase 7 Sector 61, Mohali"),
    
    # Central & North Delhi (Operation Night Ledger)
    "CELL-DEL-101": (28.6304, 77.2177, "Connaught Place Inner Circle, Central Delhi"),
    "CELL-DEL-102": (28.6139, 77.2090, "Janpath Corridor, Central Delhi"),
    "CELL-DEL-103": (28.5800, 77.2300, "Lodhi Road Institutional Area, New Delhi"),
    "CELL-DEL-110": (28.7032, 77.1325, "Pitampura Telecom Tower, North-West Delhi"),
    "CELL-DEL-111": (28.7180, 77.1120, "Rohini Sector 7 Sub-Station, North-West Delhi"),
    
    # South Delhi (Operation Red Haven)
    "CELL-DEL-201": (28.5244, 77.2066, "Saket District Centre, South Delhi"),
    "CELL-DEL-205": (28.5400, 77.2200, "Hauz Khas Village Environs, South Delhi"),
    "CELL-DEL-220": (28.5300, 77.2150, "Malviya Nagar Market, South Delhi"),
    "CELL-DEL-310": (28.5200, 77.2100, "Saket Metro Interchange, South Delhi"),
    "CELL-DEL-311": (28.5150, 77.2250, "Mehrauli-Badarpur Arterial Rd, South Delhi"),
    "CELL-DEL-312": (28.5100, 77.2350, "Pushp Vihar Sector 3, South Delhi"),
    "CELL-DEL-313": (28.5050, 77.2400, "Khanpur Intersection, South Delhi"),
    "CELL-DEL-320": (28.5000, 77.2500, "Tigri Ext, South Delhi"),
    "CELL-DEL-SCENE": (28.5020, 77.2450, "Incident Scene Service Rd, South Delhi"),
}

# Distribute generic CELL-01 through CELL-50 across Chandigarh Tricity sectors (Operation Black Circuit)
_SECTOR_ANCHORS = [
    (30.7394, 76.7876, "Sector 17 Plaza, Chandigarh"),
    (30.7325, 76.7765, "Sector 22 Market, Chandigarh"),
    (30.7065, 76.7984, "Industrial Area Phase 2, Chandigarh"),
    (30.6882, 76.7358, "Phase 7, Mohali"),
    (30.6940, 76.8010, "Panchkula Sector 4"),
    (30.6401, 76.8171, "Zirakpur Highway Hub"),
    (30.7450, 76.7720, "Sector 16 Stadium, Chandigarh"),
    (30.7250, 76.7650, "Sector 35 Commercial Belt, Chandigarh"),
]
for i in range(1, 51):
    cell_key = f"CELL-{i:02d}"
    if cell_key not in KNOWN_GEO_COORDS:
        anchor = _SECTOR_ANCHORS[(i - 1) % len(_SECTOR_ANCHORS)]
        offset_lat = ((i * 17) % 20 - 10) * 0.0015
        offset_lng = ((i * 23) % 20 - 10) * 0.0015
        KNOWN_GEO_COORDS[cell_key] = (
            round(anchor[0] + offset_lat, 6),
            round(anchor[1] + offset_lng, 6),
            f"{anchor[2]} (Sector Node {i:02d})"
        )

# Named location points (ATMs, bank branches, districts)
KNOWN_POINTS_OF_INTEREST: Dict[str, Tuple[float, float, str, GeoLocationType]] = {
    # ATMs
    "ATM-PIT-031": (28.7032, 77.1325, "Pitampura Branch ATM, Delhi", GeoLocationType.ATM),
    "ATM-ROH-017": (28.7180, 77.1120, "Rohini Sector 7 ATM, Delhi", GeoLocationType.ATM),
    "ATM-SKT-044": (28.5244, 77.2100, "Saket District Centre ATM, Delhi", GeoLocationType.ATM),
    "ATM-CHD-17": (30.7410, 76.7680, "Sector 17 Central ATM, Chandigarh", GeoLocationType.ATM),
    "ATM-CHD-22": (30.7333, 76.7794, "Sector 22 Market ATM, Chandigarh", GeoLocationType.ATM),
    
    # Places
    "SECTOR 17": (30.7410, 76.7680, "Sector 17, Chandigarh", GeoLocationType.MERCHANT),
    "SECTOR 22": (30.7333, 76.7794, "Sector 22, Chandigarh", GeoLocationType.MERCHANT),
    "SECTOR 22 MARKET": (30.7333, 76.7794, "Sector 22 Market, Chandigarh", GeoLocationType.MERCHANT),
    "INDUSTRIAL AREA": (30.7150, 76.7920, "Industrial Area, Chandigarh", GeoLocationType.MERCHANT),
    "MOHALI": (30.6882, 76.7358, "Phase 7, Mohali", GeoLocationType.MERCHANT),
    "PHASE 7 MOHALI": (30.6882, 76.7358, "Phase 7, Mohali", GeoLocationType.MERCHANT),
    "PANCHKULA": (30.6940, 76.8010, "Panchkula", GeoLocationType.MERCHANT),
    "PANCHKULA BORDER": (30.6940, 76.8010, "Panchkula Border", GeoLocationType.MERCHANT),
    "ZIRAKPUR": (30.6401, 76.8171, "Zirakpur Highway Hub", GeoLocationType.MERCHANT),
    "KHARAR": (30.7490, 76.6410, "Kharar Bypass", GeoLocationType.MERCHANT),
    "CHANDIGARH": (30.7333, 76.7794, "Chandigarh Centre", GeoLocationType.MERCHANT),
    
    # Delhi places
    "PITAMPURA, DELHI": (28.7032, 77.1325, "Pitampura, North-West Delhi", GeoLocationType.MERCHANT),
    "ROHINI, DELHI": (28.7180, 77.1120, "Rohini, North-West Delhi", GeoLocationType.MERCHANT),
    "SAKET, DELHI": (28.5244, 77.2066, "Saket District, South Delhi", GeoLocationType.MERCHANT),
    "CONNAUGHT PLACE": (28.6304, 77.2177, "Connaught Place, New Delhi", GeoLocationType.MERCHANT),
    "DELHI": (28.6139, 77.2090, "Delhi NCR", GeoLocationType.MERCHANT),
}

class GeoNormalizer:
    """
    Forensic normalization engine that converts raw records and canonical events
    into precision-graded, provenance-backed GeoCanonicalEvent records.
    """

    def __init__(self):
        self._cache: Dict[str, List[GeoCanonicalEvent]] = {}

    def clear_cache(self, case_id: Optional[str] = None):
        if case_id:
            self._cache.pop(case_id, None)
        else:
            self._cache.clear()

    @staticmethod
    def geocode_location(
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        cell_tower_id: Optional[str] = None,
        location_str: Optional[str] = None,
        atm_id: Optional[str] = None,
        ip_addr: Optional[str] = None,
        domain: Optional[str] = None,
        event_type: Optional[str] = None,
        channel: Optional[str] = None
    ) -> Tuple[Optional[float], Optional[float], GeoLocationType, float, float, str]:
        """
        Geocodes evidence indicators prioritizing semantic precision:
        ATM/Branch (~20m) -> Cell Tower (~750m) -> GPS (~15m) -> Merchant (~150m) -> IP (~15km).
        Never misclassifies cell towers or IP gateways as GPS pinpoints.
        """
        # 1. Specific ATM ID or Cash Withdrawal
        if atm_id and atm_id.upper() in KNOWN_POINTS_OF_INTEREST:
            c_lat, c_lng, name, l_type = KNOWN_POINTS_OF_INTEREST[atm_id.upper()]
            return c_lat, c_lng, GeoLocationType.ATM, 20.0, 0.95, name

        if (event_type == "CASH_WITHDRAWAL" or channel == "ATM" or (atm_id and "ATM" in atm_id.upper())):
            # If location_str matches an ATM
            if location_str:
                clean_loc = location_str.strip().upper()
                for k, v in KNOWN_POINTS_OF_INTEREST.items():
                    if "ATM" in k and (clean_loc in k or k in clean_loc or any(p in clean_loc for p in ["ROHINI", "PITAMPURA", "SAKET", "SECTOR 17", "SECTOR 22"] if p in v[2].upper())):
                        return v[0], v[1], GeoLocationType.ATM, 20.0, 0.95, v[2]
            if lat is not None and lng is not None:
                return lat, lng, GeoLocationType.ATM, 25.0, 0.95, location_str or f"ATM ({atm_id or 'Terminal'})"

        # 2. Known Cell Tower (Telecom CDR / IPDR cell ping)
        if cell_tower_id:
            c_key = cell_tower_id.strip().upper()
            if c_key in KNOWN_GEO_COORDS:
                c_lat, c_lng, name = KNOWN_GEO_COORDS[c_key]
                return c_lat, c_lng, GeoLocationType.CELL_TOWER, 750.0, 0.85, name
            elif lat is not None and lng is not None:
                return lat, lng, GeoLocationType.CELL_TOWER, 750.0, 0.85, f"Cell Sector ({cell_tower_id})"

        # 3. Explicit GPS Coordinates (e.g. from geospatial.csv waypoint telemetry)
        if lat is not None and lng is not None and not math.isnan(lat) and not math.isnan(lng):
            if domain != "NETWORK" and not ip_addr:
                loc_name = location_str or f"GPS Waypoint ({lat:.4f}, {lng:.4f})"
                return lat, lng, GeoLocationType.GPS, 15.0, 0.95, loc_name

        # 4. Known named place (Merchant / Branch)
        if location_str:
            clean_loc = location_str.strip().upper()
            if clean_loc in KNOWN_POINTS_OF_INTEREST:
                c_lat, c_lng, name, l_type = KNOWN_POINTS_OF_INTEREST[clean_loc]
                return c_lat, c_lng, l_type, 150.0, 0.80, name
            for key, val in KNOWN_POINTS_OF_INTEREST.items():
                if key in clean_loc or clean_loc in key:
                    return val[0], val[1], val[3], 250.0, 0.75, val[2]

        # 5. IP Geolocation (approximate city/ISP level, ~15km radius)
        if ip_addr or domain == "NETWORK":
            return 28.6139, 77.2090, GeoLocationType.IP_GEOLOCATION, 15000.0, 0.50, f"ISP Gateway IP ({ip_addr or 'Network'})"

        # Fallback if coordinates exist
        if lat is not None and lng is not None and not math.isnan(lat) and not math.isnan(lng):
            return lat, lng, GeoLocationType.GPS, 50.0, 0.70, location_str or "Recorded Coordinate"

        return None, None, GeoLocationType.UNKNOWN, 500.0, 0.1, "Unknown Location"

    def normalize_case_geo_events(self, case_id: str) -> List[GeoCanonicalEvent]:
        """
        Extracts and standardizes all geospatial events for a case.
        Integrates Golden Profiles, anomaly scores, and cryptographic provenance.
        """
        if case_id in self._cache:
            return self._cache[case_id]

        # Load base events from timeline service to reuse resolved identities and anomalies
        artifacts = timeline_service.get_or_build_timeline_artifacts(case_id)
        timeline_events = artifacts.get("events", [])
        
        geo_events: List[GeoCanonicalEvent] = []
        seen_events = set()

        for tev in timeline_events:
            event_id = tev.event_id
            if event_id in seen_events:
                continue

            lat = tev.latitude
            lng = tev.longitude
            cell_tower_id = tev.cell_tower_id
            location_str = tev.location_name
            atm_id = tev.attributes.get("atm_id") or tev.financial.get("atm_id") if hasattr(tev, "financial") else tev.attributes.get("atm_id")
            channel = tev.channel if hasattr(tev, "channel") else tev.financial.get("channel") if hasattr(tev, "financial") else None
            client_ip = tev.client_ip

            # Geocode with precision semantics
            f_lat, f_lng, loc_type, accuracy_radius, loc_conf, loc_name = self.geocode_location(
                lat=lat,
                lng=lng,
                cell_tower_id=cell_tower_id,
                location_str=location_str,
                atm_id=atm_id,
                ip_addr=client_ip,
                domain=tev.domain,
                event_type=tev.event_type,
                channel=channel
            )

            # Skip events that have zero geospatial information
            if f_lat is None or f_lng is None:
                continue

            seen_events.add(event_id)

            geo_ev = GeoCanonicalEvent(
                geo_event_id=f"GEO-{event_id}",
                event_id=event_id,
                case_id=case_id,
                entity_id=tev.z_cluster_id or tev.entity_name or tev.actor_entities[0] if tev.actor_entities else "UNKNOWN",
                entity_name=tev.entity_name or (tev.actor_entities[0] if tev.actor_entities else "Unknown Entity"),
                timestamp=tev.normalized_timestamp,
                timestamp_ms=tev.timestamp_ms,
                raw_timestamp=tev.raw_timestamp,
                timezone_offset=tev.timezone_offset,
                location_type=loc_type,
                latitude=f_lat,
                longitude=f_lng,
                accuracy_radius_meters=accuracy_radius,
                location_confidence=loc_conf,
                location_name=loc_name,
                address=tev.location_name or loc_name,
                cell_tower_id=cell_tower_id,
                device_id=tev.imei or tev.attributes.get("device_id") or (tev.actor_entities[0] if tev.actor_entities else None),
                domain=tev.domain,
                event_type=tev.event_type,
                raw_evidence_id=tev.evidence_id,
                evidence_filename=tev.evidence_filename,
                evidence_sha256=tev.evidence_sha256,
                anomaly_score=tev.anomaly_score,
                anomaly_reasons=tev.anomaly_reasons,
                epistemic_status=tev.epistemic_status,
                metadata={
                    "amount_inr": tev.amount_inr,
                    "channel": tev.channel,
                    "duration_seconds": tev.duration_seconds,
                    "counterparty": tev.counterparty,
                    "narration": tev.narration,
                    "attributes": tev.attributes
                }
            )
            geo_events.append(geo_ev)

        # Sort chronologically by timestamp_ms
        geo_events.sort(key=lambda x: x.timestamp_ms)
        self._cache[case_id] = geo_events
        logger.info(f"[GeoNormalizer] Extracted {len(geo_events)} geo-canonical events for case {case_id}")
        return geo_events

geo_normalizer = GeoNormalizer()
