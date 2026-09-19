import os
import sys
from fastapi.testclient import TestClient
from app.main import app
from app.services.pipeline_orchestrator import wait_for_pipeline, execute_case_pipeline, get_last_pipeline_result
from app.core.database import get_db_context
from app.models.postgres_models import CaseModel

client = TestClient(app)

case_id = "INV-2026-BLACK-CIRCUIT"
print(f"=== Seeding Evidence for {case_id} ===")

pack_dir = "/data_files/operation_black_circuit_large_test_pack"
test_files = ['kyc.csv', 'bank_statement.csv', 'cdr.csv', 'ipdr.csv', 'social_activity.csv', 'geospatial.csv', 'device_inventory.csv']

for f in test_files:
    fpath = os.path.join(pack_dir, f)
    if os.path.exists(fpath):
        with open(fpath, 'rb') as fp:
            up_res = client.post(
                f'/api/cases/{case_id}/evidence',
                files={'file': (f, fp, 'text/csv')}
            )
            print(f"Uploaded {f} -> Status {up_res.status_code}: {up_res.text[:120]}")
    else:
        print(f"File not found: {fpath}")

print("\nExecuting Pipeline...")
wait_for_pipeline(case_id=case_id, timeout=120.0)
pipeline_res = get_last_pipeline_result(case_id) or execute_case_pipeline(case_id=case_id)
print(f"Pipeline Result Keys: {list(pipeline_res.keys())}")
print(f"ER: {pipeline_res.get('entity_resolution')}")
print(f"Graph Sync: {pipeline_res.get('graph_sync')}")
print(f"Anomalies: {pipeline_res.get('anomaly_detection')}")
