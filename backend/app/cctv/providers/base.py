from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BasePlacesProvider(ABC):
    """Abstract interface for commercial/public establishment discovery."""

    @abstractmethod
    def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float,
        categories: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Searches for commercial establishments within a radius."""
        pass


class BaseRoutingProvider(ABC):
    """Abstract interface for route generation and road network modeling."""

    @abstractmethod
    def generate_routes(
        self,
        incident_lat: float,
        incident_lng: float,
        route_type: str = "APPROACH",  # APPROACH, DEPARTURE
        incident_time_str: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Generates candidate approach and departure routes."""
        pass


class BaseGovernmentCCTVProvider(ABC):
    """Abstract interface for government CCTV and tender deployment evidence."""

    @abstractmethod
    def get_deployment_evidence(
        self,
        sector: Optional[str],
        latitude: float,
        longitude: float,
        radius_meters: float
    ) -> List[Dict[str, Any]]:
        """Retrieves official CCTV deployment evidence for an area or sector."""
        pass

    @abstractmethod
    def get_authoritative_cameras(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float
    ) -> List[Dict[str, Any]]:
        """Retrieves authoritative government cameras with exact coordinates if available."""
        pass


class BaseGeocoderProvider(ABC):
    """Abstract geocoding and reverse-geocoding interface."""

    @abstractmethod
    def geocode(self, query: str) -> Optional[Dict[str, Any]]:
        """Resolves an address/sector/landmark string to lat/lng coordinates."""
        pass

    @abstractmethod
    def reverse_geocode(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """Resolves lat/lng to sector, nearest road, and city area."""
        pass
