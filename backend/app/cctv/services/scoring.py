from typing import Dict, Any, List

def calculate_route_relevance(
    distance_km: float,
    travel_time_seconds: int,
    govt_sources_count: int,
    private_sources_count: int,
    coverage_gaps_count: int,
    is_direct_arterial: bool = True
) -> Dict[str, Any]:
    """
    Computes the Investigative Route Relevance Score (0.0 to 1.0).
    Factors:
    - Surveillance density: Government cameras and potential private sources
    - Continuity: Penalizes unmonitored coverage gaps
    - Travel time plausibility: Rewards direct arterial connections
    """
    score = 0.50

    # Surveillance density bonus
    score += min(0.30, (govt_sources_count * 0.06) + (private_sources_count * 0.03))

    # Arterial connectivity bonus
    if is_direct_arterial:
        score += 0.12

    # Coverage gap penalty (small penalty for investigative awareness, not disqualifying)
    gap_penalty = min(0.15, coverage_gaps_count * 0.04)
    score -= gap_penalty

    # Plausibility bounds
    score = max(0.40, min(0.98, score))
    score = round(score, 2)

    # Categorical rating
    if score >= 0.75:
        category = "High"
    elif score >= 0.55:
        category = "Medium"
    else:
        category = "Low"

    return {
        "relevance_score": score,
        "coverage_category": category
    }
