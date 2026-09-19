"""
Clean-slate database purge script for Investigation Platform.
Purges:
- PostgreSQL (all cases, evidence, profiles, findings, signals, quarantine, quality reports)
- MinIO (all uploaded evidence and Parquet events)
- Redis (all cache keys)
- Neo4j (all nodes and relationships)
"""

import sys
import logging
from app.core.database import get_db_context
from app.models.postgres_models import (
    CaseModel, EvidenceModel, QuarantineRecordModel, DataQualityReportModel,
    GoldenProfileModel, DetectionSignalModel, AnomalyFindingModel, AnomalyRunModel, AuditLogModel
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clean_slate")

def purge_postgres():
    print("Purging PostgreSQL database...", flush=True)
    with get_db_context() as db:
        cnt_f = db.query(AnomalyFindingModel).delete()
        cnt_r = db.query(AnomalyRunModel).delete()
        cnt_s = db.query(DetectionSignalModel).delete()
        cnt_g = db.query(GoldenProfileModel).delete()
        cnt_q = db.query(QuarantineRecordModel).delete()
        cnt_d = db.query(DataQualityReportModel).delete()
        cnt_e = db.query(EvidenceModel).delete()
        cnt_a = db.query(AuditLogModel).delete()
        cnt_c = db.query(CaseModel).delete()
        db.commit()
        print(f"PostgreSQL Purged: {cnt_c} cases, {cnt_e} evidence items, {cnt_g} golden profiles, {cnt_f} anomaly findings.", flush=True)

def purge_minio():
    print("Purging MinIO object storage...", flush=True)
    try:
        from app.core.storage import storage_service
        from app.processing.canonical_reader import canonical_reader
        s3 = storage_service.s3_client
        for bucket in ["raw-evidence", "iceberg-warehouse"]:
            try:
                paginator = s3.get_paginator('list_objects_v2')
                deleted_total = 0
                for page in paginator.paginate(Bucket=bucket):
                    contents = page.get("Contents", [])
                    if contents:
                        objects = [{"Key": obj["Key"]} for obj in contents]
                        s3.delete_objects(Bucket=bucket, Delete={"Objects": objects})
                        deleted_total += len(objects)
                if deleted_total > 0:
                    print(f"MinIO Purged: {deleted_total} objects from bucket '{bucket}'.", flush=True)
                else:
                    print(f"MinIO: Bucket '{bucket}' is already empty.", flush=True)
            except Exception as be:
                print(f"MinIO Bucket {bucket} check error: {be}", flush=True)
        canonical_reader.invalidate_cache()
    except Exception as e:
        print(f"MinIO purge error: {e}", flush=True)

def purge_redis():
    print("Purging Redis cache...", flush=True)
    try:
        import redis
        from app.core.config import settings
        r = redis.from_url(settings.REDIS_URL)
        r.flushall()
        print("Redis cache flushed successfully.", flush=True)
    except Exception as e:
        print(f"Redis purge warning: {e}", flush=True)

def purge_neo4j():
    print("Purging Neo4j graph...", flush=True)
    try:
        from app.core.neo4j_client import neo4j_client
        # Reset any stale connection state so ensure_connected re-probes
        neo4j_client.is_connected = False
        neo4j_client._last_failed_time = 0
        neo4j_client._last_verified_time = 0
        if neo4j_client.ensure_connected():
            with neo4j_client.driver.session() as session:
                res = session.run("MATCH (n) DETACH DELETE n")
                summary = res.consume()
                nodes_deleted = summary.counters.nodes_deleted
                relationships_deleted = summary.counters.relationships_deleted
                print(f"Neo4j graph purged: {nodes_deleted} nodes, {relationships_deleted} relationships deleted.", flush=True)
                return
    except Exception as e:
        print(f"Neo4j purge via neo4j_client warning: {e}", flush=True)

    # Fallback: Direct driver connection
    try:
        from neo4j import GraphDatabase
        from app.core.config import settings
        for uri in [settings.NEO4J_URI, "bolt://127.0.0.1:7687", "bolt://localhost:7687"]:
            try:
                driver = GraphDatabase.driver(uri, auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD), connection_timeout=10.0)
                driver.verify_connectivity()
                with driver.session() as session:
                    res = session.run("MATCH (n) DETACH DELETE n")
                    summary = res.consume()
                    print(f"Neo4j graph purged (direct): {summary.counters.nodes_deleted} nodes, {summary.counters.relationships_deleted} rels via {uri}.", flush=True)
                driver.close()
                return
            except Exception:
                continue
        print("Neo4j: All connection attempts failed during purge.", flush=True)
    except Exception as e:
        print(f"Neo4j direct purge fallback error: {e}", flush=True)

if __name__ == "__main__":
    print("=== STARTING COMPLETE CLEAN-SLATE PURGE ===", flush=True)
    purge_postgres()
    purge_minio()
    purge_redis()
    purge_neo4j()
    print("=== CLEAN-SLATE PURGE COMPLETE ===", flush=True)
