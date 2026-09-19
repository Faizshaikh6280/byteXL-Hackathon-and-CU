import os
import time
import logging
import requests
from typing import List, Dict, Any, Optional
from app.cctv.providers.base import BasePlacesProvider
from app.cctv.providers.chandigarh_commercial_provider import chandigarh_commercial_provider
from app.cctv.providers.chandigarh_geocoder import haversine_distance_meters

logger = logging.getLogger("investigation.cctv.places")

class GooglePlacesProvider(BasePlacesProvider):
    """
    Google Places API provider with secure environment key management,
    in-memory response caching, rate-limiting protection, and automatic fallback
    to the offline Chandigarh Commercial Directory.
    """

    def __init__(self):
        self.api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 3600.0  # 1 hour

    def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 2000.0,
        categories: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        # Check cache
        cache_key = f"{round(latitude, 4)}_{round(longitude, 4)}_{int(radius_meters)}"
        now = time.time()
        if cache_key in self._cache:
            ts, cached_results = self._cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached_results

        # If no Google API key configured, use the high-fidelity offline directory
        if not self.api_key:
            logger.debug("[GooglePlaces] No GOOGLE_MAPS_API_KEY set; using local Chandigarh directory.")
            results = chandigarh_commercial_provider.search_nearby(latitude, longitude, radius_meters, categories)
            self._cache[cache_key] = (now, results)
            return results

        results = []
        try:
            url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
            type_mapping = {
                "PETROL_PUMP": "gas_station",
                "BANK": "bank",
                "ATM": "atm",
                "MALL": "shopping_mall",
                "HOTEL": "lodging",
                "HOSPITAL": "hospital",
                "PHARMACY": "pharmacy",
                "RESTAURANT": "restaurant"
            }
            target_types = ["gas_station", "bank", "atm", "shopping_mall", "hospital", "lodging"]
            if categories:
                target_types = [type_mapping.get(c, "establishment") for c in categories if c in type_mapping]

            for place_type in target_types[:3]:  # Top 3 types to conserve API quota
                params = {
                    "location": f"{latitude},{longitude}",
                    "radius": min(radius_meters, 3000),
                    "type": place_type,
                    "key": self.api_key
                }
                resp = requests.get(url, params=params, timeout=4.0)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("results", []):
                        loc = item.get("geometry", {}).get("location", {})
                        item_lat = loc.get("lat")
                        item_lng = loc.get("lng")
                        if not item_lat or not item_lng:
                            continue

                        dist = haversine_distance_meters(latitude, longitude, item_lat, item_lng)
                        if dist <= radius_meters:
                            results.append({
                                "place_id": item.get("place_id"),
                                "place_name": item.get("name"),
                                "category": place_type.upper(),
                                "address": item.get("vicinity"),
                                "latitude": item_lat,
                                "longitude": item_lng,
                                "phone": None,
                                "website": None,
                                "distance_meters": round(dist, 1),
                                "type": "POTENTIAL_PRIVATE",
                                "cctv_status": "POTENTIAL",
                                "source_provenance": "Google Places API",
                                "is_verified": False,
                                "why_relevant": f"✓ Commercial establishment ({place_type.replace('_', ' ').title()})\n✓ Located {round(dist)}m from incident scene\n✓ Road-facing business opportunity\n⚠ CCTV presence is not independently verified"
                            })

            # Merge with local directory for complete coverage and known phone contacts
            local_results = chandigarh_commercial_provider.search_nearby(latitude, longitude, radius_meters, categories)
            seen_names = set(r["place_name"].lower() for r in results)
            for lr in local_results:
                if lr["place_name"].lower() not in seen_names:
                    results.append(lr)

        except Exception as e:
            logger.warning(f"[GooglePlaces] API call failed: {e}. Falling back to offline commercial directory.")
            results = chandigarh_commercial_provider.search_nearby(latitude, longitude, radius_meters, categories)

        results.sort(key=lambda x: x["distance_meters"])
        self._cache[cache_key] = (now, results)
        return results

google_places_provider = GooglePlacesProvider()
