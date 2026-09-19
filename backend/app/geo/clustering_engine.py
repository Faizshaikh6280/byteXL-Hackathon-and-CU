import math
import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict

from app.geo.schemas import (
    GeoCanonicalEvent, CommonPlace, ActivityDensityCell, GeoLocationType
)
from app.geo.movement_engine import haversine_distance_km

logger = logging.getLogger("investigation.geo.clustering_engine")

class ClusteringEngine:
    """
    Geospatial Clustering and Common Place Engine.
    Discovers frequent visitation hubs, multi-party shared locations,
    and aggregates spatial activity density for high-performance visualization.
    """

    def __init__(
        self,
        cluster_radius_km: float = 0.30,   # 300 meters cluster radius
        grid_bin_size_deg: float = 0.005   # ~500 meters grid bin
    ):
        self.cluster_radius_km = cluster_radius_km
        self.grid_bin_size_deg = grid_bin_size_deg

    def extract_common_places(
        self,
        events: List[GeoCanonicalEvent],
        case_id: str
    ) -> List[CommonPlace]:
        """
        Clusters waypoints into distinct spatial hubs and ranks by recurring visitation and multi-entity overlap.
        """
        if not events:
            return []

        # Filter to physical locations (GPS, Cell Tower, ATM, Merchant, Social)
        physical_events = [e for e in events if e.location_type != GeoLocationType.IP_GEOLOCATION and e.latitude and e.longitude]
        if not physical_events:
            physical_events = [e for e in events if e.latitude and e.longitude]

        clusters: List[Dict[str, Any]] = []
        tower_to_cluster: Dict[str, Dict[str, Any]] = {}
        grid_to_clusters: Dict[Tuple[int, int], List[Dict[str, Any]]] = defaultdict(list)

        grid_step = 0.005 # ~500m

        for ev in physical_events:
            matched_cluster = None

            # Fast Tower lookup
            if ev.cell_tower_id and ev.cell_tower_id in tower_to_cluster:
                matched_cluster = tower_to_cluster[ev.cell_tower_id]
            else:
                # Fast spatial neighborhood grid lookup
                gx = int(ev.latitude / grid_step)
                gy = int(ev.longitude / grid_step)
                cand_clusters = []
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        cand_clusters.extend(grid_to_clusters.get((gx + dx, gy + dy), []))

                for c in cand_clusters:
                    dist = haversine_distance_km(ev.latitude, ev.longitude, c["lat"], c["lng"])
                    if dist <= self.cluster_radius_km:
                        matched_cluster = c
                        break

            if matched_cluster:
                matched_cluster["events"].append(ev)
                matched_cluster["entity_counts"][ev.entity_name or ev.entity_id] += 1
                matched_cluster["domains"][ev.domain] += 1
            else:
                new_c = {
                    "lat": ev.latitude,
                    "lng": ev.longitude,
                    "name": ev.location_name or f"Sector Hub ({ev.latitude:.3f}, {ev.longitude:.3f})",
                    "cell_tower_id": ev.cell_tower_id,
                    "location_type": ev.location_type,
                    "events": [ev],
                    "entity_counts": defaultdict(int, {ev.entity_name or ev.entity_id: 1}),
                    "domains": defaultdict(int, {ev.domain: 1})
                }
                clusters.append(new_c)
                if ev.cell_tower_id:
                    tower_to_cluster[ev.cell_tower_id] = new_c
                gx = int(ev.latitude / grid_step)
                gy = int(ev.longitude / grid_step)
                grid_to_clusters[(gx, gy)].append(new_c)

        common_places: List[CommonPlace] = []
        for idx, c in enumerate(clusters):
            ev_list = c["events"]
            total_visits = len(ev_list)
            unique_ents = list(c["entity_counts"].keys())
            
            # Determine dominant domain
            dominant_domain = max(c["domains"].items(), key=lambda x: x[1])[0] if c["domains"] else "LOCATION"
            
            # Find time spans
            ts_sorted = sorted([e.timestamp for e in ev_list])
            time_spans = [ts_sorted[0], ts_sorted[-1]] if ts_sorted else []

            place = CommonPlace(
                place_id=f"HUB-{case_id}-{idx+1:03d}",
                place_name=c["name"],
                latitude=round(c["lat"], 6),
                longitude=round(c["lng"], 6),
                location_type=c["location_type"] if isinstance(c["location_type"], GeoLocationType) else GeoLocationType.UNKNOWN,
                radius_meters=round(self.cluster_radius_km * 1000.0, 1),
                total_visits=total_visits,
                unique_entities=unique_ents,
                unique_entity_count=len(unique_ents),
                entity_visit_counts=dict(c["entity_counts"]),
                time_spans=time_spans,
                dominant_domain=dominant_domain
            )
            common_places.append(place)

        # Rank by multi-entity overlap first, then total visits
        common_places.sort(key=lambda x: (x.unique_entity_count, x.total_visits), reverse=True)
        logger.info(f"[ClusteringEngine] Discovered {len(common_places)} common place hubs for case {case_id}")
        return common_places

    def compute_density_grid(
        self,
        events: List[GeoCanonicalEvent]
    ) -> List[ActivityDensityCell]:
        """
        Computes a 2D spatial density grid suitable for heatmap and spatial concentration views.
        """
        grid_bins: Dict[Tuple[int, int], List[GeoCanonicalEvent]] = defaultdict(list)

        for ev in events:
            if not ev.latitude or not ev.longitude:
                continue
            lat_bin = int(ev.latitude / self.grid_bin_size_deg)
            lng_bin = int(ev.longitude / self.grid_bin_size_deg)
            grid_bins[(lat_bin, lng_bin)].append(ev)

        cells: List[ActivityDensityCell] = []
        for (lat_bin, lng_bin), ev_list in grid_bins.items():
            cell_lat = round((lat_bin + 0.5) * self.grid_bin_size_deg, 6)
            cell_lng = round((lng_bin + 0.5) * self.grid_bin_size_deg, 6)
            
            entities = set(e.entity_id for e in ev_list if e.entity_id)
            domain_counts: Dict[str, int] = defaultdict(int)
            for e in ev_list:
                domain_counts[e.domain] += 1

            cells.append(ActivityDensityCell(
                cell_id=f"CELL-{lat_bin}-{lng_bin}",
                latitude=cell_lat,
                longitude=cell_lng,
                event_count=len(ev_list),
                entity_count=len(entities),
                domains=dict(domain_counts)
            ))

        cells.sort(key=lambda x: x.event_count, reverse=True)
        return cells

clustering_engine = ClusteringEngine()
