from abc import ABC, abstractmethod
import re
import datetime
from typing import List, Dict, Any, Optional
from app.schemas.canonical_event import CanonicalEvent

class BaseParser(ABC):
    """Abstract interface for all domain-specific evidence parser adapters."""

    parser_version: str = "v1.0.0"
    schema_version: str = "v1.0.0"

    @abstractmethod
    def can_parse(self, detected_type: str, filename: str) -> bool:
        """Determines if this parser handles the given domain and format."""
        pass

    @abstractmethod
    def parse(
        self,
        content_bytes: bytes,
        case_id: str,
        evidence_id: str,
        filename: str,
        evidence_sha256: str
    ) -> List[CanonicalEvent]:
        """
        Parses raw evidence bytes into standardized CanonicalEvent objects.
        Preserves original attributes in the attributes dictionary.
        """
        pass

    @staticmethod
    def clean_phone(phone_raw: Optional[str]) -> Optional[str]:
        """
        Standardizes phone numbers to international E.164 format.
        Handles Indian prefixes (+91, 0, 91), dashes, spaces, and formatting characters.
        """
        if not phone_raw:
            return None
        digits = re.sub(r'\D', '', str(phone_raw))
        if len(digits) == 10:
            return f"+91{digits}"
        elif len(digits) == 11 and digits.startswith('0'):
            return f"+91{digits[1:]}"
        elif len(digits) == 12 and digits.startswith('91'):
            return f"+{digits}"
        elif len(digits) > 10:
            return f"+{digits}"
        return f"+91{digits}" if digits else None

    @staticmethod
    def clean_date(date_raw: Optional[str]) -> str:
        """
        Converts diverse date/time strings to strict ISO-8601 UTC.
        Default to current UTC time if missing or completely unparseable.
        """
        if not date_raw:
            return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d-%m-%Y"
        ]
        val = str(date_raw).strip()
        for fmt in formats:
            try:
                dt = datetime.datetime.strptime(val, fmt)
                return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                continue
        return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    @staticmethod
    def parse_float(val: Any, default: float = 0.0) -> float:
        """Safely parse floats, stripping commas and currency symbols."""
        if val is None:
            return default
        try:
            cleaned = re.sub(r'[^\d.-]', '', str(val))
            return float(cleaned) if cleaned else default
        except Exception:
            return default
