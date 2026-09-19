from typing import List, Optional
from app.ingestion.parsers.base import BaseParser
from app.ingestion.parsers.cdr_parser import CDRParser
from app.ingestion.parsers.ipdr_parser import IPDRParser
from app.ingestion.parsers.banking_parser import BankingParser
from app.ingestion.parsers.social_parser import SocialParser
from app.ingestion.parsers.kyc_parser import KYCParser

from app.ingestion.parsers.generic_parser import GenericTabularParser

class ParserRegistry:
    """Registry maintaining available domain parser adapters."""

    def __init__(self):
        self._parsers: List[BaseParser] = [
            CDRParser(),
            IPDRParser(),
            BankingParser(),
            SocialParser(),
            KYCParser(),
            GenericTabularParser(),
        ]

    def register_parser(self, parser: BaseParser):
        """Register a new domain or format parser adapter."""
        self._parsers.insert(0, parser)

    def get_parser(self, detected_type: str, filename: str) -> BaseParser:
        """Find the matching parser adapter for the detected source type and file."""
        for parser in self._parsers:
            if parser.can_parse(detected_type, filename):
                return parser
        return GenericTabularParser()

# Singleton instance
parser_registry = ParserRegistry()
