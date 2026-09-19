import uuid
import datetime
import math
import logging
from typing import List, Dict, Any, Tuple, Optional

from app.core.database import get_db_context
from app.cctv.models import (
    CCTVDeploymentEvidenceModel, PrivateSurveillanceSourceModel,
    RouteHypothesisModel, CCTVAnalysisJobModel, CCTVCaseLinkModel, CCTVVerificationModel
)
from app.cctv.schemas import (
    IncidentLocation, CCTVSourceDTO, RouteHypothesisDTO,
    CoverageGapDTO, CCTVSequenceItemDTO, CCTVIntelligenceSummary, CCTVIntelligenceResponse
)
from app.cctv.providers.chandigarh_geocoder import chandigarh_geocoder, haversine_distance_meters
from app.cctv.providers.chandigarh_govt_provider import chandigarh_govt_provider
from app.cctv.providers.google_places_provider import google_places_provider
from app.cctv.providers.chandigarh_routing_provider import chandigarh_routing_provider
from app.cctv.services.scoring import calculate_route_relevance

logger = logging.getLogger("investigation.cctv.engine")

def point_to_segment_distance(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float]:
    """
    Returns (distance_meters, fraction_along_segment) from point (px, py)
    to segment (x1, y1)-(x2, y2).
    x is longitude, y is latitude.
    """
    dx = x2 - x1
    dy = y2 - y1
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0:
        d = haversine_distance_meters(py, px, y1, x1)
        return d, 0.0

    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / seg_len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    d = haversine_distance_meters(py, px, proj_y, proj_x)
    return d, t

def distance_to_polyline(px: float, py: float, coordinates: List[List[float]]) -> Tuple[float, float]:
    """
    Returns (min_distance_meters, fraction_along_route) for point (px, py)
    projected onto a polyline of [lng, lat] coordinates.
    """
    if not coordinates or len(coordinates) < 2:
        return float("inf"), 0.0

    total_len = 0.0
    seg_lengths = []
    for i in range(len(coordinates) - 1):
        slen = haversine_distance_meters(
            coordinates[i][1], coordinates[i][0],
            coordinates[i+1][1], coordinates[i+1][0]
        )
        seg_lengths.append(slen)
        total_len += slen

    if total_len == 0:
        return haversine_distance_meters(py, px, coordinates[0][1], coordinates[0][0]), 0.0

    min_dist = float("inf")
    best_dist_along = 0.0
    accumulated_len = 0.0

    for i in range(len(coordinates) - 1):
        x1, y1 = coordinates[i][0], coordinates[i][1]
        x2, y2 = coordinates[i+1][0], coordinates[i+1][1]
        d, t = point_to_segment_distance(px, py, x1, y1, x2, y2)
        if d < min_dist:
            min_dist = d
            best_dist_along = accumulated_len + t * seg_lengths[i]
        accumulated_len += seg_lengths[i]

    fraction = best_dist_along / total_len
    return min_dist, fraction

def format_time_window(base_time_str: str, offset_seconds: int, window_mins: int = 5) -> str:
    """Calculates observation window relative to base incident time."""
    try:
        parts = base_time_str.split(":")
        h = int(parts[0])
        m = int(parts[1])
        base_mins = h * 60 + m
    except Exception:
        base_mins = 21 * 60 + 20  # Default 21:20

    target_mins = base_mins + int(offset_seconds // 60)
    start_m = max(0, target_mins - (window_mins // 2))
    end_m = start_m + window_mins

    sh = (start_m // 60) % 24
    sm = start_m % 60
    eh = (end_m // 60) % 24
    em = end_m % 60
    return f"{sh:02d}:{sm:02d} - {eh:02d}:{em:02d}"


class CCTVInvestigationEngine:
    """
    Core orchestrator for CCTV Location & Route Intelligence.
    Answers:
    1. Where can CCTV sources possibly be found around the crime scene?
    2. What are the possible approach and departure routes?
    """

    def analyze_case(
        self,
        case_id: str,
        incident_lat: float,
        incident_lng: float,
        address: Optional[str] = None,
        sector: Optional[str] = None,
        landmark: Optional[str] = None,
        incident_date: Optional[str] = None,
        incident_time: Optional[str] = None,
        search_radius_meters: float = 2500.0
    ) -> CCTVIntelligenceResponse:
        logger.info(f"[CCTVEngine] Starting analysis for Case {case_id} at ({incident_lat}, {incident_lng})")

        # 1. Reverse Geocode & Normalize Incident Location
        geo_info = chandigarh_geocoder.reverse_geocode(incident_lat, incident_lng)
        detected_sector = sector or geo_info.get("sector", "Sector 34")
        detected_landmark = landmark or geo_info.get("landmark", f"{detected_sector} Landmark")
        detected_address = address or geo_info.get("address", f"{detected_sector}, Chandigarh")
        inc_time = incident_time or "21:20"
        inc_date = incident_date or datetime.date.today().isoformat()

        location_obj = IncidentLocation(
            address=detected_address,
            sector=detected_sector,
            landmark=detected_landmark,
            latitude=round(incident_lat, 5),
            longitude=round(incident_lng, 5),
            incident_date=inc_date,
            incident_time=inc_time,
            incident_type="CYBER_FINANCIAL_CONVERGENCE",
            location_source="Investigator Confirmed"
        )

        # 2. Gather Government CCTV & Deployment Evidence
        govt_evidence = chandigarh_govt_provider.get_deployment_evidence(
            sector=detected_sector,
            latitude=incident_lat,
            longitude=incident_lng,
            radius_meters=search_radius_meters
        )
        auth_cameras = chandigarh_govt_provider.get_authoritative_cameras(
            latitude=incident_lat,
            longitude=incident_lng,
            radius_meters=search_radius_meters
        )

        # 3. Discover Potential Commercial / Private CCTV Sources
        commercial_candidates = google_places_provider.search_nearby(
            latitude=incident_lat,
            longitude=incident_lng,
            radius_meters=search_radius_meters
        )

        # 4. Check Investigator Verified Sources from Database
        verified_source_dtos: List[CCTVSourceDTO] = []
        with get_db_context() as db:
            db_verified = db.query(PrivateSurveillanceSourceModel).filter(
                (PrivateSurveillanceSourceModel.case_id == case_id) |
                (PrivateSurveillanceSourceModel.cctv_status == "INVESTIGATOR_VERIFIED")
            ).all()
            for row in db_verified:
                d = haversine_distance_meters(incident_lat, incident_lng, row.latitude, row.longitude)
                if d <= search_radius_meters * 1.5:
                    verified_source_dtos.append(CCTVSourceDTO(
                        id=row.id,
                        name=row.place_name,
                        type="INVESTIGATOR_VERIFIED",
                        category=row.category,
                        status="INVESTIGATOR_VERIFIED",
                        address=row.address,
                        latitude=row.latitude,
                        longitude=row.longitude,
                        distance_meters=round(d, 1),
                        phone=row.phone,
                        website=row.website,
                        why_relevant=f"✓ Independently verified by investigator ({row.verified_by or 'Officer'})\n✓ Confirmed operational surveillance camera on site",
                        source_provenance=f"Investigator Verified ({row.provider})",
                        is_verified=True,
                        is_added_to_case=True
                    ))

        # Build unified list of source DTOs
        unified_sources: List[CCTVSourceDTO] = []
        seen_names = set()

        # Add verified first
        for vs in verified_source_dtos:
            unified_sources.append(vs)
            seen_names.add(vs.name.lower())

        # Add authoritative government cameras
        for ac in auth_cameras:
            if ac["name"].lower() not in seen_names:
                unified_sources.append(CCTVSourceDTO(
                    id=ac["id"],
                    name=ac["name"],
                    type="GOVERNMENT_CCTV",
                    category=ac["category"],
                    status="VERIFIED",
                    address=ac["address"],
                    latitude=ac["latitude"],
                    longitude=ac["longitude"],
                    distance_meters=ac["distance_meters"],
                    camera_count=ac.get("camera_count", 4),
                    why_relevant=ac["why_relevant"],
                    source_provenance=ac["source_provenance"],
                    is_verified=True,
                    is_added_to_case=True
                ))
                seen_names.add(ac["name"].lower())

        # Add government deployment evidence
        deployment_polygons = []
        for ge in govt_evidence:
            if ge["project_name"].lower() not in seen_names:
                unified_sources.append(CCTVSourceDTO(
                    id=ge["id"],
                    name=f"Govt CCTV - {ge['area']}",
                    type="GOVERNMENT_DEPLOYMENT",
                    category="GOVERNMENT_PROJECT",
                    status="GOVERNMENT_DEPLOYMENT_EVIDENCE",
                    address=f"{ge['area']}, {ge.get('sector', 'Chandigarh')}",
                    latitude=ge["latitude"],
                    longitude=ge["longitude"],
                    distance_meters=ge["distance_meters"],
                    camera_count=ge.get("camera_count"),
                    deployment_precision=ge.get("deployment_precision"),
                    tender_reference=ge.get("tender_reference"),
                    why_relevant=ge["why_relevant"],
                    source_provenance=f"Tender: {ge.get('department', 'Municipal Corp')}",
                    is_verified=False,
                    is_added_to_case=False
                ))
                seen_names.add(ge["project_name"].lower())

                # Add polygon visualization helper
                lat, lng = ge["latitude"], ge["longitude"]
                delta = 0.003
                deployment_polygons.append({
                    "id": f"poly-{ge['id']}",
                    "name": ge["area"],
                    "sector": ge.get("sector"),
                    "coordinates": [
                        [lng - delta, lat - delta],
                        [lng + delta, lat - delta],
                        [lng + delta, lat + delta],
                        [lng - delta, lat + delta],
                        [lng - delta, lat - delta]
                    ]
                })

        # Add commercial potential sources
        for cc in commercial_candidates:
            if cc["place_name"].lower() not in seen_names:
                unified_sources.append(CCTVSourceDTO(
                    id=cc["place_id"],
                    name=cc["place_name"],
                    type="POTENTIAL_PRIVATE",
                    category=cc["category"],
                    status="POTENTIAL",
                    address=cc.get("address"),
                    latitude=cc["latitude"],
                    longitude=cc["longitude"],
                    distance_meters=cc["distance_meters"],
                    phone=cc.get("phone"),
                    website=cc.get("website"),
                    why_relevant=cc["why_relevant"],
                    source_provenance=cc.get("source_provenance", "Chandigarh Commercial Directory"),
                    is_verified=False,
                    is_added_to_case=False
                ))
                seen_names.add(cc["place_name"].lower())

        # Sort sources by proximity to crime scene
        unified_sources.sort(key=lambda s: s.distance_meters)

        # 5. Generate Candidate Approach and Departure Routes
        approach_routes_raw = chandigarh_routing_provider.generate_routes(
            incident_lat=incident_lat,
            incident_lng=incident_lng,
            route_type="APPROACH",
            incident_time_str=inc_time
        )
        departure_routes_raw = chandigarh_routing_provider.generate_routes(
            incident_lat=incident_lat,
            incident_lng=incident_lng,
            route_type="DEPARTURE",
            incident_time_str=inc_time
        )

        all_routes_raw = approach_routes_raw[:3] + departure_routes_raw[:2]
        route_dtos: List[RouteHypothesisDTO] = []

        # 6. Map CCTV Sources and Detect Gaps Along Each Route
        for r_idx, r_raw in enumerate(all_routes_raw):
            coords = r_raw["route_geometry"]["coordinates"]
            total_route_sec = r_raw["estimated_travel_time_seconds"]
            is_approach = (r_raw["route_type"] == "APPROACH")

            # Buffer corridor matching: Find all sources within 120m of route polyline
            matched_sources_with_pos: List[Tuple[CCTVSourceDTO, float]] = []
            govt_on_route = 0
            priv_on_route = 0

            for s in unified_sources:
                d_to_line, frac = distance_to_polyline(s.longitude, s.latitude, coords)
                if d_to_line <= 130.0:
                    matched_sources_with_pos.append((s, frac))
                    if s.type in ("GOVERNMENT_CCTV", "GOVERNMENT_DEPLOYMENT"):
                        govt_on_route += 1
                    else:
                        priv_on_route += 1

            # Sort sources along travel direction
            matched_sources_with_pos.sort(key=lambda item: item[1])

            # Build sequence DTOs and calculate time windows
            sequence_dtos: List[CCTVSequenceItemDTO] = []
            for s_order, (s, frac) in enumerate(matched_sources_with_pos, start=1):
                if is_approach:
                    # Traveled from 0 to frac; arrival at scene is at 1.0 (incident_time)
                    offset_from_incident = -1 * int((1.0 - frac) * total_route_sec)
                else:
                    # Traveled from scene (0.0) at incident_time to frac
                    offset_from_incident = int(frac * total_route_sec)

                time_win = format_time_window(inc_time, offset_from_incident, window_mins=5)
                dist_from_start = round(frac * r_raw["distance_meters"], 1)

                sequence_dtos.append(CCTVSequenceItemDTO(
                    sequence_order=s_order,
                    source_id=s.id,
                    source_name=s.name,
                    source_type=s.type,
                    road_name=r_raw.get("primary_road", "Arterial Road"),
                    distance_from_start_meters=dist_from_start,
                    estimated_observation_window=time_win,
                    why_relevant=(
                        f"✓ Positioned along {r_raw['route_name']} corridor\n"
                        f"✓ Estimated travel observation window: {time_win}\n"
                        f"✓ Approx. {round(dist_from_start)}m from route commencement"
                    )
                ))

            # Detect Surveillance Coverage Gaps (> 350m without CCTV)
            coverage_gaps: List[CoverageGapDTO] = []
            route_coords = r_raw["route_geometry"]["coordinates"]
            if len(route_coords) >= 2:
                # Break polyline into ~400m intervals to spot gaps
                for c_idx in range(len(route_coords) - 1):
                    p1 = route_coords[c_idx]
                    p2 = route_coords[c_idx + 1]
                    seg_d = haversine_distance_meters(p1[1], p1[0], p2[1], p2[0])
                    
                    # Check if any camera lies on this segment
                    has_cam = any(
                        point_to_segment_distance(s.longitude, s.latitude, p1[0], p1[1], p2[0], p2[1])[0] < 120.0
                        for s in unified_sources
                    )
                    if seg_d >= 350.0 and not has_cam:
                        coverage_gaps.append(CoverageGapDTO(
                            gap_id=f"GAP-{r_raw['route_id']}-{len(coverage_gaps) + 1}",
                            road_name=r_raw.get("primary_road", "Arterial Road"),
                            start_coord=p1,
                            end_coord=p2,
                            distance_meters=round(seg_d, 1),
                            explanation=f"Coverage Gap: Approx. {round(seg_d)}m section on {r_raw.get('primary_road', 'arterial connector')} without known surveillance sources from currently available data."
                        ))

            # Compute route score & coverage rating
            score_meta = calculate_route_relevance(
                distance_km=r_raw["distance_km"],
                travel_time_seconds=total_route_sec,
                govt_sources_count=govt_on_route,
                private_sources_count=priv_on_route,
                coverage_gaps_count=len(coverage_gaps)
            )

            is_recommended = (r_idx == 0)  # Top approach route recommended by default

            route_dtos.append(RouteHypothesisDTO(
                route_id=r_raw["route_id"],
                route_name=r_raw["route_name"],
                route_type=r_raw["route_type"],
                origin_area=r_raw["origin_area"],
                destination=r_raw["destination"],
                direction=r_raw["direction"],
                distance_km=r_raw["distance_km"],
                distance_meters=r_raw["distance_meters"],
                estimated_travel_time_min=r_raw["estimated_travel_time_min"],
                estimated_travel_time_seconds=total_route_sec,
                surveillance_sources_count=len(sequence_dtos),
                government_count=govt_on_route,
                private_count=priv_on_route,
                coverage_score=score_meta["coverage_category"],
                coverage_score_num=score_meta["relevance_score"],
                coverage_gaps_count=len(coverage_gaps),
                coverage_gaps=coverage_gaps,
                why_relevant=r_raw["why_relevant"],
                relevance_score=score_meta["relevance_score"],
                is_recommended=is_recommended,
                route_geometry=r_raw["route_geometry"],
                cctv_sequence=sequence_dtos
            ))

        # 7. Summary Metrics
        govt_count = sum(1 for s in unified_sources if s.type in ("GOVERNMENT_CCTV", "GOVERNMENT_DEPLOYMENT"))
        priv_count = sum(1 for s in unified_sources if s.type == "POTENTIAL_PRIVATE")
        ver_count = sum(1 for s in unified_sources if s.type == "INVESTIGATOR_VERIFIED")
        total_gaps = sum(r.coverage_gaps_count for r in route_dtos)

        top_route = route_dtos[0] if route_dtos else None
        rec_text = None
        if top_route:
            rec_text = f"{top_route.route_name} ({top_route.direction}) has the strongest combination of time compatibility, arterial road connectivity, and {top_route.surveillance_sources_count} identified CCTV sources."

        summary = CCTVIntelligenceSummary(
            total_sources=len(unified_sources),
            government_sources=govt_count,
            private_sources=priv_count,
            verified_sources=ver_count,
            possible_routes=len(route_dtos),
            approach_routes=len([r for r in route_dtos if r.route_type == "APPROACH"]),
            departure_routes=len([r for r in route_dtos if r.route_type == "DEPARTURE"]),
            coverage_gaps=total_gaps,
            recommended_route_id=top_route.route_id if top_route else None,
            recommended_starting_point=rec_text
        )

        response = CCTVIntelligenceResponse(
            case_id=case_id,
            incident_location=location_obj,
            summary=summary,
            sources=unified_sources,
            routes=route_dtos,
            deployment_polygons=deployment_polygons
        )

        # 8. Persist Analysis in DB for Case Dossier
        try:
            with get_db_context() as db:
                # Save routes
                for r in route_dtos:
                    existing = db.query(RouteHypothesisModel).filter_by(case_id=case_id, route_id=r.route_id).first()
                    if not existing:
                        db.add(RouteHypothesisModel(
                            id=f"RH-{uuid.uuid4().hex[:8].upper()}",
                            route_id=r.route_id,
                            case_id=case_id,
                            incident_id=f"INC-{case_id}",
                            route_type=r.route_type,
                            origin_area=r.origin_area,
                            destination=r.destination,
                            direction=r.direction,
                            distance_meters=r.distance_meters,
                            estimated_travel_time_seconds=r.estimated_travel_time_seconds,
                            route_geometry=r.route_geometry,
                            waypoints=[],
                            cctv_sequence=[s.model_dump() if hasattr(s, 'model_dump') else s.dict() for s in r.cctv_sequence],
                            surveillance_source_count=r.surveillance_sources_count,
                            government_source_count=r.government_count,
                            private_source_count=r.private_count,
                            coverage_score=r.coverage_score_num,
                            coverage_gaps=[g.model_dump() if hasattr(g, 'model_dump') else g.dict() for g in r.coverage_gaps],
                            relevance_score=r.relevance_score,
                            explanation=r.why_relevant
                        ))
                logger.info(f"[CCTVEngine] Successfully persisted {len(route_dtos)} route hypotheses for {case_id}")
        except Exception as e:
            logger.warning(f"[CCTVEngine] Error persisting routes to PostgreSQL: {e}")

        return response

cctv_engine = CCTVInvestigationEngine()
