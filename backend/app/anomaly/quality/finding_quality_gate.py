"""
FindingQualityGate: Evaluates 12 strict validation criteria before a CandidatePattern is promoted
to a final, investigator-facing InvestigativeFinding.
Prevents ungrounded statistical outliers, missing evidence, or duplicate findings from polluting the dossier.
"""

import logging
from typing import Dict, Any, List
from datetime import datetime
from app.anomaly.schemas.signal_contracts import InvestigativeFinding
from app.anomaly.evidence.evidence_binding_engine import EvidenceValidationResult

logger = logging.getLogger("FindingQualityGate")


class QualityGateResult:
    def __init__(self):
        self.passed: bool = False
        self.reasons: List[str] = []
        self.checks: Dict[str, bool] = {}


class FindingQualityGate:
    """
    Enforces production quality standards for investigative intelligence.
    A candidate that fails quality criteria is retained as a SupportingObservation / DetectionSignal
    and is strictly rejected from promotion to the primary investigator dossier.
    """

    def validate(
        self,
        finding: InvestigativeFinding,
        evidence_res: EvidenceValidationResult
    ) -> QualityGateResult:
        res = QualityGateResult()
        checks: Dict[str, bool] = {}
        failures: List[str] = []

        # 1. Valid Case
        has_case = bool(finding.case_id and finding.case_id.strip())
        checks["valid_case"] = has_case
        if not has_case:
            failures.append("Missing valid case_id.")

        # 2. Valid Entities
        has_entities = bool(finding.primary_entities and len(finding.primary_entities) > 0)
        checks["valid_entities"] = has_entities
        if not has_entities:
            failures.append("No primary entities resolved for this finding.")

        # 3. Valid Events
        has_events = bool(finding.supporting_events or len(evidence_res.event_refs) > 0)
        checks["valid_events"] = has_events
        if not has_events:
            failures.append("No canonical events bound to this finding.")

        # 4. Evidence Exists
        has_evidence = bool(finding.evidence_refs and len(finding.evidence_refs) > 0)
        checks["evidence_exists"] = has_evidence
        if not has_evidence:
            failures.append("No cryptographic evidence references linked to finding.")

        # 5. Timestamps Coherent
        timestamps_coherent = True
        t_range = finding.time_range
        t_start = t_range.get("start")
        t_end = t_range.get("end")
        if t_start and t_end:
            try:
                dt_start = datetime.fromisoformat(t_start.replace("Z", "+00:00"))
                dt_end = datetime.fromisoformat(t_end.replace("Z", "+00:00"))
                if dt_start > dt_end:
                    timestamps_coherent = False
                    failures.append("Incoherent timeline: start timestamp occurs after end timestamp.")
            except Exception:
                pass
        checks["timestamps_coherent"] = timestamps_coherent

        # 6. Pattern is Meaningful
        pattern_meaningful = bool(finding.pattern_type and finding.pattern_type != "UNKNOWN")
        checks["pattern_meaningful"] = pattern_meaningful
        if not pattern_meaningful:
            failures.append("Pattern type is unknown or invalid.")

        # 7. Deduplication Check
        # Verified upstream in SignalCorrelationEngine; check fingerprint
        has_fingerprint = bool(finding.fingerprint and len(finding.fingerprint) > 0)
        checks["deduplication_valid"] = has_fingerprint
        if not has_fingerprint:
            failures.append("Missing deterministic fingerprint.")

        # 8. Case Relevance Established
        case_rel_str = finding.case_relevance.value if hasattr(finding.case_relevance, "value") else str(finding.case_relevance or "")
        case_rel_valid = case_rel_str in ("HIGH", "MEDIUM", "LOW")
        checks["case_relevance_established"] = case_rel_valid
        if not case_rel_valid:
            failures.append("Case relevance unclassified.")

        # 9. Explanation Fields Generated
        explanations_valid = bool(
            finding.title and
            finding.what_happened and len(finding.what_happened) > 10 and
            finding.why_unusual and len(finding.why_unusual) > 10 and
            finding.why_relevant and len(finding.why_relevant) > 10
        )
        checks["explanations_generated"] = explanations_valid
        if not explanations_valid:
            failures.append("Incomplete explanation layers (Title, What Happened, Why Unusual, or Why Relevant missing).")

        # 10. No Unsupported Factual Claims
        no_unsupported = bool(len(evidence_res.unsupported_claims) == 0)
        checks["no_unsupported_claims"] = no_unsupported
        if not no_unsupported:
            failures.extend(evidence_res.unsupported_claims)

        # 11. Complete Provenance
        has_provenance = bool(finding.detectors and len(finding.detectors) > 0)
        checks["provenance_available"] = has_provenance
        if not has_provenance:
            failures.append("Detector references missing.")

        # 12. Not Merely a Numerical Outlier Without Context
        # A standalone generic model without supporting domain events is not promoted
        is_bare_outlier = (
            len(finding.detectors) == 1 and
            finding.detectors[0] in ("DET-BEHAVIORAL-IF", "DET-STATISTICAL") and
            len(finding.supporting_events) == 0
        )
        not_bare_outlier = not is_bare_outlier
        checks["not_bare_numerical_outlier"] = not_bare_outlier
        if not not_bare_outlier:
            failures.append("Rejected: Bare numerical outlier without corroborating event context.")

        all_passed = all(checks.values())
        res.passed = all_passed
        res.checks = checks
        res.reasons = failures

        if not all_passed:
            logger.info(
                f"[QualityGate] Finding '{finding.title}' failed quality checks ({len(failures)} failures): {failures}. Retaining as supporting observation."
            )

        return res


finding_quality_gate = FindingQualityGate()
