"""
Canonical Permission Registry for the Unified Investigative Platform.
Defines every permission token, category, and human-readable description.
"""

from typing import Dict, List, Set

class Permissions:
    # Case Management Permissions
    CASE_CREATE = "case.create"
    CASE_READ = "case.read"
    CASE_UPDATE = "case.update"
    CASE_ASSIGN = "case.assign"
    CASE_CLOSE = "case.close"
    CASE_DELETE = "case.delete"

    # Evidence Permissions
    EVIDENCE_VIEW = "evidence.view"
    EVIDENCE_UPLOAD = "evidence.upload"
    EVIDENCE_NFC_ACQUIRE = "evidence.nfc.acquire"
    EVIDENCE_DOWNLOAD = "evidence.download"
    EVIDENCE_EXPORT = "evidence.export"

    # Entity & Resolution Permissions
    ENTITY_VIEW = "entity.view"
    ENTITY_RESOLVE = "entity.resolve"
    ENTITY_MERGE = "entity.merge"
    ENTITY_SPLIT = "entity.split"

    # Graph Topology Permissions
    GRAPH_VIEW = "graph.view"
    GRAPH_EXPORT = "graph.export"

    # Timeline Forensics Permissions
    TIMELINE_VIEW = "timeline.view"
    TIMELINE_EXPORT = "timeline.export"

    # Geospatial Intelligence Permissions
    GEOSPATIAL_VIEW = "geospatial.view"
    GEOSPATIAL_EXPORT = "geospatial.export"

    # CCTV Location & Route Intelligence Permissions
    CCTV_VIEW = "cctv.view"
    CCTV_ANALYZE = "cctv.analyze"
    CCTV_VERIFY = "cctv.verify"

    # Anomaly Engine Permissions
    ANOMALY_VIEW = "anomaly.view"
    ANOMALY_INVESTIGATE = "anomaly.investigate"
    ANOMALY_ACKNOWLEDGE = "anomaly.acknowledge"
    ANOMALY_DISMISS = "anomaly.dismiss"

    # Investigative Finding Permissions
    FINDING_VIEW = "finding.view"
    FINDING_CREATE = "finding.create"
    FINDING_UPDATE = "finding.update"
    FINDING_APPROVE = "finding.approve"
    FINDING_CLOSE = "finding.close"

    # Report & Dossier Permissions
    REPORT_CREATE = "report.create"
    REPORT_VIEW = "report.view"
    REPORT_EXPORT = "report.export"

    # Identity & User Administration Permissions
    USER_CREATE = "user.create"
    USER_VIEW = "user.view"
    USER_UPDATE = "user.update"
    USER_DISABLE = "user.disable"

    # Role & Access Administration Permissions
    ROLE_VIEW = "role.view"
    ROLE_MANAGE = "role.manage"

    # Audit Trail Permissions
    AUDIT_VIEW = "audit.view"
    AUDIT_EXPORT = "audit.export"

    # Session Management Permissions
    SESSION_VIEW = "session.view"
    SESSION_REVOKE = "session.revoke"


PERMISSION_METADATA: Dict[str, Dict[str, str]] = {
    # Case
    Permissions.CASE_CREATE: {"category": "case", "description": "Create new investigation case dossiers"},
    Permissions.CASE_READ: {"category": "case", "description": "View case dossiers and metadata within authorized scope"},
    Permissions.CASE_UPDATE: {"category": "case", "description": "Update case titles, descriptions, and investigation context"},
    Permissions.CASE_ASSIGN: {"category": "case", "description": "Assign and reassign investigators and analysts to cases"},
    Permissions.CASE_CLOSE: {"category": "case", "description": "Conclude and close investigation cases"},
    Permissions.CASE_DELETE: {"category": "case", "description": "Administrative removal of case dossiers"},

    # Evidence
    Permissions.EVIDENCE_VIEW: {"category": "evidence", "description": "View evidence metadata and ingestion processing status"},
    Permissions.EVIDENCE_UPLOAD: {"category": "evidence", "description": "Upload and register new raw evidence files to a case"},
    Permissions.EVIDENCE_NFC_ACQUIRE: {"category": "evidence", "description": "Acquire and ingest physical NFC evidence from crime scenes"},
    Permissions.EVIDENCE_DOWNLOAD: {"category": "evidence", "description": "Download decrypted raw evidence files for forensic inspection"},
    Permissions.EVIDENCE_EXPORT: {"category": "evidence", "description": "Export processed evidence datasets and normalized records"},

    # Entity
    Permissions.ENTITY_VIEW: {"category": "entity", "description": "Explore resolved golden entities and cluster identities"},
    Permissions.ENTITY_RESOLVE: {"category": "entity", "description": "Execute entity resolution clustering pipeline"},
    Permissions.ENTITY_MERGE: {"category": "entity", "description": "Manually merge distinct entity clusters with audit logging"},
    Permissions.ENTITY_SPLIT: {"category": "entity", "description": "Manually split erroneously clustered entities with audit logging"},

    # Graph
    Permissions.GRAPH_VIEW: {"category": "graph", "description": "View network graph topology and link relationships"},
    Permissions.GRAPH_EXPORT: {"category": "graph", "description": "Export graph structures, subgraphs, and adjacency data"},

    # Timeline
    Permissions.TIMELINE_VIEW: {"category": "timeline", "description": "Inspect chronological canonical events and digital footprints"},
    Permissions.TIMELINE_EXPORT: {"category": "timeline", "description": "Export chronological timeline dossiers to CSV or JSON"},

    # Geospatial
    Permissions.GEOSPATIAL_VIEW: {"category": "geospatial", "description": "View geospatial maps, movement paths, and co-locations"},
    Permissions.GEOSPATIAL_EXPORT: {"category": "geospatial", "description": "Export geospatial movements and incident features to GeoJSON"},

    # CCTV
    Permissions.CCTV_VIEW: {"category": "cctv", "description": "View CCTV camera locations, coverage polygons, and routes"},
    Permissions.CCTV_ANALYZE: {"category": "cctv", "description": "Trigger CCTV route intelligence and candidate gap analysis"},
    Permissions.CCTV_VERIFY: {"category": "cctv", "description": "Mark CCTV cameras as verified or add manual sources"},

    # Anomaly
    Permissions.ANOMALY_VIEW: {"category": "anomaly", "description": "View anomaly scores, threat radar, and detection signals"},
    Permissions.ANOMALY_INVESTIGATE: {"category": "anomaly", "description": "Run multi-engine anomaly detection on case events"},
    Permissions.ANOMALY_ACKNOWLEDGE: {"category": "anomaly", "description": "Acknowledge detected anomaly observations"},
    Permissions.ANOMALY_DISMISS: {"category": "anomaly", "description": "Dismiss false-positive anomaly signals"},

    # Finding
    Permissions.FINDING_VIEW: {"category": "finding", "description": "View synthesized investigative findings and evidence links"},
    Permissions.FINDING_CREATE: {"category": "finding", "description": "Create manual findings or suggest analytical conclusions"},
    Permissions.FINDING_UPDATE: {"category": "finding", "description": "Update finding notes, status, and supporting links"},
    Permissions.FINDING_APPROVE: {"category": "finding", "description": "Formally approve investigative findings for prosecution dossiers"},
    Permissions.FINDING_CLOSE: {"category": "finding", "description": "Close and seal resolved investigative findings"},

    # Report
    Permissions.REPORT_CREATE: {"category": "report", "description": "Compose case dossier reports and analytical summaries"},
    Permissions.REPORT_VIEW: {"category": "report", "description": "View draft and approved case dossier reports"},
    Permissions.REPORT_EXPORT: {"category": "report", "description": "Export court-ready PDF dossiers and certified packages"},

    # User
    Permissions.USER_CREATE: {"category": "user", "description": "Invite and provision new law-enforcement officer accounts"},
    Permissions.USER_VIEW: {"category": "user", "description": "View user directory, active status, and unit assignments"},
    Permissions.USER_UPDATE: {"category": "user", "description": "Update officer profile, unit, and role assignments"},
    Permissions.USER_DISABLE: {"category": "user", "description": "Suspend, lock, or disable officer accounts"},

    # Role
    Permissions.ROLE_VIEW: {"category": "role", "description": "View system roles and associated permission assignments"},
    Permissions.ROLE_MANAGE: {"category": "role", "description": "Modify role definitions and permission mappings"},

    # Audit
    Permissions.AUDIT_VIEW: {"category": "audit", "description": "Inspect tamper-evident system audit trail and access logs"},
    Permissions.AUDIT_EXPORT: {"category": "audit", "description": "Export certified audit logs with chain of custody tracking"},

    # Session
    Permissions.SESSION_VIEW: {"category": "session", "description": "View active user sessions and access locations"},
    Permissions.SESSION_REVOKE: {"category": "session", "description": "Forcefully terminate active user authentication sessions"},
}

ALL_PERMISSIONS: Set[str] = set(PERMISSION_METADATA.keys())
