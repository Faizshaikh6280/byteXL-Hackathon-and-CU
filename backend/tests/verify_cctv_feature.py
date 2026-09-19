import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import init_postgres, get_db_context
from app.models.postgres_models import CaseModel
from app.cctv.services.cctv_engine import cctv_engine
from app.cctv.models import (
    PrivateSurveillanceSourceModel, RouteHypothesisModel,
    CCTVCaseLinkModel, CCTVVerificationModel
)

def verify_complete_cctv_feature():
    print("============================================================")
    print("RUNNING CHANDIGARH CCTV & ROUTE INTELLIGENCE VERIFICATION")
    print("============================================================")

    init_postgres()
    print("[1/5] PostgreSQL schema & CCTV tables initialized successfully.")

    with get_db_context() as db:
        case = db.query(CaseModel).first()
        case_id = case.case_id if case else "CASE-TEST-CHANDIGARH"
        print(f"[2/5] Active case selected: {case_id}")

    # Test 1: Crime scene in Sector 34 (commercial & municipal hub)
    res = cctv_engine.analyze_case(
        case_id=case_id,
        incident_lat=30.7225,
        incident_lng=76.7682,
        address="Sector 34 Sub-City Centre, Chandigarh",
        sector="Sector 34",
        incident_time="21:20"
    )

    print(f"[3/5] Analysis complete for {res.incident_location.address}:")
    print(f"      - Total CCTV Sources Identified: {res.summary.total_sources}")
    print(f"      - Government Deployment Evidence: {res.summary.government_sources}")
    print(f"      - Potential Private/Commercial:  {res.summary.private_sources}")
    print(f"      - Candidate Routes Generated:    {res.summary.possible_routes}")
    print(f"      - Total Coverage Gaps Flagged:   {res.summary.coverage_gaps}")
    print(f"      - Recommended Starting Point:    {res.summary.recommended_starting_point}")

    assert res.summary.total_sources >= 15, "Expected at least 15 CCTV sources"
    assert res.summary.government_sources >= 5, "Expected at least 5 government sources"
    assert res.summary.possible_routes >= 3, "Expected at least 3 candidate routes"

    # Test 2: Check route sequence & observation time windows
    print("\n[4/5] Inspecting Route Hypotheses & Time Windows:")
    for idx, r in enumerate(res.routes):
        print(f"      Route {idx+1}: {r.route_name} ({r.direction})")
        print(f"        Distance: {r.distance_km} km | Est Time: {r.estimated_travel_time_min} | CCTV Count: {r.surveillance_sources_count} | Relevance: {r.relevance_score}")
        if r.cctv_sequence:
            first_cam = r.cctv_sequence[0]
            print(f"        First camera in sequence: {first_cam.source_name} ({first_cam.estimated_observation_window})")
        if r.coverage_gaps:
            print(f"        Coverage gap flagged: {r.coverage_gaps[0].explanation}")

    # Test 3: Officer Manual Verification and Link to Case
    print("\n[5/5] Testing Manual Source Recording & Verification:")
    with get_db_context() as db:
        manual_id = "VERIFY-TEST-PETROL-01"
        test_source = PrivateSurveillanceSourceModel(
            id=manual_id,
            place_id=manual_id,
            provider="INVESTIGATOR_VERIFIED",
            place_name="Sub-Inspector Verified Forecourt Camera",
            category="PETROL_PUMP",
            address="Sector 34, Chandigarh",
            latitude=30.7228,
            longitude=76.7689,
            phone="+91 172 260 4112",
            cctv_status="INVESTIGATOR_VERIFIED",
            verified_by="SUB_INSPECTOR_SHARMA",
            why_relevant="✓ Verified 4K camera with clear view of the northbound exit carriageway",
            case_id=case_id
        )
        db.merge(test_source)
        db.merge(CCTVCaseLinkModel(
            case_id=case_id,
            item_type="SOURCE",
            item_id=manual_id,
            notes="Crucial footage preservation request submitted",
            added_by="SUB_INSPECTOR_SHARMA"
        ))
        db.commit()

        # Query back
        saved = db.query(PrivateSurveillanceSourceModel).filter_by(id=manual_id).first()
        link = db.query(CCTVCaseLinkModel).filter_by(case_id=case_id, item_id=manual_id).first()
        assert saved is not None and saved.cctv_status == "INVESTIGATOR_VERIFIED"
        assert link is not None
        print(f"      - Verified source successfully recorded: {saved.place_name} ({saved.cctv_status})")
        print(f"      - Linked to Case Dossier: {link.notes}")

    print("\n============================================================")
    print("ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!")
    print("============================================================")

if __name__ == "__main__":
    verify_complete_cctv_feature()
