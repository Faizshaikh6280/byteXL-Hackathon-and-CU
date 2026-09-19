from typing import Dict, Any, List
import numpy as np
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class StatisticalDeviationEngine(BaseDetector):
    """
    Engine #3: Statistical Deviation Engine.
    Computes Robust Z-score (MAD), Standard Z-score, and IQR outlier boundaries
    across monetary transactions, call volume, duration, and session throughput.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-STATISTICAL",
            name="Statistical Deviation & Outlier Engine",
            version="v2.0.0",
            detector_type=DetectorType.STATISTICAL,
            domain="CROSS_DOMAIN",
            applicable_domains=["BANKING", "TELECOM", "NETWORK"],
            required_fields=["all_events"],
            min_sample_size=3,
            description="Identifies mathematical outliers using Z-score, Median Absolute Deviation (MAD), and IQR."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        population_df = context.get("population_matrix")

        if population_df is None or len(population_df) < meta.min_sample_size:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Insufficient population size for statistical baselines."
            )

        metrics_to_test = ["total_volume_inr", "max_transaction_inr", "call_count", "total_bytes_transferred"]
        outlier_signals = []
        max_dev_score = 0.0
        features = {}

        entity_row = population_df[population_df["entity_id"] == entity_id]
        if entity_row.empty:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        for col in metrics_to_test:
            if col not in population_df.columns:
                continue

            series = population_df[col].values
            observed = float(entity_row[col].iloc[0])
            features[col] = observed

            if observed <= 0:
                continue

            # Compute Median and MAD (Robust Z-score)
            median = float(np.median(series))
            mad = float(np.median(np.abs(series - median)))
            # Standard deviation and IQR
            q75, q25 = np.percentile(series, [75, 25])
            iqr = q75 - q25
            iqr_cutoff = q75 + (anomaly_config.iqr_multiplier * iqr)

            robust_z = (0.6745 * (observed - median) / mad) if mad > 0 else 0.0
            std_val = float(np.std(series))
            mean_val = float(np.mean(series))
            std_z = ((observed - mean_val) / std_val) if std_val > 0 else 0.0

            if robust_z >= anomaly_config.robust_z_threshold or (iqr > 0 and observed > iqr_cutoff):
                score_candidate = min(100.0, 50.0 + (robust_z * 10.0))
                if score_candidate > max_dev_score:
                    max_dev_score = score_candidate

                readable_col = col.replace("_", " ").title()
                outlier_signals.append(
                    f"{readable_col} of {observed:,.1f} is a statistical outlier (Robust Z: {round(robust_z, 2)}, Peer Median: {round(median, 1)}, IQR 75th: {round(q75, 1)})."
                )

        is_flagged = bool(max_dev_score >= 50.0)
        explanation = (
            f"Observed statistical distribution divergence (Peak Score: {round(max_dev_score, 1)}/100). " + " ".join(outlier_signals)
            if is_flagged else "All observed metrics fall within standard peer statistical baselines."
        )

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED if is_flagged else DetectorStatus.NORMAL,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=round(max_dev_score, 2),
            normalized_score=round(max_dev_score, 1),
            confidence=0.85,
            title="Statistical Metric Outlier",
            signals=outlier_signals,
            features=features,
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=entity_data.get("event_ids", [])[:10]
        )
