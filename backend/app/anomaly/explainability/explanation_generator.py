from typing import List, Dict, Any

class ExplanationGenerator:
    """
    Synthesizes factual, human-readable explanations from detector outputs.
    Ensures that every sentence references verified evidence, timestamps,
    transaction values, or topological graph metrics.
    """

    @staticmethod
    def generate_unified_explanation(
        entity_id: str,
        entity_type: str,
        primary_detector: str,
        contributing_detectors: List[str],
        signals: List[str],
        metrics: Dict[str, Any]
    ) -> str:
        paragraphs = []

        # Headline statement
        paragraphs.append(
            f"Entity '{entity_id}' ({entity_type}) was flagged with elevated investigative risk by {len(contributing_detectors)} anomaly detection lenses (Primary: {primary_detector})."
        )

        # Evidence bullet points
        if signals:
            paragraphs.append("Key investigative signals detected:")
            for s in signals:
                paragraphs.append(f" • {s}")

        # Metrics summary
        metric_items = []
        for k, v in metrics.items():
            if isinstance(v, (int, float)):
                metric_items.append(f"{k.replace('_', ' ').title()}: {v}")
        if metric_items:
            paragraphs.append("Key Quantitative Metrics: " + ", ".join(metric_items[:5]) + ".")

        return "\n".join(paragraphs)

explanation_generator = ExplanationGenerator()
