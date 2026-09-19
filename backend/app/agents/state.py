from typing import TypedDict, Dict, Any, Optional

class InvestigationState(TypedDict):
    community_id: int
    community_json: Dict[str, Any]
    financial_analysis: Optional[Dict[str, Any]]
    geographic_analysis: Optional[Dict[str, Any]]
    temporal_analysis: Optional[Dict[str, Any]]
    final_intelligence_dossier: Optional[Dict[str, Any]]
