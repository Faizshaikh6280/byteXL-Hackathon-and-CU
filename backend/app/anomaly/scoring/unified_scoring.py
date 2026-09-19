import hashlib
import uuid
from typing import List, Dict, Any
from app.anomaly.schemas.anomaly_contracts import (
    DetectorExecutionResult, DetectorStatus, UnifiedFindingContract, SeverityLevel
)
from app.anomaly.config.anomaly_config import anomaly_config
from app.anomaly.explainability.explanation_generator import explanation_generator

class UnifiedScoringEngine:
    """
    Unified Scoring, Corroboration & Deduplication Engine.
    Synthesizes multiple detector outputs for an entity into a consolidated finding.
    Applies multi-lens corroboration bonuses, false-positive dampening, and deterministic fingerprinting.
    """

    @staticmethod
    def calculate_fingerprint(case_id: str, entity_id: str, pattern: str) -> str:
        raw = f"{case_id}:{entity_id}:{pattern}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:16]

    def consolidate_findings(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        results: List[DetectorExecutionResult]
    ) -> List[UnifiedFindingContract]:
        """
        Consolidates detector results into unified, deduplicated findings.
        """
        flagged_results = [r for r in results if r.status == DetectorStatus.FLAGGED]
        if not flagged_results:
            return []

        # Group flagged results by entity
        all_signals = []
        all_evidence_refs = set()
        all_event_refs = set()
        all_graph_refs = set()
        all_metrics = {}
        contributing_detectors = []

        scores = []
        confidences = []
        
        gds_score = 0.0
        ml_base_score = 0.0
        ml_detector_name = "N/A"

        for r in flagged_results:
            contributing_detectors.append(r.detector_id)
            all_signals.extend(r.signals)
            all_evidence_refs.update(r.evidence_refs)
            all_event_refs.update(r.canonical_event_refs)
            all_graph_refs.update(r.graph_refs)
            all_metrics.update(r.features)
            scores.append(r.normalized_score)
            confidences.append(r.confidence)
            
            if r.detector_id == "DET-GDS-CENTRALITY":
                gds_score = r.normalized_score
            elif r.normalized_score > ml_base_score:
                ml_base_score = r.normalized_score
                ml_detector_name = r.detector_id

        # Explicitly define Risk Score Calculation as requested
        # Base ML/Rule Score (max of all non-GDS)
        if ml_base_score == 0.0:
            ml_base_score = gds_score
            ml_detector_name = "DET-GDS-CENTRALITY"

        base_score = ml_base_score
        
        # Corroboration Bonus: +8 points per additional corroborating detector lens (capped at +25)
        corroboration_bonus = min(25.0, (len(flagged_results) - 1) * 8.0) if len(flagged_results) > 1 else 0.0
        
        # GDS Multiplier: Up to 1.25x if entity is a structural graph hub
        gds_multiplier = 1.0 + (gds_score / 100.0) * 0.25 
        
        # Final Formula
        raw_unified = (base_score + corroboration_bonus) * gds_multiplier
        unified_score = min(100.0, raw_unified)
        
        # Insert transparent calculation logic directly into signals (which maps to reasons in UI)
        calc_reason = (
            f"Risk Score Formula: [(Base {ml_detector_name}: {round(base_score, 1)}) + "
            f"(Corroboration Bonus for {len(flagged_results)-1} extra engines: +{round(corroboration_bonus, 1)})] "
            f"* (GDS Centrality Multiplier: {round(gds_multiplier, 2)}x) = {round(unified_score, 1)} Final Score."
        )
        all_signals.insert(0, calc_reason)

        avg_confidence = float(sum(confidences) / len(confidences)) if confidences else 1.0

        # Severity mapping
        if unified_score >= anomaly_config.severity_critical_threshold:
            severity = SeverityLevel.CRITICAL
            priority = "VERY_HIGH"
        elif unified_score >= anomaly_config.severity_high_threshold:
            severity = SeverityLevel.HIGH
            priority = "HIGH"
        elif unified_score >= anomaly_config.severity_medium_threshold:
            severity = SeverityLevel.MEDIUM
            priority = "MEDIUM"
        else:
            severity = SeverityLevel.LOW
            priority = "LOW"

        # Determine primary lens and title
        primary_result = max(flagged_results, key=lambda x: x.normalized_score)
        primary_title = primary_result.title or "Multi-Engine Anomaly Detected"
        entity_type = entity_data.get("entity_type", "Person")

        explanation = explanation_generator.generate_unified_explanation(
            entity_id=entity_id,
            entity_type=entity_type,
            primary_detector=primary_result.detector_id,
            contributing_detectors=contributing_detectors,
            signals=all_signals,
            metrics=all_metrics
        )

        fingerprint = self.calculate_fingerprint(case_id, entity_id, primary_result.detector_id)
        finding_id = f"ANOMALY-{fingerprint[:8].upper()}-{str(uuid.uuid4())[:6].upper()}"
        
        # Ensure metrics contains the calculation breakdown for the table
        all_metrics["risk_calculation"] = {
            "base_score": round(base_score, 1),
            "corroboration_bonus": round(corroboration_bonus, 1),
            "gds_multiplier": round(gds_multiplier, 2),
            "final_score": round(unified_score, 1)
        }

        finding = UnifiedFindingContract(
            finding_id=finding_id,
            case_id=case_id,
            entity_id=entity_id,
            entity_type=entity_type,
            fingerprint=fingerprint,
            title=primary_title,
            severity=severity,
            unified_score=round(unified_score, 1),
            confidence=round(avg_confidence, 2),
            investigative_priority=priority,
            domain=primary_result.domain,
            primary_detector_type=primary_result.detector_type.value,
            contributing_detectors=contributing_detectors,
            signals=all_signals,
            features=primary_result.features,
            metrics=all_metrics,
            explanation=explanation,
            evidence_refs=list(all_evidence_refs),
            canonical_event_refs=list(all_event_refs)[:15],
            graph_refs=list(all_graph_refs) if all_graph_refs else [entity_id],
            model_metadata={
                "base_score": round(base_score, 1),
                "corroboration_bonus": round(corroboration_bonus, 1),
                "detectors_triggered_count": len(flagged_results)
            },
            provenance={
                "case_id": case_id,
                "evidence_count": len(all_evidence_refs),
                "events_count": len(all_event_refs)
            }
        )

        return [finding]

unified_scoring = UnifiedScoringEngine()
