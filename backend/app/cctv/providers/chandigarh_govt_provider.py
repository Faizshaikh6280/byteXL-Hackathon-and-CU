import json
from typing import List, Dict, Any, Optional
from app.cctv.providers.base import BaseGovernmentCCTVProvider
from app.cctv.providers.chandigarh_geocoder import haversine_distance_meters

# Documented Chandigarh Government ICCC & Municipal Corporation Tender Deployments
CHANDIGARH_GOVERNMENT_DEPLOYMENTS: List[Dict[str, Any]] = [
    # ── Ward 23 (Sector 34, Sector 35, Sector 43) ──────────────────────
    {
        "id": "GOVT-CHD-W23-SEC34",
        "source_id": "MCC-CCTV-2024-W23",
        "project_name": "Municipal Corporation Chandigarh CCTV Surveillance Project - Ward 23",
        "tender_id": "TND-MCC-ENG-2023-891",
        "tender_reference": "MCC/EE(E)/2023/W23-CCTV/34",
        "department": "Municipal Corporation Chandigarh (Electrical Division)",
        "publication_date": "2023-11-14T00:00:00Z",
        "area": "Sector 34 Sub-City Centre & Commercial Belt",
        "sector": "Sector 34",
        "ward": "Ward 23",
        "facility_name": "Sub-City Centre & Market Quadrant",
        "camera_count": 32,
        "camera_type": "High-Definition Fixed & PTZ",
        "deployment_precision": "SECTOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/mcc-w23-cctv",
        "evidence_text": "Supply, installation, testing and commissioning of IP-based CCTV surveillance cameras in public parking areas, inner market squares, and sub-city arterial connectors of Sector 34 under Ward 23 development works.",
        "latitude": 30.7225,
        "longitude": 76.7682,
        "confidence": 0.95,
        "verified": True
    },
    {
        "id": "GOVT-CHD-W23-SEC35",
        "source_id": "MCC-CCTV-2024-W23-35",
        "project_name": "Ward 23 CCTV Infrastructure Scheme - Sector 35 Commercial Corridor",
        "tender_id": "TND-MCC-ENG-2023-892",
        "tender_reference": "MCC/EE(E)/2023/W23-CCTV/35",
        "department": "Municipal Corporation Chandigarh (Electrical Division)",
        "publication_date": "2023-11-18T00:00:00Z",
        "area": "Sector 35 Hotel Corridor & Inner Market",
        "sector": "Sector 35",
        "ward": "Ward 23",
        "facility_name": "Sector 35 Commercial Hub & Himalaya Marg Intersection",
        "camera_count": 28,
        "camera_type": "Fixed Dome & Night-Vision Bullet",
        "deployment_precision": "SECTOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/mcc-w23-35-cctv",
        "evidence_text": "Installation of high-resolution CCTV surveillance network along Sector 35-B and 35-C commercial squares, pedestrian walkways, and Dakshin Marg service roads under Ward 23 councillor fund.",
        "latitude": 30.7270,
        "longitude": 76.7600,
        "confidence": 0.95,
        "verified": True
    },
    {
        "id": "GOVT-CHD-W23-SEC43",
        "source_id": "MCC-CCTV-2024-W23-43",
        "project_name": "Sector 43 Institutional & Judicial Complex Surveillance Program",
        "tender_id": "TND-MCC-ENG-2024-102",
        "tender_reference": "MCC/EE(E)/2024/W23-CCTV/43",
        "department": "Chandigarh Smart City Mission & Municipal Corporation",
        "publication_date": "2024-01-20T00:00:00Z",
        "area": "Sector 43 District Courts & Surrounding Avenues",
        "sector": "Sector 43",
        "ward": "Ward 23",
        "facility_name": "District Courts Complex & ISBT Corridor Connector",
        "camera_count": 45,
        "camera_type": "PTZ 360 & Fixed Bullet",
        "deployment_precision": "FACILITY",
        "source_document_url": "https://chandigarh.gov.in/tenders/mcc-w23-43-courts",
        "evidence_text": "Integrated CCTV surveillance installation surrounding District Courts Sector 43, connecting corridors toward ISBT 43, and entry-exit perimeters.",
        "latitude": 30.7180,
        "longitude": 76.7520,
        "confidence": 0.95,
        "verified": True
    },

    # ── Manimajra (Ward 5) ─────────────────────────────────────────────
    {
        "id": "GOVT-CHD-MMJ-ROPAR-RD",
        "source_id": "MCC-MMJ-2023-ROPAR",
        "project_name": "Old Ropar Road Security Corridor CCTV Deployment",
        "tender_id": "TND-MCC-MMJ-2023-415",
        "tender_reference": "MCC/MMJ/2023/CCTV-ORR",
        "department": "Municipal Corporation Chandigarh (Sub-Division Manimajra)",
        "publication_date": "2023-08-10T00:00:00Z",
        "area": "Manimajra Town",
        "sector": "Manimajra",
        "ward": "Ward 5",
        "road_name": "Old Ropar Road",
        "corridor_start": "Fun Republic Junction",
        "corridor_end": "Police Station Chowk Manimajra",
        "facility_name": "Old Ropar Road Arterial Corridor",
        "camera_count": 24,
        "camera_type": "Fixed High-Resolution Outdoor",
        "deployment_precision": "CORRIDOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/mmj-ropar-road-cctv",
        "evidence_text": "Procurement and implementation of 24 CCTV cameras along Old Ropar Road from Fun Republic intersection up to Police Station Chowk and Main Bazaar, Manimajra Ward 5.",
        "latitude": 30.7250,
        "longitude": 76.8430,
        "confidence": 0.95,
        "verified": True
    },
    {
        "id": "GOVT-CHD-MMJ-MAIN-BAZAAR",
        "source_id": "MCC-MMJ-2023-BAZAAR",
        "project_name": "Manimajra Main Bazaar & Historical Gate CCTV Grid",
        "tender_id": "TND-MCC-MMJ-2023-418",
        "tender_reference": "MCC/MMJ/2023/CCTV-BAZAAR",
        "department": "Municipal Corporation Chandigarh",
        "publication_date": "2023-09-05T00:00:00Z",
        "area": "Main Bazaar Manimajra",
        "sector": "Manimajra",
        "ward": "Ward 5",
        "facility_name": "Main Bazaar Commercial & Residential Market",
        "camera_count": 18,
        "camera_type": "Dome & Bullet",
        "deployment_precision": "AREA",
        "source_document_url": "https://chandigarh.gov.in/tenders/mmj-bazaar-cctv",
        "evidence_text": "CCTV installation covering crowded choke-points, pedestrian alleys, and secondary vehicular egress points of Main Bazaar Manimajra.",
        "latitude": 30.7230,
        "longitude": 76.8470,
        "confidence": 0.92,
        "verified": True
    },

    # ── Hallomajra (Ward 19) ───────────────────────────────────────────
    {
        "id": "GOVT-CHD-HALLO-MAJRA",
        "source_id": "MCC-HALLO-2023-TND",
        "project_name": "Hallo Majra Village & Airport Road Ingress Surveillance Project",
        "tender_id": "TND-MCC-ENG-2023-612",
        "tender_reference": "MCC/EE(E)/2023/HM-CCTV",
        "department": "Municipal Corporation Chandigarh",
        "publication_date": "2023-10-12T00:00:00Z",
        "area": "Hallomajra Village & Hallo Majra Chowk",
        "sector": "Hallomajra",
        "ward": "Ward 19",
        "road_name": "Airport Approach Road & Purv Marg Extension",
        "facility_name": "Hallo Majra Chowk & Transit Junction",
        "camera_count": 22,
        "camera_type": "Outdoor PTZ & Fixed Bullet",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarh.gov.in/tenders/hallomajra-cctv",
        "evidence_text": "Installation of comprehensive CCTV surveillance at Hallo Majra Chowk, entrance road to village abadi, and light point intersection on Airport Road corridor.",
        "latitude": 30.6900,
        "longitude": 76.8120,
        "confidence": 0.94,
        "verified": True
    },

    # ── Sector 30 (Ward 18) ────────────────────────────────────────────
    {
        "id": "GOVT-CHD-SEC30-W18",
        "source_id": "MCC-SEC30-2024-W18",
        "project_name": "Sector 30 Community Safety & Residential CCTV Grid",
        "tender_id": "TND-MCC-ENG-2024-044",
        "tender_reference": "MCC/EE(E)/2024/W18-SEC30",
        "department": "Municipal Corporation Chandigarh (Ward 18)",
        "publication_date": "2024-02-15T00:00:00Z",
        "area": "Sector 30 Residential & Police Complex",
        "sector": "Sector 30",
        "ward": "Ward 18",
        "facility_name": "Sector 30 Market & Police Lines Periphery",
        "camera_count": 16,
        "camera_type": "Fixed HD",
        "deployment_precision": "SECTOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/sec30-w18-cctv",
        "evidence_text": "CCTV installation covering community park perimeters, Sector 30 local market, and internal 4-way crossings under Ward 18 welfare fund.",
        "latitude": 30.7100,
        "longitude": 76.7900,
        "confidence": 0.91,
        "verified": True
    },

    # ── Sector 46A & 46C (Ward 34) ─────────────────────────────────────
    {
        "id": "GOVT-CHD-SEC46-W34",
        "source_id": "MCC-SEC46-2023-W34",
        "project_name": "Sector 46A and 46C Municipal CCTV Surveillance Scheme",
        "tender_id": "TND-MCC-ENG-2023-774",
        "tender_reference": "MCC/EE(E)/2023/W34-SEC46",
        "department": "Municipal Corporation Chandigarh (Ward 34)",
        "publication_date": "2023-12-01T00:00:00Z",
        "area": "Sector 46A & Sector 46C",
        "sector": "Sector 46",
        "ward": "Ward 34",
        "facility_name": "Post Graduate Govt College Sector 46 Periphery & Markets",
        "camera_count": 26,
        "camera_type": "Bullet & Fixed Dome",
        "deployment_precision": "SECTOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/sec46-w34-cctv",
        "evidence_text": "Installation of 26 CCTV surveillance units at Sector 46A market, 46C parks, and vehicular egress points leading to Vikas Marg and Sarovar Path.",
        "latitude": 30.6950,
        "longitude": 76.7760,
        "confidence": 0.93,
        "verified": True
    },

    # ── Sector 48 (Ward 35) ────────────────────────────────────────────
    {
        "id": "GOVT-CHD-SEC48-W35",
        "source_id": "MCC-SEC48-2024-W35",
        "project_name": "Sector 48 Motor Market & Residential Societies CCTV Grid",
        "tender_id": "TND-MCC-ENG-2024-118",
        "tender_reference": "MCC/EE(E)/2024/W35-SEC48",
        "department": "Municipal Corporation Chandigarh (Ward 35)",
        "publication_date": "2024-03-02T00:00:00Z",
        "area": "Sector 48 Societies & Motor Market",
        "sector": "Sector 48",
        "ward": "Ward 35",
        "facility_name": "Sector 48 Commercial Market & Society Gates",
        "camera_count": 20,
        "camera_type": "Fixed Bullet IR",
        "deployment_precision": "SECTOR",
        "source_document_url": "https://chandigarh.gov.in/tenders/sec48-w35-cctv",
        "evidence_text": "Deployment of CCTV surveillance covering Sector 48 motor market entrance, group housing societies approach road, and Vikas Marg perimeter.",
        "latitude": 30.6800,
        "longitude": 76.7700,
        "confidence": 0.92,
        "verified": True
    },

    # ── Sector 61 (Ward 31) ────────────────────────────────────────────
    {
        "id": "GOVT-CHD-SEC61-W31",
        "source_id": "MCC-SEC61-2023-W31",
        "project_name": "Sector 61 Central Parks & MIG Flats Surveillance Project",
        "tender_id": "TND-MCC-ENG-2023-680",
        "tender_reference": "MCC/EE(E)/2023/W31-SEC61",
        "department": "Municipal Corporation Chandigarh (Ward 31)",
        "publication_date": "2023-10-28T00:00:00Z",
        "area": "Sector 61 MIG Flats & Central Parks",
        "sector": "Sector 61",
        "ward": "Ward 31",
        "facility_name": "MIG Flats Central Parks & Boundary Road",
        "camera_count": 18,
        "camera_type": "Fixed Night-Vision Bullet",
        "deployment_precision": "AREA",
        "source_document_url": "https://chandigarh.gov.in/tenders/sec61-w31-cctv",
        "evidence_text": "Provision of CCTV surveillance cameras around Central Parks, MIG Flats internal roads, and Mohali border boundary street in Sector 61 under Ward 31.",
        "latitude": 30.7150,
        "longitude": 76.7280,
        "confidence": 0.91,
        "verified": True
    },

    # ── Chandigarh Transport Undertaking (CTU ISBTs & Depots) ─────────
    {
        "id": "GOVT-CHD-CTU-ISBT17",
        "source_id": "CTU-SURV-2023-ISBT17",
        "project_name": "Chandigarh Transport Undertaking ISBT-17 Modernization & Surveillance",
        "tender_id": "TND-CTU-SEC17-2023-08",
        "tender_reference": "CTU/SPO/2023/CCTV-ISBT17",
        "department": "Chandigarh Transport Undertaking (CTU)",
        "publication_date": "2023-06-15T00:00:00Z",
        "area": "Sector 17 Inter-State Bus Terminus",
        "sector": "Sector 17",
        "ward": "Ward 2",
        "facility_name": "ISBT Sector 17 Passenger Terminal & Bus Bays",
        "camera_count": 48,
        "camera_type": "IP Dome, PTZ & Bullet",
        "deployment_precision": "FACILITY",
        "source_document_url": "https://chdctu.gov.in/tenders/ctu-isbt17-cctv",
        "evidence_text": "Comprehensive high-definition CCTV security deployment covering ticketing counters, bus platform bays, entry gates on Udyog Path, and parking compounds at ISBT 17.",
        "latitude": 30.7400,
        "longitude": 76.7830,
        "confidence": 0.98,
        "verified": True
    },
    {
        "id": "GOVT-CHD-CTU-ISBT43",
        "source_id": "CTU-SURV-2023-ISBT43",
        "project_name": "Chandigarh Transport Undertaking ISBT-43 Terminal Surveillance",
        "tender_id": "TND-CTU-SEC43-2023-11",
        "tender_reference": "CTU/SPO/2023/CCTV-ISBT43",
        "department": "Chandigarh Transport Undertaking (CTU)",
        "publication_date": "2023-07-22T00:00:00Z",
        "area": "Sector 43 Inter-State Bus Terminus",
        "sector": "Sector 43",
        "ward": "Ward 23",
        "facility_name": "ISBT Sector 43 Inter-State Terminal",
        "camera_count": 64,
        "camera_type": "PTZ, 360-degree Panoramic, IP Bullet",
        "deployment_precision": "FACILITY",
        "source_document_url": "https://chdctu.gov.in/tenders/ctu-isbt43-cctv",
        "evidence_text": "Procurement and operationalization of 64 CCTV cameras covering 3 floors of ISBT 43 terminal, auto-rickshaw drop-off lanes, inter-state bus platforms, and Himalaya Marg entrance.",
        "latitude": 30.7180,
        "longitude": 76.7520,
        "confidence": 0.98,
        "verified": True
    },
    {
        "id": "GOVT-CHD-CTU-DEPOT1",
        "source_id": "CTU-SURV-DEPOT1",
        "project_name": "CTU Depot-1 Industrial Area Phase-1 Surveillance Grid",
        "tender_id": "TND-CTU-DEPOT-2023-03",
        "tender_reference": "CTU/WS/2023/DEPOT1-CCTV",
        "department": "Chandigarh Transport Undertaking (CTU)",
        "publication_date": "2023-08-30T00:00:00Z",
        "area": "Industrial Area Phase 1",
        "sector": "Industrial Area Phase 1",
        "facility_name": "CTU Central Workshop & Depot 1",
        "camera_count": 22,
        "camera_type": "Fixed Infrared Bullet",
        "deployment_precision": "FACILITY",
        "source_document_url": "https://chdctu.gov.in/tenders/ctu-depot1",
        "evidence_text": "Perimeter and vehicular entry/exit monitoring CCTV network for CTU Depot 1 in Industrial Area Phase 1.",
        "latitude": 30.7080,
        "longitude": 76.8040,
        "confidence": 0.95,
        "verified": True
    },

    # ── Chandigarh ICCC Major Roundabouts & Surveillance Chowks ────────
    {
        "id": "GOVT-CHD-ICCC-TRIBUNE",
        "source_id": "CHD-ICCC-TRIBUNE-01",
        "project_name": "Chandigarh Smart City ICCC - 87 Major Junctions Network",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/JUNCTION-087/TRIBUNE",
        "department": "Chandigarh Smart City Limited (ICCC / Traffic Police)",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Tribune Chowk",
        "sector": "Sector 29/31/Industrial Area",
        "facility_name": "Tribune Chowk Major Rotary & Overpass",
        "camera_count": 14,
        "camera_type": "PTZ, 360-Degree Panoramic & Red-Light Violation Cameras",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "Authoritative Chandigarh ICCC surveillance junction with multi-directional coverage of Purv Marg, Dakshin Marg, and Zirakpur highway approaches.",
        "latitude": 30.7020,
        "longitude": 76.7920,
        "confidence": 1.0,
        "verified": True
    },
    {
        "id": "GOVT-CHD-ICCC-KISAN",
        "source_id": "CHD-ICCC-KISAN-02",
        "project_name": "Chandigarh Smart City ICCC - Junction Surveillance",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/JUNCTION-042/KISAN",
        "department": "Chandigarh Smart City Limited (ICCC / Traffic Police)",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Kisan Bhawan Chowk",
        "sector": "Sector 35/36/42/43",
        "facility_name": "Kisan Bhawan Chowk Intersection",
        "camera_count": 10,
        "camera_type": "Fixed High-Speed & PTZ",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "Authoritative Chandigarh ICCC intersection surveillance at crossing of Dakshin Marg and Jan Marg connecting Sector 35, 36, 42, and 43.",
        "latitude": 30.7250,
        "longitude": 76.7690,
        "confidence": 1.0,
        "verified": True
    },
    {
        "id": "GOVT-CHD-ICCC-PICCADILY",
        "source_id": "CHD-ICCC-PICCADILY-03",
        "project_name": "Chandigarh Smart City ICCC - Arterial Rotary Surveillance",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/JUNCTION-028/PICCADILY",
        "department": "Chandigarh Smart City Limited (ICCC / Traffic Police)",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Piccadily Chowk",
        "sector": "Sector 22/23/35/36",
        "facility_name": "Piccadily Chowk Rotary",
        "camera_count": 12,
        "camera_type": "PTZ & High-Resolution Fixed",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "Roundabout surveillance connecting Himalaya Marg and Sub-City arterial road between Sector 22, 23, 35, and 36.",
        "latitude": 30.7290,
        "longitude": 76.7620,
        "confidence": 1.0,
        "verified": True
    },
    {
        "id": "GOVT-CHD-ICCC-TRANSPORT",
        "source_id": "CHD-ICCC-TRANSPORT-04",
        "project_name": "Chandigarh Smart City ICCC - Eastern Corridor Surveillance",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/JUNCTION-019/TRANSPORT",
        "department": "Chandigarh Smart City Limited (ICCC / Traffic Police)",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Transport Chowk",
        "sector": "Sector 26/Industrial Area Phase 1",
        "facility_name": "Transport Chowk Major Rotary",
        "camera_count": 12,
        "camera_type": "PTZ & Surveillance Bullet",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "Purv Marg arterial intersection monitoring heavy transport, Grain Market traffic, and entrance to Industrial Area Phase 1.",
        "latitude": 30.7190,
        "longitude": 76.8150,
        "confidence": 1.0,
        "verified": True
    },
    {
        "id": "GOVT-CHD-ICCC-MATKA",
        "source_id": "CHD-ICCC-MATKA-05",
        "project_name": "Chandigarh Smart City ICCC - Madhya Marg Corridor",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/JUNCTION-011/MATKA",
        "department": "Chandigarh Smart City Limited (ICCC / Traffic Police)",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Matka Chowk",
        "sector": "Sector 9/10/16/17",
        "facility_name": "Matka Chowk Madhya Marg Rotary",
        "camera_count": 14,
        "camera_type": "PTZ 360 & Fixed Panoramic",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "High-security intersection monitoring Madhya Marg crossing Jan Marg towards Capitol Complex and Sector 17 City Centre.",
        "latitude": 30.7440,
        "longitude": 76.7810,
        "confidence": 1.0,
        "verified": True
    },
    {
        "id": "GOVT-CHD-ICCC-HOUSING-BOARD",
        "source_id": "CHD-ICCC-HOUSING-06",
        "project_name": "Chandigarh Smart City ICCC - Border Entry / Exit Surveillance",
        "tender_id": "CSCL/ITMS/2021/01",
        "tender_reference": "CSCL/ICCC/BORDER-003/HB-CHOWK",
        "department": "Chandigarh Police & Smart City Limited",
        "publication_date": "2022-03-15T00:00:00Z",
        "area": "Housing Board Chowk (Panchkula Border)",
        "sector": "Manimajra / Panchkula Border",
        "facility_name": "Housing Board Chowk Inter-State Gateway",
        "camera_count": 16,
        "camera_type": "ANPR Corridor & PTZ 360",
        "deployment_precision": "JUNCTION",
        "source_document_url": "https://chandigarhsmartcity.in/iccc-junctions",
        "evidence_text": "Critical inter-state gateway surveillance linking Chandigarh (Madhya Marg / Manimajra) directly with Panchkula Haryana.",
        "latitude": 30.7150,
        "longitude": 76.8500,
        "confidence": 1.0,
        "verified": True
    }
]

class ChandigarhGovernmentCCTVProvider(BaseGovernmentCCTVProvider):
    """
    Authoritative provider for Chandigarh ICCC surveillance cameras and Municipal Corporation
    CCTV tender deployment evidence.
    """

    def get_deployment_evidence(
        self,
        sector: Optional[str],
        latitude: float,
        longitude: float,
        radius_meters: float = 3000.0
    ) -> List[Dict[str, Any]]:
        results = []
        normalized_sec = sector.strip().lower() if sector else ""

        for item in CHANDIGARH_GOVERNMENT_DEPLOYMENTS:
            # Check direct sector match
            sec_match = False
            item_sec = (item.get("sector") or "").strip().lower()
            if normalized_sec and (normalized_sec in item_sec or item_sec in normalized_sec):
                sec_match = True

            # Calculate distance
            d = haversine_distance_meters(latitude, longitude, item["latitude"], item["longitude"])
            if sec_match or d <= radius_meters:
                record = dict(item)
                record["distance_meters"] = round(d, 1)
                record["type"] = "GOVERNMENT_DEPLOYMENT"
                record["status"] = "GOVERNMENT_DEPLOYMENT_EVIDENCE"
                record["source_provenance"] = item.get("department", "Chandigarh Government")
                
                # Human-readable why_relevant explanation
                reasons = []
                if d <= 150:
                    reasons.append(f"✓ Immediate crime scene proximity ({round(d)}m)")
                elif d <= 500:
                    reasons.append(f"✓ Nearby surveillance zone ({round(d)}m from scene)")
                else:
                    reasons.append(f"✓ Located within candidate corridor ({round(d / 1000, 2)} km)")

                if item.get("deployment_precision") == "JUNCTION":
                    reasons.append("✓ Major traffic junction with multi-directional rotary coverage")
                elif item.get("deployment_precision") == "CORRIDOR":
                    reasons.append(f"✓ Documented arterial corridor ({item.get('corridor_start')} → {item.get('corridor_end')})")
                elif item.get("deployment_precision") == "FACILITY":
                    reasons.append(f"✓ High-security public transit / institutional facility ({item.get('facility_name')})")
                else:
                    reasons.append(f"✓ Official Municipal CCTV deployment documented for {item.get('sector')}")

                if item.get("camera_count"):
                    reasons.append(f"✓ Documented deployment of ~{item['camera_count']} cameras ({item.get('camera_type', 'Surveillance')})")

                record["why_relevant"] = "\n".join(reasons)
                results.append(record)

        # Sort by distance
        results.sort(key=lambda x: x["distance_meters"])
        return results

    def get_authoritative_cameras(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 2000.0
    ) -> List[Dict[str, Any]]:
        """
        Retrieves discrete camera objects if camera-level data is documented.
        For area/corridor evidence, returns junction-level cameras.
        """
        cameras = []
        for item in CHANDIGARH_GOVERNMENT_DEPLOYMENTS:
            if item.get("deployment_precision") == "JUNCTION":
                d = haversine_distance_meters(latitude, longitude, item["latitude"], item["longitude"])
                if d <= radius_meters:
                    cameras.append({
                        "id": f"CAM-{item['id']}",
                        "name": f"ICCC Camera Pole - {item['area']}",
                        "type": "GOVERNMENT_CCTV",
                        "category": "TRAFFIC_JUNCTION",
                        "status": "VERIFIED",
                        "address": f"{item['area']}, Chandigarh",
                        "latitude": item["latitude"],
                        "longitude": item["longitude"],
                        "distance_meters": round(d, 1),
                        "camera_count": item.get("camera_count", 4),
                        "camera_type": item.get("camera_type", "PTZ"),
                        "why_relevant": f"✓ Authoritative ICCC traffic surveillance pole ({round(d)}m from scene)\n✓ Continuous 24/7 video feed archived at Chandigarh Police Command Center",
                        "source_provenance": "Chandigarh Smart City ICCC",
                        "is_verified": True
                    })
        return cameras

chandigarh_govt_provider = ChandigarhGovernmentCCTVProvider()
