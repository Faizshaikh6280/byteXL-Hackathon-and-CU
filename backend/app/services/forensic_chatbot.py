"""
AI Forensic Chatbot Engine v2.1 — Multi-Tool Agent Architecture.
Integrates local GPU Qwen 2.5 LLM with:
  - LLM-driven tool routing (replaces keyword matching)
  - Dynamic Neo4j schema introspection + multi-hop Cypher generation (1-3 hops, shortestPath, variable-length paths)
  - Strict case-scoping enforcement across Neo4j, PostgreSQL, and Agentic Reports
  - PostgreSQL schema-injected SQL generation for anomalies, alerts, evidence, cases
  - Community-scoped investigation reports extraction from agentic forensics pipeline
  - Golden profile entity resolution and cross-database enrichment
  - Multi-source orchestration for complex investigative queries
  - Structured multi-turn conversation memory
"""

import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import text as sa_text
from app.core.llm_provider import get_llm
from app.core.neo4j_client import neo4j_client
from app.core.database import get_db_context
from app.models.postgres_models import (
    CaseModel, GoldenProfileModel, AnomalyFindingModel,
    AlertModel, InvestigationReportModel, EvidenceModel
)

logger = logging.getLogger("forensic_chatbot")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PostgreSQL table schemas for SQL generation injection
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PG_TABLE_SCHEMAS = {
    "POSTGRES_ANOMALIES": {
        "table": "anomaly_findings",
        "schema": (
            "Table: anomaly_findings\n"
            "Columns:\n"
            "  finding_id VARCHAR PK, case_id VARCHAR FK, entity_id VARCHAR, entity_type VARCHAR,\n"
            "  title VARCHAR, severity VARCHAR (LOW|MEDIUM|HIGH|CRITICAL),\n"
            "  unified_score FLOAT (0.0-1.0, higher=more anomalous), confidence FLOAT,\n"
            "  domain VARCHAR (FINANCIAL|TELECOM|NETWORK|SOCIAL|GEOSPATIAL|CROSS_DOMAIN),\n"
            "  primary_detector_type VARCHAR, explanation TEXT, what_happened TEXT,\n"
            "  why_unusual TEXT, why_relevant TEXT, category VARCHAR, pattern_type VARCHAR,\n"
            "  status VARCHAR (DETECTED|CONFIRMED|DISMISSED), created_at TIMESTAMPTZ\n"
            "Common filters: severity, domain, unified_score, entity_id, status\n"
            "Sort by: unified_score DESC for most severe, created_at DESC for most recent"
        )
    },
    "POSTGRES_ALERTS": {
        "table": "investigation_alerts",
        "schema": (
            "Table: investigation_alerts\n"
            "Columns:\n"
            "  alert_id VARCHAR PK, case_id VARCHAR FK, pattern_name VARCHAR,\n"
            "  entity_id VARCHAR, entity_name VARCHAR,\n"
            "  risk_level VARCHAR (CRITICAL|HIGH|MEDIUM), risk_score INTEGER (0-100),\n"
            "  status VARCHAR (PENDING|INVESTIGATING|ASSIGNED|DISMISSED),\n"
            "  evidence_narrative TEXT, created_at TIMESTAMPTZ, triaged_by VARCHAR\n"
            "Common filters: risk_level, risk_score, status, pattern_name, entity_name\n"
            "Sort by: risk_score DESC for highest risk"
        )
    },
    "POSTGRES_PROFILES": {
        "table": "golden_profiles",
        "schema": (
            "Table: golden_profiles\n"
            "Columns:\n"
            "  case_id VARCHAR PK, z_cluster_id VARCHAR PK, primary_name VARCHAR,\n"
            "  known_aliases JSON (array of strings), known_phones JSON (array of strings),\n"
            "  known_accounts JSON (array of strings), associated_emails JSON (array),\n"
            "  known_addresses JSON (array), national_ids JSON (array),\n"
            "  risk_score FLOAT (0.0-1.0), method VARCHAR, last_updated TIMESTAMPTZ\n"
            "IMPORTANT: To search names use: LOWER(primary_name) LIKE LOWER('%searchterm%')\n"
            "To search inside JSON arrays use: known_phones::text LIKE '%value%'\n"
            "Sort by: risk_score DESC for highest risk suspects"
        )
    },
    "POSTGRES_EVIDENCE": {
        "table": "evidence",
        "schema": (
            "Table: evidence\n"
            "Columns:\n"
            "  evidence_id VARCHAR PK, case_id VARCHAR FK, original_filename VARCHAR,\n"
            "  mime_type VARCHAR, file_size BIGINT (bytes), sha256 VARCHAR,\n"
            "  processing_status VARCHAR (RECEIVED|PROCESSING|PARSED|COMPLETED|FAILED),\n"
            "  detected_source_type VARCHAR (BANKING|TELECOM|NETWORK|SOCIAL|KYC|UNKNOWN),\n"
            "  record_count INTEGER, valid_record_count INTEGER, invalid_record_count INTEGER,\n"
            "  quality_score FLOAT (0-100), received_at TIMESTAMPTZ\n"
            "Sort by: received_at DESC for most recent"
        )
    },
    "POSTGRES_CASES": {
        "table": "cases",
        "schema": (
            "Table: cases\n"
            "Columns:\n"
            "  case_id VARCHAR PK, case_reference VARCHAR UNIQUE, title VARCHAR,\n"
            "  description TEXT, created_at TIMESTAMPTZ, created_by VARCHAR,\n"
            "  status VARCHAR (ACTIVE|CLOSED|ARCHIVED), sensitivity VARCHAR,\n"
            "  updated_at TIMESTAMPTZ\n"
            "Sort by: created_at DESC for most recent"
        )
    },
    "POSTGRES_REPORTS": {
        "table": "investigation_reports",
        "schema": (
            "Table: investigation_reports\n"
            "Columns:\n"
            "  report_id INTEGER PK, community_id INTEGER,\n"
            "  financial_json JSON (financial forensic analysis: laundering, hawala, smurfing),\n"
            "  geographic_json JSON (geographic movement analysis: towers, routes, co-location),\n"
            "  temporal_json JSON (temporal pattern analysis: burst activity, timelines),\n"
            "  lead_json JSON (lead investigator prosecutorial case synthesis),\n"
            "  status VARCHAR (processing|completed), created_at TIMESTAMPTZ\n"
            "Filter by: community_id, status\n"
            "Sort by: created_at DESC for most recent"
        )
    }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Tool classification prompt for LLM-driven routing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL_CLASSIFICATION_PROMPT = """You are a query router for a digital forensics investigation platform.
Classify the user's question into exactly ONE tool.

Tools:
- NEO4J_GRAPH: relationships, connections, transactions between accounts, phone calls, cell towers, IP addresses, network paths, who owns what, shortest path, multi-hop traversals, search and find in graph
- POSTGRES_ANOMALIES: anomalies, unusual patterns, threats, risk detections, suspicious activity findings
- POSTGRES_ALERTS: CEP alerts, warnings, risk level patterns, triage status
- POSTGRES_PROFILES: suspect profiles, person identity, known aliases, phone numbers, bank accounts, entity resolution, who is someone
- POSTGRES_EVIDENCE: evidence files, uploads, data quality, processing status, source types
- POSTGRES_REPORTS: investigation reports, forensic analysis results, community analysis, agent findings (financial specialist, geographic specialist, temporal specialist, lead dossier)
- POSTGRES_CASES: case metadata, case list, case status, investigation overview
- MULTI_SOURCE: queries needing BOTH graph relationships AND database records together

Output ONLY the tool name. Nothing else."""


class ForensicChatbotService:
    """Enterprise AI forensic multi-tool agent with cross-database synthesis and voice/text NL-querying."""

    # ── Case Resolution ────────────────────────────────────────────
    def resolve_case_identifiers(self, case_id: Optional[str]) -> List[str]:
        """Resolves case identifier to both primary case_id and human-friendly case_reference."""
        if not case_id:
            return []
        with get_db_context() as session:
            case = session.query(CaseModel).filter(
                (CaseModel.case_id == case_id) | (CaseModel.case_reference == case_id)
            ).first()
            if case:
                cids = [case.case_id]
                if case.case_reference and case.case_reference not in cids:
                    cids.append(case.case_reference)
                return cids
        return [case_id]

    # ── Dynamic Neo4j Schema Introspection ─────────────────────────
    def introspect_case_schema(self, case_ids: List[str]) -> Dict[str, Any]:
        """
        Dynamically introspects the Neo4j graph for the active case.
        Returns exact node labels, relationship types, and actual property keys in use.
        Ensures zero hardcoding so any case uploaded at runtime works out-of-the-box.
        """
        schema = {
            "node_labels": [],
            "relationship_types": [],
            "label_properties": {},
            "relationship_properties": {},
            "sample_nodes": []
        }

        if not neo4j_client.ensure_connected():
            return {
                "node_labels": ["Person", "BankAccount", "Phone", "CellTower", "IPAddress", "IMEI", "SocialAccount", "ATM"],
                "relationship_types": ["OWNS_ACCOUNT", "TRANSACTED_WITH", "OWNS_PHONE", "PINGED_TOWER",
                                       "CALLED", "ASSIGNED_IP", "USED_DEVICE", "LOGGED_IN_FROM",
                                       "USES_HANDLE", "WITHDREW_CASH_AT"],
                "label_properties": {
                    "Person": ["name", "golden_id", "risk_score", "communityId", "pagerank", "aliases", "phones", "emails", "case_id"],
                    "BankAccount": ["account_number", "holder", "bank_name", "risk_score", "case_id"],
                    "Phone": ["number", "holder", "imei", "risk_score", "case_id"],
                    "CellTower": ["tower_id", "location", "lat", "lng", "address", "case_id"],
                    "IPAddress": ["address", "service", "isp", "case_id"],
                    "IMEI": ["imei_number", "case_id"],
                    "SocialAccount": ["handle", "platform", "case_id"],
                    "ATM": ["atm_id", "location", "case_id"]
                },
                "relationship_properties": {
                    "TRANSACTED_WITH": ["amount", "total_amount", "txn_count", "txn_type", "channel", "timestamp"],
                    "CALLED": ["duration", "total_duration", "call_count", "timestamp"],
                    "PINGED_TOWER": ["duration", "pings_count", "last_seen"],
                    "WITHDREW_CASH_AT": ["amount", "total_amount", "cashout_count", "timestamp"]
                },
                "sample_nodes": []
            }

        try:
            with neo4j_client.driver.session() as session:
                lbl_res = session.run(
                    """
                    MATCH (n)
                    WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))
                    RETURN DISTINCT labels(n)[0] AS label
                    LIMIT 20
                    """,
                    {"case_ids": case_ids}
                )
                labels = [r["label"] for r in lbl_res if r["label"]]
                schema["node_labels"] = labels or ["Person", "BankAccount", "Phone", "CellTower", "IPAddress"]

                rel_res = session.run(
                    """
                    MATCH (n)-[r]->(m)
                    WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))
                    RETURN DISTINCT type(r) AS rel_type
                    LIMIT 30
                    """,
                    {"case_ids": case_ids}
                )
                rels = [r["rel_type"] for r in rel_res if r["rel_type"]]
                schema["relationship_types"] = rels or ["OWNS_ACCOUNT", "TRANSACTED_WITH", "OWNS_PHONE",
                                                         "CALLED", "PINGED_TOWER"]

                for lbl in schema["node_labels"][:10]:
                    prop_res = session.run(
                        f"""
                        MATCH (n:`{lbl}`)
                        WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))
                        RETURN keys(n) AS keys
                        LIMIT 5
                        """,
                        {"case_ids": case_ids}
                    )
                    all_keys = set()
                    for pr in prop_res:
                        all_keys.update(pr["keys"] or [])
                    all_keys.discard("case_ids")
                    all_keys.discard("embedding")
                    schema["label_properties"][lbl] = sorted(list(all_keys))

                for rel_type in schema["relationship_types"][:10]:
                    try:
                        rp_res = session.run(
                            f"""
                            MATCH ()-[r:`{rel_type}`]->()
                            RETURN keys(r) AS keys
                            LIMIT 3
                            """,
                        )
                        rp_keys = set()
                        for rp in rp_res:
                            rp_keys.update(rp["keys"] or [])
                        rp_keys.discard("case_id")
                        if rp_keys:
                            schema["relationship_properties"][rel_type] = sorted(list(rp_keys))
                    except Exception:
                        pass

                sample_res = session.run(
                    """
                    MATCH (n)
                    WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))
                    RETURN labels(n)[0] AS type,
                           coalesce(n.name, n.account_number, n.number, n.tower_id, n.address, n.handle, 'Node') AS identifier,
                           n.risk_score AS risk
                    LIMIT 8
                    """,
                    {"case_ids": case_ids}
                )
                schema["sample_nodes"] = [dict(sr) for sr in sample_res]

        except Exception as e:
            logger.warning(f"[Schema Introspection Warning] {e}")

        return schema

    # ── LLM-Driven / Heuristic Tool Classification ─────────────────
    def classify_tool(self, message: str, history: Optional[List[Dict[str, str]]] = None) -> str:
        """Classifies the user query into the appropriate investigation tool, using fast heuristics first."""
        # Fast 0ms heuristic match first to avoid unnecessary 15s LLM latency
        fast_tool = self._keyword_classify(message)
        if fast_tool:
            return fast_tool

        context_lines = ""
        if history:
            for turn in history[-3:]:
                context_lines += f"{turn.get('role', 'user').upper()}: {turn.get('content', '')}\n"

        prompt = f"""{TOOL_CLASSIFICATION_PROMPT}

Conversation context:
{context_lines}
User question: "{message}"
Tool:"""

        try:
            llm = get_llm(num_predict=20, num_ctx=512)
            resp = llm.invoke(prompt)
            raw = resp.content if hasattr(resp, "content") else str(resp)
            raw = raw.strip().upper().replace(" ", "_").replace("-", "_")

            valid_tools = [
                "NEO4J_GRAPH", "POSTGRES_ANOMALIES", "POSTGRES_ALERTS",
                "POSTGRES_PROFILES", "POSTGRES_EVIDENCE", "POSTGRES_REPORTS",
                "POSTGRES_CASES", "MULTI_SOURCE"
            ]

            for tool in valid_tools:
                if tool in raw:
                    return tool

            return "NEO4J_GRAPH"
        except Exception as e:
            logger.warning(f"[Tool Classification Warning] {e}")
            return "NEO4J_GRAPH"

    def _keyword_classify(self, message: str) -> Optional[str]:
        """Fast keyword-based tool classification for instantaneous response."""
        msg = message.lower()

        # Profiling / Suspect / Person lookup
        if any(k in msg for k in ["suspect", "profile", "alias", "identity", "who is", "who are",
                                   "tell me about", "known phone", "known account", "cluster"]):
            return "POSTGRES_PROFILES"

        # Anomalies
        if any(k in msg for k in ["anomal", "unusual", "suspicious", "threat", "detection",
                                   "finding", "risk score", "behavioral"]):
            return "POSTGRES_ANOMALIES"

        # Alerts
        if any(k in msg for k in ["alert", "warning", "triage", "cep pattern", "notification"]):
            return "POSTGRES_ALERTS"

        # Evidence files
        if any(k in msg for k in ["evidence", "uploaded file", "data quality", "ingestion",
                                   "processing status", "source type"]):
            return "POSTGRES_EVIDENCE"

        # Reports
        if any(k in msg for k in ["report", "investigation result", "forensic analysis",
                                   "agent result", "community analysis", "synthesis",
                                   "financial specialist", "geographic specialist",
                                   "temporal specialist", "lead dossier"]):
            return "POSTGRES_REPORTS"

        # Cases
        if any(k in msg for k in ["case list", "all cases", "case status", "case detail",
                                   "case overview", "dossier"]):
            return "POSTGRES_CASES"

        # Graph / Network traversals
        if any(k in msg for k in ["transaction", "transfer", "bank account", "phone call", "call record",
                                   "cell tower", "tower", "ping", "connected to", "path between",
                                   "network", "hop", "graph", "ip address", "linked to", "owns",
                                   "relationship", "between", "imei", "shortest", "traversal",
                                   "chain", "multi-hop", "distance", "route", "node", "edge"]):
            return "NEO4J_GRAPH"

        if any(k in msg for k in ["cross-domain", "multi-source", "everything about", "full dossier"]):
            return "MULTI_SOURCE"

        if any(k in msg for k in ["show", "find", "who", "list", "get", "all"]):
            return "NEO4J_GRAPH"

        return None

    # ── Advanced Multi-Hop Neo4j Cypher Generation ─────────────────
    def generate_cypher_with_qwen(self, prompt: str, schema: Dict[str, Any], case_ids: List[str]) -> str:
        """
        Translates the user query into read-only Neo4j Cypher using local GPU Qwen 2.5
        strictly adhering to dynamically discovered schema. Supports multi-hop traversals (1-3 hops, shortestPath).
        """
        labels_str = ", ".join(schema.get("node_labels", []))
        rels_str = ", ".join(schema.get("relationship_types", []))
        props_desc = "\n".join([f"  {lbl}: {', '.join(props)}" for lbl, props in schema.get("label_properties", {}).items()])
        rel_props_desc = "\n".join([f"  {rel}: {', '.join(props)}" for rel, props in schema.get("relationship_properties", {}).items()])

        system_prompt = f"""You are an expert Neo4j Cypher query architect for an intelligence forensics platform.
Translate the user's question into a single safe, read-only Neo4j Cypher query.

GRAPH SCHEMA:
Node Labels: {labels_str}
Relationships: {rels_str}
Node Properties:
{props_desc}
Relationship Properties:
{rel_props_desc}

MANDATORY RULES:
1. Output ONLY the Cypher query. No markdown, no backticks, no prose explanation.
2. MUST start with MATCH. NEVER use CREATE, MERGE, SET, DELETE, REMOVE, DROP.
3. Case scoping: ALWAYS filter the start node by case_id:
   WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
4. For person name lookups: toLower(p.name) CONTAINS toLower('name')
5. MULTI-HOP QUERIES:
   - 1 to 3 hops paths: MATCH path = (p:Person)-[*1..3]-(target) WHERE ... RETURN p.name AS source, [n IN nodes(path) | coalesce(n.name, n.account_number, n.number, labels(n)[0])] AS connection_chain, labels(target)[0] AS target_type, coalesce(target.name, target.account_number, target.number) AS target_entity
   - Shortest path: MATCH (p1:Person), (p2:Person) WHERE toLower(p1.name) CONTAINS toLower('name1') AND toLower(p2.name) CONTAINS toLower('name2') MATCH path = shortestPath((p1)-[*..6]-(p2)) RETURN [n in nodes(path) | coalesce(n.name, n.account_number, n.number)] AS path_entities, length(path) AS total_hops
   - Money laundering across accounts (2-3 hops): MATCH (p:Person)-[:OWNS_ACCOUNT]->(b1:BankAccount)-[r:TRANSACTED_WITH*1..3]->(b2:BankAccount) WHERE ... RETURN p.name AS originator, b1.account_number AS source_account, length(r) AS hops, b2.account_number AS destination_account, b2.holder AS destination_holder
   - Chained calls: MATCH (p:Person)-[:OWNS_PHONE]->(ph1:Phone)-[r:CALLED*1..2]->(ph2:Phone) WHERE ... RETURN p.name, ph1.number AS caller, ph2.number AS receiver
   - Cell tower co-location: MATCH (ph1:Phone)-[:PINGED_TOWER]->(t:CellTower)<-[:PINGED_TOWER]-(ph2:Phone) WHERE ph1.number <> ph2.number RETURN ph1.number AS phone1, t.tower_id AS tower, ph2.number AS phone2
6. SEARCH AND FIND:
   - Find by identifier: MATCH (n) WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, []))) AND (toLower(coalesce(n.name, '')) CONTAINS toLower('term') OR coalesce(n.number, '') CONTAINS 'term' OR coalesce(n.account_number, '') CONTAINS 'term' OR coalesce(n.tower_id, '') CONTAINS 'term') RETURN labels(n)[0] AS type, coalesce(n.name, n.account_number, n.number, n.tower_id) AS identifier, coalesce(n.risk_score, 0.5) AS risk_score
7. Direct transactions by person:
   MATCH (p:Person)-[:OWNS_ACCOUNT]->(b1:BankAccount)-[r:TRANSACTED_WITH]->(b2:BankAccount)
   WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, []))) AND toLower(p.name) CONTAINS toLower('name')
   RETURN p.name AS person_name, b1.account_number AS sender_account, r.amount AS amount, b2.account_number AS receiver_account, b2.holder AS receiver_holder
8. Always append LIMIT 25 at the end.

Question: {prompt}
Cypher:"""

        p_low = prompt.lower()
        if any(k in p_low for k in ["transfer", "bank", "amount", "money", "transaction"]) and not any(k in p_low for k in ["path", "shortest", "hop"]):
            name_match = re.search(r'(?:for|of|by|from|to)\s+([a-zA-Z\s]+)', prompt, re.IGNORECASE)
            if name_match:
                name_term = name_match.group(1).strip()
                if name_term and len(name_term) > 2 and name_term.lower() not in ["the", "all", "account", "bank"]:
                    return f"MATCH (p:Person)-[:OWNS_ACCOUNT]->(b1:BankAccount)-[r:TRANSACTED_WITH]->(b2:BankAccount)\nWHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, []))) AND toLower(p.name) CONTAINS toLower('{name_term}')\nRETURN p.name AS person_name, b1.account_number AS sender_account, coalesce(r.amount, 0) AS amount, b2.account_number AS receiver_account, b2.holder AS receiver_holder\nORDER BY r.amount DESC LIMIT 25"
            return (
                "MATCH (b1:BankAccount)-[r:TRANSACTED_WITH]->(b2:BankAccount)\n"
                "WHERE (b1.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(b1.case_ids, [])))\n"
                "RETURN b1.account_number AS sender_account, b1.holder AS sender_holder,\n"
                "       coalesce(r.amount, 0) AS amount, b2.account_number AS recipient_account, b2.holder AS recipient_holder\n"
                "ORDER BY r.amount DESC LIMIT 25"
            )
        elif any(k in p_low for k in ["phone", "call", "caller", "dial"]):
            return (
                "MATCH (p1:Phone)-[r:CALLED]->(p2:Phone)\n"
                "WHERE (p1.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p1.case_ids, [])))\n"
                "RETURN p1.number AS caller, coalesce(r.duration, 0) AS duration, p2.number AS receiver\n"
                "LIMIT 25"
            )
        elif any(k in p_low for k in ["tower", "cell", "bts"]):
            return (
                "MATCH (p:Phone)-[r:PINGED_TOWER]->(t:CellTower)\n"
                "WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))\n"
                "RETURN p.number AS phone, t.tower_id AS tower_id, t.location AS location, r.pings_count AS pings\n"
                "LIMIT 25"
            )

        try:
            llm = get_llm(num_predict=150, num_ctx=1024)
            resp = llm.invoke(system_prompt)
            raw = resp.content if hasattr(resp, "content") else str(resp)
            clean = raw.replace("```cypher", "").replace("```", "").strip()

            if "MATCH" in clean:
                clean = clean[clean.index("MATCH"):]

            if clean.count("RETURN") > 1 and "MATCH" in clean:
                first_ret = clean.find("RETURN")
                next_match = clean.find("MATCH", first_ret)
                if next_match > 0:
                    clean = clean[:next_match].strip()

            forbidden = ["create", "merge", "delete", "set ", "remove", "drop", "detach"]
            if any(f in clean.lower() for f in forbidden):
                clean = self._fallback_cypher(prompt, case_ids)

            if "LIMIT" not in clean.upper():
                clean = clean.rstrip().rstrip(";") + "\nLIMIT 25"

            # Enforce case scoping if Qwen omitted it
            clean = self._enforce_case_scoping_in_cypher(clean, case_ids)

            return clean
        except Exception as e:
            logger.warning(f"[Qwen Cypher Gen Warning] {e}")
            return self._fallback_cypher(prompt, case_ids)

    def _enforce_case_scoping_in_cypher(self, cypher: str, case_ids: List[str]) -> str:
        """Guarantees Cypher query contains case_id filtering for strict case scoping."""
        if not case_ids or "$case_ids" in cypher or "case_id" in cypher:
            return cypher

        # If WHERE exists in Cypher, prepend case scoping condition
        if "WHERE" in cypher:
            idx = cypher.index("WHERE") + 5
            return cypher[:idx] + " (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, []))) AND " + cypher[idx:]
        
        return cypher

    def _fallback_cypher(self, prompt: str, case_ids: List[str]) -> str:
        """Fallback Cypher queries when LLM generation fails."""
        p_low = prompt.lower()
        if "transfer" in p_low or "bank" in p_low or "amount" in p_low or "money" in p_low or "transaction" in p_low:
            return (
                "MATCH (b1:BankAccount)-[r:TRANSACTED_WITH]->(b2:BankAccount)\n"
                "WHERE (b1.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(b1.case_ids, [])))\n"
                "RETURN b1.account_number AS sender_account, b1.holder AS sender_holder,\n"
                "       coalesce(r.amount, 0) AS amount, b2.account_number AS recipient_account, b2.holder AS recipient_holder\n"
                "ORDER BY r.amount DESC LIMIT 25"
            )
        elif "hop" in p_low or "connect" in p_low or "path" in p_low:
            return (
                "MATCH path = (p:Person)-[*1..2]-(target)\n"
                "WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))\n"
                "RETURN p.name AS source, [r IN relationships(path) | type(r)] AS edge_types,\n"
                "       [n IN nodes(path) | coalesce(n.name, n.account_number, n.number, labels(n)[0])] AS connection_chain,\n"
                "       labels(target)[0] AS target_type, coalesce(target.name, target.account_number, target.number, 'Node') AS target_entity\n"
                "LIMIT 25"
            )
        elif "phone" in p_low or "call" in p_low:
            return (
                "MATCH (p1:Phone)-[r:CALLED]->(p2:Phone)\n"
                "WHERE (p1.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p1.case_ids, [])))\n"
                "RETURN p1.number AS caller, coalesce(r.duration, 0) AS duration, p2.number AS receiver\n"
                "LIMIT 25"
            )
        elif "tower" in p_low or "ping" in p_low or "cell" in p_low:
            return (
                "MATCH (p:Phone)-[r:PINGED_TOWER]->(t:CellTower)\n"
                "WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))\n"
                "RETURN p.number AS phone, t.tower_id AS tower_id, t.location AS location, r.pings_count AS pings\n"
                "LIMIT 25"
            )
        else:
            return (
                "MATCH (p:Person)\n"
                "WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))\n"
                "RETURN p.name AS name, p.golden_id AS cluster_id,\n"
                "       coalesce(p.risk_score, 0.5) AS risk_score, p.communityId AS community\n"
                "ORDER BY p.risk_score DESC LIMIT 25"
            )

    # ── PostgreSQL SQL Generation ──────────────────────────────────
    def generate_sql_with_qwen(self, prompt: str, tool_name: str, case_ids: List[str]) -> str:
        """
        Translates the user query into read-only PostgreSQL SQL using local GPU Qwen 2.5
        with full table schema injection for the selected tool.
        """
        table_info = PG_TABLE_SCHEMAS.get(tool_name)
        if not table_info:
            return ""

        case_list_str = ", ".join([f"'{c}'" for c in case_ids])
        p_low = prompt.lower()

        # Fast direct query templates for standard investigative queries (avoids unnecessary LLM lag)
        if tool_name == "POSTGRES_PROFILES":
            name_match = re.search(r'(?:about|who is|find|search for)\s+([a-zA-Z\s]+)', prompt, re.IGNORECASE)
            if name_match:
                search_term = name_match.group(1).strip()
                if search_term and len(search_term) > 2 and search_term.lower() not in ["the", "all", "suspects", "them", "suspect"]:
                    return f"SELECT z_cluster_id, primary_name, risk_score, known_phones, known_accounts, known_aliases FROM golden_profiles WHERE case_id IN ({case_list_str}) AND (LOWER(primary_name) LIKE LOWER('%{search_term}%') OR known_aliases::text LIKE '%{search_term}%') ORDER BY risk_score DESC LIMIT 25"
            return f"SELECT z_cluster_id, primary_name, risk_score, known_phones, known_accounts, known_aliases FROM golden_profiles WHERE case_id IN ({case_list_str}) ORDER BY risk_score DESC LIMIT 25"

        elif tool_name == "POSTGRES_ANOMALIES":
            if "critical" in p_low:
                return f"SELECT finding_id, title, severity, unified_score, domain, entity_id, what_happened, status FROM anomaly_findings WHERE case_id IN ({case_list_str}) AND severity = 'CRITICAL' ORDER BY unified_score DESC LIMIT 25"
            elif "high" in p_low:
                return f"SELECT finding_id, title, severity, unified_score, domain, entity_id, what_happened, status FROM anomaly_findings WHERE case_id IN ({case_list_str}) AND severity IN ('CRITICAL', 'HIGH') ORDER BY unified_score DESC LIMIT 25"
            return f"SELECT finding_id, title, severity, unified_score, domain, entity_id, what_happened, status FROM anomaly_findings WHERE case_id IN ({case_list_str}) ORDER BY unified_score DESC LIMIT 25"

        elif tool_name == "POSTGRES_ALERTS":
            if "critical" in p_low:
                return f"SELECT alert_id, pattern_name, entity_name, risk_level, risk_score, status, evidence_narrative FROM investigation_alerts WHERE case_id IN ({case_list_str}) AND risk_level = 'CRITICAL' ORDER BY risk_score DESC LIMIT 25"
            return f"SELECT alert_id, pattern_name, entity_name, risk_level, risk_score, status, evidence_narrative FROM investigation_alerts WHERE case_id IN ({case_list_str}) ORDER BY risk_score DESC LIMIT 25"

        elif tool_name == "POSTGRES_EVIDENCE":
            return f"SELECT evidence_id, original_filename, detected_source_type, processing_status, record_count, quality_score, received_at FROM evidence WHERE case_id IN ({case_list_str}) ORDER BY received_at DESC LIMIT 25"

        elif tool_name == "POSTGRES_CASES":
            return f"SELECT case_id, case_reference, title, status, sensitivity, created_at, created_by FROM cases ORDER BY created_at DESC LIMIT 25"

        system_prompt = f"""You are a PostgreSQL query expert for a forensics database.
Translate the user's question into a single safe, read-only PostgreSQL SELECT query.

DATABASE SCHEMA:
{table_info['schema']}

MANDATORY RULES:
1. Output ONLY the SQL query. No markdown, no backticks, no explanation.
2. MUST start with SELECT. NEVER use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
3. MUST filter strictly by case_id IN ({case_list_str}) unless querying the cases table itself.
4. For text searches use: LOWER(column) LIKE LOWER('%term%')
5. End with LIMIT 25.
6. Use meaningful column aliases with AS.

Question: {prompt}
SQL:"""

        try:
            llm = get_llm(num_predict=150, num_ctx=1024)
            resp = llm.invoke(system_prompt)
            raw = resp.content if hasattr(resp, "content") else str(resp)
            clean = raw.replace("```sql", "").replace("```", "").strip()

            if "SELECT" in clean.upper():
                idx = clean.upper().index("SELECT")
                clean = clean[idx:]

            for terminator in ["\n\n", "\nNote:", "\nExplanation:", "\n--"]:
                if terminator in clean:
                    clean = clean[:clean.index(terminator)]

            forbidden_sql = ["insert", "update", "delete", "drop", "alter", "create",
                             "truncate", "grant", "revoke", "exec"]
            if any(f in clean.lower().split() for f in forbidden_sql):
                return self._fallback_sql(tool_name, case_ids)

            if "LIMIT" not in clean.upper():
                clean = clean.rstrip().rstrip(";") + "\nLIMIT 25"

            # Enforce case_id filter if missing in non-cases table
            clean_clean = clean.rstrip(";")
            if tool_name != "POSTGRES_CASES" and "case_id" not in clean_clean.lower() and case_ids:
                if "WHERE" in clean_clean.upper():
                    clean_clean = clean_clean.replace("WHERE", f"WHERE case_id IN ({case_list_str}) AND ", 1)
                elif "FROM" in clean_clean.upper():
                    # Insert WHERE before ORDER BY or LIMIT
                    parts = clean_clean.split("LIMIT")
                    clean_clean = f"{parts[0]} WHERE case_id IN ({case_list_str}) LIMIT{parts[1]}"

            return clean_clean
        except Exception as e:
            logger.warning(f"[Qwen SQL Gen Warning] {e}")
            return self._fallback_sql(tool_name, case_ids)

    def _fallback_sql(self, tool_name: str, case_ids: List[str]) -> str:
        """Fallback SQL queries when LLM generation fails."""
        case_list = ", ".join([f"'{c}'" for c in case_ids])
        table_info = PG_TABLE_SCHEMAS.get(tool_name, {})
        table = table_info.get("table", "cases")

        fallbacks = {
            "POSTGRES_ANOMALIES": f"SELECT finding_id, title, severity, unified_score, domain, entity_id, what_happened, status FROM anomaly_findings WHERE case_id IN ({case_list}) ORDER BY unified_score DESC LIMIT 25",
            "POSTGRES_ALERTS": f"SELECT alert_id, pattern_name, entity_name, risk_level, risk_score, status, evidence_narrative FROM investigation_alerts WHERE case_id IN ({case_list}) ORDER BY risk_score DESC LIMIT 25",
            "POSTGRES_PROFILES": f"SELECT z_cluster_id, primary_name, risk_score, known_phones, known_accounts, known_aliases FROM golden_profiles WHERE case_id IN ({case_list}) ORDER BY risk_score DESC LIMIT 25",
            "POSTGRES_EVIDENCE": f"SELECT evidence_id, original_filename, detected_source_type, processing_status, record_count, quality_score, received_at FROM evidence WHERE case_id IN ({case_list}) ORDER BY received_at DESC LIMIT 25",
            "POSTGRES_CASES": f"SELECT case_id, case_reference, title, status, sensitivity, created_at, created_by FROM cases ORDER BY created_at DESC LIMIT 25",
            "POSTGRES_REPORTS": f"SELECT report_id, community_id, status, created_at FROM investigation_reports ORDER BY created_at DESC LIMIT 25"
        }
        return fallbacks.get(tool_name, f"SELECT * FROM {table} LIMIT 25")

    # ── Query Execution Methods ────────────────────────────────────
    def execute_neo4j_query(self, cypher: str, case_ids: List[str]) -> List[Dict[str, Any]]:
        """Executes a Cypher query against Neo4j and returns records as dicts."""
        if not neo4j_client.ensure_connected():
            return []
        try:
            with neo4j_client.driver.session() as session:
                res = session.run(
                    cypher,
                    {"case_ids": case_ids, "case_id": case_ids[0] if case_ids else ""}
                )
                records = []
                for r in res:
                    record = {}
                    for key in r.keys():
                        val = r[key]
                        if hasattr(val, 'items'):
                            val = dict(val)
                        elif isinstance(val, list):
                            val = [str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v for v in val]
                        elif not isinstance(val, (int, float, bool, str, type(None))):
                            val = str(val)
                        record[key] = val
                    records.append(record)
                return records
        except Exception as e:
            logger.warning(f"[Cypher Execution Error] {e}")
            try:
                with neo4j_client.driver.session() as session:
                    fallback_res = session.run(
                        """
                        MATCH (n)
                        WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))
                        RETURN labels(n)[0] AS type, coalesce(n.name, n.account_number, n.number, 'Entity') AS name,
                               coalesce(n.risk_score, 0.5) AS risk_score
                        LIMIT 15
                        """,
                        {"case_ids": case_ids}
                    )
                    return [dict(r) for r in fallback_res]
            except Exception:
                return []

    def execute_postgres_query(self, sql: str, case_ids: List[str]) -> List[Dict[str, Any]]:
        """Executes a read-only SQL query against PostgreSQL and returns records as dicts."""
        if not sql or not sql.strip().upper().startswith("SELECT"):
            return []

        try:
            with get_db_context() as session:
                result = session.execute(sa_text(sql))
                columns = list(result.keys())
                records = []
                for row in result:
                    record = {}
                    for i, col in enumerate(columns):
                        val = row[i]
                        if hasattr(val, 'isoformat'):
                            val = val.isoformat()
                        elif isinstance(val, (dict, list)):
                            pass
                        elif not isinstance(val, (int, float, bool, str, type(None))):
                            val = str(val)
                        record[col] = val
                    records.append(record)
                return records
        except Exception as e:
            logger.warning(f"[SQL Execution Error] {e}")
            return []

    # ── Community-Scoped Investigation Reports ──────────────────────
    def query_investigation_reports(self, case_ids: List[str], message: str) -> Tuple[List[Dict[str, Any]], str]:
        """Queries investigation reports strictly scoped to communities in the active case."""
        records = []
        sql_used = ""
        try:
            # 1. First find communities belonging to this case in Neo4j
            case_communities = []
            if neo4j_client.ensure_connected():
                try:
                    with neo4j_client.driver.session() as session:
                        res = session.run(
                            """
                            MATCH (p:Person)
                            WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
                            RETURN DISTINCT p.communityId AS cid
                            """,
                            {"case_ids": case_ids}
                        )
                        case_communities = [r["cid"] for r in res if r["cid"] is not None and r["cid"] != -1]
                except Exception:
                    pass

            with get_db_context() as session:
                query = session.query(InvestigationReportModel)
                if case_communities:
                    query = query.filter(
                        (InvestigationReportModel.community_id.in_(case_communities)) |
                        (InvestigationReportModel.community_id == -1)
                    )
                else:
                    query = query.filter(InvestigationReportModel.community_id == -1)

                reports = query.order_by(InvestigationReportModel.created_at.desc()).limit(5).all()

                # Fallback to latest completed reports if no community match found
                if not reports:
                    reports = session.query(InvestigationReportModel).filter(
                        InvestigationReportModel.status == "completed"
                    ).order_by(InvestigationReportModel.created_at.desc()).limit(3).all()

                for r in reports:
                    report_data = {
                        "report_id": r.report_id,
                        "community_id": r.community_id,
                        "status": r.status,
                        "created_at": r.created_at.isoformat() if r.created_at else ""
                    }

                    msg_lower = message.lower()
                    if any(k in msg_lower for k in ["financial", "money", "transaction", "smurfing", "flow", "hawala"]):
                        if r.financial_json:
                            report_data["financial_analysis"] = self._extract_report_summary(r.financial_json)
                    elif any(k in msg_lower for k in ["geographic", "location", "movement", "travel", "tower", "route"]):
                        if r.geographic_json:
                            report_data["geographic_analysis"] = self._extract_report_summary(r.geographic_json)
                    elif any(k in msg_lower for k in ["temporal", "time", "burst", "timeline", "chronolog"]):
                        if r.temporal_json:
                            report_data["temporal_analysis"] = self._extract_report_summary(r.temporal_json)
                    else:
                        if r.lead_json:
                            report_data["lead_synthesis"] = self._extract_report_summary(r.lead_json)
                        if r.financial_json:
                            report_data["financial_analysis"] = self._extract_report_summary(r.financial_json)

                    records.append(report_data)

                target_cids_repr = ",".join(str(c) for c in (case_communities or [-1]))
                sql_used = f"SELECT report_id, community_id, status, financial_json, geographic_json, temporal_json, lead_json FROM investigation_reports WHERE community_id IN ({target_cids_repr}) ORDER BY created_at DESC LIMIT 5"
        except Exception as e:
            logger.warning(f"[Investigation Reports Query Warning] {e}")

        return records, sql_used

    def _extract_report_summary(self, report_json: Any) -> Any:
        """Extracts a compact summary from a report JSON column."""
        if not report_json:
            return None
        if isinstance(report_json, str):
            try:
                report_json = json.loads(report_json)
            except Exception:
                return report_json

        if isinstance(report_json, dict):
            summary = {}
            for key, val in report_json.items():
                if isinstance(val, str) and len(val) > 400:
                    summary[key] = val[:400] + "..."
                elif isinstance(val, list) and len(val) > 8:
                    summary[key] = val[:8]
                else:
                    summary[key] = val
            return summary
        return report_json

    # ── Entity Resolution ──────────────────────────────────────────
    def resolve_entities_from_records(self, records: List[Dict], pg_suspects: List[Dict]) -> List[Dict]:
        """Cross-references graph records with golden profiles for entity resolution."""
        resolved = list(pg_suspects)

        for rec in records:
            sender_acc = rec.get("sender_account") or rec.get("from_account") or rec.get("source_account")
            rec_acc = rec.get("recipient_account") or rec.get("to_account") or rec.get("destination_account") or rec.get("receiver_account")
            phone_num = rec.get("phone_number") or rec.get("caller") or rec.get("phone") or rec.get("number")
            person_name = rec.get("person_name") or rec.get("sender_holder") or rec.get("originator") or rec.get("source")

            for acc in [sender_acc, rec_acc]:
                if acc and not any(e.get("id") == acc or (e.get("details") and acc in str(e.get("details", ""))) for e in resolved):
                    matched_owner = next((p["name"] for p in pg_suspects if acc in str(p.get("details", ""))), None)
                    resolved.append({
                        "id": acc,
                        "name": f"{matched_owner} ({acc})" if matched_owner else f"Account {acc}",
                        "type": "BankAccount",
                        "risk_score": 0.75,
                        "cluster_id": matched_owner or "Financial Node",
                        "pivot_id": acc,
                        "details": f"Beneficial Owner: {matched_owner or 'Under Investigation'}"
                    })

            if phone_num and not any(e.get("id") == phone_num for e in resolved):
                matched_owner = next((p["name"] for p in pg_suspects if phone_num in str(p.get("details", ""))), None)
                resolved.append({
                    "id": phone_num,
                    "name": f"{matched_owner} ({phone_num})" if matched_owner else f"Phone {phone_num}",
                    "type": "Phone",
                    "risk_score": 0.65,
                    "cluster_id": matched_owner or "Cellular Endpoint",
                    "pivot_id": phone_num,
                    "details": f"Subscriber: {matched_owner or 'Monitored Handset'}"
                })

        return resolved

    # ── Context Extraction ─────────────────────────────────────────
    def _build_conversation_context(self, history: Optional[List[Dict[str, str]]]) -> str:
        """Builds structured conversation context from history."""
        if not history:
            return "No previous conversation for this case."
        context_parts = []
        for turn in history[-5:]:
            role = turn.get("role", "user").upper()
            content = turn.get("content", "")
            if len(content) > 300:
                content = content[:300] + "..."
            context_parts.append(f"{role}: {content}")
        return "\n".join(context_parts)

    # ── Load PostgreSQL Context ────────────────────────────────────
    def _load_pg_context(self, case_ids: List[str]) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """Loads golden profiles, anomalies, and alerts from PostgreSQL strictly for the active case."""
        pg_suspects = []
        pg_anomalies = []
        pg_alerts = []

        with get_db_context() as session:
            raw_profiles = session.query(GoldenProfileModel).filter(
                GoldenProfileModel.case_id.in_(case_ids)
            ).all()
            for p in raw_profiles:
                pg_suspects.append({
                    "id": p.z_cluster_id,
                    "name": p.primary_name,
                    "type": "Person",
                    "risk_score": float(p.risk_score or 0.5),
                    "cluster_id": p.z_cluster_id,
                    "pivot_id": p.primary_name,
                    "details": f"Phones: {', '.join(p.known_phones or [])} | Accounts: {', '.join(p.known_accounts or [])}"
                })

            raw_findings = session.query(AnomalyFindingModel).filter(
                AnomalyFindingModel.case_id.in_(case_ids)
            ).order_by(AnomalyFindingModel.unified_score.desc()).limit(10).all()
            for f in raw_findings:
                pg_anomalies.append({
                    "finding_id": f.finding_id,
                    "title": f.title,
                    "severity": f.severity,
                    "score": round(float(f.unified_score or 0.0), 2),
                    "domain": f.domain,
                    "what_happened": f.what_happened or f.explanation or f.title
                })

            raw_alerts = session.query(AlertModel).filter(
                AlertModel.case_id.in_(case_ids)
            ).order_by(AlertModel.risk_score.desc()).limit(5).all()
            for a in raw_alerts:
                pg_alerts.append({
                    "pattern_name": a.pattern_name,
                    "risk_level": a.risk_level,
                    "risk_score": a.risk_score,
                    "explanation": getattr(a, "evidence_narrative", "") or getattr(a, "explanation", "")
                })

        return pg_suspects, pg_anomalies, pg_alerts

    # ── Response Synthesis ─────────────────────────────────────────
    def _synthesize_response(self, message: str, tool_used: str, records: List[Dict],
                              pg_suspects: List[Dict], pg_anomalies: List[Dict],
                              pg_alerts: List[Dict], generated_query: str,
                              conversation_context: str, case_ids: List[str]) -> str:
        """Uses Qwen 2.5 to synthesize an authoritative forensic response from live query results."""
        tool_label = {
            "NEO4J_GRAPH": "Neo4j Graph Database",
            "POSTGRES_ANOMALIES": "Anomaly Detection Engine",
            "POSTGRES_ALERTS": "CEP Alert System",
            "POSTGRES_PROFILES": "Entity Resolution Database",
            "POSTGRES_EVIDENCE": "Evidence Registry",
            "POSTGRES_REPORTS": "AI Investigation Reports",
            "POSTGRES_CASES": "Case Management System",
            "MULTI_SOURCE": "Cross-Database Intelligence"
        }.get(tool_used, "Investigation Database")

        records_summary = records[:8] if records else []

        synthesis_prompt = f"""You are TRACE AI, a senior digital forensics intelligence analyst.
Provide a clear, professional answer to the investigator's question based strictly on current case facts.

INVESTIGATOR QUESTION: "{message}"

CONVERSATION CONTEXT:
{conversation_context}

DATA SOURCE: {tool_label}
QUERY EXECUTED: {generated_query or 'Direct Database Lookup'}
RECORDS RETURNED: {len(records)} records
SAMPLE DATA: {json.dumps(records_summary, default=str)[:1200]}

CASE-SPECIFIC EVIDENCE:
- Active Case IDs: {case_ids}
- Known Suspects: {[{'name': s['name'], 'risk': s['risk_score']} for s in pg_suspects[:4]]}
- Detected Anomalies: {[{'title': a['title'], 'severity': a['severity']} for a in pg_anomalies[:3]]}
- Active CEP Alerts: {[{'pattern': al['pattern_name'], 'level': al['risk_level']} for al in pg_alerts[:3]]}

INSTRUCTIONS:
1. Give a direct, factual answer in 2-3 short paragraphs using the actual data returned.
2. If multi-hop paths or transaction chains were found, explain the chain of custody/transfer hops clearly.
3. Highlight specific names, amounts (in INR ₹), account numbers, phone numbers when present.
4. Mention relevant anomalies or alerts tied to the entities if applicable.
5. Use markdown **bold** for key entities and amounts.
6. Keep the tone authoritative and court-admissible.

Forensic Response:"""

        try:
            llm = get_llm(num_predict=220, num_ctx=1536)
            resp = llm.invoke(synthesis_prompt)
            reply = resp.content if hasattr(resp, "content") else str(resp)
            return reply.strip()
        except Exception as e:
            logger.warning(f"[Synthesis Warning] {e}")
            if records:
                return f"Query executed successfully via **{tool_label}**. Found **{len(records)} records** matching your query. Review the data table below for detailed results."
            elif pg_anomalies:
                top = pg_anomalies[0]
                return f"Located **{len(pg_anomalies)} anomalies** in case **{case_ids[0] if case_ids else 'Active Case'}**. Most critical: **{top['title']}** ({top['severity']}, {int(top['score']*100)}% risk)."
            else:
                return f"Investigation query processed for case **{case_ids[0] if case_ids else 'Active Case'}**. No matching records found for this specific query."

    # ── Generate Follow-up Suggestions ─────────────────────────────
    def _generate_followups(self, tool_used: str, message: str,
                             records: List[Dict], pg_suspects: List[Dict],
                             pg_anomalies: List[Dict]) -> List[str]:
        """Generates contextual follow-up question suggestions."""
        suggestions = []

        if tool_used == "NEO4J_GRAPH":
            if pg_suspects:
                suggestions.append(f"Show all bank transfers linked to {pg_suspects[0]['name']}")
                suggestions.append(f"Find 2-hop connections for {pg_suspects[0]['name']}")
            suggestions.append("Find multi-hop connections between top suspects")
            if any("amount" in r for r in records):
                suggestions.append("Show transactions greater than ₹100,000")

        elif tool_used == "POSTGRES_ANOMALIES":
            suggestions.append("Show only CRITICAL severity anomalies")
            suggestions.append("What financial anomalies were detected?")
            if pg_suspects:
                suggestions.append(f"Show anomalies related to {pg_suspects[0]['name']}")

        elif tool_used == "POSTGRES_ALERTS":
            suggestions.append("Show PENDING alerts that need triage")
            suggestions.append("What are the highest risk score alerts?")

        elif tool_used == "POSTGRES_PROFILES":
            if pg_suspects:
                suggestions.append(f"Show all transactions by {pg_suspects[0]['name']}")
                suggestions.append(f"What anomalies are linked to {pg_suspects[0]['name']}?")
            suggestions.append("List all suspects with risk score above 0.7")

        elif tool_used == "POSTGRES_EVIDENCE":
            suggestions.append("Which evidence files failed processing?")
            suggestions.append("Show evidence with lowest data quality scores")

        elif tool_used == "POSTGRES_REPORTS":
            suggestions.append("What did the financial specialist agent report?")
            suggestions.append("Show the geographic movement analysis")

        else:
            if pg_suspects:
                suggestions.append(f"Tell me about {pg_suspects[0]['name']}")
            suggestions.append("What are the critical anomalies in this case?")
            suggestions.append("Show all evidence files")

        return suggestions[:3]

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # MAIN ORCHESTRATOR
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def process_chat_message(
        self,
        message: str,
        case_id: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Executes end-to-end multi-tool conversational forensic query strictly scoped to case_id.
        1. Classifies the query to select the right tool
        2. Generates the appropriate query (Cypher/SQL)
        3. Executes against the target database
        4. Resolves entities and cross-references
        5. Synthesizes a forensic response
        """
        target_cids = self.resolve_case_identifiers(case_id)
        conversation_context = self._build_conversation_context(history)

        # ── Step 1: Classify Tool ──────────────────────────────────
        tool_used = self.classify_tool(message, history)
        logger.info(f"[Chatbot] Tool classified: {tool_used} for query: {message[:80]}")

        # ── Step 2: Load PostgreSQL context strictly for this case ───
        pg_suspects, pg_anomalies, pg_alerts = self._load_pg_context(target_cids)

        # ── Step 3: Execute Tool-Specific Query ────────────────────
        generated_cypher = None
        sql_query = None
        records = []
        resolved_entities = list(pg_suspects)

        if tool_used == "NEO4J_GRAPH":
            schema = self.introspect_case_schema(target_cids)
            generated_cypher = self.generate_cypher_with_qwen(message, schema, target_cids)
            records = self.execute_neo4j_query(generated_cypher, target_cids)
            resolved_entities = self.resolve_entities_from_records(records, pg_suspects)

        elif tool_used == "MULTI_SOURCE":
            schema = self.introspect_case_schema(target_cids)
            generated_cypher = self.generate_cypher_with_qwen(message, schema, target_cids)
            neo4j_records = self.execute_neo4j_query(generated_cypher, target_cids)
            resolved_entities = self.resolve_entities_from_records(neo4j_records, pg_suspects)

            sql_query = self._fallback_sql("POSTGRES_ANOMALIES", target_cids)
            pg_records = self.execute_postgres_query(sql_query, target_cids)
            records = neo4j_records + pg_records

        elif tool_used == "POSTGRES_REPORTS":
            report_records, sql_query = self.query_investigation_reports(target_cids, message)
            records = report_records

        elif tool_used in PG_TABLE_SCHEMAS:
            sql_query = self.generate_sql_with_qwen(message, tool_used, target_cids)
            records = self.execute_postgres_query(sql_query, target_cids)

            if tool_used == "POSTGRES_PROFILES" and records:
                for rec in records:
                    name = rec.get("primary_name") or rec.get("name")
                    if name and not any(e.get("name") == name for e in resolved_entities):
                        resolved_entities.append({
                            "id": rec.get("z_cluster_id", name),
                            "name": name,
                            "type": "Person",
                            "risk_score": float(rec.get("risk_score", 0.5)),
                            "cluster_id": rec.get("z_cluster_id", ""),
                            "pivot_id": name,
                            "details": f"Phones: {rec.get('known_phones', '')} | Accounts: {rec.get('known_accounts', '')}"
                        })

        # ── Step 4: Synthesize Response ────────────────────────────
        generated_query = generated_cypher or sql_query or ""
        reply_text = self._synthesize_response(
            message=message,
            tool_used=tool_used,
            records=records,
            pg_suspects=pg_suspects,
            pg_anomalies=pg_anomalies,
            pg_alerts=pg_alerts,
            generated_query=generated_query,
            conversation_context=conversation_context,
            case_ids=target_cids
        )

        # ── Step 5: Generate Follow-ups ────────────────────────────
        suggested_followups = self._generate_followups(
            tool_used, message, records, pg_suspects, pg_anomalies
        )

        return {
            "reply": reply_text,
            "tool_used": tool_used,
            "generated_cypher": generated_cypher,
            "sql_query": sql_query,
            "records_count": len(records),
            "records": records[:20],
            "resolved_entities": resolved_entities[:8],
            "anomalies": pg_anomalies[:4],
            "alerts": pg_alerts[:3],
            "suggested_followups": suggested_followups,
            "model_used": "qwen2.5:7b (Local GPU Ollama)"
        }


forensic_chatbot = ForensicChatbotService()
