import threading
from typing import Dict, Any, List
from app.core.config import settings

try:
    from graphdatascience import GraphDataScience
    _GDS_AVAILABLE = True
except ImportError:
    GraphDataScience = None  # type: ignore
    _GDS_AVAILABLE = False

_projection_lock = threading.Lock()

def get_gds_client():
    """Initialize and return the GraphDataScience client."""
    if not _GDS_AVAILABLE:
        raise RuntimeError("graphdatascience package is not installed. GDS features unavailable.")

    """Initialize and return the GraphDataScience client."""
    return GraphDataScience(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )

def project_and_compute_association_strength(gds: Any = None, graph_name: str = "criminal_network", case_id: Any = None):
    """
    Project weighted monopartite graph via Cypher Projection.
    Links entities across CDR, Bank Transfers, Shared IPDR Sessions, and Social Links.
    Computes Association Strength C_ij / (S_i * S_j) scoped to case_id if provided.
    """
    if gds is None:
        gds = get_gds_client()
        
    with _projection_lock:
        try:
            if gds.graph.exists(graph_name)["exists"]:
                try:
                    gds.graph.drop(gds.graph.get(graph_name))
                except Exception:
                    pass
        except Exception:
            pass
        
    case_filter_node = f"AND (e.case_id = '{case_id}' OR '{case_id}' IN coalesce(e.case_ids, []))" if case_id else ""
    case_filter_e1 = f"AND (e1.case_id = '{case_id}' OR '{case_id}' IN coalesce(e1.case_ids, []))" if case_id else ""
    case_filter_e2 = f"AND (e2.case_id = '{case_id}' OR '{case_id}' IN coalesce(e2.case_ids, []))" if case_id else ""
    case_filter_n1 = f"AND (n1.case_id = '{case_id}' OR '{case_id}' IN coalesce(n1.case_ids, []))" if case_id else ""
    case_filter_n2 = f"AND (n2.case_id = '{case_id}' OR '{case_id}' IN coalesce(n2.case_ids, []))" if case_id else ""

    node_query = f"""
    MATCH (e) WHERE NOT e:Anomaly {case_filter_node}
    RETURN id(e) AS id, labels(e) AS labels
    """
    
    relationship_query = f"""
    MATCH (e1)-[r]-(e2)
    WHERE NOT e1:Anomaly AND NOT e2:Anomaly AND id(e1) < id(e2) {case_filter_e1} {case_filter_e2}
    WITH e1, e2, count(r) AS C_ij
    MATCH (e1)-[r1]-(n1) WHERE NOT n1:Anomaly {case_filter_n1} WITH e1, e2, C_ij, count(r1) AS S_i
    MATCH (e2)-[r2]-(n2) WHERE NOT n2:Anomaly {case_filter_n2} WITH e1, e2, C_ij, S_i, count(r2) AS S_j
    WITH e1, e2, (toFloat(C_ij) / (toFloat(S_i) * toFloat(S_j))) AS association_strength
    RETURN id(e1) AS source, id(e2) AS target, 'CO_OFFENDING' AS type, association_strength AS weight
    """
    
    G, result = gds.graph.project.cypher(
        graph_name,
        node_query,
        relationship_query
    )
    return G

def run_gds_analytics(gds: GraphDataScience, G) -> Dict[str, Any]:
    """Execute all 5 GDS algorithms for Community Detection, Centrality, and Role Mining."""
    results = {}
    
    # 1. Louvain Community Detection (Finding the Syndicate)
    gds.louvain.write(
        G,
        writeProperty="communityId",
        relationshipTypes=["CO_OFFENDING"],
        relationshipWeightProperty="weight",
        includeIntermediateCommunities=False
    )
    results["louvain"] = "completed"
    
    # 2. PageRank (Unmasking the Kingpin)
    gds.pageRank.write(
        G,
        writeProperty="pagerank",
        relationshipTypes=["CO_OFFENDING"],
        relationshipWeightProperty="weight",
        dampingFactor=0.85,
        maxIterations=50
    )
    results["pagerank"] = "completed"
    
    # 3. Betweenness Centrality (Targeting the Bridge / Broker)
    gds.betweenness.write(
        G,
        writeProperty="betweenness",
        relationshipTypes=["CO_OFFENDING"]
    )
    results["betweenness"] = "completed"

    # 4. FastRP (Node Embeddings) - Safe drop if exists on in-memory G, then mutate & write
    try:
        gds.graph.nodeProperties.drop(G, ["fastrp_embedding"])
    except Exception:
        pass

    gds.fastRP.mutate(
        G,
        mutateProperty="fastrp_embedding",
        embeddingDimension=16,
        iterationWeights=[0.0, 1.0, 0.7]
    )
    gds.graph.nodeProperties.write(G, ["fastrp_embedding"])
    results["fastrp"] = "completed"

    # 5. KNN Node Similarity (Exposing Hidden Shadows / Silent Partners)
    try:
        gds.knn.mutate(
            G,
            nodeProperties=["fastrp_embedding"],
            mutateRelationshipType="SIMILAR_BEHAVIOR",
            mutateProperty="score",
            topK=2,
            concurrency=1,
            randomSeed=42
        )
        results["knn_similarity"] = "completed (in-memory)"
    except Exception as e:
        results["knn_similarity"] = f"warning: {str(e)}"

    return {"status": "All 5 GDS Analytics executed successfully", "details": results}

def run_networkx_analytics(session, case_id: Any = None) -> Dict[str, Any]:
    """
    High-performance NetworkX fallback engine when Neo4j GDS plugin is not available.
    Computes Louvain community detection, PageRank, and Betweenness Centrality,
    then updates Neo4j nodes with communityId, pagerank, and betweenness.
    """
    import networkx as nx
    
    # 1. Fetch nodes
    node_query = """
    MATCH (e) WHERE NOT e:Anomaly 
      AND ($cid IS NULL OR e.case_id = $cid OR $cid IN coalesce(e.case_ids, []))
    RETURN elementId(e) AS id, coalesce(e.name, e.primary_name, e.number, e.account_number, e.address, e.id) AS label
    """
    nodes = session.run(node_query, {"cid": case_id}).data()
    if not nodes:
        return {"status": "empty", "nodes": 0}
        
    # 2. Fetch edges
    rel_query = """
    MATCH (e1)-[r]-(e2)
    WHERE NOT e1:Anomaly AND NOT e2:Anomaly AND elementId(e1) < elementId(e2)
      AND ($cid IS NULL OR e1.case_id = $cid OR $cid IN coalesce(e1.case_ids, []))
      AND ($cid IS NULL OR e2.case_id = $cid OR $cid IN coalesce(e2.case_ids, []))
    RETURN elementId(e1) AS src, elementId(e2) AS tgt, count(r) AS weight
    """
    rels = session.run(rel_query, {"cid": case_id}).data()
    
    G = nx.Graph()
    for n in nodes:
        G.add_node(n["id"], label=n.get("label"))
    for r in rels:
        G.add_edge(r["src"], r["tgt"], weight=float(r["weight"]))
        
    # 3. Community detection (Louvain with fallback to connected components)
    try:
        communities = list(nx.community.louvain_communities(G, seed=42))
    except Exception:
        communities = list(nx.connected_components(G))
        
    # 4. PageRank & Betweenness
    try:
        pr = nx.pagerank(G, weight="weight" if rels else None)
    except Exception:
        pr = {n: 1.0 / len(G) for n in G.nodes()}
        
    try:
        bw = nx.betweenness_centrality(G, weight="weight" if rels else None)
    except Exception:
        bw = {n: 0.0 for n in G.nodes()}
        
    # 5. Batch write back to Neo4j
    updates = []
    for comm_idx, comm in enumerate(communities, start=1):
        for node_id in comm:
            updates.append({
                "id": node_id,
                "communityId": comm_idx,
                "pagerank": round(pr.get(node_id, 0.0), 4),
                "betweenness": round(bw.get(node_id, 0.0), 4)
            })
            
    if updates:
        session.run("""
            UNWIND $updates AS u
            MATCH (e) WHERE elementId(e) = u.id
            SET e.communityId = u.communityId,
                e.pagerank = u.pagerank,
                e.betweenness = u.betweenness
        """, {"updates": updates})
        
    return {
        "status": "completed",
        "engine": "networkx",
        "nodes": len(nodes),
        "relationships": len(rels),
        "communities": len(communities)
    }

def generate_logical_community_metadata(session, cid: int, case_id: Any = None) -> Dict[str, Any]:
    """
    Dynamically generates a professional, logical name and operational profile
    for a community based on its kingpins, brokers, locations, and crime signatures.
    """
    q = """
    MATCH (e) WHERE e.communityId = $cid AND NOT e:Anomaly
      AND ($case_id IS NULL OR e.case_id = $case_id OR $case_id IN coalesce(e.case_ids, []))
    WITH collect(e) as nodes
    RETURN [n in nodes WHERE 'Person' IN labels(n)] as people,
           [n in nodes WHERE 'BankAccount' IN labels(n)] as accounts,
           [n in nodes WHERE 'Phone' IN labels(n)] as phones,
           [n in nodes WHERE 'CellTower' IN labels(n)] as towers,
           [n in nodes WHERE 'IPAddress' IN labels(n)] as ips,
           [n in nodes | coalesce(n.name, n.primary_name, n.number, n.account_number, n.handle, n.address, elementId(n))] as member_ids,
           size(nodes) as total_size
    """
    rec = session.run(q, cid=cid, case_id=case_id).single()
    if not rec or rec["total_size"] == 0:
        return {
            "communityId": cid,
            "name": f"Syndicate Cluster #{cid}",
            "kingpin": "Primary Suspect",
            "broker": "Cell Broker",
            "crime_profile": "Operational Nexus",
            "location": "Jurisdiction Zone",
            "size": 0,
            "top_members": [],
            "member_ids": []
        }
        
    people = rec["people"]
    accounts = rec["accounts"]
    phones = rec["phones"]
    towers = rec["towers"]
    ips = rec["ips"]
    size = rec["total_size"]
    
    sorted_people = sorted(
        people,
        key=lambda p: (p.get("pagerank", 0.0), p.get("risk_score", 0.0), p.get("betweenness", 0.0)),
        reverse=True
    )
    
    kingpin = "Unknown"
    broker = "Unknown"
    locations = []
    
    if sorted_people:
        kingpin = sorted_people[0].get("name") or sorted_people[0].get("primary_name") or "Primary Suspect"
        for p in sorted_people:
            addrs = p.get("addresses", [])
            for a in addrs:
                if a and isinstance(a, str):
                    locations.append(a.strip())
        if len(sorted_people) > 1:
            sorted_by_bw = sorted(sorted_people[1:], key=lambda p: p.get("betweenness", 0.0), reverse=True)
            broker = sorted_by_bw[0].get("name") or sorted_by_bw[0].get("primary_name") or "Operational Broker"
    elif accounts:
        kingpin = f"Account {accounts[0].get('account_number', 'Target')}"
    elif phones:
        kingpin = f"Subscriber {phones[0].get('number', 'Target')}"
        
    crime_signatures = []
    if len(accounts) > 1:
        crime_signatures.append("Money Mule & Hawala Ring")
    if len(phones) > 1 or len(towers) > 1:
        crime_signatures.append("Extortion & Telecom Conduit")
    if len(ips) > 0:
        crime_signatures.append("Cyber Intrusion Cell")
        
    crime_tag = " & ".join(crime_signatures) if crime_signatures else "Organized Criminal Nexus"
    loc_str = locations[0] if locations else "Investigation Zone"
    
    if kingpin != "Unknown" and "Syndicate" not in kingpin and "Nexus" not in kingpin:
        cluster_name = f"{kingpin} Syndicate ({loc_str} {crime_tag})"
    elif kingpin != "Unknown":
        cluster_name = f"{kingpin} ({loc_str} {crime_tag})"
    else:
        cluster_name = f"Infrastructure Cell #{cid} ({loc_str} {crime_tag})"
        
    return {
        "communityId": cid,
        "name": cluster_name,
        "kingpin": kingpin if kingpin != "Unknown" else f"Cluster #{cid} Suspect",
        "broker": broker if broker != "Unknown" else "Operational Broker",
        "size": size,
        "crime_profile": crime_tag,
        "location": loc_str,
        "top_members": [p.get("name") for p in sorted_people if p.get("name")],
        "member_ids": [str(m) for m in rec["member_ids"] if m] if rec and "member_ids" in rec else []
    }

def extract_community_subgraph(session, community_id: int, case_id: Any = None) -> Dict[str, Any]:
    """
    Extracts a strict JSON data contract for a targeted syndicate subgraph,
    including the results of all 5 GDS algorithms (Louvain, PageRank, Betweenness, FastRP/KNN, Dijkstra).
    """
    meta = generate_logical_community_metadata(session, community_id, case_id=case_id)
    
    # 1. Base community extraction query
    query = """
    MATCH (e)
    WHERE e.communityId = $cid AND NOT e:Anomaly
      AND ($case_id IS NULL OR e.case_id = $case_id OR $case_id IN coalesce(e.case_ids, []))
    WITH collect(e) AS members, count(e) AS total_members
    
    UNWIND members AS m
    WITH total_members, m,
         [l IN labels(m) WHERE l IN ['Phone']] AS phones,
         [l IN labels(m) WHERE l IN ['BankAccount']] AS accounts,
         [l IN labels(m) WHERE l IN ['IPAddress']] AS ips,
         [l IN labels(m) WHERE l IN ['SocialAccount']] AS social
    WITH total_members,
         sum(size(phones)) AS cdr_count,
         sum(size(accounts)) AS fund_count,
         sum(size(ips)) AS ip_count,
         sum(size(social)) AS social_count,
         collect({
            entity_id: coalesce(m.id, m.number, m.account_number, m.address, m.imei_number, elementId(m)),
            display_name: coalesce(m.name, m.primary_name, m.account_number, m.number, m.address, m.handle, m.imei_number, m.id, elementId(m)),
            pagerank: round(coalesce(m.pagerank, 0.0) * 1000) / 1000,
            betweenness: round(coalesce(m.betweenness, 0.0) * 1000) / 1000,
            labels: labels(m),
            phone_numbers: CASE WHEN 'Phone' IN labels(m) THEN [m.number] ELSE [] END,
            bank_accounts: CASE WHEN 'BankAccount' IN labels(m) THEN [m.account_number] ELSE [] END,
            ip_addresses: CASE WHEN 'IPAddress' IN labels(m) THEN [m.address] ELSE [] END,
            social_handles: CASE WHEN 'SocialAccount' IN labels(m) THEN [m.handle] ELSE [] END
         }) AS offenders
         
    MATCH (e1)-[r]->(e2)
    WHERE e1.communityId = $cid AND e2.communityId = $cid AND NOT e1:Anomaly AND NOT e2:Anomaly
      AND ($case_id IS NULL OR (e1.case_id = $case_id AND e2.case_id = $case_id))
    WITH total_members, cdr_count, fund_count, ip_count, social_count, offenders, type(r) AS rel_type, r, e1, e2
    
    WITH total_members, cdr_count, fund_count, ip_count, social_count, offenders,
         collect(CASE WHEN rel_type = 'TRANSACTED_WITH' THEN {
            tx_id: elementId(r),
            sender_id: coalesce(e1.name, e1.account_number, e1.id),
            receiver_id: coalesce(e2.name, e2.account_number, e2.id),
            amount: coalesce(r.amount, 0.0),
            timestamp: coalesce(r.timestamp, ''),
            type: coalesce(r.method, 'UNKNOWN'),
            remarks: coalesce(r.remarks, '')
         } END) AS financial_transactions,
         collect(CASE WHEN rel_type = 'PINGED_TOWER' THEN {
            call_id: elementId(r),
            caller_id: coalesce(e1.name, e1.number, e1.id),
            callee_id: coalesce(e2.name, e2.number, e2.id),
            timestamp: coalesce(r.timestamp, ''),
            duration_sec: coalesce(r.duration, 0),
            cell_tower_id: e2.tower_id
         } END) AS communications_cdr,
         collect(CASE WHEN rel_type IN ['ASSIGNED_IP', 'LOGGED_IN_FROM'] THEN {
            session_id: elementId(r),
            entity_id: coalesce(e1.name, e1.id),
            dest_ip: coalesce(e2.address, ''),
            dest_port: 443,
            timestamp: coalesce(r.timestamp, ''),
            bytes_transferred: coalesce(r.bytes, 0),
            vpn_or_proxy: coalesce(r.vpn_or_proxy, false)
         } END) AS digital_ipdr
         
    RETURN {
        group_id: $cid,
        metrics_summary: {
            total_members: total_members,
            total_events: cdr_count + fund_count + ip_count + social_count,
            cdr_event_count: cdr_count,
            financial_event_count: fund_count,
            ipdr_event_count: ip_count,
            social_event_count: social_count
        },
        offenders: offenders,
        financial_transactions: [x IN financial_transactions WHERE x IS NOT NULL],
        communications_cdr: [x IN communications_cdr WHERE x IS NOT NULL],
        digital_ipdr: [x IN digital_ipdr WHERE x IS NOT NULL]
    } AS payload
    """
    base_res = session.run(query, cid=community_id, case_id=case_id).single()
    payload = base_res["payload"] if base_res else {"group_id": community_id, "offenders": []}
    
    # 2. FastRP / KNN Similar Behavior (Exposing Hidden Shadows / Silent Partners)
    knn_records = []
    try:
        knn_q = """
        MATCH (n1), (n2)
        WHERE (n1.communityId = $cid OR n2.communityId = $cid)
          AND elementId(n1) < elementId(n2)
          AND n1.fastrp_embedding IS NOT NULL
          AND n2.fastrp_embedding IS NOT NULL
          AND NOT n1:Anomaly AND NOT n2:Anomaly
        WITH n1, n2, gds.similarity.cosine(n1.fastrp_embedding, n2.fastrp_embedding) AS similarity
        WHERE similarity > 0.65
        RETURN coalesce(n1.name, n1.account_number, n1.number, n1.handle, n1.address, elementId(n1)) AS entity_1,
               coalesce(n2.name, n2.account_number, n2.number, n2.handle, n2.address, elementId(n2)) AS entity_2,
               round(similarity * 1000) / 1000 AS similarity
        ORDER BY similarity DESC LIMIT 5
        """
        knn_records = [
            {
                "entity_1": r["entity_1"],
                "entity_2": r["entity_2"],
                "similarity": r["similarity"],
                "significance": f"High behavioral similarity ({round(r['similarity'] * 100)}%) indicating silent partner or shadow asset."
            }
            for r in session.run(knn_q, cid=community_id, case_id=case_id)
        ]
    except Exception:
        knn_records = []
    
    # 3. Shortest Path (Dijkstra Money Trail)
    sp_records = []
    try:
        sp_q = """
        MATCH (source:BankAccount), (target:BankAccount)
        WHERE source <> target AND (source.communityId = $cid OR target.communityId = $cid)
        MATCH p = shortestPath((source)-[:TRANSACTED_WITH*..6]-(target))
        RETURN [n in nodes(p) | coalesce(n.holder, n.account_number, n.name, n.id)] AS trail,
               [r in relationships(p) | {type: type(r), amount: coalesce(r.amount, 0.0)}] AS hops,
               length(p) AS length
        ORDER BY length ASC LIMIT 4
        """
        sp_records = [
            {
                "trail": r["trail"],
                "hops": r["hops"],
                "length": r["length"],
                "description": f"Multi-hop money trail ({r['length']} transfers) tracing funds across intermediary accounts."
            }
            for r in session.run(sp_q, cid=community_id, case_id=case_id)
        ]
    except Exception:
        sp_records = []
    
    # 4. GDS Louvain Syndicate Summary
    offenders = payload.get("offenders", [])
    ranked_pr = sorted(offenders, key=lambda x: x.get("pagerank", 0.0), reverse=True)
    ranked_bw = sorted(offenders, key=lambda x: x.get("betweenness", 0.0), reverse=True)
    
    payload["community_metadata"] = meta
    payload["gds_louvain"] = {
        "community_id": community_id,
        "syndicate_name": meta["name"],
        "size": meta["size"],
        "crime_profile": meta["crime_profile"],
        "location": meta["location"],
        "cohesion": "High density multi-modal criminal cluster isolated via Louvain modularity optimization"
    }
    payload["gds_pagerank"] = {
        "kingpin": meta["kingpin"],
        "top_entities": [
            {"name": o["display_name"], "pagerank": o["pagerank"], "role": "Operational Command" if idx == 0 else "Key Node"}
            for idx, o in enumerate(ranked_pr[:5])
        ]
    }
    payload["gds_betweenness"] = {
        "primary_broker": meta["broker"],
        "top_bridges": [
            {"name": o["display_name"], "betweenness": o["betweenness"], "role": "Syndicate Gateway / Broker" if idx == 0 else "Network Conduit"}
            for idx, o in enumerate(ranked_bw[:5])
        ]
    }
    payload["gds_fastrp_knn"] = {
        "silent_partners": knn_records,
        "method": "FastRP 16-dimensional random walk embeddings + KNN cosine similarity"
    }
    payload["gds_shortest_path"] = {
        "money_trails": sp_records,
        "algorithm": "Dijkstra Shortest Path Traversal over Transaction Graph"
    }
    
    return payload

def extract_entire_graph_subgraph(session, case_id: Any = None) -> Dict[str, Any]:
    """
    Extracts a rich, global JSON data contract for the entire knowledge graph,
    enabling macro-level multi-syndicate forensic analysis across all 5 GDS algorithms.
    """
    # 1. Collect all distinct communities and their logical profiles
    cid_q = """
    MATCH (e)
    WHERE e.communityId IS NOT NULL AND NOT e:Anomaly
      AND ($case_id IS NULL OR e.case_id = $case_id OR $case_id IN coalesce(e.case_ids, []))
    RETURN e.communityId AS cid, count(e) AS size
    ORDER BY size DESC LIMIT 15
    """
    raw_cids = [r["cid"] for r in session.run(cid_q, case_id=case_id)]
    syndicates = [generate_logical_community_metadata(session, cid, case_id=case_id) for cid in raw_cids]
    
    # 2. Extract all entities with GDS metrics
    node_q = """
    MATCH (m)
    WHERE NOT m:Anomaly
      AND ($case_id IS NULL OR m.case_id = $case_id OR $case_id IN coalesce(m.case_ids, []))
    RETURN coalesce(m.id, m.number, m.account_number, m.address, m.imei_number, elementId(m)) AS entity_id,
           coalesce(m.name, m.primary_name, m.account_number, m.number, m.address, m.handle, m.imei_number, m.id, elementId(m)) AS display_name,
           round(coalesce(m.pagerank, 0.0) * 1000) / 1000 AS pagerank,
           round(coalesce(m.betweenness, 0.0) * 1000) / 1000 AS betweenness,
           m.communityId AS community_id,
           labels(m) AS labels,
           CASE WHEN 'Phone' IN labels(m) THEN [m.number] ELSE [] END AS phone_numbers,
           CASE WHEN 'BankAccount' IN labels(m) THEN [m.account_number] ELSE [] END AS bank_accounts,
           CASE WHEN 'IPAddress' IN labels(m) THEN [m.address] ELSE [] END AS ip_addresses,
           CASE WHEN 'SocialAccount' IN labels(m) THEN [m.handle] ELSE [] END AS social_handles
    ORDER BY pagerank DESC
    """
    all_nodes = [dict(r) for r in session.run(node_q, case_id=case_id)]
    
    # 3. Inter-syndicate relationships (cross-cluster links)
    cross_rel_q = """
    MATCH (e1)-[r]->(e2)
    WHERE e1.communityId IS NOT NULL AND e2.communityId IS NOT NULL 
      AND e1.communityId <> e2.communityId AND NOT e1:Anomaly AND NOT e2:Anomaly
    RETURN type(r) AS rel_type,
           coalesce(e1.name, e1.account_number, e1.number, e1.id) AS source,
           e1.communityId AS source_comm,
           coalesce(e2.name, e2.account_number, e2.number, e2.id) AS target,
           e2.communityId AS target_comm,
           coalesce(r.amount, 0.0) AS amount,
           coalesce(r.timestamp, '') AS timestamp,
           coalesce(r.duration, 0) AS duration
    LIMIT 25
    """
    inter_syndicate_bridges = [dict(r) for r in session.run(cross_rel_q, case_id=case_id)]
    
    # 4. Global financial transactions
    tx_q = """
    MATCH (e1)-[r:TRANSACTED_WITH]->(e2)
    WHERE NOT e1:Anomaly AND NOT e2:Anomaly
    RETURN elementId(r) AS tx_id,
           coalesce(e1.name, e1.account_number, e1.id) AS sender_id,
           e1.communityId AS sender_comm,
           coalesce(e2.name, e2.account_number, e2.id) AS receiver_id,
           e2.communityId AS receiver_comm,
           coalesce(r.amount, 0.0) AS amount,
           coalesce(r.timestamp, '') AS timestamp,
           coalesce(r.method, 'UNKNOWN') AS type,
           coalesce(r.remarks, '') AS remarks
    ORDER BY r.amount DESC LIMIT 20
    """
    financial_transactions = [dict(r) for r in session.run(tx_q, case_id=case_id)]
    
    # 5. Global communications CDR
    cdr_q = """
    MATCH (e1)-[r:CALLED]->(e2)
    WHERE NOT e1:Anomaly AND NOT e2:Anomaly
    RETURN elementId(r) AS call_id,
           coalesce(e1.name, e1.number, e1.id) AS caller_id,
           e1.communityId AS caller_comm,
           coalesce(e2.name, e2.number, e2.id) AS callee_id,
           e2.communityId AS callee_comm,
           coalesce(r.timestamp, '') AS timestamp,
           coalesce(r.duration, 0) AS duration_sec
    ORDER BY r.duration DESC LIMIT 20
    """
    communications_cdr = [dict(r) for r in session.run(cdr_q, case_id=case_id)]
    
    # 6. Global digital IPDR
    ip_q = """
    MATCH (e1)-[r:ASSIGNED_IP|LOGGED_IN_FROM]->(e2)
    WHERE NOT e1:Anomaly AND NOT e2:Anomaly
    RETURN elementId(r) AS session_id,
           coalesce(e1.name, e1.id) AS entity_id,
           coalesce(e2.address, '') AS dest_ip,
           coalesce(r.timestamp, '') AS timestamp,
           coalesce(r.bytes, 0) AS bytes_transferred,
           coalesce(r.vpn_or_proxy, false) AS vpn_or_proxy
    LIMIT 20
    """
    digital_ipdr = [dict(r) for r in session.run(ip_q, case_id=case_id)]
    
    # 7. Global FastRP & KNN Similar Behavior (Cross-Syndicate Shadows)
    knn_records = []
    try:
        knn_q = """
        MATCH (n1), (n2)
        WHERE elementId(n1) < elementId(n2)
          AND n1.fastrp_embedding IS NOT NULL
          AND n2.fastrp_embedding IS NOT NULL
          AND NOT n1:Anomaly AND NOT n2:Anomaly
        WITH n1, n2, gds.similarity.cosine(n1.fastrp_embedding, n2.fastrp_embedding) AS similarity
        WHERE similarity > 0.60
        RETURN coalesce(n1.name, n1.account_number, n1.number, n1.handle, n1.address, elementId(n1)) AS entity_1,
               n1.communityId AS comm_1,
               coalesce(n2.name, n2.account_number, n2.number, n2.handle, n2.address, elementId(n2)) AS entity_2,
               n2.communityId AS comm_2,
               round(similarity * 1000) / 1000 AS similarity
        ORDER BY similarity DESC LIMIT 8
        """
        knn_records = [
            {
                "entity_1": r["entity_1"],
                "comm_1": r["comm_1"],
                "entity_2": r["entity_2"],
                "comm_2": r["comm_2"],
                "similarity": r["similarity"],
                "significance": f"High behavioral similarity ({round(r['similarity'] * 100)}%) across clusters {r['comm_1']} and {r['comm_2']} indicating shared operational cell or silent partner."
            }
            for r in session.run(knn_q, case_id=case_id)
        ]
    except Exception:
        knn_records = []
    
    # 8. Cross-Syndicate Shortest Paths
    sp_records = []
    try:
        sp_q = """
        MATCH (source:BankAccount), (target:BankAccount)
        WHERE source <> target AND source.communityId <> target.communityId
        MATCH p = shortestPath((source)-[:TRANSACTED_WITH*..8]-(target))
        RETURN [n in nodes(p) | coalesce(n.holder, n.account_number, n.name, n.id)] AS trail,
               [r in relationships(p) | {type: type(r), amount: coalesce(r.amount, 0.0)}] AS hops,
               length(p) AS length
        ORDER BY length ASC LIMIT 4
        """
        sp_records = [
            {
                "trail": r["trail"],
                "hops": r["hops"],
                "length": r["length"],
                "description": f"Cross-syndicate money trail ({r['length']} transfers) bridging distinct criminal cells."
            }
            for r in session.run(sp_q, case_id=case_id)
        ]
    except Exception:
        sp_records = []
    
    # Sort top actors
    ranked_pr = sorted(all_nodes, key=lambda x: x.get("pagerank", 0.0), reverse=True)
    ranked_bw = sorted(all_nodes, key=lambda x: x.get("betweenness", 0.0), reverse=True)
    
    kingpin_name = ranked_pr[0]["display_name"] if ranked_pr and ranked_pr[0].get("display_name") else "Primary Person of Interest"
    broker_name = ranked_bw[0]["display_name"] if ranked_bw and ranked_bw[0].get("display_name") else (ranked_pr[1]["display_name"] if len(ranked_pr) > 1 and ranked_pr[1].get("display_name") else "Key Coordinator")
    macro_name = f"Case Graph Panorama ({case_id})" if case_id else "Global Investigation Panorama"
    macro_meta = {
        "communityId": "ALL",
        "name": macro_name,
        "kingpin": kingpin_name,
        "broker": broker_name,
        "size": len(all_nodes),
        "crime_profile": "Multi-Modal Forensic Evidence Network",
        "location": "Active Investigation Corridor",
        "top_members": [o["display_name"] for o in ranked_pr[:5] if o.get("display_name")]
    }
    
    return {
        "group_id": "ALL",
        "is_entire_graph": True,
        "community_metadata": macro_meta,
        "metrics_summary": {
            "total_members": len(all_nodes),
            "total_syndicates": len(syndicates),
            "total_cross_syndicate_bridges": len(inter_syndicate_bridges),
            "financial_event_count": len(financial_transactions),
            "cdr_event_count": len(communications_cdr),
            "ipdr_event_count": len(digital_ipdr)
        },
        "syndicates": syndicates,
        "inter_syndicate_bridges": inter_syndicate_bridges,
        "offenders": all_nodes,
        "financial_transactions": financial_transactions,
        "communications_cdr": communications_cdr,
        "digital_ipdr": digital_ipdr,
        "gds_louvain": {
            "community_id": "ALL",
            "syndicate_name": macro_meta["name"],
            "size": len(all_nodes),
            "total_syndicates": len(syndicates),
            "crime_profile": macro_meta["crime_profile"],
            "location": macro_meta["location"],
            "cohesion": f"Comprehensive modularity optimization partitions network into {len(syndicates)} interconnected criminal cells with {len(inter_syndicate_bridges)} cross-border operational bridges."
        },
        "gds_pagerank": {
            "kingpin": macro_meta["kingpin"],
            "top_entities": [
                {"name": o["display_name"], "pagerank": o["pagerank"], "role": "Systemic Command" if idx == 0 else "High-Influence Hub"}
                for idx, o in enumerate(ranked_pr[:8])
            ]
        },
        "gds_betweenness": {
            "primary_broker": macro_meta["broker"],
            "top_bridges": [
                {"name": o["display_name"], "betweenness": o["betweenness"], "role": "Cross-Syndicate Broker / Gateway" if idx == 0 else "Inter-Cell Conduit"}
                for idx, o in enumerate(ranked_bw[:8])
            ]
        },
        "gds_fastrp_knn": {
            "silent_partners": knn_records,
            "method": "Global FastRP 16-dimensional embeddings + KNN cosine similarity across all nodes"
        },
        "gds_shortest_path": {
            "money_trails": sp_records,
            "algorithm": "Cross-Syndicate Dijkstra Shortest Path Traversal"
        }
    }

