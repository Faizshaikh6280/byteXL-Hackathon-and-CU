from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class BaseDetector(ABC):
    """
    Abstract base class for all anomaly detection lenses.
    Provides standard lifecycle methods: metadata inspection, input validation,
    execution, failure isolation, and normalized result emission.
    """

    @abstractmethod
    def get_metadata(self) -> DetectorMetadata:
        """Returns declarative metadata: ID, type, domain, required fields, version."""
        pass

    def validate_input(self, entity_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Verifies whether the entity data contains the required fields/events
        for this detector to compute a valid result.
        Returns:
            (is_valid: bool, missing_fields: List[str])
        """
        meta = self.get_metadata()
        missing = []
        for req in meta.required_fields:
            # Check top level or domain-specific sub-dictionaries
            parts = req.split(".")
            val = entity_data
            for p in parts:
                if isinstance(val, dict):
                    val = val.get(p)
                else:
                    val = None
                    break
            if val is None or (isinstance(val, (list, dict, str)) and len(val) == 0):
                missing.append(req)

        return (len(missing) == 0, missing)

    @abstractmethod
    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        """Core detection logic implemented by subclasses."""
        pass

    def execute(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        """
        Safe execution wrapper with validation, failure isolation, and standardized outputs.
        """
        meta = self.get_metadata()
        is_valid, missing = self.validate_input(entity_data)

        if not is_valid:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_version=meta.version,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                missing_fields=missing,
                not_applicable_reason=f"Missing required fields: {', '.join(missing)}"
            )

        try:
            return self.run_detection(case_id, entity_id, entity_data, context)
        except Exception as e:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_version=meta.version,
                detector_type=meta.detector_type,
                status=DetectorStatus.ERROR,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                error_info=str(e),
                explanation=f"Detector encountered execution error: {e}"
            )
