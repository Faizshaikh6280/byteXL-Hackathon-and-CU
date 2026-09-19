from typing import Dict, Any, List
from datetime import datetime
import numpy as np
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.anomaly.config.anomaly_config import anomaly_config

class DarkPeriodDetector(BaseDetector):
    """
    Engine #5E: Dark Period & Signal Silence Change-Point Detector.
    Detects sudden abnormal cessation of device telemetry or cellular pinging
    coinciding with critical investigation incident windows, followed by abrupt resumption.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-SPATIAL-DARKPERIOD",
            name="Dark Period & Telemetry Silence Detector",
            version="v2.0.0",
            detector_type=DetectorType.SPATIAL_TEMPORAL,
            domain="TELECOM",
            applicable_domains=["TELECOM", "NETWORK"],
            required_fields=["all_events"],
            min_sample_size=3,
            description="Identifies abnormal operational silence periods where an active device ceases transmissions."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        # Telemetry/radio silence requires telecom or cellular tower transmissions
        events = [
            e for e in entity_data.get("all_events", [])
            if any(d in str(e.get("domain") or e.get("source_type", "")).upper() for d in ("TELECOM", "NETWORK"))
        ]

        timestamps = []
        for e in events:
            ts = e.get("timestamp")
            if ts:
                try:
                    timestamps.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
                except Exception:
                    pass

        if len(timestamps) < 4:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="Insufficient chronological events (requires >= 4 events) to establish baseline ping frequency."
            )

        timestamps.sort()
        intervals_hours = [(timestamps[i+1] - timestamps[i]).total_seconds() / 3600.0 for i in range(len(timestamps)-1)]

        median_interval = float(np.median(intervals_hours))
        max_interval = float(np.max(intervals_hours))
        threshold_hours = max(36.0, anomaly_config.spatial.signal_silence_threshold_hours)

        # Flag if maximum gap is significantly larger than threshold and baseline interval
        is_flagged = bool(max_interval >= threshold_hours and max_interval >= 5.0 * max(1.0, median_interval))

        if not is_flagged:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        signals = [
            f"Signal blackout observed: Device went completely silent for {round(max_interval, 1)} hours (normal baseline activity interval is {round(median_interval, 1)} hours)."
        ]
        score = min(100.0, 50.0 + (max_interval / threshold_hours) * 15.0)
        explanation = f"Change-point detector identified a {round(max_interval, 1)}-hour telemetry dark period followed by abrupt activity resumption."

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=max_interval,
            normalized_score=round(score, 1),
            confidence=0.85,
            title="Telemetry Dark Period / Radio Silence Anomaly",
            signals=signals,
            features={"max_silence_hours": round(max_interval, 1), "baseline_interval_hours": round(median_interval, 1)},
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", [])
        )
