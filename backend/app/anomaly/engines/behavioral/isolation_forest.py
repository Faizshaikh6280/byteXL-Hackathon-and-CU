from typing import Dict, Any, List
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class BehavioralIsolationForestDetector(BaseDetector):
    """
    Engine #1: Behavioral Anomaly Engine.
    Uses an Isolation Forest ensemble trained over multi-dimensional behavioral vectors
    to isolate entities exhibiting abnormal communication, transaction, or movement footprints.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-BEHAVIORAL-IF",
            name="Behavioral Isolation Forest Detector",
            version="v2.0.0",
            detector_type=DetectorType.BEHAVIORAL,
            domain="CROSS_DOMAIN",
            applicable_domains=["TELECOM", "BANKING", "NETWORK", "CROSS_DOMAIN"],
            required_fields=["all_events"],
            min_sample_size=3,
            description="Isolates statistical outliers across combined communication, financial, and spatial features."
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
                not_applicable_reason="Insufficient entity population for peer-relative Isolation Forest."
            )

        feature_cols = [
            "call_count", "unique_contacts", "avg_call_duration",
            "night_activity_ratio", "unique_imeis", "transaction_count",
            "total_volume_inr", "max_transaction_inr", "inflow_outflow_ratio",
            "total_distance_km", "max_speed_kmh", "session_count"
        ]

        # Ensure all columns exist
        available_cols = [c for c in feature_cols if c in population_df.columns]
        if not available_cols:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Feature matrix columns unavailable."
            )

        X = population_df[available_cols].values
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = IsolationForest(
            n_estimators=anomaly_config.isolation_forest_estimators,
            contamination=anomaly_config.isolation_forest_contamination,
            random_state=42
        )
        model.fit(X_scaled)

        # Locate this entity in the matrix
        entity_mask = population_df["entity_id"] == entity_id
        if not entity_mask.any():
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        row_idx = np.where(entity_mask)[0][0]
        entity_vector = X_scaled[row_idx:row_idx+1]

        raw_score = float(model.score_samples(entity_vector)[0]) # negative values are more anomalous
        all_scores = model.score_samples(X_scaled)
        min_s, max_s = float(np.min(all_scores)), float(np.max(all_scores))

        # Normalize score to 0 - 100
        if max_s > min_s:
            norm_score = 100.0 * (1.0 - (raw_score - min_s) / (max_s - min_s))
        else:
            norm_score = 0.0

        is_flagged = bool(norm_score >= 60.0)

        # Identify contributing features by checking z-score on scaled values
        signals = []
        features = {}
        for idx, col in enumerate(available_cols):
            val = float(population_df[col].iloc[row_idx])
            mean_val = float(population_df[col].mean())
            features[col] = val
            if mean_val > 0 and val > 2.0 * mean_val and val > 1:
                ratio = round(val / mean_val, 1)
                signals.append(f"{col.replace('_', ' ').title()} was {ratio}x above peer baseline ({val} vs peer avg {round(mean_val, 1)}).")

        explanation = f"Isolation Forest identified behavioral divergence (Score: {round(norm_score, 1)}/100). " + " ".join(signals[:3])

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED if is_flagged else DetectorStatus.NORMAL,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=round(raw_score, 4),
            normalized_score=round(norm_score, 1),
            confidence=0.88,
            title="Behavioral Deviation Detected",
            signals=signals,
            features=features,
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=entity_data.get("event_ids", [])[:10]
        )
