import math
import networkx as nx
from typing import List, Dict, Any, Tuple, Optional
from app.cctv.providers.base import BaseRoutingProvider
from app.cctv.providers.chandigarh_geocoder import haversine_distance_meters

# Key Intersections, Chowks, and Gateways in Chandigarh
CHANDIGARH_INTERSECTIONS = {
    # Madhya Marg Intersections
    "PGI_CHOWK": {"lat": 30.7650, "lng": 76.7750, "name": "PGI Chowk (Madhya Marg West)"},
    "MATKA_CHOWK": {"lat": 30.7440, "lng": 76.7810, "name": "Matka Chowk (Madhya Marg / Jan Marg)"},
    "PRESS_CHOWK": {"lat": 30.7380, "lng": 76.7910, "name": "Press Chowk (Madhya Marg / Himalaya Marg)"},
    "TRANSPORT_CHOWK": {"lat": 30.7190, "lng": 76.8150, "name": "Transport Chowk (Madhya Marg / Purv Marg)"},
    "HOUSING_BOARD_CHOWK": {"lat": 30.7150, "lng": 76.8500, "name": "Housing Board Chowk (Panchkula Gateway)"},

    # Dakshin Marg Intersections
    "CRICKET_CHOWK": {"lat": 30.7390, "lng": 76.7620, "name": "Cricket Stadium Chowk (Jan Marg / Udyog Path)"},
    "AROMA_CHOWK": {"lat": 30.7320, "lng": 76.7720, "name": "Aroma Chowk (Himalaya Marg / Sec 21/22)"},
    "PICCADILY_CHOWK": {"lat": 30.7290, "lng": 76.7620, "name": "Piccadily Chowk (Himalaya Marg / Sec 22/35)"},
    "KISAN_BHAWAN_CHOWK": {"lat": 30.7250, "lng": 76.7690, "name": "Kisan Bhawan Chowk (Dakshin Marg / Jan Marg)"},
    "SEC34_35_LIGHTS": {"lat": 30.7230, "lng": 76.7650, "name": "Sector 34/35 Dividing Light Point"},
    "SEC34_SUB_CITY": {"lat": 30.7225, "lng": 76.7682, "name": "Sector 34 Sub-City Centre Central Cross"},
    "SEC33_34_ROTARY": {"lat": 30.7180, "lng": 76.7720, "name": "Sector 33/34 Dividing Rotary"},
    "GMCH32_CHOWK": {"lat": 30.7090, "lng": 76.7790, "name": "GMCH 32 Hospital Chowk"},
    "TRIBUNE_CHOWK": {"lat": 30.7020, "lng": 76.7920, "name": "Tribune Chowk (Dakshin Marg / Purv Marg / Zirakpur Gateway)"},

    # Jan Marg & Himalaya Marg Connectors
    "SEC17_ISBT": {"lat": 30.7400, "lng": 76.7830, "name": "ISBT 17 Terminal Gateway"},
    "SEC43_ISBT": {"lat": 30.7180, "lng": 76.7520, "name": "ISBT 43 / District Courts Gateway"},
    "MOHALI_BORDER_SEC43": {"lat": 30.7100, "lng": 76.7420, "name": "Mohali Phase 7 / Sector 43 Border"},

    # Vikas Marg Intersections (Southern Sector Arterial)
    "SEC46_47_CHOWK": {"lat": 30.6920, "lng": 76.7800, "name": "Sector 46/47 Vikas Marg Chowk"},
    "SEC47_48_CHOWK": {"lat": 30.6840, "lng": 76.7750, "name": "Sector 47/48 Motor Market Intersection"},
    "HALLO_MAJRA_CHOWK": {"lat": 30.6900, "lng": 76.8120, "name": "Hallo Majra Chowk (Airport Road Gateway)"},

    # Eastern Belt (Industrial Area / Manimajra)
    "ELANTE_MALL_JUNCTION": {"lat": 30.7060, "lng": 76.8020, "name": "Elante Mall Industrial Area Phase 1 Crossing"},
    "FUN_REPUBLIC_JUNCTION": {"lat": 30.7260, "lng": 76.8420, "name": "Fun Republic Junction (Old Ropar Road Manimajra)"},
    "MANIMAJRA_PS_CHOWK": {"lat": 30.7240, "lng": 76.8460, "name": "Police Station Chowk Manimajra"}
}

# Bidirectional Road Segments forming Chandigarh's Arterial Grid
CHANDIGARH_ROAD_SEGMENTS = [
    ("MATKA_CHOWK", "PRESS_CHOWK", "Madhya Marg", 45),
    ("PRESS_CHOWK", "TRANSPORT_CHOWK", "Madhya Marg", 45),
    ("TRANSPORT_CHOWK", "HOUSING_BOARD_CHOWK", "Madhya Marg Extension", 50),
    ("HOUSING_BOARD_CHOWK", "FUN_REPUBLIC_JUNCTION", "Old Ropar Road", 35),
    ("FUN_REPUBLIC_JUNCTION", "MANIMAJRA_PS_CHOWK", "Old Ropar Road Corridor", 30),

    ("MATKA_CHOWK", "CRICKET_CHOWK", "Jan Marg North", 40),
    ("CRICKET_CHOWK", "KISAN_BHAWAN_CHOWK", "Jan Marg Central", 40),
    ("KISAN_BHAWAN_CHOWK", "SEC43_ISBT", "Jan Marg South", 40),
    ("SEC43_ISBT", "MOHALI_BORDER_SEC43", "Himalaya Marg Extension", 45),

    ("PRESS_CHOWK", "AROMA_CHOWK", "Himalaya Marg North", 40),
    ("AROMA_CHOWK", "PICCADILY_CHOWK", "Himalaya Marg Central", 40),
    ("PICCADILY_CHOWK", "SEC34_35_LIGHTS", "Sub-City Arterial Road", 35),
    ("SEC34_35_LIGHTS", "SEC34_SUB_CITY", "Sector 34 Inner Corridor", 30),
    ("SEC34_SUB_CITY", "SEC33_34_ROTARY", "Sarovar Path Link", 35),
    ("SEC33_34_ROTARY", "GMCH32_CHOWK", "Chaitanya Path", 35),

    ("KISAN_BHAWAN_CHOWK", "SEC34_35_LIGHTS", "Dakshin Marg West", 45),
    ("SEC34_35_LIGHTS", "SEC33_34_ROTARY", "Dakshin Marg Central", 45),
    ("SEC33_34_ROTARY", "GMCH32_CHOWK", "Dakshin Marg East", 45),
    ("GMCH32_CHOWK", "TRIBUNE_CHOWK", "Dakshin Marg East Expressway", 50),

    ("TRANSPORT_CHOWK", "ELANTE_MALL_JUNCTION", "Purv Marg North", 45),
    ("ELANTE_MALL_JUNCTION", "TRIBUNE_CHOWK", "Purv Marg Central", 45),
    ("TRIBUNE_CHOWK", "HALLO_MAJRA_CHOWK", "Purv Marg South / Airport Expressway", 50),

    ("SEC33_34_ROTARY", "SEC46_47_CHOWK", "Sarovar Path South", 40),
    ("SEC46_47_CHOWK", "SEC47_48_CHOWK", "Vikas Marg West", 40),
    ("SEC46_47_CHOWK", "HALLO_MAJRA_CHOWK", "Vikas Marg East", 45)
]

def build_road_graph() -> nx.Graph:
    G = nx.Graph()
    for node_id, data in CHANDIGARH_INTERSECTIONS.items():
        G.add_node(node_id, lat=data["lat"], lng=data["lng"], name=data["name"])

    for u, v, road_name, speed_kmh in CHANDIGARH_ROAD_SEGMENTS:
        u_data = CHANDIGARH_INTERSECTIONS[u]
        v_data = CHANDIGARH_INTERSECTIONS[v]
        dist_m = haversine_distance_meters(u_data["lat"], u_data["lng"], v_data["lat"], v_data["lng"])
        # Travel time in seconds: distance (m) / (speed_kmh * 1000 / 3600) + 30s roundabout delay
        speed_mps = (speed_kmh * 1000.0) / 3600.0
        time_sec = (dist_m / speed_mps) + 25.0
        G.add_edge(u, v, road_name=road_name, distance=dist_m, travel_time=time_sec, speed=speed_kmh)
    return G

ROAD_GRAPH = build_road_graph()

class ChandigarhRoutingProvider(BaseRoutingProvider):
    """
    Topological road graph routing engine for Chandigarh.
    Generates multiple plausible, diverse approach and departure route hypotheses
    with exact distances, estimated travel times, and turn-by-turn coordinate polylines.
    """

    def _find_nearest_node(self, lat: float, lng: float) -> str:
        best_node = "SEC34_SUB_CITY"
        min_d = float("inf")
        for node_id, data in CHANDIGARH_INTERSECTIONS.items():
            d = haversine_distance_meters(lat, lng, data["lat"], data["lng"])
            if d < min_d:
                min_d = d
                best_node = node_id
        return best_node

    def generate_routes(
        self,
        incident_lat: float,
        incident_lng: float,
        route_type: str = "APPROACH",
        incident_time_str: Optional[str] = "21:20"
    ) -> List[Dict[str, Any]]:
        target_node = self._find_nearest_node(incident_lat, incident_lng)
        routes = []

        # Strategic Gateway Nodes representing regional entry/exit corridors
        gateways = [
            ("TRIBUNE_CHOWK", "Zirakpur / Ambala Highway Corridor", "South-East Approach"),
            ("HOUSING_BOARD_CHOWK", "Panchkula / Kalka Highway Gateway", "North-East Approach"),
            ("MOHALI_BORDER_SEC43", "Mohali Phase 7 / Sector 70 Corridor", "South-West Approach"),
            ("TRANSPORT_CHOWK", "Eastern Arterial / Purv Marg Gateway", "East Approach"),
            ("HALLO_MAJRA_CHOWK", "Airport Road / Industrial South Gateway", "South Approach")
        ]

        route_counter = 1
        for gateway_node, gateway_title, direction_title in gateways:
            if gateway_node == target_node:
                continue

            try:
                # Find all simple paths or shortest path
                if nx.has_path(ROAD_GRAPH, gateway_node, target_node):
                    path = nx.shortest_path(ROAD_GRAPH, source=gateway_node, target=target_node, weight="travel_time")
                    
                    # For departure, reverse the path (from incident out to gateway)
                    if route_type == "DEPARTURE":
                        path = list(reversed(path))
                        origin = CHANDIGARH_INTERSECTIONS[target_node]["name"]
                        dest = gateway_title
                        direction = f"Outbound towards {direction_title.replace('Approach', 'Exit')}"
                    else:
                        origin = gateway_title
                        dest = CHANDIGARH_INTERSECTIONS[target_node]["name"]
                        direction = f"Inbound from {direction_title}"

                    total_dist_m = 0.0
                    total_time_s = 0.0
                    coordinates = []
                    waypoints = []

                    # Add origin coordinate
                    for idx, nid in enumerate(path):
                        ndata = CHANDIGARH_INTERSECTIONS[nid]
                        coordinates.append([ndata["lng"], ndata["lat"]])
                        waypoints.append({
                            "name": ndata["name"],
                            "lat": ndata["lat"],
                            "lng": ndata["lng"]
                        })
                        if idx > 0:
                            prev_nid = path[idx - 1]
                            edge_data = ROAD_GRAPH[prev_nid][nid]
                            total_dist_m += edge_data["distance"]
                            total_time_s += edge_data["travel_time"]

                    # Include direct offset from target_node to the exact incident coordinates
                    offset_d = haversine_distance_meters(
                        CHANDIGARH_INTERSECTIONS[target_node]["lat"],
                        CHANDIGARH_INTERSECTIONS[target_node]["lng"],
                        incident_lat,
                        incident_lng
                    )
                    total_dist_m += offset_d
                    total_time_s += (offset_d / 8.33)  # ~30 km/h final stretch
                    
                    if route_type == "DEPARTURE":
                        coordinates.insert(0, [incident_lng, incident_lat])
                    else:
                        coordinates.append([incident_lng, incident_lat])

                    dist_km = round(total_dist_m / 1000.0, 2)
                    min_time = max(3, int(total_time_s // 60))
                    max_time = min_time + max(2, int(min_time * 0.35))
                    travel_time_min_str = f"{min_time}-{max_time} min"

                    # Primary arterial road used
                    primary_road = "Dakshin Marg / Jan Marg"
                    if len(path) >= 2:
                        primary_road = ROAD_GRAPH[path[0]][path[1]]["road_name"]

                    routes.append({
                        "route_id": f"ROUTE-{route_type[:3]}-{route_counter}",
                        "route_name": f"Possible {route_type.title()} Route {route_counter}",
                        "route_type": route_type,
                        "origin_area": origin,
                        "destination": dest,
                        "direction": direction,
                        "distance_km": dist_km,
                        "distance_meters": round(total_dist_m, 1),
                        "estimated_travel_time_min": travel_time_min_str,
                        "estimated_travel_time_seconds": int(total_time_s),
                        "primary_road": primary_road,
                        "route_geometry": {
                            "type": "LineString",
                            "coordinates": coordinates
                        },
                        "waypoints": waypoints,
                        "why_relevant": (
                            f"✓ Direct arterial road connection via {primary_road}\n"
                            f"✓ Connects major gateway ({origin.split('(')[0].strip()}) to incident sector\n"
                            f"✓ High-velocity 4-lane corridor with regular traffic flow"
                        ),
                        "relevance_score": round(max(0.65, 0.95 - (route_counter * 0.08)), 2)
                    })
                    route_counter += 1
                    if len(routes) >= 3:
                        break
            except Exception:
                continue

        return routes

chandigarh_routing_provider = ChandigarhRoutingProvider()
