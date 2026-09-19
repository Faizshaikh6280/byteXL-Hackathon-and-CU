import math
from typing import Dict, Any, Optional
from app.cctv.providers.base import BaseGeocoderProvider

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

CHANDIGARH_SECTOR_CENTROIDS = {
    "Sector 1": {"lat": 30.7600, "lng": 76.8040, "area": "Capitol Complex"},
    "Sector 2": {"lat": 30.7580, "lng": 76.7950, "area": "Secretariat / High Court"},
    "Sector 3": {"lat": 30.7560, "lng": 76.7860, "area": "VIP Residences"},
    "Sector 4": {"lat": 30.7540, "lng": 76.7770, "area": "Ministers Residences"},
    "Sector 5": {"lat": 30.7520, "lng": 76.7680, "area": "Sukhna Enclave"},
    "Sector 6": {"lat": 30.7500, "lng": 76.7590, "area": "Governor House"},
    "Sector 7": {"lat": 30.7380, "lng": 76.8000, "area": "Madhya Marg North"},
    "Sector 8": {"lat": 30.7360, "lng": 76.7910, "area": "Inner Market 8"},
    "Sector 9": {"lat": 30.7340, "lng": 76.7820, "area": "Madhya Marg Central"},
    "Sector 10": {"lat": 30.7320, "lng": 76.7730, "area": "Museum & Art Gallery"},
    "Sector 11": {"lat": 30.7300, "lng": 76.7640, "area": "Panjab University North"},
    "Sector 12": {"lat": 30.7650, "lng": 76.7750, "area": "PGIMER / PEC"},
    "Sector 14": {"lat": 30.7610, "lng": 76.7650, "area": "Panjab University Campus"},
    "Sector 15": {"lat": 30.7580, "lng": 76.7550, "area": "Patel Market / DAV"},
    "Sector 16": {"lat": 30.7480, "lng": 76.7800, "area": "GMSH 16 / Rose Garden"},
    "Sector 17": {"lat": 30.7410, "lng": 76.7850, "area": "City Centre / ISBT 17 / Plaza"},
    "Sector 18": {"lat": 30.7350, "lng": 76.7900, "area": "Tagore Theatre"},
    "Sector 19": {"lat": 30.7280, "lng": 76.7950, "area": "Palika Bazaar"},
    "Sector 20": {"lat": 30.7210, "lng": 76.8000, "area": "Gurdwara Chowk"},
    "Sector 21": {"lat": 30.7280, "lng": 76.7750, "area": "Aroma Chowk West"},
    "Sector 22": {"lat": 30.7350, "lng": 76.7700, "area": "Shastri Market / Aroma Chowk"},
    "Sector 23": {"lat": 30.7420, "lng": 76.7650, "area": "Cricket Stadium / All-Weather Pool"},
    "Sector 24": {"lat": 30.7490, "lng": 76.7600, "area": "Hotel Parkview / Law College"},
    "Sector 25": {"lat": 30.7550, "lng": 76.7500, "area": "UIET Panjab University"},
    "Sector 26": {"lat": 30.7250, "lng": 76.8150, "area": "Grain Market / Timber Market"},
    "Sector 27": {"lat": 30.7180, "lng": 76.8100, "area": "Transport Chowk West"},
    "Sector 28": {"lat": 30.7110, "lng": 76.8050, "area": "Purv Marg"},
    "Sector 29": {"lat": 30.7040, "lng": 76.8000, "area": "Industrial Area Approach"},
    "Sector 30": {"lat": 30.7100, "lng": 76.7900, "area": "Ward 18 / Police Complex"},
    "Sector 31": {"lat": 30.6970, "lng": 76.7950, "area": "Air Force Station Corridor"},
    "Sector 32": {"lat": 30.7050, "lng": 76.7800, "area": "GMCH 32 Hospital"},
    "Sector 33": {"lat": 30.7120, "lng": 76.7750, "area": "Terraced Garden"},
    "Sector 34": {"lat": 30.7225, "lng": 76.7682, "area": "Sub-City Centre / Commercial Hub"},
    "Sector 35": {"lat": 30.7270, "lng": 76.7600, "area": "Ward 23 / Hotel Corridor / JW Marriott"},
    "Sector 36": {"lat": 30.7340, "lng": 76.7520, "area": "Fragrance Garden"},
    "Sector 37": {"lat": 30.7410, "lng": 76.7450, "area": "Community Centre / Main Road"},
    "Sector 38": {"lat": 30.7480, "lng": 76.7380, "area": "Vivek High / Gurdwara"},
    "Sector 42": {"lat": 30.7260, "lng": 76.7450, "area": "Hockey Stadium / New Lake"},
    "Sector 43": {"lat": 30.7180, "lng": 76.7520, "area": "District Courts / ISBT 43"},
    "Sector 44": {"lat": 30.7100, "lng": 76.7600, "area": "Residential & Market"},
    "Sector 45": {"lat": 30.7020, "lng": 76.7680, "area": "Burail Sub-Division"},
    "Sector 46": {"lat": 30.6950, "lng": 76.7760, "area": "Sector 46A / 46C / Post Graduate College"},
    "Sector 47": {"lat": 30.6880, "lng": 76.7840, "area": "Sukhna Choe Corridor"},
    "Sector 48": {"lat": 30.6800, "lng": 76.7700, "area": "Ward 35 / Motor Market Corridor"},
    "Sector 49": {"lat": 30.6850, "lng": 76.7600, "area": "Society Flats / Mohali Border"},
    "Sector 50": {"lat": 30.6920, "lng": 76.7520, "area": "Progressive Enclave"},
    "Sector 51": {"lat": 30.6990, "lng": 76.7440, "area": "District Courts Complex Approach"},
    "Sector 52": {"lat": 30.7060, "lng": 76.7360, "area": "Kajheri"},
    "Sector 61": {"lat": 30.7150, "lng": 76.7280, "area": "Ward 31 / MIG Flats / Central Parks"},
    "Industrial Area Phase 1": {"lat": 30.7080, "lng": 76.8050, "area": "Elante Mall / Commercial Zone"},
    "Industrial Area Phase 2": {"lat": 30.6950, "lng": 76.7900, "area": "Warehouses / Logistics"},
    "Manimajra": {"lat": 30.7240, "lng": 76.8450, "area": "Fun Republic / Old Ropar Road / PS Chowk"},
    "Hallomajra": {"lat": 30.6900, "lng": 76.8120, "area": "Hallo Majra Chowk / Airport Road"},
    "IT Park Chandigarh": {"lat": 30.7290, "lng": 76.8400, "area": "Kishangarh / DLF / Rajiv Gandhi IT Park"}
}

CHANDIGARH_LANDMARKS = {
    "sub-city centre sector 34": {"lat": 30.7225, "lng": 76.7682, "sector": "Sector 34", "address": "Sub-City Centre, Sector 34, Chandigarh"},
    "sector 34": {"lat": 30.7225, "lng": 76.7682, "sector": "Sector 34", "address": "Sector 34, Chandigarh"},
    "sector 35": {"lat": 30.7270, "lng": 76.7600, "sector": "Sector 35", "address": "Sector 35, Chandigarh"},
    "jw marriott": {"lat": 30.7265, "lng": 76.7610, "sector": "Sector 35", "address": "Dakshin Marg, Sector 35, Chandigarh"},
    "sector 17 plaza": {"lat": 30.7410, "lng": 76.7850, "sector": "Sector 17", "address": "Sector 17 Plaza, Chandigarh"},
    "isbt 17": {"lat": 30.7400, "lng": 76.7830, "sector": "Sector 17", "address": "ISBT Sector 17, Chandigarh"},
    "isbt 43": {"lat": 30.7180, "lng": 76.7520, "sector": "Sector 43", "address": "ISBT Sector 43, Chandigarh"},
    "district courts 43": {"lat": 30.7170, "lng": 76.7500, "sector": "Sector 43", "address": "District Courts, Sector 43, Chandigarh"},
    "elante mall": {"lat": 30.7055, "lng": 76.8015, "sector": "Industrial Area Phase 1", "address": "Elante Mall, Industrial Area Phase 1, Chandigarh"},
    "fun republic": {"lat": 30.7260, "lng": 76.8420, "sector": "Manimajra", "address": "Old Ropar Road, Manimajra, Chandigarh"},
    "manimajra": {"lat": 30.7240, "lng": 76.8450, "sector": "Manimajra", "address": "Manimajra, Chandigarh"},
    "hallomajra": {"lat": 30.6900, "lng": 76.8120, "sector": "Hallomajra", "address": "Hallo Majra, Chandigarh"},
    "tribune chowk": {"lat": 30.7020, "lng": 76.7920, "sector": "Sector 29/31/Industrial Area", "address": "Tribune Chowk, Chandigarh"},
    "transport chowk": {"lat": 30.7190, "lng": 76.8150, "sector": "Sector 26/Industrial Area", "address": "Transport Chowk, Purv Marg, Chandigarh"},
    "matka chowk": {"lat": 30.7440, "lng": 76.7810, "sector": "Sector 9/10/16/17", "address": "Matka Chowk, Madhya Marg, Chandigarh"},
    "kisan bhawan chowk": {"lat": 30.7250, "lng": 76.7690, "sector": "Sector 35/36/42/43", "address": "Kisan Bhawan Chowk, Dakshin Marg, Chandigarh"},
    "aroma chowk": {"lat": 30.7320, "lng": 76.7720, "sector": "Sector 21/22", "address": "Aroma Chowk, Himalaya Marg, Chandigarh"},
    "piccadily chowk": {"lat": 30.7290, "lng": 76.7620, "sector": "Sector 22/23/35/36", "address": "Piccadily Chowk, Himalaya Marg, Chandigarh"},
    "cricket stadium chowk": {"lat": 30.7390, "lng": 76.7620, "sector": "Sector 16/23", "address": "Cricket Stadium Chowk, Jan Marg, Chandigarh"},
    "housing board chowk": {"lat": 30.7150, "lng": 76.8500, "sector": "Manimajra / Panchkula Border", "address": "Housing Board Chowk, Chandigarh"},
    "pgimer": {"lat": 30.7650, "lng": 76.7750, "sector": "Sector 12", "address": "PGIMER, Sector 12, Chandigarh"},
    "gmch 32": {"lat": 30.7050, "lng": 76.7800, "sector": "Sector 32", "address": "GMCH, Sector 32, Chandigarh"},
    "sector 48": {"lat": 30.6800, "lng": 76.7700, "sector": "Sector 48", "address": "Sector 48, Chandigarh"},
    "sector 61": {"lat": 30.7150, "lng": 76.7280, "sector": "Sector 61", "address": "Sector 61, Chandigarh"}
}

class ChandigarhGeocoderProvider(BaseGeocoderProvider):
    """
    High-precision geocoder and reverse-geocoder for Chandigarh Union Territory.
    Resolves sector names, corridors, landmarks, and roundabouts without relying
    on third-party API availability.
    """

    def geocode(self, query: str) -> Optional[Dict[str, Any]]:
        if not query:
            return None
        q = query.strip().lower()

        # Check landmarks first
        for key, val in CHANDIGARH_LANDMARKS.items():
            if key in q or q in key:
                return {
                    "latitude": val["lat"],
                    "longitude": val["lng"],
                    "sector": val["sector"],
                    "address": val["address"],
                    "area": val.get("area", val["sector"]),
                    "confidence": 0.95
                }

        # Check sectors
        for sec_name, data in CHANDIGARH_SECTOR_CENTROIDS.items():
            if sec_name.lower() in q:
                return {
                    "latitude": data["lat"],
                    "longitude": data["lng"],
                    "sector": sec_name,
                    "address": f"{sec_name}, Chandigarh",
                    "area": data["area"],
                    "confidence": 0.90
                }

        # Fallback default: Sector 34 Chandigarh
        default_sec = CHANDIGARH_SECTOR_CENTROIDS["Sector 34"]
        return {
            "latitude": default_sec["lat"],
            "longitude": default_sec["lng"],
            "sector": "Sector 34",
            "address": "Sector 34, Chandigarh",
            "area": default_sec["area"],
            "confidence": 0.50
        }

    def reverse_geocode(self, latitude: float, longitude: float) -> Dict[str, Any]:
        closest_sector = "Sector 34"
        closest_area = "Sub-City Centre"
        min_dist = float("inf")

        for sec_name, data in CHANDIGARH_SECTOR_CENTROIDS.items():
            d = haversine_distance_meters(latitude, longitude, data["lat"], data["lng"])
            if d < min_dist:
                min_dist = d
                closest_sector = sec_name
                closest_area = data["area"]

        # Check if right near a famous landmark (< 250m)
        for lm_name, val in CHANDIGARH_LANDMARKS.items():
            d = haversine_distance_meters(latitude, longitude, val["lat"], val["lng"])
            if d < 250:
                return {
                    "sector": val["sector"],
                    "landmark": lm_name.title(),
                    "address": val["address"],
                    "distance_to_center_meters": round(d, 1)
                }

        return {
            "sector": closest_sector,
            "landmark": f"{closest_sector} ({closest_area})",
            "address": f"{closest_sector}, Chandigarh",
            "distance_to_center_meters": round(min_dist, 1)
        }

chandigarh_geocoder = ChandigarhGeocoderProvider()
