import uuid
import re
import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.neo4j_client import neo4j_client
from app.core.database import get_db
from app.models.iam_models import UserModel, CaseMemberModel
from app.authorization.dependencies import require_permission
from app.authorization.permissions import Permissions
from app.authorization.roles import Roles
from app.audit.audit_service import record_audit_event, AuditAction

router = APIRouter()

def extract_label(labels, props):
    labels_set = set(labels or [])
    
    # 1. Type-specific authoritative identifiers (guarantees BankAccount never gets Person name)
    if "BankAccount" in labels_set or props.get("account_number"):
        acc = props.get("account_number")
        if acc:
            return str(acc)
    if "IMEI" in labels_set or "Device" in labels_set or props.get("imei_number") or props.get("imei"):
        imei = props.get("imei_number") or props.get("imei")
        if imei:
            return str(imei)
    if "SIMCard" in labels_set or props.get("imsi"):
        imsi = props.get("imsi")
        if imsi:
            return f"SIM: {imsi}"
    if "SocialAccount" in labels_set or props.get("handle"):
        handle = props.get("handle")
        if handle:
            return f"@{str(handle).lstrip('@')}"
    if "CellTower" in labels_set or props.get("tower_id") or props.get("cell_tower_id"):
        tower = props.get("tower_id") or props.get("cell_tower_id")
        if tower:
            return str(tower)
    if "ATM" in labels_set or props.get("atm_id"):
        atm = props.get("atm_id")
        if atm:
            return f"ATM: {atm}"
    if "IPAddress" in labels_set or props.get("address") or props.get("ip") or props.get("assigned_ip"):
        ip = props.get("address") or props.get("ip") or props.get("assigned_ip")
        if ip:
            return str(ip)
    if "Phone" in labels_set or props.get("number") or props.get("phone"):
        ph = props.get("number") or props.get("phone")
        if ph:
            return str(ph)
    if "Person" in labels_set:
        pname = props.get("primary_name") or props.get("name")
        if pname and not _is_phone_number(pname):
            return str(pname)

    # 2. General fallback prioritizing exact IDs over generic fields (holder moved to last resort)
    lbl = (
        props.get("primary_name") or
        props.get("name") or 
        props.get("account_number") or 
        props.get("number") or 
        props.get("phone") or
        props.get("imei_number") or 
        props.get("imei") or 
        (f"SIM: {props['imsi']}" if props.get("imsi") else None) or
        (f"@{props['handle'].lstrip('@')}" if props.get("handle") else None) or
        props.get("tower_id") or 
        props.get("cell_tower_id") or 
        props.get("atm_id") or
        props.get("address") or 
        props.get("ip") or 
        props.get("assigned_ip") or 
        props.get("email") or
        props.get("identifier") or
        props.get("id") or
        props.get("golden_id") or
        props.get("holder")
    )
    if lbl:
        return str(lbl)
    node_type = labels[0] if (labels and len(labels) > 0) else "Entity"
    return f"{node_type}"

def _is_phone_number(name: str) -> bool:
    """Detect if a primary_name is actually just a phone number (not a real person name)."""
    if not name:
        return False
    cleaned = re.sub(r'[\s\-\(\)\+]', '', str(name))
    return cleaned.isdigit() and len(cleaned) >= 7

def build_canonical_graph(target_case_id: str):
    from app.core.database import get_db_context
    from app.models.postgres_models import GoldenProfileModel
    from app.processing.canonical_reader import canonical_reader
    import logging
    logger = logging.getLogger("investigation.graph")

    nodes = {}
    edges = []
    seen_edges = set()
    ph_to_person = {}
    person_phones = {}

    with get_db_context() as db:
        profiles = db.query(GoldenProfileModel).filter_by(case_id=target_case_id).all()
        for p in profiles:
            if _is_phone_number(p.primary_name):
                # Don't create Person node for phone-only placeholder
                continue

            p_id = f"person_{p.z_cluster_id}"
            known_phs = [str(ph).strip() for ph in (p.known_phones or []) if ph and str(ph).lower() not in ("nan", "none", "")]
            nodes[p_id] = {
                "id": p_id,
                "label": p.primary_name or "Suspect",
                "type": "Person",
                "riskScore": p.risk_score or 0.0,
                "properties": {
                    "golden_id": p.z_cluster_id,
                    "name": p.primary_name,
                    "primary_phone": known_phs[0] if known_phs else None,
                    "phones": known_phs,
                    "risk_score": p.risk_score,
                    "aliases": p.known_aliases or [],
                    "case_id": target_case_id
                }
            }
            for ph in known_phs:
                ph_to_person[ph] = p_id
                ph_to_person[f"phone_{ph}"] = p_id
                person_phones.setdefault(p_id, []).append(ph)

            # Bank Account ownership
            for acc in (p.known_accounts or []):
                if acc and str(acc).lower() not in ("nan", "none", ""):
                    acc_id = f"acc_{acc}"
                    if acc_id not in nodes:
                        nodes[acc_id] = {
                            "id": acc_id,
                            "label": str(acc),
                            "type": "BankAccount",
                            "properties": {"account_number": str(acc), "holder": p.primary_name, "case_id": target_case_id}
                        }
                    edge_k = (p_id, acc_id, "OWNS_ACCOUNT")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({
                            "id": f"e_{p_id}_{acc_id}",
                            "source": p_id,
                            "target": acc_id,
                            "relationship": "OWNS_ACCOUNT",
                            "properties": {}
                        })

            # Social handles
            for sh in (p.social_handles or []):
                h = sh.get("handle") if isinstance(sh, dict) else str(sh)
                if h:
                    sh_id = f"social_{h}"
                    if sh_id not in nodes:
                        nodes[sh_id] = {
                            "id": sh_id,
                            "label": f"@{h.lstrip('@')}",
                            "type": "SocialAccount",
                            "properties": {"handle": str(h), "case_id": target_case_id}
                        }
                    edge_k = (p_id, sh_id, "USES_HANDLE")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({
                            "id": f"e_{p_id}_{sh_id}",
                            "source": p_id,
                            "target": sh_id,
                            "relationship": "USES_HANDLE",
                            "properties": {}
                        })

        # NFC Evidence Acquisitions
        try:
            from app.models.nfc_evidence_models import NFCEvidenceAcquisitionModel
            nfc_items = db.query(NFCEvidenceAcquisitionModel).filter_by(case_id=target_case_id).all()
            for item in nfc_items:
                ev_node_id = f"evidence_{item.evidence_id}"
                nodes[ev_node_id] = {
                    "id": ev_node_id,
                    "label": f"NFC Evidence ({item.acquisition_id})",
                    "type": "Evidence",
                    "riskScore": 0.4,
                    "properties": {
                        "evidence_id": item.evidence_id,
                        "acquisition_id": item.acquisition_id,
                        "source_type": "NFC",
                        "sha256": item.raw_sha256,
                        "records": item.record_count,
                        "case_id": target_case_id
                    }
                }
                er_res = item.entity_resolution_result or {}
                matched_cid = er_res.get("matched_cluster_id")
                tier = er_res.get("match_tier")
                if matched_cid:
                    target_p_id = f"person_{matched_cid}"
                    if target_p_id in nodes:
                        rel_name = "NFC_EVIDENCE_MATCHED_ENTITY" if tier == "MATCHED" else "NFC_EVIDENCE_SUGGESTS_ENTITY"
                        edge_k = (ev_node_id, target_p_id, rel_name)
                        if edge_k not in seen_edges:
                            seen_edges.add(edge_k)
                            edges.append({
                                "id": f"e_{ev_node_id}_{target_p_id}",
                                "source": ev_node_id,
                                "target": target_p_id,
                                "relationship": rel_name,
                                "properties": {"confidence": er_res.get("confidence", 0.0)}
                            })
        except Exception as nfc_err:
            logger.warning(f"Error loading NFC graph nodes: {nfc_err}")

    try:
        events = canonical_reader.read_all_events(case_id=target_case_id, limit=3000)
        for ev in events:
            telemetry = ev.get("telemetry", {})
            financial = ev.get("financial", {})
            identity = ev.get("normalized_identity") or ev.get("entities") or {}
            c_phone = identity.get("phone")
            called = ev.get("attributes", {}).get("called_number")

            # Bank transfers
            from_acc = financial.get("account_number") or ev.get("attributes", {}).get("from_account")
            to_acc = financial.get("counterparty") or ev.get("attributes", {}).get("to_account")
            if from_acc and to_acc:
                f_id = f"acc_{from_acc}"
                t_id = f"acc_{to_acc}"
                if f_id not in nodes:
                    nodes[f_id] = {"id": f_id, "label": str(from_acc), "type": "BankAccount", "properties": {"account_number": str(from_acc)}}
                if t_id not in nodes:
                    nodes[t_id] = {"id": t_id, "label": str(to_acc), "type": "BankAccount", "properties": {"account_number": str(to_acc)}}
                edge_k = (f_id, t_id, "TRANSFERS_MONEY")
                if edge_k not in seen_edges:
                    seen_edges.add(edge_k)
                    edges.append({
                        "id": f"e_tx_{len(edges)}",
                        "source": f_id,
                        "target": t_id,
                        "relationship": "TRANSFERS_MONEY",
                        "properties": {"amount": financial.get("amount_inr", 0), "timestamp": ev.get("timestamp")}
                    })

            # Calls
            if c_phone and called:
                c_str = str(c_phone).strip()
                cal_str = str(called).strip()
                src_node = ph_to_person.get(c_str, f"phone_{c_str}")
                tgt_node = ph_to_person.get(cal_str, f"phone_{cal_str}")
                if src_node != tgt_node:
                    if src_node.startswith("phone_") and src_node not in nodes:
                        nodes[src_node] = {"id": src_node, "label": c_str, "type": "Phone", "properties": {"number": c_str}}
                    if tgt_node.startswith("phone_") and tgt_node not in nodes:
                        nodes[tgt_node] = {"id": tgt_node, "label": cal_str, "type": "Phone", "properties": {"number": cal_str}}
                    edge_k = (src_node, tgt_node, "CALLS")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({
                            "id": f"e_call_{len(edges)}",
                            "source": src_node,
                            "target": tgt_node,
                            "relationship": "CALLS",
                            "properties": {"duration": telemetry.get("duration_seconds", 0), "timestamp": ev.get("timestamp")}
                        })

            # Device / SIM / Tower / IP linked to Person (or external Phone)
            if c_phone:
                c_str = str(c_phone).strip()
                actor_id = ph_to_person.get(c_str, f"phone_{c_str}")
                if actor_id.startswith("phone_") and actor_id not in nodes:
                    nodes[actor_id] = {"id": actor_id, "label": c_str, "type": "Phone", "properties": {"number": c_str}}

                imei = telemetry.get("imei") or ev.get("attributes", {}).get("imei")
                tower = telemetry.get("cell_tower_id") or ev.get("attributes", {}).get("cell_id")
                ip = telemetry.get("assigned_ip") or ev.get("attributes", {}).get("ip")
                imsi = telemetry.get("imsi") or ev.get("attributes", {}).get("imsi")

                if imei:
                    im_id = f"imei_{imei}"
                    if im_id not in nodes:
                        nodes[im_id] = {"id": im_id, "label": str(imei), "type": "Device", "properties": {"imei_number": str(imei)}}
                    edge_k = (actor_id, im_id, "USES_DEVICE")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({"id": f"e_im_{len(edges)}", "source": actor_id, "target": im_id, "relationship": "USES_DEVICE", "properties": {}})

                if imsi:
                    sim_id = f"sim_{imsi}"
                    if sim_id not in nodes:
                        nodes[sim_id] = {"id": sim_id, "label": f"SIM: {imsi}", "type": "SIMCard", "properties": {"imsi": str(imsi)}}
                    edge_k = (actor_id, sim_id, "USES_SIM")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({"id": f"e_sim_{len(edges)}", "source": actor_id, "target": sim_id, "relationship": "USES_SIM", "properties": {}})

                if tower:
                    tw_id = f"tower_{tower}"
                    if tw_id not in nodes:
                        nodes[tw_id] = {"id": tw_id, "label": str(tower), "type": "CellTower", "properties": {"tower_id": str(tower)}}
                    edge_k = (actor_id, tw_id, "LOCATED_AT")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({"id": f"e_tw_{len(edges)}", "source": actor_id, "target": tw_id, "relationship": "LOCATED_AT", "properties": {}})

                if ip:
                    ip_id = f"ip_{ip}"
                    if ip_id not in nodes:
                        nodes[ip_id] = {"id": ip_id, "label": str(ip), "type": "IPAddress", "properties": {"address": str(ip)}}
                    edge_k = (actor_id, ip_id, "CONNECTS_VIA_IP")
                    if edge_k not in seen_edges:
                        seen_edges.add(edge_k)
                        edges.append({"id": f"e_ip_{len(edges)}", "source": actor_id, "target": ip_id, "relationship": "CONNECTS_VIA_IP", "properties": {}})

    except Exception as ex:
        logger.warning(f"Error building canonical fallback graph: {ex}")

    # Enrich fallback canonical graph nodes with detected anomalies
    try:
        from app.models.postgres_models import AnomalyFindingModel
        with get_db_context() as session:
            findings = session.query(AnomalyFindingModel).filter(AnomalyFindingModel.case_id == target_case_id).all()
            for n in nodes.values():
                nid = str(n.get("id", ""))
                props = n.get("properties", {})
                matched = [
                    f for f in findings
                    if str(f.entity_id) in (nid, props.get("number"), props.get("account_number"), props.get("address"), props.get("imei_number"), props.get("tower_id"), props.get("primary_phone"))
                    or any(str(pe.get("entity_id")) in (nid, props.get("number"), props.get("account_number"), props.get("primary_phone")) for pe in (f.primary_entities or []))
                ]
                n["hasAnomaly"] = bool(matched)
                n["anomalyCount"] = len(matched)
                if matched:
                    severities = [m.severity for m in matched]
                    n["highestAnomalySeverity"] = "CRITICAL" if "CRITICAL" in severities else ("HIGH" if "HIGH" in severities else "MEDIUM")
    except Exception:
        pass

    clean_edges = [
        e for e in edges
        if e["source"] in nodes
        and e["target"] in nodes
        and e["source"] != e["target"]
        and e.get("relationship") not in ("RESOLVED_TO", "OWNS_PHONE")
        and nodes[e["source"]].get("label") != nodes[e["target"]].get("label")
    ]
    return {"nodes": list(nodes.values()), "edges": clean_edges}

@router.get("/topology")
def get_graph_topology(
    case_id: Optional[str] = None,
    community_id: Optional[str] = None,
    include_anomalies: bool = False,
    current_user: UserModel = Depends(require_permission(Permissions.GRAPH_VIEW)),
    db: Session = Depends(get_db)
):
    target_case_id = case_id
    if not target_case_id:
        from app.models.postgres_models import CaseModel
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            return {"nodes": [], "edges": []}
        target_case_id = c.case_id

    # Filter by community if provided and not 'all'
    cid_filter = None
    cid_int = None
    cid_str = None
    if community_id and str(community_id).strip().lower() not in ("all", "null", "none", ""):
        cid_filter = str(community_id).strip()
        cid_str = cid_filter
        try:
            cid_int = int(cid_filter)
        except ValueError:
            cid_int = None

    # Load anomaly findings for this case to enrich all suspect nodes
    anomaly_map: Dict[str, List[Dict[str, Any]]] = {}
    try:
        from app.models.postgres_models import AnomalyFindingModel
        findings = db.query(AnomalyFindingModel).filter(AnomalyFindingModel.case_id == target_case_id).all()
        for f in findings:
            f_info = {
                "finding_id": f.finding_id,
                "title": f.title,
                "severity": f.severity,
                "pattern_type": f.pattern_type,
                "score": f.unified_score
            }
            if f.entity_id:
                eid = str(f.entity_id).strip()
                anomaly_map.setdefault(eid, []).append(f_info)
                anomaly_map.setdefault(eid.lower(), []).append(f_info)
            for pe in (f.primary_entities or []):
                pe_id = str(pe.get("entity_id") or "").strip()
                pe_name = str(pe.get("display_name") or "").strip()
                if pe_id:
                    anomaly_map.setdefault(pe_id, []).append(f_info)
                    anomaly_map.setdefault(pe_id.lower(), []).append(f_info)
                if pe_name:
                    anomaly_map.setdefault(pe_name, []).append(f_info)
                    anomaly_map.setdefault(pe_name.lower(), []).append(f_info)
    except Exception as ex:
        import logging
        logging.getLogger("investigation.graph").warning(f"[GraphTopology] Anomaly map load error: {ex}")

    def enrich_node(node: dict):
        props = node.get("properties", {})
        candidates = [
            node.get("id"),
            node.get("label"),
            props.get("golden_id"),
            props.get("number"),
            props.get("account_number"),
            props.get("handle"),
            props.get("name"),
            props.get("address"),
            props.get("imei_number"),
            props.get("tower_id")
        ]
        matches = []
        for cand in candidates:
            if cand is not None:
                s_cand = str(cand).strip()
                if s_cand in anomaly_map:
                    matches.extend(anomaly_map[s_cand])
                elif s_cand.lower() in anomaly_map:
                    matches.extend(anomaly_map[s_cand.lower()])
        
        seen_fids = set()
        unique = []
        for m in matches:
            if m["finding_id"] not in seen_fids:
                seen_fids.add(m["finding_id"])
                unique.append(m)
                
        node["hasAnomaly"] = bool(unique)
        node["anomalyCount"] = len(unique)
        node["anomalies"] = unique
        node["properties"]["has_anomaly"] = bool(unique)
        node["properties"]["anomaly_count"] = len(unique)
        if unique:
            severities = [u["severity"] for u in unique]
            highest_sev = "CRITICAL" if "CRITICAL" in severities else ("HIGH" if "HIGH" in severities else ("MEDIUM" if "MEDIUM" in severities else "LOW"))
            node["highestAnomalySeverity"] = highest_sev
            node["properties"]["highest_anomaly_severity"] = highest_sev
            node["properties"]["anomalies_summary"] = "; ".join([f"[{u['severity']}] {u['title']}" for u in unique[:3]])

    # If Neo4j is connected, synchronize and query native Cypher graph
    if neo4j_client.ensure_connected():
        try:
            with neo4j_client.driver.session() as session:
                check_res = session.run(
                    "MATCH (n) WHERE n.case_id = $case_id OR $case_id IN coalesce(n.case_ids, []) RETURN count(n) AS cnt",
                    {"case_id": target_case_id}
                ).single()
                cnt = check_res["cnt"] if check_res else 0
                if cnt == 0:
                    from app.services.graph_sync import sync_mongo_to_neo4j
                    sync_mongo_to_neo4j(case_id=target_case_id)

                # 1. Map all phone elementIds & numbers to Person elementIds
                res_map = session.run("""
                    MATCH (p:Person)-[:OWNS_PHONE]->(ph:Phone)
                    WHERE (p.case_id = $case_id OR $case_id IN coalesce(p.case_ids, []))
                    RETURN elementId(p) AS p_id, elementId(ph) AS ph_id, ph.number AS phone_num, p.name AS p_name
                """, {"case_id": target_case_id})
                
                ph_to_person = {}
                person_elem_ids = set()
                person_phones = {}
                for rec in res_map:
                    p_id = rec["p_id"]
                    person_elem_ids.add(p_id)
                    ph_to_person[rec["ph_id"]] = p_id
                    if rec["phone_num"]:
                        ph_to_person[rec["phone_num"]] = p_id
                        person_phones.setdefault(p_id, []).append(rec["phone_num"])

                p_res = session.run("""
                    MATCH (p:Person)
                    WHERE (p.case_id = $case_id OR $case_id IN coalesce(p.case_ids, []))
                    RETURN elementId(p) AS p_id
                """, {"case_id": target_case_id})
                for rec in p_res:
                    person_elem_ids.add(rec["p_id"])

                query = """
                MATCH (n) WHERE NOT 'Anomaly' IN labels(n) AND (n.case_id = $case_id OR $case_id IN coalesce(n.case_ids, []))
                  AND ($cid_filter IS NULL OR n.communityId = $cid_int OR toString(n.communityId) = $cid_str)
                OPTIONAL MATCH (n)-[r]->(m) 
                WHERE NOT 'Anomaly' IN labels(m) 
                  AND (m.case_id = $case_id OR $case_id IN coalesce(m.case_ids, []))
                  AND ($cid_filter IS NULL OR m.communityId = $cid_int OR toString(m.communityId) = $cid_str)
                  AND NOT type(r) IN ['SIMILAR_BEHAVIOR', 'CO_OFFENDING', 'HAS_ANOMALY']
                RETURN 
                    elementId(n) AS source_id, 
                    labels(n) AS source_labels, 
                    properties(n) AS source_props,
                    elementId(m) AS target_id,
                    labels(m) AS target_labels,
                    properties(m) AS target_props,
                    type(r) AS rel_type,
                    elementId(r) AS rel_id,
                    properties(r) AS rel_props
                LIMIT 3500
                """
                result = session.run(query, {
                    "case_id": target_case_id,
                    "cid_filter": cid_filter,
                    "cid_int": cid_int,
                    "cid_str": cid_str
                })

                raw_nodes = {}
                projected_edges_map = {}

                canonical_rel_map = {
                    "CALLED": "CALLS",
                    "USED_DEVICE": "USES_DEVICE",
                    "PINGED_TOWER": "LOCATED_AT",
                    "ASSIGNED_IP": "CONNECTS_VIA_IP",
                    "TRANSACTED_WITH": "TRANSFERS_MONEY",
                    "LOGGED_IN_FROM": "CONNECTS_VIA_IP",
                }

                for record in result:
                    s_id = record["source_id"]
                    s_type = record["source_labels"][0] if record["source_labels"] else "Unknown"
                    s_props = record["source_props"] or {}
                    raw_nodes[s_id] = (s_type, s_props, record["source_labels"])

                    t_id = record["target_id"]
                    if t_id is not None:
                        t_type = record["target_labels"][0] if record["target_labels"] else "Unknown"
                        t_props = record["target_props"] or {}
                        raw_nodes[t_id] = (t_type, t_props, record["target_labels"])

                        rel = record["rel_type"]
                        # Drop redundant phone ownership bridges and reverse links
                        if rel in ("OWNS_PHONE", "RESOLVED_TO"):
                            continue

                        # Remap phone endpoints to Person
                        eff_s = ph_to_person.get(s_id, s_id)
                        eff_t = ph_to_person.get(t_id, t_id)
                        if eff_s == eff_t:
                            continue

                        norm_rel = canonical_rel_map.get(rel, rel)
                        edge_k = (eff_s, eff_t, norm_rel)
                        rel_props = record["rel_props"] or {}

                        if edge_k in projected_edges_map:
                            existing = projected_edges_map[edge_k]
                            for pk, pv in rel_props.items():
                                if pk not in existing["properties"]:
                                    existing["properties"][pk] = pv
                        else:
                            projected_edges_map[edge_k] = {
                                "id": f"e_{record['rel_id']}",
                                "source": eff_s,
                                "target": eff_t,
                                "relationship": norm_rel,
                                "properties": dict(rel_props)
                            }

                active_node_ids = set()
                for e in projected_edges_map.values():
                    active_node_ids.add(e["source"])
                    active_node_ids.add(e["target"])
                for pid in person_elem_ids:
                    active_node_ids.add(pid)

                nodes = {}
                for nid in active_node_ids:
                    if nid in raw_nodes:
                        ntype, nprops, nlabels = raw_nodes[nid]
                        # If this node was a Phone belonging to a resolved Person, omit it
                        if ntype == "Phone" and nid in ph_to_person:
                            continue

                        # Normalize type display
                        if "IMEI" in nlabels or ntype == "IMEI":
                            ntype = "IMEI"
                        elif "Device" in nlabels:
                            ntype = "Device"
                        elif "BankAccount" in nlabels:
                            ntype = "BankAccount"
                        elif "SIMCard" in nlabels:
                            ntype = "SIMCard"
                        elif "SocialAccount" in nlabels:
                            ntype = "SocialAccount"
                        elif "ATM" in nlabels:
                            ntype = "ATM"

                        # Attach primary_phone and phones to Person node
                        if nid in person_phones:
                            nprops["phones"] = person_phones[nid]
                            nprops["primary_phone"] = person_phones[nid][0]

                        nodes[nid] = {
                            "id": str(nid),
                            "label": extract_label(nlabels, nprops),
                            "type": ntype,
                            "riskScore": nprops.get("risk_score", 0.0),
                            "properties": nprops
                        }

                # Edges connecting active nodes (drop self-loops, redundant bridges, and identical label connections)
                edges = [
                    e for e in projected_edges_map.values()
                    if e["source"] in nodes
                    and e["target"] in nodes
                    and e["source"] != e["target"]
                    and e.get("relationship") not in ("RESOLVED_TO", "OWNS_PHONE")
                    and nodes[e["source"]].get("label") != nodes[e["target"]].get("label")
                ]

                # Optionally include Anomaly nodes & HAS_ANOMALY edges
                if include_anomalies:
                    anom_res = session.run("""
                    MATCH (n)-[r:HAS_ANOMALY]->(a:Anomaly)
                    WHERE (n.case_id = $case_id OR $case_id IN coalesce(n.case_ids, []))
                    RETURN elementId(n) AS source_id, elementId(a) AS anom_id, properties(a) AS anom_props, elementId(r) AS rel_id
                    LIMIT 200
                    """, {"case_id": target_case_id})
                    for r in anom_res:
                        a_id = str(r["anom_id"])
                        raw_s_id = str(r["source_id"])
                        s_id = ph_to_person.get(raw_s_id, raw_s_id)
                        ap = r["anom_props"]
                        if a_id not in nodes:
                            nodes[a_id] = {
                                "id": a_id,
                                "label": ap.get("title") or ap.get("type") or "Anomaly",
                                "type": "Anomaly",
                                "riskScore": ap.get("score", 95.0),
                                "properties": ap,
                                "hasAnomaly": True,
                                "anomalyCount": 1,
                                "highestAnomalySeverity": ap.get("severity", "HIGH")
                            }
                        if s_id in nodes:
                            edges.append({
                                "id": f"e_{r['rel_id']}",
                                "source": s_id,
                                "target": a_id,
                                "relationship": "HAS_ANOMALY",
                                "properties": {}
                            })

            if nodes:
                # Enrich all nodes with visual anomaly indicators
                for n in nodes.values():
                    enrich_node(n)
                return {"nodes": list(nodes.values()), "edges": edges}
        except Exception as e:
            import logging
            logging.getLogger("investigation.graph").warning(f"[GraphTopology] Neo4j query failed for {target_case_id}, falling back to canonical: {e}")

    # Fallback to direct PostgreSQL & Canonical Parquet graph construction
    return build_canonical_graph(target_case_id)

@router.post("/sync")
def sync_graph(
    case_id: Optional[str] = None,
    current_user: UserModel = Depends(require_permission(Permissions.GRAPH_VIEW))
):
    from app.services.graph_sync import sync_mongo_to_neo4j
    return sync_mongo_to_neo4j(case_id=case_id)


class AddConnectedRelationRequest(BaseModel):
    case_id: Optional[str] = None
    source_node_id: str
    source_node_type: Optional[str] = None
    source_node_label: Optional[str] = None

    # Target Node Details
    target_node_type: str = Field(..., description="Node label/type e.g. Phone, SIMCard, Device, BankAccount, IPAddress, CellTower, Person, SocialAccount, ATM")
    target_node_value: str = Field(..., description="Primary identifier e.g. phone number, IMEI, account number, IP, etc.")
    target_node_attributes: Optional[Dict[str, Any]] = Field(default_factory=dict)

    # Relationship Details
    relationship_type: str = Field(..., description="Relationship type e.g. CALLS, TRANSFERS_MONEY, USES_DEVICE, USES_SIM, CONNECTS_VIA_IP, LOCATED_AT, ASSOCIATED_WITH")
    direction: Optional[str] = Field("outgoing", description="outgoing, incoming, or bidirectional")
    relationship_attributes: Optional[Dict[str, Any]] = Field(default_factory=dict)

    # Pipeline Execution
    rerun_pipeline: Optional[bool] = True


@router.post("/nodes/add-relation")
def add_connected_relation(
    req: AddConnectedRelationRequest,
    current_user: UserModel = Depends(require_permission(Permissions.GRAPH_VIEW)),
    db: Session = Depends(get_db)
):
    """
    Dynamically creates a new connected node and relationship in the relational graph for a case.
    Persists data in Neo4j and the Parquet warehouse, and re-executes the complete investigation pipeline.
    """
    target_case_id = req.case_id
    if not target_case_id:
        from app.models.postgres_models import CaseModel
        c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
        if not c:
            raise HTTPException(status_code=400, detail="No active case found.")
        target_case_id = c.case_id

    # Check case membership / permission safely
    role_name = ""
    if hasattr(current_user, "role") and current_user.role:
        role_name = getattr(current_user.role, "name", str(current_user.role))
    if role_name not in (Roles.SYSTEM_ADMIN, Roles.SUPERINTENDENT, Roles.AUDITOR, Roles.IPS_OFFICER):
        is_member = db.query(CaseMemberModel).filter_by(
            case_id=target_case_id, user_id=getattr(current_user, "id", None), active=True
        ).first()
        if not is_member:
            raise HTTPException(status_code=403, detail=f"Access denied: Not assigned to case {target_case_id}")

    if not neo4j_client.ensure_connected():
        raise HTTPException(status_code=503, detail="Graph database (Neo4j) is currently unavailable.")

    # 1. Clean & normalize inputs
    target_type = req.target_node_type.strip()
    target_val = req.target_node_value.strip()
    if not target_val:
        raise HTTPException(status_code=400, detail="Target node identifier value cannot be empty.")

    rel_type = re.sub(r"[^A-Za-z0-9_]", "", req.relationship_type.strip()).upper()
    if not rel_type:
        rel_type = "ASSOCIATED_WITH"

    direction = (req.direction or "outgoing").lower().strip()

    def _clean_props_for_neo4j(d: dict) -> dict:
        clean = {}
        for k, v in (d or {}).items():
            if v is None:
                continue
            clean_k = re.sub(r"[^A-Za-z0-9_]", "_", str(k)).strip("_")
            if not clean_k:
                continue
            if isinstance(v, (str, int, bool)):
                clean[clean_k] = v
            elif isinstance(v, float):
                if v != v or v == float('inf') or v == float('-inf'):
                    continue
                clean[clean_k] = v
            elif isinstance(v, (list, tuple)):
                clean[clean_k] = [str(x) for x in v if x is not None]
            elif isinstance(v, dict):
                clean[clean_k] = json.dumps(v)
            else:
                clean[clean_k] = str(v)
        return clean

    target_props = _clean_props_for_neo4j(req.target_node_attributes)
    rel_props = _clean_props_for_neo4j(req.relationship_attributes)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    raw_ts = str(rel_props.get("timestamp") or "").strip()
    if not raw_ts:
        rel_props["timestamp"] = now_iso
    else:
        if not (raw_ts.endswith("Z") or "+" in raw_ts or "-" in raw_ts[-6:]):
            rel_props["timestamp"] = f"{raw_ts}+00:00"
    rel_props.setdefault("case_id", target_case_id)
    target_props.setdefault("case_id", target_case_id)

    # 2. Execute Neo4j transactions
    created_node = {}
    created_rel = {}

    try:
        with neo4j_client.driver.session() as session:
            # 2a. Match source node
            s_id = str(req.source_node_id).strip()
            s_label = str(req.source_node_label or req.source_node_id).strip()
            raw_id = re.sub(r"^(person|phone|acc|sim|device|ip|tower|social|evidence)_", "", s_id)

            source_res = session.run("""
                MATCH (s)
                WHERE (
                    elementId(s) = $s_id OR s.id = $s_id OR s.id = $raw_id
                    OR s.number IN [$s_id, $raw_id, $s_label]
                    OR s.account_number IN [$s_id, $raw_id, $s_label]
                    OR s.imei_number IN [$s_id, $raw_id, $s_label]
                    OR s.imei IN [$s_id, $raw_id, $s_label]
                    OR s.imsi IN [$s_id, $raw_id, $s_label]
                    OR s.address IN [$s_id, $raw_id, $s_label]
                    OR s.tower_id IN [$s_id, $raw_id, $s_label]
                    OR s.name IN [$s_id, $raw_id, $s_label]
                    OR s.handle IN [$s_id, $raw_id, $s_label]
                    OR s.golden_id IN [$s_id, $raw_id, $s_label]
                    OR s.z_cluster_id IN [$s_id, $raw_id, $s_label]
                    OR s.atm_id IN [$s_id, $raw_id, $s_label]
                    OR s.email IN [$s_id, $raw_id, $s_label]
                    OR s.identifier IN [$s_id, $raw_id, $s_label]
                )
                AND (s.case_id = $case_id OR $case_id IN coalesce(s.case_ids, []))
                RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props
                LIMIT 1
            """, {
                "s_id": s_id,
                "raw_id": raw_id,
                "s_label": s_label,
                "case_id": target_case_id
            }).single()

            if not source_res:
                source_res = session.run("""
                    MATCH (s)
                    WHERE (
                        elementId(s) = $s_id OR s.id = $s_id OR s.id = $raw_id
                        OR s.number IN [$s_id, $raw_id, $s_label]
                        OR s.account_number IN [$s_id, $raw_id, $s_label]
                        OR s.imei_number IN [$s_id, $raw_id, $s_label]
                        OR s.imei IN [$s_id, $raw_id, $s_label]
                        OR s.imsi IN [$s_id, $raw_id, $s_label]
                        OR s.address IN [$s_id, $raw_id, $s_label]
                        OR s.tower_id IN [$s_id, $raw_id, $s_label]
                        OR s.name IN [$s_id, $raw_id, $s_label]
                        OR s.handle IN [$s_id, $raw_id, $s_label]
                        OR s.golden_id IN [$s_id, $raw_id, $s_label]
                        OR s.z_cluster_id IN [$s_id, $raw_id, $s_label]
                        OR s.atm_id IN [$s_id, $raw_id, $s_label]
                        OR s.email IN [$s_id, $raw_id, $s_label]
                        OR s.identifier IN [$s_id, $raw_id, $s_label]
                    )
                    RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props
                    LIMIT 1
                """, {
                    "s_id": s_id,
                    "raw_id": raw_id,
                    "s_label": s_label
                }).single()

            if not source_res:
                # Source node does not exist in Neo4j yet: synthesize/merge it dynamically
                s_type_clean = re.sub(r"[^A-Za-z0-9_]", "", req.source_node_type or "Entity") or "Entity"
                synth_val = s_label or raw_id or s_id
                if s_type_clean.upper() in ("PHONE", "MSISDN"):
                    synth_q = "MERGE (s:Phone {number: $val}) SET s.case_id = $case_id, s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                elif s_type_clean.upper() in ("DEVICE", "IMEI"):
                    synth_q = "MERGE (s:Device:IMEI {imei_number: $val}) SET s.case_id = $case_id, s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                elif s_type_clean.upper() in ("BANKACCOUNT", "ACCOUNT"):
                    synth_q = "MERGE (s:BankAccount {account_number: $val}) SET s.case_id = $case_id, s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                elif s_type_clean.upper() in ("PERSON",):
                    synth_q = "MERGE (s:Person {name: $val, case_id: $case_id}) SET s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                elif s_type_clean.upper() in ("IPADDRESS", "IP"):
                    synth_q = "MERGE (s:IPAddress {address: $val}) SET s.case_id = $case_id, s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                else:
                    synth_q = f"MERGE (s:{s_type_clean} {{identifier: $val, case_id: $case_id}}) SET s.id = $s_id RETURN s, elementId(s) AS s_elem_id, labels(s) AS s_labels, properties(s) AS s_props"
                
                source_res = session.run(synth_q, {"val": synth_val, "case_id": target_case_id, "s_id": s_id}).single()

            if not source_res:
                raise HTTPException(status_code=404, detail=f"Source node '{req.source_node_id}' could not be resolved in graph.")

            source_elem_id = source_res["s_elem_id"]

            # Ensure source node has case_ids updated
            session.run("""
                MATCH (s) WHERE elementId(s) = $s_elem_id
                SET s.case_id = coalesce(s.case_id, $case_id),
                    s.case_ids = CASE WHEN s.case_ids IS NULL THEN [$case_id] WHEN $case_id IN s.case_ids THEN s.case_ids ELSE s.case_ids + [$case_id] END
            """, {"s_elem_id": source_elem_id, "case_id": target_case_id})

            # 2b. Merge target node according to type
            type_upper = target_type.upper()
            if type_upper in ("PHONE", "MSISDN", "MOBILE"):
                target_query = """
                    MERGE (t:Phone {number: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("DEVICE", "IMEI", "HANDSET", "HARDWARE"):
                target_query = """
                    MERGE (t:IMEI {imei_number: $val})
                    SET t:Device,
                        t.imei = $val,
                        t.imei_number = $val,
                        t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("BANKACCOUNT", "BANK_ACCOUNT", "ACCOUNT"):
                target_query = """
                    MERGE (t:BankAccount {account_number: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("IPADDRESS", "IP_ADDRESS", "IP"):
                target_query = """
                    MERGE (t:IPAddress {address: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("CELLTOWER", "CELL_TOWER", "TOWER"):
                target_query = """
                    MERGE (t:CellTower {tower_id: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("SIMCARD", "SIM_CARD", "SIM", "IMSI"):
                target_query = """
                    MERGE (t:SIMCard {imsi: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("PERSON", "SUSPECT", "INDIVIDUAL"):
                target_query = """
                    MERGE (t:Person {name: $val, case_id: $case_id})
                    SET t.primary_name = $val,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("SOCIALACCOUNT", "SOCIAL_ACCOUNT", "HANDLE"):
                target_query = """
                    MERGE (t:SocialAccount {handle: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper in ("EMAIL",):
                target_query = """
                    MERGE (t:Email {address: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            elif type_upper == "ATM":
                target_query = """
                    MERGE (t:ATM {atm_id: $val})
                    SET t.case_id = $case_id,
                        t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """
            else:
                safe_type = re.sub(r"[^A-Za-z0-9_]", "", target_type) or "CustomEntity"
                target_query = f"""
                    MERGE (t:{safe_type} {{identifier: $val, case_id: $case_id}})
                    SET t.case_ids = CASE WHEN t.case_ids IS NULL THEN [$case_id] WHEN $case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [$case_id] END
                    SET t += $props
                    RETURN t, elementId(t) AS t_elem_id, labels(t) AS t_labels, properties(t) AS t_props
                """

            t_res = session.run(target_query, {
                "val": target_val,
                "case_id": target_case_id,
                "props": target_props
            }).single()

            target_elem_id = t_res["t_elem_id"]
            target_labels = t_res["t_labels"]
            target_node_props = t_res["t_props"]

            created_node = {
                "id": str(target_elem_id),
                "label": extract_label(target_labels, target_node_props),
                "type": target_labels[0] if target_labels else target_type,
                "properties": target_node_props
            }

            # 2c. Create relationship between source and target
            if direction == "incoming":
                rel_query = f"""
                    MATCH (s), (t)
                    WHERE elementId(s) = $s_elem_id AND elementId(t) = $t_elem_id
                    MERGE (t)-[r:{rel_type}]->(s)
                    SET r.case_id = $case_id
                    SET r += $rel_props
                    RETURN elementId(r) AS rel_elem_id, type(r) AS rel_type, properties(r) AS r_props
                """
            elif direction == "bidirectional":
                rel_query = f"""
                    MATCH (s), (t)
                    WHERE elementId(s) = $s_elem_id AND elementId(t) = $t_elem_id
                    MERGE (s)-[r1:{rel_type}]->(t)
                    SET r1.case_id = $case_id
                    SET r1 += $rel_props
                    MERGE (t)-[r2:{rel_type}]->(s)
                    SET r2.case_id = $case_id
                    SET r2 += $rel_props
                    RETURN elementId(r1) AS rel_elem_id, type(r1) AS rel_type, properties(r1) AS r_props
                """
            else: # outgoing
                rel_query = f"""
                    MATCH (s), (t)
                    WHERE elementId(s) = $s_elem_id AND elementId(t) = $t_elem_id
                    MERGE (s)-[r:{rel_type}]->(t)
                    SET r.case_id = $case_id
                    SET r += $rel_props
                    RETURN elementId(r) AS rel_elem_id, type(r) AS rel_type, properties(r) AS r_props
                """

            rel_res = session.run(rel_query, {
                "s_elem_id": source_elem_id,
                "t_elem_id": target_elem_id,
                "case_id": target_case_id,
                "rel_props": rel_props
            }).single()

            rel_elem_id = rel_res["rel_elem_id"] if rel_res else f"rel_{uuid.uuid4().hex[:8]}"
            created_rel = {
                "id": f"e_{rel_elem_id}",
                "type": rel_type,
                "source": str(target_elem_id) if direction == "incoming" else str(source_elem_id),
                "target": str(source_elem_id) if direction == "incoming" else str(target_elem_id),
                "properties": rel_props
            }
    except HTTPException:
        raise
    except Exception as neo_err:
        import logging
        logging.getLogger("investigation.graph").error(f"[AddRelation] Neo4j transaction error: {neo_err}")
        raise HTTPException(status_code=400, detail=f"Graph database error: {str(neo_err)}")

    # 3. Construct CanonicalEvent & write to MinIO warehouse
    try:
        from app.schemas.canonical_event import (
            CanonicalEvent, CanonicalEntities, CanonicalTelemetry, CanonicalFinancial, EventProvenance
        )
        from app.processing.spark_pipeline import spark_pipeline

        # Determine domain and event_type
        domain = "GENERAL"
        ev_type = "INVESTIGATIVE_LINK"
        if rel_type in ("CALLS", "SMS") or target_type.upper() in ("PHONE", "SIMCARD"):
            domain = "TELECOM"
            ev_type = "CALL"
        elif rel_type in ("TRANSFERS_MONEY", "TRANSACTED_WITH") or target_type.upper() in ("BANKACCOUNT", "ATM"):
            domain = "FINANCIAL"
            ev_type = "TRANSACTION"
        elif rel_type in ("CONNECTS_VIA_IP", "ASSIGNED_IP") or target_type.upper() == "IPADDRESS":
            domain = "NETWORK"
            ev_type = "IP_SESSION"
        elif rel_type in ("LOCATED_AT", "PINGED_TOWER") or target_type.upper() == "CELLTOWER":
            domain = "LOCATION"
            ev_type = "LOCATION_EVENT"

        canon_entities = CanonicalEntities()
        canon_telemetry = CanonicalTelemetry()
        canon_financial = CanonicalFinancial()

        # Populate based on target properties
        if target_type.upper() in ("PHONE", "MSISDN"):
            canon_entities.phone = target_val
        elif target_type.upper() in ("PERSON",):
            canon_entities.name = target_val
        elif target_type.upper() in ("BANKACCOUNT",):
            canon_financial.account_number = target_val
            if "counterparty" in rel_props:
                canon_financial.counterparty = str(rel_props["counterparty"])
            if "amount" in rel_props:
                try:
                    canon_financial.amount_inr = float(rel_props["amount"])
                except Exception:
                    pass
        elif target_type.upper() in ("DEVICE", "IMEI"):
            canon_telemetry.imei = target_val
        elif target_type.upper() in ("SIMCARD", "IMSI"):
            canon_telemetry.imsi = target_val
        elif target_type.upper() in ("IPADDRESS",):
            canon_telemetry.assigned_ip = target_val
            if "source_port" in rel_props:
                try:
                    canon_telemetry.source_port = int(rel_props["source_port"])
                except Exception:
                    pass
        elif target_type.upper() in ("CELLTOWER",):
            canon_telemetry.cell_tower_id = target_val

        # Populate duration if present
        if "duration" in rel_props:
            try:
                canon_telemetry.duration_seconds = int(rel_props["duration"])
            except Exception:
                pass

        manual_ev_id = f"manual_{uuid.uuid4().hex[:8]}"
        canon_ev = CanonicalEvent(
            event_id=f"evt_man_{uuid.uuid4().hex[:12]}",
            case_id=target_case_id,
            evidence_id=manual_ev_id,
            event_type=ev_type,
            source_type=domain,
            timestamp=rel_props.get("timestamp", now_iso),
            entities=canon_entities,
            telemetry=canon_telemetry,
            financial=canon_financial,
            attributes={
                "source_node": req.source_node_label or req.source_node_id,
                "target_node": target_val,
                "relationship": rel_type,
                "direction": direction,
                "creator": getattr(current_user, "official_email", "analyst"),
                **target_props,
                **rel_props
            },
            provenance=EventProvenance(
                case_id=target_case_id,
                evidence_id=manual_ev_id,
                source_file="graph_manual_interaction",
                row_index=1,
                evidence_sha256=uuid.uuid4().hex
            )
        )

        spark_pipeline.write_canonical_events(
            case_id=target_case_id,
            evidence_id=manual_ev_id,
            events=[canon_ev]
        )
    except Exception as ev_err:
        import logging
        logging.getLogger("investigation.graph").warning(f"[AddRelation] Could not write canonical event: {ev_err}")

    # 4. Invalidate caches & re-run investigation pipeline if requested
    pipeline_result = None
    if req.rerun_pipeline:
        try:
            from app.processing.canonical_reader import canonical_reader
            canonical_reader.invalidate_cache(target_case_id)
        except Exception:
            pass

        try:
            from app.timeline.service import timeline_service
            timeline_service._cache.pop(target_case_id, None)
        except Exception:
            pass

        try:
            from app.services.pipeline_orchestrator import run_case_pipeline_async
            run_case_pipeline_async(case_id=target_case_id, debounce_seconds=0.2)
            pipeline_result = {"status": "scheduled", "mode": "async"}
        except Exception as pipe_err:
            import logging
            logging.getLogger("investigation.graph").error(f"[AddRelation] Pipeline re-execution error: {pipe_err}")
            pipeline_result = {"error": str(pipe_err)}

    # 5. Record audit trail
    try:
        user_role_name = None
        if hasattr(current_user, "role") and current_user.role:
            user_role_name = getattr(current_user.role, "name", str(current_user.role))
        record_audit_event(
            action=AuditAction.CASE_UPDATED,
            result="SUCCESS",
            user_id=getattr(current_user, "id", None),
            actor=getattr(current_user, "official_email", "analyst"),
            role=user_role_name,
            case_id=target_case_id,
            resource_type="graph_relationship",
            details={
                "source_node_id": req.source_node_id,
                "target_node_type": target_type,
                "target_node_value": target_val,
                "relationship_type": rel_type,
                "direction": direction,
                "rerun_pipeline": req.rerun_pipeline
            },
            db=db
        )
    except Exception as audit_err:
        import logging
        logging.getLogger("investigation.graph").warning(f"[AddRelation] Audit record warning: {audit_err}")

    return {
        "status": "success",
        "message": f"Successfully created node '{target_val}' with relationship '{rel_type}'.",
        "created_node": created_node,
        "created_relationship": created_rel,
        "pipeline_result": pipeline_result
    }



