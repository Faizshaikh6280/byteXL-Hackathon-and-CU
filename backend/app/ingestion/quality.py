from typing import List, Dict, Any
from app.schemas.canonical_event import CanonicalEvent

class DataQualityEngine:
    """
    Computes rigorous data quality metrics, missing-field ratios,
    and composite quality scores for ingested evidence.
    """

    @staticmethod
    def calculate_quality_metrics(
        total_records: int,
        valid_events: List[CanonicalEvent],
        invalid_count: int,
        duplicate_count: int
    ) -> Dict[str, Any]:
        if total_records == 0:
            return {
                "total_records": 0,
                "valid_records": 0,
                "invalid_records": 0,
                "duplicate_records": 0,
                "missing_field_ratios": {},
                "quality_score": 100.0
            }

        valid_count = len(valid_events)

        # Calculate missing field ratios on valid records
        missing_phones = sum(1 for e in valid_events if not e.entities.phone)
        missing_names = sum(1 for e in valid_events if not e.entities.name)
        missing_ids = sum(1 for e in valid_events if not e.entities.national_id)
        missing_geo = sum(1 for e in valid_events if e.telemetry.lat is None or e.telemetry.lng is None)

        missing_ratios = {
            "missing_phone_ratio": round(missing_phones / total_records, 4),
            "missing_name_ratio": round(missing_names / total_records, 4),
            "missing_national_id_ratio": round(missing_ids / total_records, 4),
            "missing_coordinates_ratio": round(missing_geo / total_records, 4)
        }

        # Quality score formula (0 to 100)
        invalid_penalty = (invalid_count / total_records) * 50.0
        duplicate_penalty = (duplicate_count / total_records) * 20.0
        missing_penalty = (missing_ratios["missing_phone_ratio"] * 0.5 + missing_ratios["missing_name_ratio"] * 0.5) * 30.0

        raw_score = 100.0 - (invalid_penalty + duplicate_penalty + missing_penalty)
        quality_score = round(max(0.0, min(100.0, raw_score)), 2)

        return {
            "total_records": total_records,
            "valid_records": valid_count,
            "invalid_records": invalid_count,
            "duplicate_records": duplicate_count,
            "missing_field_ratios": missing_ratios,
            "quality_score": quality_score
        }

data_quality_engine = DataQualityEngine()
