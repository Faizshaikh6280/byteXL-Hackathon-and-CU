from typing import Dict, Any, List, Optional

try:
    import networkx as nx
except ImportError:
    nx = None

from neo4j import GraphDatabase
from app.core.config import settings
from app.core.neo4j_client import neo4j_client
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class NetworkGraphAnomalyEngine(BaseDetector):
    """
    Engine #4: Network & Hidden Anomaly Engine.
    Executes graph structural intelligence: Betweenness Centrality (cut-outs/bridges),
    PageRank, Degree, Community Detection (Louvain), and structural topology analysis.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-GRAPH-NETWORK",
            name="Network Topology & Hidden Cut-out Detector",
            version="v2.0.0",
            detector_type=DetectorType.NETWORK,
            domain="CROSS_DOMAIN",
            applicable_domains=["TELECOM", "BANKING", "NETWORK", "SOCIAL", "CROSS_DOMAIN"],
            required_fields=[],
            min_sample_size=3,
            description="Analyzes graph structure to identify cut-out bridges, hubs, and hidden communities."
        )

    def _extract_case_graph(self, context=None):
        """Projects Neo4j nodes and edges into an in-memory NetworkX graph for topology analysis."""
        if nx is None:
            return None
        if context and context.get("_gds_nx_graph"):
            return context["_gds_nx_graph"]
        G = nx.Graph()
        if not neo4j_client.ensure_connected():
            return G

        with neo4j_client.driver.session() as session:
            # Query all nodes and relationships
            result = session.run("""
                MATCH (n)
                OPTIONAL MATCH (n)-[r]->(m)
                RETURN 
                    coalesce(n.golden_id, n.number, n.account_number, n.handle, n.address, elementId(n)) AS src_id,
                    labels(n)[0] AS src_type,
                    coalesce(m.golden_id, m.number, m.account_number, m.handle, m.address, elementId(m)) AS tgt_id,
                    labels(m)[0] AS tgt_type,
                    type(r) AS rel_type
            """)
            for row in result:
                src = row["src_id"]
                if src:
                    G.add_node(src, type=row["src_type"])
                tgt = row["tgt_id"]
                if tgt and src != tgt:
                    G.add_node(tgt, type=row["tgt_type"])
                    G.add_edge(src, tgt, relation=row["rel_type"])
        return G

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()

        if nx is None:
            # Resilient native Cypher query when NetworkX is not installed
            if not neo4j_client.ensure_connected():
                return DetectorExecutionResult(
                    detector_id=meta.detector_id,
                    detector_type=meta.detector_type,
                    status=DetectorStatus.NOT_APPLICABLE,
                    entity_id=entity_id,
                    case_id=case_id,
                    domain=meta.domain,
                    not_applicable_reason="Neo4j connection unavailable."
                )
            with neo4j_client.driver.session() as session:
                res = session.run("""
                    MATCH (n) WHERE coalesce(n.golden_id, n.number, n.account_number, n.handle, n.address, elementId(n)) = $entity_id
                    OPTIONAL MATCH (n)-[r]-()
                    WITH n, count(r) AS degree
                    OPTIONAL MATCH (n)-->(a)-->(b)-->(n)
                    RETURN degree, count(a) AS triangles
                """, {"entity_id": entity_id}).single()
                if not res:
                    return DetectorExecutionResult(
                        detector_id=meta.detector_id,
                        detector_type=meta.detector_type,
                        status=DetectorStatus.NORMAL,
                        entity_id=entity_id,
                        case_id=case_id,
                        domain=meta.domain
                    )
                deg = int(res["degree"] or 0)
                tri = int(res["triangles"] or 0)
                score = min(100.0, (deg * 15.0) + (tri * 10.0))
                is_flagged = bool(deg >= 3)
                signals = [f"High structural connectivity: Degree {deg}, local cluster triangles {tri}."] if is_flagged else []
                return DetectorExecutionResult(
                    detector_id=meta.detector_id,
                    detector_version=meta.version,
                    detector_type=meta.detector_type,
                    status=DetectorStatus.FLAGGED if is_flagged else DetectorStatus.NORMAL,
                    entity_id=entity_id,
                    case_id=case_id,
                    domain=meta.domain,
                    raw_score=float(deg),
                    normalized_score=round(score, 1),
                    confidence=0.88,
                    title="Graph Structural Anomaly (Native Cypher)",
                    signals=signals,
                    features={"degree": deg, "triangles": tri},
                    explanation=f"Native Cypher graph analysis identified degree {deg} connectivity.",
                    graph_refs=[entity_id]
                )

        G = context.get("graph_nx")
        if G is None or len(G) < meta.min_sample_size:
            G = self._extract_case_graph(context)
            context["graph_nx"] = G

        if G is None or len(G) < meta.min_sample_size or entity_id not in G:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Node not present in current graph topology projection."
            )

        # 1. Compute Centrality Metrics
        degree = G.degree(entity_id)
        
        # Cache or compute betweenness
        if "betweenness" not in context:
            context["betweenness"] = nx.betweenness_centrality(G)
        betweenness = context["betweenness"].get(entity_id, 0.0)

        # Cache or compute PageRank
        if "pagerank" not in context:
            try:
                context["pagerank"] = nx.pagerank(G, max_iter=100)
            except Exception:
                context["pagerank"] = {}
        pagerank = context["pagerank"].get(entity_id, 0.0)

        # 2. Community Detection (Louvain)
        if "communities" not in context:
            try:
                communities = list(nx.community.louvain_communities(G))
                node_comm = {}
                for c_idx, comm in enumerate(communities):
                    for node in comm:
                        node_comm[node] = c_idx
                context["communities"] = node_comm
            except Exception:
                context["communities"] = {}

        comm_id = context["communities"].get(entity_id, -1)

        # 3. Detect Bridge / Cut-out Role
        all_betweenness = list(context["betweenness"].values())
        max_betweenness = max(all_betweenness) if all_betweenness else 0.0
        p90_betweenness = float(sorted(all_betweenness)[int(len(all_betweenness)*0.80)]) if all_betweenness else 0.0

        signals = []
        is_bridge = bool(betweenness >= 0.15 and len(G.nodes) >= 3 and (betweenness >= p90_betweenness or betweenness == max_betweenness))
        is_hub = bool(degree >= 3 and len(G.nodes) >= 3 and degree >= max(2, int(len(G.nodes) * 0.25)))

        score = 0.0
        if is_bridge:
            score += 50.0
            signals.append(f"Network Cut-Out Bridge: Entity has elevated Betweenness Centrality ({round(betweenness, 3)}), mediating traffic between isolated subgraphs.")
        if is_hub:
            score += 35.0
            signals.append(f"High-Degree Hub: Direct operational links to {degree} separate entities/accounts/devices in graph.")
        if pagerank > 0.05:
            score += 15.0
            signals.append(f"High Structural Influence: PageRank score of {round(pagerank, 4)}.")

        total_score = min(100.0, score)
        is_flagged = total_score >= 50.0

        features = {
            "degree": degree,
            "betweenness_centrality": round(betweenness, 4),
            "pagerank": round(pagerank, 4),
            "community_id": comm_id,
            "neighbors_count": len(list(G.neighbors(entity_id)))
        }

        explanation = (
            f"Graph structural anomaly (Score: {round(total_score, 1)}/100). " + " ".join(signals)
            if is_flagged else "Entity exhibits normal peripheral network connectivity."
        )

        ev_refs = entity_data.get("evidence_ids") or [f"NEO4J-EVIDENCE-{entity_id}"]
        ev_ids = entity_data.get("event_ids", [])[:10] or [f"NEO4J-TOPOLOGY-{entity_id}"]

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED if is_flagged else DetectorStatus.NORMAL,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=round(betweenness, 4),
            normalized_score=round(total_score, 1),
            confidence=0.90,
            title="Graph Cut-Out / Bridge Node Anomaly",
            signals=signals,
            features=features,
            explanation=explanation,
            evidence_refs=ev_refs,
            canonical_event_refs=ev_ids,
            graph_refs=[entity_id]
        )
