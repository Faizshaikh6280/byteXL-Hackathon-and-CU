import logging
from typing import Optional, Dict, Any
from app.core.celery_app import celery_app
from app.anomaly.orchestration.orchestrator import orchestrator

logger = logging.getLogger("AnomalyService")

@celery_app.task(name='anomaly_engine.run_detection')
def run_anomaly_detection(case_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Celery background task and synchronous entrypoint for the Multi-Engine Anomaly Intelligence Subsystem.
    Executes all 11 analytical engines across MinIO/Iceberg, PostgreSQL, and Neo4j.
    """
    logger.info(f"Triggering Multi-Engine Anomaly Detection for case: {case_id or 'ACTIVE_CASE'}")
    try:
        result = orchestrator.run_case_analysis(case_id=case_id)
        logger.info(f"Multi-engine anomaly detection completed: {result.get('status')}")
        return result
    except Exception as e:
        logger.error(f"Multi-engine anomaly execution failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}
