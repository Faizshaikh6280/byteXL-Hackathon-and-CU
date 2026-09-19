"""
Clear Neo4j graph, PostgreSQL metadata/cases, and MinIO storage to re-run full pipeline cleanly.
Zero MongoDB dependencies.
"""
import logging
from app.core.neo4j_client import neo4j_client
from app.core.database import get_db_context
from app.models.postgres_models import (
    CaseModel, EvidenceModel, QuarantineRecordModel,
    DataQualityReportModel, GoldenProfileModel, AuditLogModel,
    AnomalyFindingModel, AnomalyRunModel, DetectionSignalModel
)
from app.processing.canonical_reader import canonical_reader
from app.core.storage import storage_service
from app.core.config import settings

logger = logging.getLogger("investigation.reset")

async def clear_and_reset():
    # 1. Clear Neo4j Property Graph
    if neo4j_client.ensure_connected():
        with neo4j_client.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        logger.info("[Reset] Cleared all nodes and edges from Neo4j.")

    # 2. Clear PostgreSQL Tables
    with get_db_context() as db:
        db.query(DetectionSignalModel).delete()
        db.query(AnomalyFindingModel).delete()
        db.query(AnomalyRunModel).delete()
        db.query(QuarantineRecordModel).delete()
        db.query(DataQualityReportModel).delete()
        db.query(EvidenceModel).delete()
        db.query(CaseModel).delete()
        db.query(GoldenProfileModel).delete()
        db.query(AuditLogModel).delete()
    logger.info("[Reset] Cleared all records from PostgreSQL.")

    # 3. Clear MinIO Warehouse Parquet Objects
    canonical_reader.clear_warehouse()

    # 4. Clear MinIO Raw Evidence Objects
    try:
        storage_service.ensure_buckets()
        paginator = storage_service.s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=settings.MINIO_BUCKET_EVIDENCE):
            for obj in page.get('Contents', []):
                storage_service.s3_client.delete_object(
                    Bucket=settings.MINIO_BUCKET_EVIDENCE,
                    Key=obj['Key']
                )
        logger.info("[Reset] Cleared raw evidence bucket in MinIO.")
    except Exception as e:
        logger.warning(f"[Reset] Error clearing raw evidence bucket: {e}")

    # 5. Flush Redis Caches and Queues
    try:
        import redis
        r = redis.from_url(settings.REDIS_URI)
        r.flushall()
        logger.info("[Reset] Flushed Redis caches and Celery task queues.")
    except Exception as e:
        logger.warning(f"[Reset] Error flushing Redis: {e}")

    return {"status": "cleared", "message": "Neo4j, PostgreSQL, MinIO, and Redis cleared successfully."}
