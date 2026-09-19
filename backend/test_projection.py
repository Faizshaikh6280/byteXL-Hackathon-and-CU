from app.core.neo4j_client import neo4j_client

def test_case_projection(target_case_id):
    with neo4j_client.driver.session() as session:
        # 1. Map phone to person
        res_map = session.run("""
            MATCH (p:Person)-[r:OWNS_PHONE]->(ph:Phone)
            WHERE (p.case_id = $case_id OR $case_id IN coalesce(p.case_ids, []))
            RETURN elementId(p) AS p_id, elementId(ph) AS ph_id, ph.number AS phone_num, p.name AS p_name
        """, {"case_id": target_case_id})
        
        ph_to_person = {}
        for rec in res_map:
            ph_to_person[rec["ph_id"]] = rec["p_id"]
            if rec["phone_num"]:
                ph_to_person[rec["phone_num"]] = rec["p_id"]

        print(f"=== Case {target_case_id} ===")
        print(f"Resolved phone-to-person mappings: {len(ph_to_person)}")

        # 2. Query nodes and edges
        query = """
        MATCH (n) WHERE NOT 'Anomaly' IN labels(n) AND (n.case_id = $case_id OR $case_id IN coalesce(n.case_ids, []))
        OPTIONAL MATCH (n)-[r]->(m) 
        WHERE NOT 'Anomaly' IN labels(m) 
          AND (m.case_id = $case_id OR $case_id IN coalesce(m.case_ids, []))
          AND NOT type(r) IN ['SIMILAR_BEHAVIOR', 'CO_OFFENDING', 'HAS_ANOMALY']
        RETURN 
            elementId(n) AS source_id, 
            labels(n) AS source_labels, 
            properties(n) AS source_props,
            elementId(m) AS target_id,
            labels(m) AS target_labels,
            properties(m) AS target_props,
            type(r) AS rel_type,
            elementId(r) AS rel_id,
            properties(r) AS rel_props
        LIMIT 2500
        """
        result = session.run(query, {"case_id": target_case_id})
        
        nodes = {}
        edges = []
        seen_edges = set()

        for record in result:
            s_id = record["source_id"]
            s_labels = record["source_labels"] or ["Unknown"]
            s_type = s_labels[0]
            s_props = record["source_props"] or {}

            # Map phone to person
            if s_type == "Phone" and s_id in ph_to_person:
                effective_s = ph_to_person[s_id]
            else:
                effective_s = s_id
                if s_id not in nodes and (s_type != "Phone" or s_id not in ph_to_person):
                    nodes[s_id] = {
                        "id": str(s_id),
                        "type": s_type,
                        "label": s_props.get("name") or s_props.get("primary_name") or s_props.get("number") or s_props.get("account_number") or s_props.get("imei_number") or s_props.get("tower_id") or s_props.get("address") or s_props.get("handle") or str(s_id)
                    }

            if s_type == "Person" and s_id not in nodes:
                nodes[s_id] = {
                    "id": str(s_id),
                    "type": "Person",
                    "label": s_props.get("name") or s_props.get("primary_name") or "Person"
                }

            t_id = record["target_id"]
            if t_id is not None:
                t_labels = record["target_labels"] or ["Unknown"]
                t_type = t_labels[0]
                t_props = record["target_props"] or {}

                if t_type == "Phone" and t_id in ph_to_person:
                    effective_t = ph_to_person[t_id]
                else:
                    effective_t = t_id
                    if t_id not in nodes and (t_type != "Phone" or t_id not in ph_to_person):
                        nodes[t_id] = {
                            "id": str(t_id),
                            "type": t_type,
                            "label": t_props.get("name") or t_props.get("primary_name") or t_props.get("number") or t_props.get("account_number") or t_props.get("imei_number") or t_props.get("tower_id") or t_props.get("address") or t_props.get("handle") or str(t_id)
                        }

                if t_type == "Person" and t_id not in nodes:
                    nodes[t_id] = {
                        "id": str(t_id),
                        "type": "Person",
                        "label": t_props.get("name") or t_props.get("primary_name") or "Person"
                    }

                rel_type = record["rel_type"]
                # Skip bridge edges between person and their own phone
                if rel_type in ("OWNS_PHONE", "RESOLVED_TO") and (s_id in ph_to_person or t_id in ph_to_person):
                    continue
                if effective_s == effective_t:
                    continue

                edge_k = (effective_s, effective_t, rel_type)
                if edge_k not in seen_edges:
                    seen_edges.add(edge_k)
                    edges.append({
                        "source": effective_s,
                        "target": effective_t,
                        "relationship": rel_type
                    })

        print(f"Projected nodes: {len(nodes)}, Projected edges: {len(edges)}")
        types = {}
        for n in nodes.values():
            types[n["type"]] = types.get(n["type"], 0) + 1
        print("Projected node types:", types)
        rel_types = {}
        for e in edges:
            rel_types[e["relationship"]] = rel_types.get(e["relationship"], 0) + 1
        print("Projected edge relationships:", rel_types)
        print("Sample Person nodes:")
        for n in list(nodes.values()):
            if n["type"] == "Person":
                print(f"  Person: {n['label']} ({n['id']})")
        print()

for cid in ['INV-2026-BLACK-CIRCUIT', 'CASE-1AB58859', 'CASE-A1AFE5E1']:
    test_case_projection(cid)
