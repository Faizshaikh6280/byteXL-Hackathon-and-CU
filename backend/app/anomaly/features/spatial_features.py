import math
from typing import List, Dict, Any, Tuple
from datetime import datetime

class SpatialFeatureExtractor:
    """Extracts geospatial movement and trajectory telemetry features."""

    @staticmethod
    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculates great-circle distance between two GPS coordinates in kilometers."""
        r = 6371.0  # Earth radius in kilometers
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(d_lon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c

    def extract_trajectory_features(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Input: list of canonical events with telemetry coordinates for an entity.
        Output: trajectory features, max implied velocity, total distance.
        """
        KNOWN_TOWERS = {
            "CELL-DEL-SCENE": (28.5244, 77.2066),
            "CELL-DEL-201": (28.6139, 77.2090),
            "CELL-DEL-205": (28.6289, 77.2150),
            "CELL-DEL-220": (28.5355, 77.2625),
            "CELL-DEL-310": (28.5700, 77.2200),
            "CELL-DEL-311": (28.5500, 77.2150),
            "CELL-DEL-312": (28.5350, 77.2100),
            "CELL-DEL-313": (28.5300, 77.2080),
            "CELL-DEL-320": (28.5100, 77.2000),
            "CELL-DEL-101": (28.6300, 77.2200),
            "CELL-DEL-102": (28.6350, 77.2250),
            "CELL-DEL-103": (28.6400, 77.2300),
            "CELL-CHD-22": (30.7333, 76.7794),
            "CELL-CHD-17": (30.7410, 76.7680),
            "CELL-CHD-IA": (30.7150, 76.7920),
            "CELL-MOH-07": (30.6882, 76.7358),
            "CELL-PKL-03": (30.6940, 76.8010),
        }
        KNOWN_LOCATIONS = {
            "saket": (28.5244, 77.2066),
            "connaught place": (28.6300, 77.2200),
            "cp": (28.6300, 77.2200),
            "south extension": (28.5700, 77.2200),
            "south ex": (28.5700, 77.2200),
            "karol bagh": (28.6289, 77.2150),
            "hauz khas": (28.5300, 77.2080),
            "malviya nagar": (28.5350, 77.2100),
            "delhi": (28.6139, 77.2090),
            "sector 22": (30.7333, 76.7794),
            "sector 22 market": (30.7333, 76.7794),
            "sector 17": (30.7410, 76.7680),
            "mohali": (30.6882, 76.7358),
            "phase 7 mohali": (30.6882, 76.7358),
            "chandigarh": (30.7333, 76.7794),
            "panchkula": (30.6940, 76.8010),
            "zirakpur": (30.6425, 76.8173),
        }

        waypoints: List[Dict[str, Any]] = []

        for e in events:
            domain = str(e.get("domain") or e.get("source_type", "")).upper()
            # Non-movement records (Banking, KYC) and CDR voice calls should not be treated as GPS waypoints
            if any(d in domain for d in ("BANKING", "KYC")):
                continue
            if "TELECOM" in domain and not (e.get("telemetry", {}).get("lat") or e.get("attributes", {}).get("latitude")):
                continue

            telemetry = e.get("telemetry", {})
            attrs = e.get("attributes", {})
            lat = telemetry.get("lat") or attrs.get("latitude")
            lng = telemetry.get("lng") or attrs.get("longitude")
            cell_tower_id = telemetry.get("cell_tower_id") or attrs.get("cell_id") or attrs.get("cell_tower_id")
            location_name = attrs.get("location") or telemetry.get("address") or attrs.get("address")
            ts_str = e.get("timestamp")

            if (lat is None or lng is None) and cell_tower_id:
                ct_clean = str(cell_tower_id).strip().upper()
                if ct_clean in KNOWN_TOWERS:
                    lat, lng = KNOWN_TOWERS[ct_clean]

            if (lat is None or lng is None) and location_name:
                loc_clean = str(location_name).strip().lower()
                for k, coords in KNOWN_LOCATIONS.items():
                    if k in loc_clean:
                        lat, lng = coords
                        break

            if lat is not None and lng is not None and ts_str:
                try:
                    dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                    waypoints.append({
                        "dt": dt,
                        "timestamp": dt.isoformat(),
                        "lat": float(lat),
                        "lng": float(lng),
                        "event_id": e.get("event_id", ""),
                        "cell_tower_id": str(cell_tower_id) if cell_tower_id else None,
                        "location": str(location_name) if location_name else None
                    })
                except Exception:
                    pass

        if not waypoints:
            return {
                "waypoint_count": 0,
                "total_distance_km": 0.0,
                "max_speed_kmh": 0.0,
                "impossible_transitions": [],
                "waypoints": []
            }

        # Sort chronologically
        waypoints.sort(key=lambda x: x["dt"])

        total_distance = 0.0
        max_speed = 0.0
        impossible_transitions = []

        for i in range(len(waypoints) - 1):
            w1 = waypoints[i]
            w2 = waypoints[i+1]

            elapsed_seconds = (w2["dt"] - w1["dt"]).total_seconds()
            if elapsed_seconds <= 0:
                continue

            dist_km = self.haversine_km(w1["lat"], w1["lng"], w2["lat"], w2["lng"])
            total_distance += dist_km
            speed_kmh = (dist_km / elapsed_seconds) * 3600.0

            if speed_kmh > max_speed:
                max_speed = speed_kmh

            # Flag if speed exceeds physical plausibility
            if speed_kmh > 800.0 and dist_km > 50.0:
                impossible_transitions.append({
                    "from_event": w1["event_id"],
                    "to_event": w2["event_id"],
                    "from_coord": [w1["lat"], w1["lng"]],
                    "to_coord": [w2["lat"], w2["lng"]],
                    "distance_km": round(dist_km, 2),
                    "elapsed_seconds": round(elapsed_seconds, 1),
                    "speed_kmh": round(speed_kmh, 1)
                })

        return {
            "waypoint_count": len(waypoints),
            "total_distance_km": round(total_distance, 2),
            "max_speed_kmh": round(max_speed, 1),
            "impossible_transitions": impossible_transitions,
            "waypoints": [
                {
                    "timestamp": w["dt"].isoformat(),
                    "lat": w["lat"],
                    "lng": w["lng"],
                    "event_id": w["event_id"],
                    "cell_tower_id": w["cell_tower_id"],
                    "location": w["location"]
                }
                for w in waypoints
            ]
        }

spatial_features = SpatialFeatureExtractor()
