import sys
import os
import json

from app.core.database import get_db_context
from app.models.iam_models import UserModel
from app.api.graph import add_connected_relation, AddConnectedRelationRequest, get_graph_topology
from app.core.neo4j_client import neo4j_client

def test_add_relation_flow():
    print("\n--- Starting test_add_relation_flow ---")
    case_id = "INV-2026-BLACK-CIRCUIT"

    with get_db_context() as db:
        admin_user = db.query(UserModel).first()
        assert admin_user is not None, "No user found in database!"

        # 1. Fetch current graph topology to find a source node
        topo_before = get_graph_topology(case_id=case_id, current_user=admin_user, db=db)
        nodes_before = topo_before["nodes"]
        edges_before = topo_before["edges"]
        print(f"[Before] Case {case_id} has {len(nodes_before)} nodes and {len(edges_before)} edges.")

        assert len(nodes_before) > 0, "Expected existing nodes in INV-2026-BLACK-CIRCUIT!"
        source_node = nodes_before[0]
        source_id = source_node["id"]
        source_label = source_node["label"]
        source_type = source_node["type"]
        print(f"[Source Node Selected] ID={source_id}, Type={source_type}, Label={source_label}")

        # 2. Add a new connected node with attributes and relation
        test_new_phone = "+919988776655"
        req = AddConnectedRelationRequest(
            case_id=case_id,
            source_node_id=source_id,
            source_node_type=source_type,
            source_node_label=source_label,
            target_node_type="Phone",
            target_node_value=test_new_phone,
            target_node_attributes={
                "provider_telecom": "Airtel",
                "kyc_name": "Satish Kumar",
                "status": "ACTIVE"
            },
            relationship_type="CALLS",
            direction="outgoing",
            relationship_attributes={
                "duration": 180,
                "notes": "Intercepted encrypted voice communication"
            },
            rerun_pipeline=True
        )

        res = add_connected_relation(req=req, current_user=admin_user, db=db)
        print(f"[Response] Status: {res.get('status')}, Message: {res.get('message')}")
        assert res.get("status") == "success"
        assert res.get("created_node") is not None
        assert res.get("created_relationship") is not None

        pipe_res = res.get("pipeline_result")
        print(f"[Pipeline Result] ER Profiles: {pipe_res.get('entity_resolution', {}).get('golden_profiles')}, Anomaly Findings: {pipe_res.get('anomaly_detection', {}).get('total_findings')}")

        # 3. Fetch updated graph topology and verify new node and relationship are present
        topo_after = get_graph_topology(case_id=case_id, current_user=admin_user, db=db)
        nodes_after = topo_after["nodes"]
        edges_after = topo_after["edges"]
        print(f"[After] Case {case_id} has {len(nodes_after)} nodes and {len(edges_after)} edges.")

        # Check target node
        created_node_found = any(n["label"] == test_new_phone or n.get("properties", {}).get("number") == test_new_phone for n in nodes_after)
        assert created_node_found, f"Created node {test_new_phone} not found in updated graph topology!"
        print(f"[PASS] Successfully verified created node '{test_new_phone}' in updated graph topology!")

        # Check relationship
        rel_found = any(e.get("relationship") == "CALLS" and (e.get("properties", {}).get("notes") == "Intercepted encrypted voice communication" or e.get("properties", {}).get("duration") == 180) for e in edges_after)
        assert rel_found, "Created CALLS relationship not found in updated graph topology!"
        print("[PASS] Successfully verified created 'CALLS' relationship in updated graph topology!")

    print("\n>>> ALL ADD_RELATION TESTS PASSED PERFECTLY! <<<")

if __name__ == "__main__":
    test_add_relation_flow()
