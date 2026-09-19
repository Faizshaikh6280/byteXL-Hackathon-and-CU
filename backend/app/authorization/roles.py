"""
Canonical Role Definitions and Default Permission Mappings for the Investigation Platform.
"""

from typing import Dict, List, Set
from app.authorization.permissions import Permissions, ALL_PERMISSIONS

class Roles:
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    SUPERINTENDENT = "SUPERINTENDENT"
    IPS_OFFICER = "IPS_OFFICER"
    INSPECTOR = "INSPECTOR"
    SUB_INSPECTOR = "SUB_INSPECTOR"
    ANALYST = "ANALYST"
    AUDITOR = "AUDITOR"


ROLE_DEFINITIONS: Dict[str, Dict[str, any]] = {
    Roles.SYSTEM_ADMIN: {
        "display_name": "System Administrator",
        "description": "Enterprise administrator with universal access across users, security, case dossiers, and forensic analytics.",
        "is_system_role": True,
        "permissions": sorted(list(ALL_PERMISSIONS))
    },
    Roles.SUPERINTENDENT: {
        "display_name": "Superintendent of Police (SP)",
        "description": "Executive supervision over cases, personnel assignments, report approvals, and unit activity.",
        "is_system_role": True,
        "permissions": [
            Permissions.CASE_CREATE,
            Permissions.CASE_READ,
            Permissions.CASE_UPDATE,
            Permissions.CASE_ASSIGN,
            Permissions.CASE_CLOSE,
            Permissions.EVIDENCE_VIEW,
            Permissions.EVIDENCE_NFC_ACQUIRE,
            Permissions.EVIDENCE_DOWNLOAD,
            Permissions.EVIDENCE_EXPORT,
            Permissions.ENTITY_VIEW,
            Permissions.GRAPH_VIEW,
            Permissions.GRAPH_EXPORT,
            Permissions.TIMELINE_VIEW,
            Permissions.TIMELINE_EXPORT,
            Permissions.GEOSPATIAL_VIEW,
            Permissions.GEOSPATIAL_EXPORT,
            Permissions.CCTV_VIEW,
            Permissions.CCTV_ANALYZE,
            Permissions.ANOMALY_VIEW,
            Permissions.ANOMALY_INVESTIGATE,
            Permissions.ANOMALY_ACKNOWLEDGE,
            Permissions.FINDING_VIEW,
            Permissions.FINDING_APPROVE,
            Permissions.FINDING_CLOSE,
            Permissions.REPORT_CREATE,
            Permissions.REPORT_VIEW,
            Permissions.REPORT_EXPORT,
            Permissions.AUDIT_VIEW,
            Permissions.USER_VIEW,
            Permissions.USER_CREATE,
            Permissions.USER_UPDATE,
        ]
    },
    Roles.IPS_OFFICER: {
        "display_name": "IPS Officer / Senior Investigator",
        "description": "Operational lead with full investigative capabilities across cases, evidence, and entity analysis.",
        "is_system_role": True,
        "permissions": [
            Permissions.CASE_CREATE,
            Permissions.CASE_READ,
            Permissions.CASE_UPDATE,
            Permissions.CASE_ASSIGN,
            Permissions.EVIDENCE_VIEW,
            Permissions.EVIDENCE_UPLOAD,
            Permissions.EVIDENCE_NFC_ACQUIRE,
            Permissions.EVIDENCE_DOWNLOAD,
            Permissions.EVIDENCE_EXPORT,
            Permissions.ENTITY_VIEW,
            Permissions.ENTITY_RESOLVE,
            Permissions.ENTITY_MERGE,
            Permissions.ENTITY_SPLIT,
            Permissions.GRAPH_VIEW,
            Permissions.GRAPH_EXPORT,
            Permissions.TIMELINE_VIEW,
            Permissions.TIMELINE_EXPORT,
            Permissions.GEOSPATIAL_VIEW,
            Permissions.GEOSPATIAL_EXPORT,
            Permissions.CCTV_VIEW,
            Permissions.CCTV_ANALYZE,
            Permissions.CCTV_VERIFY,
            Permissions.ANOMALY_VIEW,
            Permissions.ANOMALY_INVESTIGATE,
            Permissions.ANOMALY_ACKNOWLEDGE,
            Permissions.ANOMALY_DISMISS,
            Permissions.FINDING_VIEW,
            Permissions.FINDING_CREATE,
            Permissions.FINDING_UPDATE,
            Permissions.FINDING_APPROVE,
            Permissions.FINDING_CLOSE,
            Permissions.REPORT_CREATE,
            Permissions.REPORT_VIEW,
            Permissions.REPORT_EXPORT,
            Permissions.AUDIT_VIEW,
            Permissions.USER_VIEW,
        ]
    },
    Roles.INSPECTOR: {
        "display_name": "Police Inspector",
        "description": "Lead field and forensic investigator for assigned cases.",
        "is_system_role": True,
        "permissions": [
            Permissions.CASE_CREATE,
            Permissions.CASE_READ,
            Permissions.CASE_UPDATE,
            Permissions.EVIDENCE_VIEW,
            Permissions.EVIDENCE_UPLOAD,
            Permissions.EVIDENCE_NFC_ACQUIRE,
            Permissions.EVIDENCE_DOWNLOAD,
            Permissions.ENTITY_VIEW,
            Permissions.ENTITY_RESOLVE,
            Permissions.GRAPH_VIEW,
            Permissions.TIMELINE_VIEW,
            Permissions.TIMELINE_EXPORT,
            Permissions.GEOSPATIAL_VIEW,
            Permissions.CCTV_VIEW,
            Permissions.CCTV_ANALYZE,
            Permissions.CCTV_VERIFY,
            Permissions.ANOMALY_VIEW,
            Permissions.ANOMALY_INVESTIGATE,
            Permissions.ANOMALY_ACKNOWLEDGE,
            Permissions.FINDING_VIEW,
            Permissions.FINDING_CREATE,
            Permissions.FINDING_UPDATE,
            Permissions.FINDING_APPROVE,
            Permissions.REPORT_CREATE,
            Permissions.REPORT_VIEW,
        ]
    },
    Roles.SUB_INSPECTOR: {
        "display_name": "Sub-Inspector (SI)",
        "description": "Field investigator handling evidence ingestion, search, anomaly inspection, and note taking.",
        "is_system_role": True,
        "permissions": [
            Permissions.CASE_READ,
            Permissions.EVIDENCE_VIEW,
            Permissions.EVIDENCE_UPLOAD,
            Permissions.EVIDENCE_NFC_ACQUIRE,
            Permissions.ENTITY_VIEW,
            Permissions.ENTITY_RESOLVE,
            Permissions.GRAPH_VIEW,
            Permissions.TIMELINE_VIEW,
            Permissions.GEOSPATIAL_VIEW,
            Permissions.CCTV_VIEW,
            Permissions.ANOMALY_VIEW,
            Permissions.FINDING_VIEW,
            Permissions.FINDING_CREATE,  # Suggest findings / notes
            Permissions.REPORT_VIEW,
        ]
    },
    Roles.ANALYST: {
        "display_name": "Forensic Intelligence Analyst",
        "description": "Technical analysis of telecommunication, financial, graph topology, and spatial patterns.",
        "is_system_role": True,
        "permissions": [
            Permissions.CASE_READ,
            Permissions.EVIDENCE_VIEW,
            Permissions.EVIDENCE_NFC_ACQUIRE,
            Permissions.ENTITY_VIEW,
            Permissions.ENTITY_RESOLVE,
            Permissions.GRAPH_VIEW,
            Permissions.GRAPH_EXPORT,
            Permissions.TIMELINE_VIEW,
            Permissions.TIMELINE_EXPORT,
            Permissions.GEOSPATIAL_VIEW,
            Permissions.GEOSPATIAL_EXPORT,
            Permissions.CCTV_VIEW,
            Permissions.CCTV_ANALYZE,
            Permissions.ANOMALY_VIEW,
            Permissions.ANOMALY_INVESTIGATE,
            Permissions.FINDING_VIEW,
            Permissions.FINDING_CREATE,
            Permissions.FINDING_UPDATE,
            Permissions.REPORT_CREATE,
            Permissions.REPORT_VIEW,
        ]
    },
    Roles.AUDITOR: {
        "display_name": "Compliance & Integrity Auditor",
        "description": "Independent oversight of chain of custody, system access, and investigation records.",
        "is_system_role": True,
        "permissions": [
            Permissions.AUDIT_VIEW,
            Permissions.AUDIT_EXPORT,
            Permissions.CASE_READ,
            Permissions.EVIDENCE_VIEW,
            Permissions.REPORT_VIEW,
            Permissions.SESSION_VIEW,
            Permissions.USER_VIEW,
        ]
    }
}

DEFAULT_ROLES: List[str] = list(ROLE_DEFINITIONS.keys())

ROLE_PERMISSION_MATRIX: Dict[str, List[str]] = {
    role: data["permissions"] for role, data in ROLE_DEFINITIONS.items()
}
