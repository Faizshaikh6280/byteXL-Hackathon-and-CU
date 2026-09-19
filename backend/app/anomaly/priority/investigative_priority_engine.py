"""
InvestigativePriorityEngine: Computes investigative operational priority separately from anomaly score.
Evaluates case relevance, evidence quality, independent corroboration, pattern severity, and target entity involvement.
"""

import logging
from typing import Dict, Any, List
from app.anomaly.schemas.signal_contracts import (
    CandidatePattern, CaseRelevanceLevel, InvestigativePriorityLevel, SeverityLevel
)
from app.anomaly.corroboration.corroboration_engine import CorroborationResult
from app.anomaly.evidence.evidence_binding_engine import EvidenceValidationResult

logger = logging.getLogger("InvestigativePriorityEngine")


class InvestigativePriorityEngine:
    """
    Decouples raw anomaly score from investigative action priority.
    A high numerical anomaly score without case relevance should NOT monopolize investigator attention,
    while a moderate-score finding that directly implicates a case target deserves high priority.
    """

    def compute_priority(
        self,
        candidate: CandidatePattern,
        corroboration: CorroborationResult,
        evidence_res: EvidenceValidationResult,
        case_relevance: CaseRelevanceLevel,
        relevance_reasons: List[str]
    ) -> tuple[InvestigativePriorityLevel, SeverityLevel]:
        priority_points = 0.0

        # 1. Case Relevance Weight (Strongest factor, up to 45 points)
        if case_relevance == CaseRelevanceLevel.HIGH:
            priority_points += 45.0
        elif case_relevance == CaseRelevanceLevel.MEDIUM:
            priority_points += 25.0
        else:
            priority_points += 5.0

        # 2. Evidence Quality (Up to 25 points)
        if evidence_res.quality_tier == "HIGH":
            priority_points += 25.0
        elif evidence_res.quality_tier == "MEDIUM":
            priority_points += 15.0
        else:
            priority_points += 5.0

        # 3. Independent Domain Diversity (Up to 20 points)
        domain_count = len(corroboration.independent_domains)
        if domain_count >= 3:
            priority_points += 20.0
        elif domain_count >= 2:
            priority_points += 12.0
        else:
            priority_points += 5.0

        # 4. Pattern Severity Weight
        high_severity_patterns = {
            "FIN_RAPID_TRANSFER_TO_CASH", "FIN_RAPID_FAN_OUT", "GEO_IMPOSSIBLE_TRAVEL",
            "CROSS_DOMAIN_COLLISION", "SOC_SHARED_INFRASTRUCTURE", "GRAPH_NETWORK_BRIDGE"
        }
        if candidate.pattern_id in high_severity_patterns:
            priority_points += 15.0
        else:
            priority_points += 5.0

        # 5. Anomaly Score Contribution (Capped to prevent score from dominating)
        score_contrib = (corroboration.calibrated_anomaly_score / 100.0) * 15.0
        priority_points += score_contrib

        # Map to InvestigativePriorityLevel
        if priority_points >= 80.0:
            priority = InvestigativePriorityLevel.CRITICAL
        elif priority_points >= 60.0:
            priority = InvestigativePriorityLevel.HIGH
        elif priority_points >= 40.0:
            priority = InvestigativePriorityLevel.MEDIUM
        else:
            priority = InvestigativePriorityLevel.LOW

        # Map to SeverityLevel based on pattern nature and anomaly magnitude
        if corroboration.calibrated_anomaly_score >= 85.0 or candidate.pattern_id in ("FIN_RAPID_TRANSFER_TO_CASH", "GEO_IMPOSSIBLE_TRAVEL"):
            severity = SeverityLevel.CRITICAL
        elif corroboration.calibrated_anomaly_score >= 70.0:
            severity = SeverityLevel.HIGH
        elif corroboration.calibrated_anomaly_score >= 50.0:
            severity = SeverityLevel.MEDIUM
        else:
            severity = SeverityLevel.LOW

        return priority, severity


investigative_priority_engine = InvestigativePriorityEngine()
