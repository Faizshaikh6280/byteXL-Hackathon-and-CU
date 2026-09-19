import os
import sys
import unittest

# Ensure backend root in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.cctv.providers.chandigarh_geocoder import chandigarh_geocoder
from app.cctv.providers.chandigarh_govt_provider import chandigarh_govt_provider
from app.cctv.providers.chandigarh_commercial_provider import chandigarh_commercial_provider
from app.cctv.providers.chandigarh_routing_provider import chandigarh_routing_provider
from app.cctv.services.cctv_engine import cctv_engine

class TestCCTVLocationAndRouteIntelligence(unittest.TestCase):

    def test_geocoder(self):
        res = chandigarh_geocoder.geocode("Sector 34")
        self.assertIsNotNone(res)
        self.assertEqual(res["sector"], "Sector 34")
        self.assertAlmostEqual(res["latitude"], 30.7225, places=2)

        rev = chandigarh_geocoder.reverse_geocode(30.7225, 76.7682)
        self.assertIn("Sector 34", rev["sector"])

    def test_government_deployment_evidence(self):
        evidence = chandigarh_govt_provider.get_deployment_evidence(
            sector="Sector 34",
            latitude=30.7225,
            longitude=76.7682,
            radius_meters=2500.0
        )
        self.assertGreater(len(evidence), 0)
        has_sec34 = any("Sector 34" in e.get("sector", "") for e in evidence)
        self.assertTrue(has_sec34)
        for e in evidence:
            self.assertEqual(e["type"], "GOVERNMENT_DEPLOYMENT")
            self.assertIn("✓", e["why_relevant"])

    def test_authoritative_cameras(self):
        cameras = chandigarh_govt_provider.get_authoritative_cameras(
            latitude=30.7225,
            longitude=76.7682,
            radius_meters=3000.0
        )
        self.assertGreater(len(cameras), 0)
        for cam in cameras:
            self.assertEqual(cam["type"], "GOVERNMENT_CCTV")
            self.assertEqual(cam["status"], "VERIFIED")
            self.assertTrue(cam["is_verified"])

    def test_commercial_private_cctv_discovery(self):
        places = chandigarh_commercial_provider.search_nearby(
            latitude=30.7225,
            longitude=76.7682,
            radius_meters=2000.0
        )
        self.assertGreater(len(places), 0)
        for p in places:
            self.assertEqual(p["type"], "POTENTIAL_PRIVATE")
            self.assertEqual(p["cctv_status"], "POTENTIAL")
            self.assertFalse(p["is_verified"])
            self.assertIn("✓", p["why_relevant"])
            self.assertIn("⚠", p["why_relevant"])

    def test_route_hypothesis_generation(self):
        routes = chandigarh_routing_provider.generate_routes(
            incident_lat=30.7225,
            incident_lng=76.7682,
            route_type="APPROACH",
            incident_time_str="21:20"
        )
        self.assertGreaterEqual(len(routes), 2)
        for r in routes:
            self.assertEqual(r["route_type"], "APPROACH")
            self.assertGreater(r["distance_km"], 0)
            self.assertGreater(r["estimated_travel_time_seconds"], 0)
            self.assertIn("LineString", r["route_geometry"]["type"])
            self.assertGreater(len(r["route_geometry"]["coordinates"]), 1)

    def test_end_to_end_cctv_engine(self):
        case_id = "CASE-UNIT-TEST-001"
        res = cctv_engine.analyze_case(
            case_id=case_id,
            incident_lat=30.7225,
            incident_lng=76.7682,
            sector="Sector 34",
            incident_time="21:20"
        )
        self.assertEqual(res.case_id, case_id)
        self.assertGreater(res.summary.total_sources, 10)
        self.assertGreater(res.summary.government_sources, 0)
        self.assertGreater(res.summary.private_sources, 0)
        self.assertGreater(res.summary.possible_routes, 0)
        self.assertIsNotNone(res.summary.recommended_starting_point)

        # Verify route sequences and gaps
        for r in res.routes:
            self.assertGreater(r.relevance_score, 0)
            self.assertIn(r.coverage_score, ["High", "Medium", "Low"])
            if r.surveillance_sources_count > 0:
                self.assertGreater(len(r.cctv_sequence), 0)
                first_seq = r.cctv_sequence[0]
                self.assertIn(":", first_seq.estimated_observation_window)

if __name__ == "__main__":
    unittest.main()
