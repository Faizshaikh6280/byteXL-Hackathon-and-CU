"""
MultiEngineOrchestrator: Production-grade Investigative Intelligence Orchestrator.
Manages end-to-end execution:
Feature Extraction -> Detector Engines -> Detection Signals -> Normalization ->
Correlation & Deduplication -> Pattern Matching -> Context Enrichment -> Case Relevance ->
Evidence Binding -> Corroboration -> Finding Synthesis -> Investigative Priority ->
Quality Gate -> Dual PostgreSQL & Neo4j Persistence.
"""

import logging
import uuid
import datetime
import json
from typing import Dict, Any, List, Optional
from app.core.database import get_db_context
from app.core.neo4j_client import neo4j_client
from app.models.postgres_models import (
    AnomalyFindingModel, AnomalyRunModel, CaseModel, DetectionSignalModel
)
from app.anomaly.features.feature_factory import feature_factory
from app.anomaly.registry.detector_registry import detector_registry
from app.anomaly.schemas.anomaly_contracts import DetectorStatus
from app.anomaly.schemas.signal_contracts import (
    DetectionSignal, InvestigativeFinding, SignalStatus
)
from app.anomaly.normalization.signal_normalizer import signal_normalizer
from app.anomaly.correlation.correlation_engine import signal_correlation_engine
from app.anomaly.patterns.pattern_matcher import pattern_matcher
from app.anomaly.enrichment.context_enrichment import context_enrichment_engine
from app.anomaly.relevance.case_relevance_engine import case_relevance_engine
from app.anomaly.evidence.evidence_binding_engine import evidence_binding_engine
from app.anomaly.corroboration.corroboration_engine import corroboration_engine
from app.anomaly.priority.investigative_priority_engine import investigative_priority_engine
from app.anomaly.synthesis.finding_synthesis_engine import finding_synthesis_engine
from app.anomaly.quality.finding_quality_gate import finding_quality_gate

logger = logging.getLogger("MultiEngineOrchestrator")


class MultiEngineOrchestrator:
    """
    Executes the complete Investigative Intelligence pipeline.
    Transforms raw detector outputs into contextualized, evidence-grounded Investigative Findings.
    """

    def __init__(self):
        self.registry = detector_registry

    def run_case_analysis(self, case_id: Optional[str] = None, events: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Executes end-to-end investigative analysis for a case.
        """
        run_id = f"RUN-{uuid.uuid4()}"
        start_time = datetime.datetime.now(datetime.timezone.utc)

        # Resolve active case
        resolved_case_id = case_id
        with get_db_context() as db:
            if not resolved_case_id:
                latest_case = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
                if latest_case:
                    resolved_case_id = latest_case.case_id
                else:
                    resolved_case_id = "CASE-DEFAULT"

            existing_case = db.query(CaseModel).filter_by(case_id=resolved_case_id).first()
            if not existing_case:
                default_case = CaseModel(
                    case_id=resolved_case_id,
                    case_reference=f"REF-{resolved_case_id}",
                    title=f"Investigation Case {resolved_case_id}",
                    status="ACTIVE"
                )
                db.add(default_case)
                db.commit()

            run_record = AnomalyRunModel(
                run_id=run_id,
                case_id=resolved_case_id,
                status="RUNNING",
                current_stage="FEATURE_EXTRACTION",
                started_at=start_time,
                detectors_executed=[],
                detectors_failed=[]
            )
            db.add(run_record)
            db.commit()

        logger.info(f"Starting Investigative Intelligence Run {run_id} for Case {resolved_case_id}")

        detectors_executed = []
        detectors_failed = []
        all_raw_signals: List[DetectionSignal] = []
        promoted_findings: List[InvestigativeFinding] = []
        rejected_candidates: List[Dict[str, Any]] = []

        try:
            # ── Stage 1: Feature Extraction ──────────────────────────
            logger.info("Stage 1: Building entity feature store from Canonical Warehouse...")
            entity_store = feature_factory.build_entity_feature_store(case_id=resolved_case_id, events=events)
            population_df = feature_factory.build_tabular_matrix(entity_store)

            context: Dict[str, Any] = {
                "case_id": resolved_case_id,
                "all_entity_store": entity_store,
                "population_matrix": population_df,
                "run_id": run_id
            }

            with get_db_context() as db:
                run = db.query(AnomalyRunModel).filter_by(run_id=run_id).first()
                if run:
                    run.current_stage = "DETECTOR_EXECUTION"
                    db.commit()

            # ── Stage 2: Multi-Engine Execution & Signal Production ───
            logger.info("Stage 2: Executing 11+ analytical engines across entity store...")
            detectors = self.registry.get_all_detectors()

            for entity_id, entity_data in entity_store.items():
                for detector in detectors:
                    det_meta = detector.get_metadata()
                    det_id = det_meta.detector_id

                    try:
                        res = detector.execute(
                            case_id=resolved_case_id,
                            entity_id=entity_id,
                            entity_data=entity_data,
                            context=context
                        )
                        if det_id not in detectors_executed:
                            detectors_executed.append(det_id)

                        # Stage 3: Normalize output to canonical DetectionSignal
                        signal = signal_normalizer.normalize(
                            result=res,
                            entity_data=entity_data,
                            context=context
                        )
                        all_raw_signals.append(signal)

                    except Exception as ex:
                        logger.error(f"Detector {det_id} failed on entity {entity_id}: {ex}")
                        if det_id not in detectors_failed:
                            detectors_failed.append(det_id)

            # Persist all raw signals for audit and analyst inspection
            logger.info(f"Stage 3: Persisting {len(all_raw_signals)} raw detection signals to PostgreSQL...")
            self._persist_signals_to_postgres(resolved_case_id, all_raw_signals)

            # ── Stage 4: Signal Correlation & Deduplication ───────────
            logger.info("Stage 4: Correlating and deduplicating signals across 7 dimensions...")
            signal_groups = signal_correlation_engine.correlate(
                case_id=resolved_case_id,
                signals=all_raw_signals
            )

            # ── Stage 5: Pattern Matching & Synthesis Pipeline ────────
            logger.info(f"Stage 5: Evaluating {len(signal_groups)} correlated signal groups against Pattern Library...")

            for group in signal_groups:
                # 5A. Pattern Matcher
                candidate = pattern_matcher.match(group)
                if not candidate:
                    continue

                # 5B. Context Enrichment (Entities, Events, Timeline, Spatial, Graph, Case)
                enriched = context_enrichment_engine.enrich(
                    candidate=candidate,
                    entity_store=entity_store,
                    context=context
                )

                # 5C. Case Relevance Evaluation
                case_rel, rel_reasons = case_relevance_engine.evaluate(
                    candidate=candidate,
                    enriched=enriched
                )

                # 5D. Evidence Binding & Claim Verification (NO EVIDENCE -> NO CLAIM)
                evidence_res = evidence_binding_engine.bind_and_validate(
                    candidate=candidate,
                    enriched=enriched
                )

                # 5E. Corroboration & Double-Counting Protection
                corroboration = corroboration_engine.evaluate(candidate)

                # 5F. Decoupled Investigative Priority & Severity
                priority, severity = investigative_priority_engine.compute_priority(
                    candidate=candidate,
                    corroboration=corroboration,
                    evidence_res=evidence_res,
                    case_relevance=case_rel,
                    relevance_reasons=rel_reasons
                )

                # 5G. Finding Synthesis (Plain-language narrative layers)
                finding = finding_synthesis_engine.synthesize(
                    candidate=candidate,
                    enriched=enriched,
                    evidence_res=evidence_res,
                    corroboration=corroboration,
                    case_relevance=case_rel,
                    relevance_reasons=rel_reasons,
                    priority=priority,
                    severity=severity
                )

                # 5H. Quality Gate Verification (12 Checks)
                quality_res = finding_quality_gate.validate(
                    finding=finding,
                    evidence_res=evidence_res
                )

                if quality_res.passed:
                    promoted_findings.append(finding)
                else:
                    rejected_candidates.append({
                        "candidate_id": candidate.candidate_id,
                        "title": candidate.title,
                        "reasons": quality_res.reasons
                    })

            # ── Stage 6: Dual Persistence (PostgreSQL & Neo4j) ─────────
            logger.info(f"Stage 6: Persisting {len(promoted_findings)} promoted findings to PostgreSQL & Neo4j...")
            self._persist_findings_to_postgres(resolved_case_id, promoted_findings)
            self._persist_findings_to_neo4j(promoted_findings)

            # ── Stage 7: Finalize Run State ───────────────────────────
            end_time = datetime.datetime.now(datetime.timezone.utc)
            duration_sec = (end_time - start_time).total_seconds()

            summary_stats = {
                "total_entities_analyzed": len(entity_store),
                "total_signals_generated": len(all_raw_signals),
                "active_signals_flagged": sum(1 for s in all_raw_signals if s.status != SignalStatus.NORMAL),
                "correlated_signal_groups": len(signal_groups),
                "total_findings": len(promoted_findings),
                "rejected_candidates_count": len(rejected_candidates),
                "critical_count": sum(1 for f in promoted_findings if f.severity == "CRITICAL"),
                "high_count": sum(1 for f in promoted_findings if f.severity == "HIGH"),
                "medium_count": sum(1 for f in promoted_findings if f.severity == "MEDIUM"),
                "low_count": sum(1 for f in promoted_findings if f.severity == "LOW"),
                "duration_seconds": round(duration_sec, 2)
            }

            with get_db_context() as db:
                run = db.query(AnomalyRunModel).filter_by(run_id=run_id).first()
                if run:
                    run.status = "COMPLETED" if not detectors_failed else "PARTIAL_FAILURE"
                    run.current_stage = "COMPLETED"
                    run.completed_at = end_time
                    run.detectors_executed = detectors_executed
                    run.detectors_failed = detectors_failed
                    run.total_findings = len(promoted_findings)
                    run.summary_stats = summary_stats
                    db.commit()

            logger.info(
                f"Investigative run {run_id} completed: {len(all_raw_signals)} signals consolidated into {len(promoted_findings)} findings."
            )
            return {
                "status": "success",
                "run_id": run_id,
                "case_id": resolved_case_id,
                "summary": summary_stats,
                "findings_count": len(promoted_findings),
                "signals_count": len(all_raw_signals),
                "detectors_executed": detectors_executed,
                "detectors_failed": detectors_failed
            }

        except Exception as e:
            logger.error(f"Orchestrator encountered unhandled error: {e}", exc_info=True)
            with get_db_context() as db:
                run = db.query(AnomalyRunModel).filter_by(run_id=run_id).first()
                if run:
                    run.status = "FAILED"
                    run.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    run.error_message = str(e)
                    db.commit()
            return {"status": "error", "message": str(e), "run_id": run_id}

    def _persist_signals_to_postgres(self, case_id: str, signals: List[DetectionSignal]):
        """Persists raw detection signals for audit, debugging, and advanced analyst inspection."""
        with get_db_context() as db:
            for s in signals:
                existing = db.query(DetectionSignalModel).filter_by(signal_id=s.signal_id).first()
                if not existing:
                    t_start = None
                    if s.timestamp_start:
                        try:
                            t_start = datetime.datetime.fromisoformat(s.timestamp_start.replace("Z", "+00:00"))
                        except Exception:
                            pass
                    t_end = None
                    if s.timestamp_end:
                        try:
                            t_end = datetime.datetime.fromisoformat(s.timestamp_end.replace("Z", "+00:00"))
                        except Exception:
                            pass

                    row = DetectionSignalModel(
                        signal_id=s.signal_id,
                        case_id=case_id,
                        detector_id=s.detector_id,
                        detector_version=s.detector_version,
                        pattern_type=s.pattern_type,
                        signal_type=s.signal_type,
                        domain=s.domain,
                        entity_refs=s.entity_refs,
                        event_refs=s.event_refs,
                        evidence_refs=s.evidence_refs,
                        timestamp_start=t_start,
                        timestamp_end=t_end,
                        location_refs=s.location_refs,
                        observations=s.observations,
                        baseline=s.baseline,
                        metrics=s.metrics,
                        raw_score=s.raw_score,
                        normalized_score=s.normalized_score,
                        detector_confidence=s.detector_confidence,
                        graph_refs=s.graph_refs,
                        provenance=s.provenance,
                        status=s.status.value if hasattr(s.status, "value") else str(s.status)
                    )
                    db.add(row)
            db.commit()

    def _persist_findings_to_postgres(self, case_id: str, findings: List[InvestigativeFinding]):
        """Persists promoted findings into anomaly_findings table with idempotency via fingerprint."""
        with get_db_context() as db:
            valid_finding_ids = set()
            for f in findings:
                prim_ent = f.primary_entities[0] if f.primary_entities else {}
                entity_id = prim_ent.get("entity_id", "Unknown")
                entity_type = prim_ent.get("entity_type", "Person")

                # Idempotent update or insert based on fingerprint
                existing = db.query(AnomalyFindingModel).filter_by(fingerprint=f.fingerprint).first()
                if not existing:
                    existing = db.query(AnomalyFindingModel).filter_by(finding_id=f.finding_id).first()

                if existing:
                    # Update existing record
                    existing.case_id = case_id
                    existing.title = f.title
                    existing.severity = f.severity
                    existing.unified_score = f.anomaly_score
                    existing.confidence = f.detection_confidence
                    existing.investigative_priority = f.investigative_priority
                    existing.what_happened = f.what_happened
                    existing.why_unusual = f.why_unusual
                    existing.why_relevant = f.why_relevant
                    existing.case_relevance = f.case_relevance
                    existing.relevance_reasons = f.relevance_reasons
                    existing.signals = f.supporting_observations
                    existing.explanation = f.what_happened
                    existing.metrics = f.technical_details.get("raw_metrics", {})
                    existing.evidence_refs = f.evidence_refs
                    existing.canonical_event_refs = [e.get("event_id") for e in f.supporting_events if e.get("event_id")]
                    existing.graph_context = f.graph_context
                    existing.timeline_context = f.timeline_context
                    existing.spatial_context = f.spatial_context
                    existing.primary_entities = f.primary_entities
                    existing.related_entities = f.related_entities
                    existing.time_range = f.time_range
                    existing.locations = f.locations
                    existing.supporting_observations = f.supporting_observations
                    existing.supporting_signals = f.supporting_signals
                    existing.supporting_events = f.supporting_events
                    existing.detectors = f.detectors
                    existing.detector_summary = f.detector_summary
                    existing.technical_details = f.technical_details
                    existing.provenance = f.provenance
                    valid_finding_ids.add(existing.finding_id)
                else:
                    row = AnomalyFindingModel(
                        finding_id=f.finding_id,
                        case_id=case_id,
                        entity_id=entity_id,
                        entity_type=entity_type,
                        fingerprint=f.fingerprint,
                        title=f.title,
                        severity=f.severity,
                        unified_score=f.anomaly_score,
                        confidence=f.detection_confidence,
                        investigative_priority=f.investigative_priority,
                        domain=f.category,
                        primary_detector_type=f.pattern_type,
                        contributing_detectors=f.detectors,
                        signals=f.supporting_observations,
                        explanation=f.what_happened,
                        metrics=f.technical_details.get("raw_metrics", {}),
                        evidence_refs=f.evidence_refs,
                        canonical_event_refs=[e.get("event_id") for e in f.supporting_events if e.get("event_id")],
                        graph_refs=[prim_ent.get("entity_id", "")],
                        model_metadata=f.technical_details,
                        category=f.category,
                        pattern_type=f.pattern_type,
                        what_happened=f.what_happened,
                        why_unusual=f.why_unusual,
                        why_relevant=f.why_relevant,
                        primary_entities=f.primary_entities,
                        related_entities=f.related_entities,
                        time_range=f.time_range,
                        locations=f.locations,
                        supporting_observations=f.supporting_observations,
                        supporting_signals=f.supporting_signals,
                        supporting_events=f.supporting_events,
                        graph_context=f.graph_context,
                        timeline_context=f.timeline_context,
                        spatial_context=f.spatial_context,
                        detectors=f.detectors,
                        detector_summary=f.detector_summary,
                        evidence_quality=f.evidence_quality,
                        case_relevance=f.case_relevance,
                        relevance_reasons=f.relevance_reasons,
                        technical_details=f.technical_details,
                        provenance=f.provenance,
                        status="DETECTED"
                    )
                    db.add(row)
                    valid_finding_ids.add(f.finding_id)

            # Prune obsolete findings for this case that are not in the current run's promoted set
            if valid_finding_ids:
                db.query(AnomalyFindingModel).filter(
                    AnomalyFindingModel.case_id == case_id,
                    ~AnomalyFindingModel.finding_id.in_(valid_finding_ids)
                ).delete(synchronize_session=False)

            db.commit()

    def _persist_findings_to_neo4j(self, findings: List[InvestigativeFinding]):
        """
        Persists findings into Neo4j with enriched investigative properties.
        Preserves complete backward compatibility with (:Anomaly) and [:HAS_ANOMALY].
        """
        if not neo4j_client.ensure_connected():
            logger.warning("Neo4j driver not connected; skipping graph persistence.")
            return

        with neo4j_client.driver.session() as session:
            for f in findings:
                prim_ent = f.primary_entities[0] if f.primary_entities else {}
                ent_id = prim_ent.get("entity_id", "Unknown")
                ent_type = prim_ent.get("entity_type", "Person")

                cypher = """
                MERGE (a:Anomaly {id: $finding_id})
                SET a.score = $score,
                    a.severity = $severity,
                    a.type = $pattern_type,
                    a.category = $category,
                    a.reasons = $reasons,
                    a.metrics = $metrics,
                    a.detectedAt = datetime(),
                    a.status = 'NEW',
                    a.entityType = $entity_type,
                    a.entityId = $entity_id,
                    a.title = $title,
                    a.whatHappened = $what_happened,
                    a.whyUnusual = $why_unusual,
                    a.whyRelevant = $why_relevant,
                    a.caseRelevance = $case_relevance,
                    a.confidence = $confidence,
                    a.investigativePriority = $priority,
                    a.domain = $domain,
                    a.contributingDetectors = $detectors,
                    a.evidenceRefs = $evidence_refs,
                    a.timelineJson = $timeline_json,
                    a.graphContextJson = $graph_context_json,
                    a.spatialContextJson = $spatial_context_json

                WITH a
                OPTIONAL MATCH (e) WHERE 
                    e.golden_id = $entity_id
                    OR e.number = $entity_id
                    OR e.account_number = $entity_id
                    OR e.handle = $entity_id
                    OR e.address = $entity_id
                    OR e.imei_number = $entity_id
                    OR e.tower_id = $entity_id
                    OR coalesce(e.golden_id, e.number, e.account_number, e.handle, e.address, elementId(e)) = $entity_id
                FOREACH (_ IN CASE WHEN e IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (e)-[:HAS_ANOMALY]->(a)
                )
                """
                session.run(cypher, {
                    "finding_id": f.finding_id,
                    "score": f.anomaly_score,
                    "severity": f.severity,
                    "pattern_type": f.pattern_type,
                    "category": f.category,
                    "reasons": f.supporting_observations if f.supporting_observations else [f.title],
                    "metrics": json.dumps(f.technical_details.get("raw_metrics", {})),
                    "entity_type": ent_type,
                    "entity_id": ent_id,
                    "title": f.title,
                    "what_happened": f.what_happened,
                    "why_unusual": f.why_unusual,
                    "why_relevant": f.why_relevant,
                    "case_relevance": f.case_relevance,
                    "confidence": f.detection_confidence,
                    "priority": f.investigative_priority,
                    "domain": f.category,
                    "detectors": f.detectors,
                    "evidence_refs": f.evidence_refs,
                    "timeline_json": json.dumps(f.timeline_context),
                    "graph_context_json": json.dumps(f.graph_context),
                    "spatial_context_json": json.dumps(f.spatial_context)
                })


orchestrator = MultiEngineOrchestrator()
