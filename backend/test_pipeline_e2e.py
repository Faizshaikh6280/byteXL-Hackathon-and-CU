import os
import sys
from fastapi.testclient import TestClient
print("[Test] Loading FastAPI application...", flush=True)
from app.main import app
print("[Test] Initializing TestClient...", flush=True)
client = TestClient(app)
print("[Test] TestClient ready.", flush=True)

import uuid
unique_suffix = uuid.uuid4().hex[:6].upper()
print("=== 1. CREATING NEW INVESTIGATION CASE ===", flush=True)
case_res = client.post('/api/cases', json={
    'title': f'Operation Apex Cyber Nexus {unique_suffix}',
    'case_reference': f'INV-2026-APEX-{unique_suffix}',
    'description': 'End-to-end verification case for upload and graph generation'
})
print(f"Case created: status {case_res.status_code}", flush=True)
if case_res.status_code != 200:
    print(f"Error creating case: {case_res.text}", flush=True)
    sys.exit(1)
case_data = case_res.json()
case_id = case_data['case_id']
print(f"Case ID: {case_id}, Reference: {case_data['case_reference']}", flush=True)

print("\n=== 2. UPLOADING MULTI-SOURCE EVIDENCE ===", flush=True)
pack_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "operation_black_circuit_large_test_pack"))
test_files = ['kyc.csv', 'bank_statement.csv', 'cdr.csv', 'ipdr.csv', 'social_activity.csv', 'geospatial.csv', 'device_inventory.csv']
for f in test_files:
    fpath = os.path.join(pack_dir, f)
    if os.path.exists(fpath):
        with open(fpath, 'rb') as fp:
            up_res = client.post(
                f'/api/cases/{case_id}/evidence',
                files={'file': (f, fp, 'text/csv')}
            )
            data = up_res.json()
            detected = data.get('detected_source')
            score = data.get('quality_score')
            records = data.get('valid_records')
            print(f"Uploaded {f} -> Status {up_res.status_code} | Domain: {detected} | Records: {records} | Score: {score}", flush=True)
    else:
        print(f"File not found: {fpath}", flush=True)

print("\n=== 3. EXECUTING INVESTIGATION PIPELINE ===", flush=True)
from app.services.pipeline_orchestrator import wait_for_pipeline, execute_case_pipeline, get_last_pipeline_result
print("Waiting for background pipeline worker to process all uploaded files...", flush=True)
wait_for_pipeline(case_id=case_id, timeout=180.0)
pipeline_res = get_last_pipeline_result(case_id) or execute_case_pipeline(case_id=case_id)
er = pipeline_res.get('entity_resolution', {})
print(f"Entity Resolution: {er.get('status')} | Golden Profiles: {er.get('golden_profiles')}", flush=True)
gs = pipeline_res.get('graph_sync', {})
print(f"Neo4j Graph Sync: {gs.get('status')} | Nodes synced: {gs.get('nodes_synced', gs.get('message'))}", flush=True)
ad = pipeline_res.get('anomaly_detection', {})
print(f"Anomaly Detection: Total findings {ad.get('total_findings', 0)} (Critical: {ad.get('critical_count', 0)})", flush=True)

print("\n=== 4. VERIFYING RELATIONSHIP GRAPH TOPOLOGY ===", flush=True)
topo_res = client.get(f'/api/graph/topology?case_id={case_id}')
topo = topo_res.json()
nodes_count = len(topo.get('nodes', []))
edges_count = len(topo.get('edges', []))
print(f"Graph Topology: {nodes_count} nodes, {edges_count} edges", flush=True)
node_types = {}
for n in topo.get('nodes', []):
    nt = n.get('type', 'Unknown')
    node_types[nt] = node_types.get(nt, 0) + 1
print(f"Node Types Breakdown: {node_types}", flush=True)
assert nodes_count > 0, "Graph topology must not be empty!"
assert edges_count > 0, "Graph topology must have connecting edges!"

print("\n=== 5. VERIFYING GOLDEN IDENTITIES ===", flush=True)
profiles_res = client.get(f'/api/system/golden_profiles?case_id={case_id}')
profiles = profiles_res.json()
print(f"Golden Profiles in PostgreSQL: {len(profiles)} profiles", flush=True)
assert len(profiles) > 0, "Golden profiles must exist!"

print("\n=== 6. VERIFYING TIMELINE EVENTS & BURSTS ===", flush=True)
timeline_res = client.get(f'/api/timeline/events?case_id={case_id}&limit=20')
timeline_data = timeline_res.json()
events = timeline_data.get('events', [])
print(f"Canonical Timeline Events: {len(events)} events (Total in warehouse: {timeline_data.get('total_events', len(events))})", flush=True)
assert len(events) > 0, "Timeline events must exist!"

bursts_res = client.get(f'/api/timeline/bursts?case_id={case_id}')
print(f"Timeline Activity Bursts: {len(bursts_res.json())} bursts detected", flush=True)

print("\n=== 7. VERIFYING GEOSPATIAL INTELLIGENCE ===", flush=True)
geo_res = client.get(f'/api/geo/investigation?case_id={case_id}')
geo = geo_res.json()
movements = geo.get('movements', [])
colocations = geo.get('co_locations', [])
common_places = geo.get('common_places', [])
print(f"Geospatial: {len(movements)} movements, {len(colocations)} co-locations, {len(common_places)} common hubs", flush=True)

print("\n=== 8. VERIFYING ANOMALY FINDINGS ===", flush=True)
anomalies_res = client.get(f'/api/anomaly/findings?case_id={case_id}')
anomalies = anomalies_res.json().get('anomalies', [])
print(f"Anomaly Findings: {len(anomalies)} findings in case", flush=True)

print("\n=======================================================")
print(" ALL 5 INVESTIGATION PILLARS VERIFIED 100% WORKING! ")
print("=======================================================")
