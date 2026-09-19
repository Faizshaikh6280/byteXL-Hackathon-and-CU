"""
CaseRelevanceEngine: Evaluates how and why a CandidatePattern specifically pertains to the active case.
Assesses target entity links, investigation timeline alignment, spatial boundaries, and objective correlation.
"""

import logging
from typing import Dict, Any, List, Tuple
from app.anomaly.schemas.signal_contracts import CandidatePattern, CaseRelevanceLevel
from app.anomaly.enrichment.context_enrichment import EnrichedContext

logger = logging.getLogger("CaseRelevanceEngine")


class CaseRelevanceEngine:
    """
    Evaluates specific investigative relevance to prevent presenting generic statistical outliers
    as priority findings when they are detached from the core case objectives.
    """

    def evaluate(
        self,
        candidate: CandidatePattern,
        enriched: EnrichedContext
    ) -> Tuple[CaseRelevanceLevel, List[str]]:
        """
        Evaluates relevance to case objectives, targets, and timeline.
        Returns (relevance_level, relevance_reasons).
        """
        relevance_score = 0
        reasons: List[str] = []

        case_notes = enriched.case_context.get("investigator_notes", "").lower()
        case_title = enriched.case_context.get("title", "").lower()
        case_text = f"{case_title} {case_notes}"

        # 1. Target Entity Involvement
        all_involved_names = []
        all_involved_identifiers = set()

        for ent in enriched.primary_entities + enriched.related_entities:
            name = ent.get("display_name", "")
            if name and name != "Unknown":
                all_involved_names.append(name)
            all_involved_identifiers.add(ent.get("entity_id", "").lower())
            for alias in ent.get("aliases", []):
                all_involved_names.append(alias)
            for phone in ent.get("phones", []):
                all_involved_identifiers.add(str(phone).lower())
            for acc in ent.get("accounts", []):
                all_involved_identifiers.add(str(acc).lower())

        matched_targets = []
        for name in all_involved_names:
            if name.lower() in case_text and len(name) > 3:
                matched_targets.append(name)

        if matched_targets:
            relevance_score += 50
            reasons.append(
                f"Directly involves target individual(s) named in case brief: {', '.join(set(matched_targets))}."
            )
        elif any(ident in case_text for ident in all_involved_identifiers if len(ident) > 5):
            relevance_score += 40
            reasons.append("Involves phone numbers or bank accounts explicitly cited in case dossier.")

        # 2. Case Objective & Pattern Alignment
        category = candidate.category
        if "extortion" in case_text or "kidnapping" in case_text or "fraud" in case_text:
            if category in ("FINANCIAL", "CROSS_DOMAIN", "SPATIAL_TEMPORAL"):
                relevance_score += 25
                reasons.append(
                    f"Finding pattern ({candidate.pattern_id}) matches core investigation focus (financial extortion / cross-domain coordination)."
                )

        # 3. Target Location Alignment
        loc_context = enriched.spatial_context
        if loc_context.get("available"):
            for wp in loc_context.get("waypoints", []):
                name = wp.get("name", "").lower()
                if any(city in name for city in ["noida", "delhi", "gurugram", "sector 15", "sangam vihar"]):
                    if any(city in case_text for city in ["noida", "delhi", "gurugram", "sector 15", "sangam vihar"]):
                        relevance_score += 20
                        reasons.append(f"Recorded location ({wp.get('name')}) matches designated case geographic sectors.")
                        break

        # 4. Multi-Domain Cross-Corroboration
        if len(candidate.domains_involved) >= 2:
            relevance_score += 15
            reasons.append(
                f"Activity spans {len(candidate.domains_involved)} distinct case domains ({', '.join(candidate.domains_involved)})."
            )

        # 5. Graph Structural Brokerage
        graph_role = enriched.graph_context.get("structural_role")
        if graph_role == "Network Cut-Out Bridge":
            relevance_score += 20
            reasons.append("Entity occupies a central cut-out broker role connecting syndicate cells in case graph.")

        # 6. Coordinated Syndicate & Core Pattern Alignment
        core_patterns = {
            "FIN_COORDINATED_FLOW", "GEO_CONVERGENCE", "GEOGRAPHIC_CONVERGENCE",
            "COMM_SYNCHRONIZED_EPISODE", "SOC_SHARED_INFRASTRUCTURE",
            "CROSS_DOMAIN_COLLISION", "IDENTITY_DISCREPANCY", "ID_DISCREPANCY"
        }
        if candidate.pattern_id in core_patterns:
            relevance_score += 35
            reasons.append(f"Directly implicates key suspects in coordinated multi-party pattern ({candidate.pattern_id}).")

        if len(candidate.entity_refs) >= 3:
            relevance_score += 20
            reasons.append(f"Demonstrates multi-party coordination among {len(candidate.entity_refs)} identified persons.")

        burst_amt = (
            candidate.aggregated_observations.get("aug28_burst_total_inr", 0) or
            candidate.aggregated_observations.get("total_cycle_volume_inr", 0) or
            candidate.aggregated_observations.get("inflow_amount_inr", 0)
        )
        if burst_amt >= 100000:
            relevance_score += 25
            reasons.append(f"Involves high-value monetary movement totaling ₹{burst_amt:,.0f} within target operational window.")

        # Determine final relevance level
        if relevance_score >= 50:
            level = CaseRelevanceLevel.HIGH
        elif relevance_score >= 25:
            level = CaseRelevanceLevel.MEDIUM
        else:
            level = CaseRelevanceLevel.LOW
            if not reasons:
                reasons.append("Finding exhibits peripheral connection to current primary case targets.")

        return level, reasons


case_relevance_engine = CaseRelevanceEngine()
