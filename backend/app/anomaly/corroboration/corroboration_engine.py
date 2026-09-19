"""
CorroborationEngine: Evaluates independent multi-domain corroboration while mitigating mathematical double-counting.
Prioritizes cross-domain confirmation (BANK + CDR + IPDR + SOCIAL) over redundant algorithmic repetition.
"""

import logging
from typing import Dict, Any, List, Set, Tuple
from app.anomaly.schemas.signal_contracts import CandidatePattern, DetectionSignal

logger = logging.getLogger("CorroborationEngine")


class CorroborationResult:
    def __init__(self):
        self.calibrated_anomaly_score: float = 0.0
        self.detection_confidence: float = 1.0
        self.corroboration_bonus: float = 0.0
        self.domain_bonus: float = 0.0
        self.independent_domains: List[str] = []
        self.effective_detectors: List[str] = []
        self.double_counting_dampened_count: int = 0
        self.corroboration_summary: str = ""


class CorroborationEngine:
    """
    Computes true evidential corroboration across independent domains and engines.
    Applies double-counting protection when multiple models look at the same data points.
    """

    # Families of mathematically correlated engines
    CORRELATED_FAMILIES = {
        "STATISTICAL_FAMILY": {"DET-BEHAVIORAL-IF", "DET-STATISTICAL", "DET-ADV-AUTOENCODER"},
        "GRAPH_TOPOLOGY_FAMILY": {"DET-GRAPH-NETWORK", "DET-GDS-CENTRALITY", "DET-ADV-NODE2VEC", "DET-ADV-RGCN"}
    }

    def evaluate(
        self,
        candidate: CandidatePattern
    ) -> CorroborationResult:
        result = CorroborationResult()
        all_signals = candidate.primary_signals + candidate.supporting_signals

        if not all_signals:
            return result

        # 1. Base Score from primary signal
        base_score = candidate.primary_signals[0].normalized_score if candidate.primary_signals else 50.0

        # 2. Extract unique domains
        domains = sorted(list({s.domain for s in all_signals if s.domain}))
        result.independent_domains = domains

        # 3. Detect mathematical redundancy across algorithms
        seen_families: Set[str] = set()
        effective_detectors: List[str] = []
        dampened_count = 0

        for s in all_signals:
            det_id = s.detector_id
            family_found = None
            for fam_name, fam_members in self.CORRELATED_FAMILIES.items():
                if det_id in fam_members:
                    family_found = fam_name
                    break

            if family_found:
                if family_found in seen_families:
                    dampened_count += 1
                else:
                    seen_families.add(family_found)
                    effective_detectors.append(det_id)
            else:
                effective_detectors.append(det_id)

        result.effective_detectors = effective_detectors
        result.double_counting_dampened_count = dampened_count

        # 4. Corroboration Bonus
        # +5 points per distinct effective analytical engine (capped at +15)
        extra_engines = max(0, len(effective_detectors) - 1)
        engine_bonus = min(15.0, extra_engines * 5.0)

        # 5. Multi-Domain Diversity Bonus (Strongest form of corroboration)
        # +10 points per additional independent domain (capped at +25)
        extra_domains = max(0, len(domains) - 1)
        domain_bonus = min(25.0, extra_domains * 10.0)

        result.corroboration_bonus = round(engine_bonus, 1)
        result.domain_bonus = round(domain_bonus, 1)

        # 6. Composite Score Calculation (Calibrated to prevent saturation per negative controls)
        raw_final = base_score + (engine_bonus * 0.5) + (domain_bonus * 0.5)
        result.calibrated_anomaly_score = round(min(92.0, max(0.0, raw_final)), 1)

        # 7. Confidence Calibration
        confidences = [s.detector_confidence for s in all_signals if s.detector_confidence > 0]
        avg_conf = sum(confidences) / len(confidences) if confidences else 1.0
        # Boost confidence when multiple independent domains corroborate
        if len(domains) >= 2:
            avg_conf = min(1.0, avg_conf + 0.05)
        result.detection_confidence = round(avg_conf, 2)

        # Summary string
        summary_parts = [f"Base score: {base_score:.1f}"]
        if domain_bonus > 0:
            summary_parts.append(f"+{domain_bonus:.1f} Multi-Domain Bonus ({', '.join(domains)})")
        if engine_bonus > 0:
            summary_parts.append(f"+{engine_bonus:.1f} Detector Corroboration Bonus ({len(effective_detectors)} lenses)")
        if dampened_count > 0:
            summary_parts.append(f"({dampened_count} redundant mathematical signals dampened)")

        result.corroboration_summary = "; ".join(summary_parts)
        return result


corroboration_engine = CorroborationEngine()
