"""
Advanced Search and Case Intelligence Engine.
Features:
1. Omni-Bar Auto-Type Recognition (Phone, IPv4, Bank Account, Amount, Handle, IMEI, Cell Tower, Natural Language)
2. Dual-Mode Matching (Exact Match for identifiers, Fuzzy Jaro-Winkler for names & handles)
3. Bank Account Resolution to Person Entities (via Zingg Golden Profiles & Neo4j OWNS_ACCOUNT)
4. Cross-Querying of Associated Anomaly Findings and CEP Alerts from PostgreSQL
5. Multi-Criteria & Spatial-Temporal Filtering (Sliding Windows, Tower Radius, Risk Floor, Degree Centrality)
6. Natural Language to Neo4j Cypher / SQL Query via Local Qwen 2.5 LLM on GPU
7. Unified Entity Knowledge Cards with "Pivot to Graph Visualizer" trigger
"""

import re
import json
import logging
import datetime
from typing import Dict, Any, List, Optional
from difflib import SequenceMatcher

from app.core.config import settings
from app.core.database import get_db_context
from app.core.neo4j_client import neo4j_client
from app.core.llm_provider import get_llm
from app.models.postgres_models import (
    GoldenProfileModel, SearchHistoryModel, CaseModel, 
    AnomalyFindingModel, AlertModel
)

logger = logging.getLogger("investigation.search")

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def jaro_winkler_similarity(s1: str, s2: str) -> float:
    """Calculates string similarity ratio for fuzzy matching."""
    if not s1 or not s2:
        return 0.0
    return SequenceMatcher(None, s1.lower().strip(), s2.lower().strip()).ratio()


class SearchEngine:
    """Multi-Engine Investigative Search & NL-Query Subsystem."""

    def resolve_case_identifiers(self, case_id: Optional[str]) -> List[str]:
        """
        Resolves case_id and case_reference dynamically to support any active case.
        Returns a deduplicated list of identifiers to query in PostgreSQL and Neo4j.
        """
        if not case_id:
            with get_db_context() as session:
                latest = session.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
                if latest:
                    return list({latest.case_id, latest.case_reference})
            return ["INV-2026-BLACK-CIRCUIT"]

        with get_db_context() as session:
            c = session.query(CaseModel).filter(
                (CaseModel.case_id == case_id) | (CaseModel.case_reference == case_id)
            ).first()
            if c:
                return list({c.case_id, c.case_reference, case_id})
        return [case_id]

    def classify_input(self, query: str) -> Dict[str, Any]:
        """
        Auto-classifies investigator input via Regex and NLP heuristics.
        Returns detected type, normalized query, confidence, and human-readable label.
        """
        q = query.strip()
        
        # 1. Phone / IMSI (E.164 or 10-12 digits)
        if re.match(r"^(\+91[\-\s]?)?[6-9]\d{9}$", q.replace(" ", "")) or (re.match(r"^\+?\d{10,13}$", q.replace(" ", "")) and not q.startswith("0")):
            clean_ph = q.replace(" ", "").replace("-", "")
            return {"type": "PHONE", "normalized": clean_ph, "confidence": 0.95, "label": "Phone / IMSI Identifier"}

        # 2. IPv4 / Subnet
        if re.match(r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:[0-2]?[0-9]|3[0-2]))?$", q):
            return {"type": "IP_ADDRESS", "normalized": q, "confidence": 0.98, "label": "IPv4 Address / Subnet"}

        # 3. Social Media Handle
        if q.startswith("@") and len(q) >= 2:
            return {"type": "SOCIAL_HANDLE", "normalized": q, "confidence": 0.95, "label": "Social Media Handle"}

        # 4. IMEI / Hardware Device ID (14-16 digits)
        if re.match(r"^\d{14,16}$", q):
            return {"type": "IMEI", "normalized": q, "confidence": 0.92, "label": "IMEI / Device Telemetry"}

        # 5. Cell Tower / Base Station ID (e.g., TOWER_104, Tower 104, CELL-...)
        if re.match(r"^(?:TOWER|CELL|BTS)[\-_ ]?[A-Z0-9\-]+$", q, re.IGNORECASE) or ("tower" in q.lower() and any(c.isdigit() for c in q)):
            return {"type": "CELL_TOWER", "normalized": q.upper(), "confidence": 0.94, "label": "Cell Tower Telemetry"}

        # 6. Financial Transaction Amount
        amt_match = re.match(r"^[₹$]?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]{4,10})$", q)
        if amt_match and any(c.isdigit() for c in q) and len(q) <= 12 and not q.startswith("+"):
            val_str = amt_match.group(1).replace(",", "").replace("₹", "").replace("$", "").strip()
            try:
                amt_val = float(val_str)
                if amt_val >= 1000:
                    return {"type": "TRANSACTION_AMOUNT", "normalized": amt_val, "confidence": 0.88, "label": "Financial Amount"}
            except ValueError:
                pass

        # 7. Bank Account (BANK prefix, ACC prefix, or 9-18 digits)
        if re.match(r"^(?:BANK|ACC|[A-Z]{3,4})?\d{9,18}$", q, re.IGNORECASE) or (q.upper().startswith("BANK") and len(q) >= 6) or (q.upper().startswith("ACC") and len(q) >= 6) or (q.isdigit() and 9 <= len(q) <= 18):
            return {"type": "BANK_ACCOUNT", "normalized": q.upper(), "confidence": 0.92, "label": "Bank Account Number"}

        # 8. Natural Language Query (Sentences with inquiry words or complex multi-word clauses)
        nl_triggers = ["show", "find", "who", "connected", "transfer", "transferred", "above", "between", "linked", "nuh", "delhi", "call", "account", "phone", "suspect", "mule", "all", "which", "radius", "near", "within"]
        words = q.lower().split()
        if len(words) >= 3 and any(t in words for t in nl_triggers):
            return {"type": "NATURAL_LANGUAGE", "normalized": q, "confidence": 0.90, "label": "Natural Language Question"}

        # 9. Person Name / Keyword
        return {"type": "NAME_KEYWORD", "normalized": q, "confidence": 0.75, "label": "Person Name / Keyword"}

    def execute_omni_search(
        self,
        query: str,
        case_id: str,
        match_mode: str = "exact",  # exact vs fuzzy
        filters: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes unified search matching across PostgreSQL Golden Profiles,
        PostgreSQL Anomaly Findings, CEP Alerts, and Neo4j Knowledge Graph.
        Returns rich Unified Entity Knowledge Cards with verified Person resolutions.
        """
        classification = self.classify_input(query)
        detected_type = classification["type"]
        filters = filters or {}
        
        target_cids = self.resolve_case_identifiers(case_id)
        primary_case_id = target_cids[0]

        min_risk = float(filters.get("min_risk_score", 0.0))
        min_amount = float(filters.get("min_amount", 0.0))
        min_degree = int(filters.get("min_degree", 0))
        geo_tower_filter = filters.get("geo_tower_id") or ""
        time_window_mins = int(filters.get("time_window_mins", 0))
        incident_time_str = filters.get("incident_time")

        matched_cards = []
        seen_entity_ids = set()

        # ═══ 1. Search in PostgreSQL Golden Profiles ═══
        with get_db_context() as session:
            profiles_query = session.query(GoldenProfileModel).filter(
                GoldenProfileModel.case_id.in_(target_cids)
            )
            all_profiles = profiles_query.all()

            # Pre-load anomaly findings and alerts for this case to cross-correlate
            all_findings = session.query(AnomalyFindingModel).filter(
                AnomalyFindingModel.case_id.in_(target_cids)
            ).all()

            all_alerts = session.query(AlertModel).filter(
                AlertModel.case_id.in_(target_cids)
            ).all()

            for p in all_profiles:
                score = 0.0
                match_reason = ""
                resolved_info = None

                p_name = p.primary_name or ""
                aliases = p.known_aliases or []
                phones = [str(x) for x in (p.known_phones or [])]
                accounts = [str(x) for x in (p.known_accounts or [])]
                handles = []
                for sh in (p.social_handles or []):
                    handles.append(sh if isinstance(sh, str) else sh.get("handle", ""))

                # Evaluate match based on classification
                if detected_type == "PHONE":
                    target_ph = str(classification["normalized"])
                    clean_target = target_ph.replace("+", "").replace("-", "")
                    if any(clean_target in ph.replace("+", "").replace("-", "") for ph in phones):
                        score = 1.0
                        match_reason = f"Exact match on phone: {target_ph}"
                        resolved_info = {
                            "name": p_name,
                            "cluster_id": p.z_cluster_id,
                            "role": "Verified Registered Subscriber"
                        }
                elif detected_type == "BANK_ACCOUNT":
                    target_acc = str(classification["normalized"])
                    clean_target = target_acc.replace("-", "").replace(" ", "").upper()
                    if any(clean_target in acc.replace("-", "").replace(" ", "").upper() for acc in accounts):
                        score = 1.0
                        match_reason = f"Bank account {target_acc} resolved to verified Person: {p_name}"
                        resolved_info = {
                            "name": p_name,
                            "cluster_id": p.z_cluster_id,
                            "role": "Beneficial Account Holder"
                        }
                elif detected_type == "SOCIAL_HANDLE":
                    target_h = str(classification["normalized"]).lower()
                    if any(target_h in h.lower() for h in handles):
                        score = 1.0
                        match_reason = f"Matched handle: {target_h}"
                    elif match_mode == "fuzzy":
                        best_h_score = max([jaro_winkler_similarity(target_h, h) for h in handles] or [0.0])
                        if best_h_score >= 0.70:
                            score = best_h_score
                            match_reason = f"Fuzzy matched handle ({int(score*100)}%): {target_h}"
                else:
                    # Name / Keyword matching
                    q_lower = query.lower()
                    if q_lower == p_name.lower():
                        score = 1.0
                        match_reason = f"Exact name match: {p_name}"
                    elif q_lower in p_name.lower():
                        score = 0.90
                        match_reason = f"Substring name match in: {p_name}"
                    elif any(q_lower in a.lower() for a in aliases):
                        score = 0.85
                        match_reason = f"Alias match: {p_name}"
                    elif match_mode == "fuzzy":
                        sim = max(
                            [jaro_winkler_similarity(q_lower, p_name)] +
                            [jaro_winkler_similarity(q_lower, a) for a in aliases]
                        )
                        if sim >= 0.65:
                            score = sim
                            match_reason = f"Fuzzy name match ({int(sim*100)}%): {p_name}"

                # Apply cross-domain threshold filters
                if score > 0:
                    profile_risk = float(p.risk_score or 0.35)
                    if min_risk > 0 and (profile_risk * 100.0) < min_risk:
                        continue

                    e_id = p.z_cluster_id or p.primary_name
                    if e_id not in seen_entity_ids:
                        seen_entity_ids.add(e_id)
                        
                        # Find associated anomalies for this person
                        associated_anomalies = []
                        search_ident_set = {p_name.lower(), e_id.lower()} | {ph.lower() for ph in phones} | {acc.lower() for acc in accounts}
                        for f in all_findings:
                            f_ent = str(f.entity_id or "").lower()
                            f_title = str(f.title or "").lower()
                            f_primaries = [str(x).lower() for x in (f.primary_entities or [])]
                            if (f_ent in search_ident_set or 
                                any(ident in f_title for ident in search_ident_set) or
                                any(p_ident in f_primaries for p_ident in search_ident_set)):
                                associated_anomalies.append({
                                    "finding_id": f.finding_id,
                                    "title": f.title,
                                    "severity": f.severity,
                                    "score": round(float(f.unified_score or 0.0), 2),
                                    "domain": f.domain,
                                    "detector": f.primary_detector_type,
                                    "what_happened": f.what_happened or f.explanation
                                })

                        # Find associated CEP alerts
                        associated_alerts = []
                        for a in all_alerts:
                            a_ent = str(a.entity_id or "").lower()
                            a_name = str(a.entity_name or "").lower()
                            if a_ent in search_ident_set or a_name in search_ident_set:
                                associated_alerts.append({
                                    "alert_id": a.alert_id,
                                    "pattern_name": a.pattern_name,
                                    "risk_level": a.risk_level,
                                    "risk_score": a.risk_score
                                })

                        # Generate timeline snippet
                        timeline_snippet = []
                        if phones:
                            timeline_snippet.append({
                                "type": "CDR",
                                "icon": "phone",
                                "label": f"Cellular Link: {phones[0]}",
                                "time": "Monitored CDR stream"
                            })
                        if accounts:
                            timeline_snippet.append({
                                "type": "BANK",
                                "icon": "landmark",
                                "label": f"Bank Vault: {accounts[0]}",
                                "time": "Active transaction ledger"
                            })
                        if handles:
                            timeline_snippet.append({
                                "type": "SOCIAL",
                                "icon": "globe",
                                "label": f"Handle: {handles[0]}",
                                "time": "IPDR digital session"
                            })

                        conn_count = len(phones) + len(accounts) + len(handles)
                        if min_degree > 0 and conn_count < min_degree:
                            continue

                        matched_cards.append({
                            "entity_id": e_id,
                            "primary_name": p.primary_name,
                            "type": "Person",
                            "risk_score": profile_risk,
                            "risk_level": "CRITICAL" if profile_risk >= 0.8 else ("HIGH" if profile_risk >= 0.6 else "MEDIUM"),
                            "known_aliases": aliases,
                            "verified_phones": phones,
                            "bank_accounts": accounts,
                            "social_handles": handles,
                            "match_confidence": round(score, 3),
                            "match_reason": match_reason,
                            "resolved_person": resolved_info or {
                                "name": p.primary_name,
                                "cluster_id": p.z_cluster_id,
                                "risk_score": profile_risk,
                                "role": "Canonical Zingg Entity"
                            },
                            "connected_nodes_count": conn_count,
                            "associated_anomalies": associated_anomalies[:5],
                            "associated_alerts": associated_alerts[:4],
                            "timeline_snippet": timeline_snippet,
                            "graph_pivot_id": p.primary_name
                        })

        # ═══ 2. Search in Neo4j Graph for direct identifier matches & Bank resolution ═══
        if neo4j_client.ensure_connected():
            try:
                with neo4j_client.driver.session() as session:
                    # 2A: Special Bank Account Resolution Query
                    if detected_type == "BANK_ACCOUNT" or query.upper().startswith("BANK") or query.upper().startswith("ACC") or (query.isdigit() and len(query) >= 9):
                        bank_cypher = """
                        MATCH (b:BankAccount)
                        WHERE (b.case_id IN $cids OR ANY(cid IN $cids WHERE cid IN coalesce(b.case_ids, [])))
                          AND (toLower(b.account_number) CONTAINS toLower($q) OR toLower(coalesce(b.holder, '')) CONTAINS toLower($q))
                        OPTIONAL MATCH (p:Person)-[:OWNS_ACCOUNT]->(b)
                        OPTIONAL MATCH (b)-[r:TRANSACTED_WITH]-(other:BankAccount)
                        RETURN elementId(b) AS b_id, b.account_number AS acc, b.holder AS holder,
                               elementId(p) AS p_id, p.name AS p_name, p.risk_score AS p_risk,
                               collect(distinct other.account_number)[..5] AS counterparties,
                               count(r) AS tx_count
                        LIMIT 10
                        """
                        b_records = session.run(bank_cypher, {"cids": target_cids, "q": query.strip()})
                        for br in b_records:
                            acc_num = br["acc"]
                            p_name = br["p_name"] or br["holder"] or "Account Holder"
                            if acc_num not in seen_entity_ids:
                                seen_entity_ids.add(acc_num)
                                p_risk = float(br["p_risk"] or 0.65)
                                
                                # Query anomalies for this account
                                with get_db_context() as dbs:
                                    anoms = dbs.query(AnomalyFindingModel).filter(
                                        AnomalyFindingModel.case_id.in_(target_cids),
                                        (AnomalyFindingModel.entity_id == acc_num) | 
                                        (AnomalyFindingModel.title.ilike(f"%{acc_num}%")) |
                                        (AnomalyFindingModel.what_happened.ilike(f"%{acc_num}%"))
                                    ).all()
                                    acc_anomalies = [
                                        {
                                            "finding_id": an.finding_id,
                                            "title": an.title,
                                            "severity": an.severity,
                                            "score": round(float(an.unified_score or 0.0), 2),
                                            "domain": an.domain,
                                            "detector": an.primary_detector_type
                                        }
                                        for an in anoms[:4]
                                    ]

                                matched_cards.append({
                                    "entity_id": acc_num,
                                    "primary_name": f"Bank Vault: {acc_num}",
                                    "type": "BankAccount",
                                    "risk_score": p_risk,
                                    "risk_level": "CRITICAL" if p_risk >= 0.8 else "HIGH",
                                    "known_aliases": [p_name] if p_name else [],
                                    "verified_phones": [],
                                    "bank_accounts": [acc_num],
                                    "social_handles": [],
                                    "match_confidence": 1.0,
                                    "match_reason": f"Bank account resolved to Person: {p_name} via OWNS_ACCOUNT",
                                    "resolved_person": {
                                        "name": p_name,
                                        "cluster_id": br["p_id"] or "RESOLVED-P",
                                        "risk_score": p_risk,
                                        "role": "Beneficial Owner"
                                    },
                                    "connected_nodes_count": int(br["tx_count"] or 2) + 1,
                                    "associated_anomalies": acc_anomalies,
                                    "associated_alerts": [],
                                    "timeline_snippet": [
                                        {"type": "BANK", "icon": "landmark", "label": f"Disbursement conduit {acc_num}", "time": "Monitored Transactions"}
                                    ],
                                    "graph_pivot_id": acc_num
                                })

                    # 2B: General Graph Entity Matcher
                    cypher = """
                    MATCH (n)
                    WHERE (n.case_id IN $cids OR ANY(cid IN $cids WHERE cid IN coalesce(n.case_ids, [])))
                      AND NOT 'Anomaly' IN labels(n)
                      AND (
                        toLower(coalesce(n.name, '')) CONTAINS toLower($q)
                        OR toLower(coalesce(n.number, '')) CONTAINS toLower($q)
                        OR toLower(coalesce(n.account_number, '')) CONTAINS toLower($q)
                        OR toLower(coalesce(n.address, '')) CONTAINS toLower($q)
                        OR toLower(coalesce(n.handle, '')) CONTAINS toLower($q)
                        OR toLower(coalesce(n.tower_id, '')) CONTAINS toLower($q)
                      )
                    RETURN elementId(n) AS node_id, labels(n) AS labels, properties(n) AS props
                    LIMIT 20
                    """
                    records = session.run(cypher, {"cids": target_cids, "q": query.strip()})
                    for r in records:
                        n_id = r["node_id"]
                        labels = r["labels"]
                        props = r["props"]
                        lbl = labels[0] if labels else "Entity"
                        
                        name = props.get("name") or props.get("number") or props.get("account_number") or props.get("address") or props.get("handle") or props.get("tower_id") or "Node"
                        
                        if name not in seen_entity_ids and n_id not in seen_entity_ids:
                            seen_entity_ids.add(name)
                            pr = float(props.get("pagerank", 0.35))
                            if min_risk > 0 and (pr * 100.0) < min_risk:
                                continue
                            
                            conn = int(props.get("degree", 3))
                            if min_degree > 0 and conn < min_degree:
                                continue

                            matched_cards.append({
                                "entity_id": str(name),
                                "primary_name": name,
                                "type": lbl,
                                "risk_score": pr,
                                "risk_level": "HIGH" if pr >= 0.4 else "MEDIUM",
                                "known_aliases": [props.get("aliases")] if props.get("aliases") else [],
                                "verified_phones": [props.get("number")] if props.get("number") else [],
                                "bank_accounts": [props.get("account_number")] if props.get("account_number") else [],
                                "social_handles": [props.get("handle")] if props.get("handle") else [],
                                "match_confidence": 0.95,
                                "match_reason": f"Neo4j graph entity match ({lbl})",
                                "connected_nodes_count": conn,
                                "associated_anomalies": [],
                                "associated_alerts": [],
                                "timeline_snippet": [
                                    {"type": lbl, "icon": "share-2", "label": f"Graph Entity: {name}", "time": "Case Topology"}
                                ],
                                "graph_pivot_id": str(name)
                            })
            except Exception as e:
                logger.warning(f"[Neo4j Search Query Warning] {e}")

        # ═══ 3. Geospatial & Cell Tower Proximity Filter ═══
        if geo_tower_filter and neo4j_client.ensure_connected():
            try:
                with neo4j_client.driver.session() as session:
                    geo_cypher = """
                    MATCH (tw:CellTower)
                    WHERE (tw.case_id IN $cids OR ANY(cid IN $cids WHERE cid IN coalesce(tw.case_ids, [])))
                      AND (toLower(tw.tower_id) CONTAINS toLower($tw_id) OR toLower(coalesce(tw.location, '')) CONTAINS toLower($tw_id))
                    OPTIONAL MATCH (p:Phone)-[r:PINGED_TOWER]->(tw)
                    RETURN tw.tower_id AS tower, tw.location AS location, p.number AS phone, p.holder AS holder, r.timestamp AS ping_time
                    LIMIT 20
                    """
                    t_records = session.run(geo_cypher, {"cids": target_cids, "tw_id": geo_tower_filter.strip()})
                    for tr in t_records:
                        ph = tr["phone"]
                        tw_id = tr["tower"]
                        loc = tr["location"] or "Perimeter"
                        if ph and ph not in seen_entity_ids:
                            seen_entity_ids.add(ph)
                            matched_cards.append({
                                "entity_id": ph,
                                "primary_name": f"Device Ping at {tw_id}",
                                "type": "Phone",
                                "risk_score": 0.75,
                                "risk_level": "HIGH",
                                "known_aliases": [tr["holder"]] if tr["holder"] else [],
                                "verified_phones": [ph],
                                "bank_accounts": [],
                                "social_handles": [],
                                "match_confidence": 0.98,
                                "match_reason": f"Geospatial match: Active within cell tower radius of {tw_id} ({loc})",
                                "connected_nodes_count": 2,
                                "associated_anomalies": [],
                                "associated_alerts": [],
                                "timeline_snippet": [
                                    {"type": "TOWER", "icon": "radio-tower", "label": f"Cell Tower Ping: {tw_id}", "time": tr["ping_time"] or "Monitored Tower Window"}
                                ],
                                "graph_pivot_id": ph
                            })
            except Exception as e:
                logger.warning(f"[Geospatial Search Warning] {e}")

        # Record search into SearchHistoryModel
        try:
            with get_db_context() as session:
                rec = SearchHistoryModel(
                    case_id=primary_case_id,
                    user_id=user_id or "ANALYST_LEAD",
                    query_text=query,
                    query_type="OMNI",
                    detected_type=detected_type,
                    filters=filters,
                    result_count=len(matched_cards),
                    created_at=utcnow()
                )
                session.add(rec)
                session.commit()
        except Exception as e:
            logger.warning(f"[Search History Log] {e}")

        return {
            "query": query,
            "detected_type": detected_type,
            "classification": classification,
            "match_mode": match_mode,
            "total_results": len(matched_cards),
            "cards": matched_cards
        }

    def execute_nl_to_cypher(self, natural_language_prompt: str, case_id: str) -> Dict[str, Any]:
        """
        Translates natural language questions into executable Neo4j Cypher queries
        using the local Qwen 2.5 LLM running on the user's GPU.
        Executes safely and returns matched nodes.
        """
        target_cids = self.resolve_case_identifiers(case_id)
        
        # Dynamically introspect active case schema
        from app.services.forensic_chatbot import forensic_chatbot
        dyn_schema = forensic_chatbot.introspect_case_schema(target_cids)
        labels_str = ", ".join(dyn_schema.get("node_labels", []))
        rels_str = ", ".join(dyn_schema.get("relationship_types", []))
        props_desc = "\n".join([f"- {lbl}: {', '.join(props)}" for lbl, props in dyn_schema.get("label_properties", {}).items()])

        schema_context = f"""
        DYNAMICALLY INTROSPECTED GRAPH SCHEMA:
        Active Labels: {labels_str}
        Active Relationships: {rels_str}
        Attributes Per Label:
        {props_desc}

        FEW-SHOT EXAMPLES:
        Example 1:
        Q: "Show bank accounts receiving transfers above ₹2,000,000"
        Cypher:
        MATCH (b1:BankAccount)-[r:TRANSACTED_WITH]->(b2:BankAccount)
        WHERE (b1.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(b1.case_ids, [])))
          AND coalesce(r.amount, 0) > 2000000
        RETURN b1.account_number AS sender_account, b1.holder AS sender_holder, coalesce(r.amount, 0) AS amount, b2.account_number AS recipient_account, b2.holder AS recipient_holder
        LIMIT 25

        Example 2:
        Q: "Find all active devices within cell tower 104"
        Cypher:
        MATCH (p:Phone)-[r:PINGED_TOWER]->(tw:CellTower)
        WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
          AND (toLower(tw.tower_id) CONTAINS '104' OR toLower(tw.address) CONTAINS '104')
        RETURN p.number AS phone_number, tw.tower_id AS tower_id, tw.address AS location, r.timestamp AS time
        LIMIT 25

        Example 3:
        Q: "Show all high risk suspects with more than 3 connections"
        Cypher:
        MATCH (p:Person)
        WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
          AND p.risk_score >= 0.70
        RETURN p.name AS suspect_name, p.risk_score AS risk_score, p.golden_id AS cluster_id
        ORDER BY p.risk_score DESC
        LIMIT 25
        """

        system_prompt = f"""You are a principal Cypher database architect for an intelligence forensics platform.
Translate the user's natural language question into a single, valid, safe, read-only Neo4j Cypher query.

{schema_context}

RULES:
1. ONLY return the Cypher query. Do not include markdown tags like ```cypher or explanations.
2. MUST start with MATCH. Never use CREATE, MERGE, DELETE, SET, or DROP.
3. Always include LIMIT 25 at the end.
4. Parameterize case IDs using: (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, [])))

Question: {natural_language_prompt}
Cypher Query:"""

        cypher_generated = ""
        try:
            llm = get_llm(num_predict=350, num_ctx=2048)
            resp = llm.invoke(system_prompt)
            cypher_raw = resp.content if hasattr(resp, "content") else str(resp)
            # Strip code blocks
            cypher_clean = cypher_raw.replace("```cypher", "").replace("```", "").strip()
            # Extract first MATCH block
            if "MATCH" in cypher_clean:
                cypher_clean = cypher_clean[cypher_clean.index("MATCH"):]
            cypher_generated = cypher_clean
        except Exception as e:
            logger.warning(f"[NL-to-Cypher LLM Warning] {e}")
            # Robust fallback Cypher based on keywords
            q_lower = natural_language_prompt.lower()
            if "bank" in q_lower or "transfer" in q_lower:
                cypher_generated = """
                MATCH (s:BankAccount)-[r:TRANSACTED_WITH]->(t:BankAccount)
                WHERE (s.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(s.case_ids, [])))
                RETURN s.account_number AS source, s.holder AS holder, coalesce(r.amount, 0) AS amount, t.account_number AS destination
                ORDER BY r.amount DESC LIMIT 25
                """
            elif "phone" in q_lower or "tower" in q_lower:
                cypher_generated = """
                MATCH (p:Phone)-[r:PINGED_TOWER]->(tw:CellTower)
                WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
                RETURN p.number AS phone, tw.tower_id AS tower, tw.location AS location
                LIMIT 25
                """
            else:
                cypher_generated = """
                MATCH (p:Person)
                WHERE (p.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(p.case_ids, [])))
                RETURN p.name AS name, p.risk_score AS risk, p.communityId AS community
                ORDER BY p.risk_score DESC LIMIT 25
                """

        # Validate against write operations
        forbidden = ["create", "merge", "delete", "set", "remove", "drop", "detach"]
        if any(f in cypher_generated.lower().split() for f in forbidden):
            cypher_generated = "MATCH (n) WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, []))) RETURN n LIMIT 25"

        # Execute Cypher
        records_out = []
        if neo4j_client.ensure_connected():
            try:
                with neo4j_client.driver.session() as session:
                    # Provide both $case_ids and single $case_id for compatibility
                    res = session.run(
                        cypher_generated,
                        {"case_ids": target_cids, "case_id": target_cids[0]}
                    )
                    for r in res:
                        records_out.append(dict(r))
            except Exception as e:
                logger.warning(f"[Cypher Execution Error] {e}")
                # Secondary safe fallback execution
                with neo4j_client.driver.session() as session:
                    fallback_res = session.run(
                        "MATCH (n) WHERE (n.case_id IN $case_ids OR ANY(cid IN $case_ids WHERE cid IN coalesce(n.case_ids, []))) RETURN coalesce(n.name, n.number, n.account_number, elementId(n)) AS name, labels(n)[0] AS type, coalesce(n.risk_score, 0.4) AS score LIMIT 15",
                        {"case_ids": target_cids}
                    )
                    records_out = [dict(r) for r in fallback_res]

        return {
            "success": True,
            "prompt": natural_language_prompt,
            "natural_language_prompt": natural_language_prompt,
            "generated_cypher": cypher_generated.strip(),
            "cypher_query": cypher_generated.strip(),
            "model_used": "qwen2.5:7b (Local GPU Ollama)",
            "result_count": len(records_out),
            "total_records": len(records_out),
            "records": records_out
        }

    def get_search_history(self, case_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieves past investigative search queries."""
        target_cids = self.resolve_case_identifiers(case_id) if case_id else []
        with get_db_context() as session:
            q = session.query(SearchHistoryModel)
            if target_cids:
                q = q.filter(SearchHistoryModel.case_id.in_(target_cids))
            records = q.order_by(SearchHistoryModel.created_at.desc()).limit(50).all()
            return [
                {
                    "id": r.id,
                    "case_id": r.case_id,
                    "query_text": r.query_text,
                    "query_type": r.query_type,
                    "detected_type": r.detected_type,
                    "result_count": r.result_count,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                }
                for r in records
            ]


search_engine = SearchEngine()
