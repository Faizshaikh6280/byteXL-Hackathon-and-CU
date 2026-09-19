import logging
import threading
import asyncio
from typing import Optional, Dict, Any, Set

from app.core.database import get_db_context
from app.models.postgres_models import CaseModel

logger = logging.getLogger("investigation.pipeline_orchestrator")

_active_case_threads: Dict[str, threading.Thread] = {}
_pending_cases: Set[str] = set()
_debounce_timers: Dict[str, threading.Timer] = {}
_last_case_results: Dict[str, Any] = {}
_orchestrator_lock = threading.Lock()

_execution_lock = threading.Lock()

def get_last_pipeline_result(case_id: str) -> Optional[Dict[str, Any]]:
    with _orchestrator_lock:
        return _last_case_results.get(case_id)

def execute_case_pipeline(case_id: str) -> Dict[str, Any]:
    """
    Executes the full automated investigation pipeline for a case:
    1. Entity Resolution (Golden Profiles via Zingg/deterministic clustering)
    2. Neo4j Property Graph Synchronization (Person, Phone, BankAccount, IP, IMEI, CellTower)
    3. Multi-Engine Anomaly Detection (21 analytical engines)
    """
    with _execution_lock:
        results = {
            "case_id": case_id,
            "entity_resolution": None,
            "graph_sync": None,
            "anomaly_detection": None
        }
        logger.info(f"[PipelineOrchestrator] Starting full automated pipeline for case: {case_id}")

        # 1. Entity Resolution
        try:
            from app.services.zingg_er import run_entity_resolution
            er_result = run_entity_resolution(case_id=case_id)
            results["entity_resolution"] = er_result
            logger.info(f"[PipelineOrchestrator] Entity Resolution complete for {case_id}: {er_result.get('golden_profiles', 0)} profiles")
        except Exception as e:
            logger.exception(f"[PipelineOrchestrator] Entity Resolution failed for {case_id}: {e}")
            results["entity_resolution"] = {"error": str(e)}

        # 2. Neo4j Graph Synchronization
        try:
            from app.services.graph_sync import sync_mongo_to_neo4j
            graph_result = sync_mongo_to_neo4j(case_id=case_id)
            results["graph_sync"] = graph_result
            logger.info(f"[PipelineOrchestrator] Neo4j Graph Sync complete for {case_id}: {graph_result}")
        except Exception as e:
            logger.exception(f"[PipelineOrchestrator] Neo4j Graph Sync failed for {case_id}: {e}")
            results["graph_sync"] = {"error": str(e)}

        # 3. Multi-Engine Anomaly Detection
        try:
            from app.anomaly.orchestration.orchestrator import MultiEngineOrchestrator
            orchestrator = MultiEngineOrchestrator()
            anomaly_result = orchestrator.run_case_analysis(case_id=case_id)
            summary = anomaly_result.get("summary", {})
            results["anomaly_detection"] = summary
            logger.info(f"[PipelineOrchestrator] Anomaly Detection complete for {case_id}: {summary.get('total_findings', 0)} findings")
        except Exception as e:
            logger.exception(f"[PipelineOrchestrator] Anomaly Detection failed for {case_id}: {e}")
            results["anomaly_detection"] = {"error": str(e)}

        with _orchestrator_lock:
            _last_case_results[case_id] = results
        return results

def _run_case_pipeline_worker(case_id: str):
    while True:
        try:
            with _orchestrator_lock:
                _pending_cases.discard(case_id)
            execute_case_pipeline(case_id)
        except Exception as e:
            logger.exception(f"[PipelineOrchestrator] Error during pipeline execution for {case_id}: {e}")

        with _orchestrator_lock:
            if case_id in _pending_cases:
                # Another upload arrived while processing; loop to process all newly uploaded files
                logger.info(f"[PipelineOrchestrator] Additional uploads arrived for {case_id}; re-running pipeline.")
                continue
            else:
                _active_case_threads.pop(case_id, None)
                break

def _debounce_trigger(case_id: str):
    with _orchestrator_lock:
        _debounce_timers.pop(case_id, None)
        existing_thread = _active_case_threads.get(case_id)
        if existing_thread and existing_thread.is_alive():
            _pending_cases.add(case_id)
            return

        thread = threading.Thread(
            target=_run_case_pipeline_worker,
            args=(case_id,),
            daemon=True,
            name=f"PipelineWorker-{case_id}"
        )
        _active_case_threads[case_id] = thread
        thread.start()
        logger.info(f"[PipelineOrchestrator] Serialized background worker started for case {case_id}")

def run_case_pipeline_async(case_id: str, debounce_seconds: float = 1.0):
    """
    Debounced asynchronous pipeline launcher.
    If multiple files are uploaded back-to-back, coalesces them so the pipeline
    runs once across all newly available multi-source evidence files.
    """
    with _orchestrator_lock:
        if case_id in _debounce_timers:
            _debounce_timers[case_id].cancel()

        timer = threading.Timer(debounce_seconds, _debounce_trigger, args=(case_id,))
        _debounce_timers[case_id] = timer
        timer.daemon = True
        timer.start()
        logger.info(f"[PipelineOrchestrator] Scheduled debounced pipeline run for case {case_id} ({debounce_seconds}s)")

def wait_for_pipeline(case_id: str, timeout: float = 120.0) -> bool:
    """Waits for any debounced or active background pipeline execution for the case to complete."""
    import time
    # If a debounce timer is active, flush it immediately
    with _orchestrator_lock:
        timer = _debounce_timers.get(case_id)
        if timer and timer.is_alive():
            timer.cancel()
            _debounce_timers.pop(case_id, None)
            _debounce_trigger(case_id)

    start = time.time()
    while time.time() - start < timeout:
        with _orchestrator_lock:
            timer = _debounce_timers.get(case_id)
            thread = _active_case_threads.get(case_id)
            timer_alive = timer and timer.is_alive()
            thread_alive = thread and thread.is_alive()
            if not timer_alive and not thread_alive:
                return True
        time.sleep(0.5)
    return False

