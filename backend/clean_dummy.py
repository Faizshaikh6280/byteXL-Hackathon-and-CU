import os
from app.core.neo4j_client import neo4j_client
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel
from app.core.storage import storage_service
from app.services.zingg_er import run_entity_resolution
from app.services.graph_sync import sync_mongo_to_neo4j

print("=== 1. Cleaning Neo4j dummy test nodes ===")
with neo4j_client.driver.session() as s:
    del_res = s.run("""
        MATCH (n)
        WHERE n.number STARTS WITH "+919999" 
           OR n.identifier STARTS WITH "TEST_" 
           OR n.name STARTS WITH "+919999"
           OR n.target_val STARTS WITH "TEST_"
           OR n.number STARTS WITH "+9199880000"
        DETACH DELETE n
        RETURN count(n) AS cnt
    """).single()
    print(f"Deleted {del_res['cnt']} dummy nodes from Neo4j.")

print("=== 2. Cleaning Postgres dummy golden profiles ===")
with get_db_context() as db:
    deleted = db.query(GoldenProfileModel).filter(
        (GoldenProfileModel.primary_name.like('%+919999%')) |
        (GoldenProfileModel.primary_name.like('%TEST_%'))
    ).delete(synchronize_session=False)
    db.commit()
    print(f"Deleted {deleted} dummy profiles from Postgres.")

print("=== 3. Cleaning MinIO manual dummy events ===")
try:
    s3 = storage_service.s3_client
    bucket = storage_service.bucket
    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket, Prefix="canonical_events/")
    del_keys = []
    for page in pages:
        for obj in page.get('Contents', []):
            k = obj['Key']
            if 'evidence_id=manual_' in k or 'evidence_id=evt_man_' in k:
                del_keys.append({'Key': k})
    if del_keys:
        # Delete in chunks of 1000
        for i in range(0, len(del_keys), 1000):
            chunk = del_keys[i:i+1000]
            s3.delete_objects(Bucket=bucket, Delete={'Objects': chunk})
        print(f"Deleted {len(del_keys)} manual dummy parquet files from MinIO.")
    else:
        print("No manual dummy parquet files found in MinIO.")
except Exception as e:
    print(f"MinIO cleanup note: {e}")

print("=== 4. Re-running Entity Resolution & Graph Sync for Cases ===")
for cid in ['INV-2026-BLACK-CIRCUIT', 'CASE-1AB58859', 'CASE-A1AFE5E1']:
    try:
        er_res = run_entity_resolution(cid)
        print(f"Case {cid} ER result: {er_res.get('golden_profiles', 0)} golden profiles.")
    except Exception as e:
        print(f"Case {cid} ER error: {e}")

print("=== Cleanup Complete ===")
