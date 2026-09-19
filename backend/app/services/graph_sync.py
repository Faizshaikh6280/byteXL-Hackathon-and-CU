import logging
import re
from typing import Optional
from app.core.neo4j_client import neo4j_client
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel
from app.processing.canonical_reader import canonical_reader

logger = logging.getLogger("investigation.graph_sync")

def _is_phone_number(name: str) -> bool:
    """Detect if a primary_name is actually just a phone number (not a real person name)."""
    if not name:
        return False
    cleaned = re.sub(r'[\s\-\(\)\+]', '', str(name))
    return cleaned.isdigit() and len(cleaned) >= 7

def sync_mongo_to_neo4j(case_id: Optional[str] = None):
    """
    Synchronizes canonical events and resolved golden profiles for the given case into Neo4j property graph.
    Data source:
      - Golden Profiles from PostgreSQL golden_profiles table
      - Operational Telemetry & Transactions from MinIO Parquet Canonical Warehouse
    """
    if not neo4j_client.ensure_connected():
        return {"status": "error", "message": "Neo4j not connected"}

    target_case_id = case_id
    if not target_case_id:
        with get_db_context() as db:
            from app.models.postgres_models import CaseModel
            c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
            if not c:
                return {"status": "success", "message": "No active cases found to sync."}
            target_case_id = c.case_id

    with neo4j_client.driver.session() as session:
        # ── 1. Sync Golden Person Nodes from PostgreSQL ──────────────
        with get_db_context() as db:
            profiles = db.query(GoldenProfileModel).filter(GoldenProfileModel.case_id == target_case_id).all()

            profile_dicts = [{
                "z_cluster_id": p.z_cluster_id,
                "primary_name": p.primary_name or "Unknown",
                "risk_score": p.risk_score or 0.0,
                "aliases": p.known_aliases or [],
                "phones": p.known_phones or [],
                "emails": p.associated_emails or [],
                "addresses": p.known_addresses or [],
                "national_ids": p.national_ids or [],
                "accounts": p.known_accounts or [],
                "social_handles": p.social_handles or [],
                "merged_node_ids": p.merged_node_ids or [],
                "method": p.method or "deterministic",
                "last_updated": p.last_updated.isoformat() if p.last_updated else "",
                "case_id": target_case_id
            } for p in profiles]

        def run_batched(query: str, items: list, chunk_size: int = 500):
            if not items:
                return
            for i in range(0, len(items), chunk_size):
                chunk = items[i:i + chunk_size]
                res = session.run(query, {"batch": chunk})
                res.consume()

        if profile_dicts:
            # Separate real person profiles from phone-only profiles.
            # Phone-only profiles (where primary_name is just a phone number) should NOT
            # create Person nodes — their phones will appear as proper Phone nodes via
            # the owns_phone_batch below.
            real_person_profiles = [p for p in profile_dicts if not _is_phone_number(p["primary_name"])]
            phone_only_profiles = [p for p in profile_dicts if _is_phone_number(p["primary_name"])]

            if real_person_profiles:
                run_batched("""
                    UNWIND $batch AS p
                    MERGE (person:Person {case_id: p.case_id, golden_id: p.z_cluster_id})
                    SET person.name            = p.primary_name,
                        person.risk_score      = p.risk_score,
                        person.aliases         = p.aliases,
                        person.phones          = p.phones,
                        person.emails          = p.emails,
                        person.addresses       = p.addresses,
                        person.national_ids    = p.national_ids,
                        person.merged_node_ids = p.merged_node_ids,
                        person.method          = p.method,
                        person.last_updated    = p.last_updated
                """, real_person_profiles)

            # Ensure phone-only profiles still get their phones as standalone Phone nodes
            for p in phone_only_profiles:
                for ph in p.get("phones", []):
                    if ph and str(ph).lower() not in ("nan", "none", ""):
                        session.run("""
                            MERGE (ph:Phone {number: $phone})
                            SET ph.case_id = $case_id,
                                ph.case_ids = CASE 
                                    WHEN ph.case_ids IS NULL THEN [$case_id]
                                    WHEN $case_id IN ph.case_ids THEN ph.case_ids
                                    ELSE ph.case_ids + [$case_id] END
                        """, {"phone": str(ph).strip(), "case_id": target_case_id}).consume()

            # Collect phone/account/handle edges from ALL profiles (including phone-only)
            # so real Person nodes still get OWNS_PHONE relationships to their phones
            owns_phone_batch = []
            owns_acc_batch = []
            uses_handle_batch = []
            for p in real_person_profiles:
                cid = p["z_cluster_id"]
                for ph in p.get("phones", []):
                    if ph and str(ph).lower() not in ("nan", "none", ""):
                        owns_phone_batch.append({"cluster_id": cid, "phone": str(ph).strip(), "case_id": target_case_id})
                for acc in p.get("accounts", []):
                    if acc and str(acc).lower() not in ("nan", "none", ""):
                        owns_acc_batch.append({"cluster_id": cid, "acc": str(acc).strip(), "name": p.get("primary_name"), "case_id": target_case_id})
                for sh in p.get("social_handles", []):
                    handle = sh.get("handle") if isinstance(sh, dict) else str(sh)
                    platform = sh.get("platform", "Web") if isinstance(sh, dict) else "Web"
                    if handle:
                        uses_handle_batch.append({"cluster_id": cid, "handle": str(handle).strip(), "platform": platform, "case_id": target_case_id})

            if owns_phone_batch:
                run_batched("""
                    UNWIND $batch AS row
                    MERGE (ph:Phone {number: row.phone})
                    SET ph.case_id = row.case_id,
                        ph.case_ids = CASE 
                            WHEN ph.case_ids IS NULL THEN [row.case_id]
                            WHEN row.case_id IN ph.case_ids THEN ph.case_ids
                            ELSE ph.case_ids + [row.case_id] END
                    MERGE (p:Person {case_id: row.case_id, golden_id: row.cluster_id})
                    MERGE (p)-[r:OWNS_PHONE]->(ph)
                    SET r.case_id = row.case_id
                """, owns_phone_batch)

            if owns_acc_batch:
                run_batched("""
                    UNWIND $batch AS row
                    MERGE (ba:BankAccount {account_number: row.acc})
                    SET ba.holder = row.name, 
                        ba.case_id = row.case_id,
                        ba.case_ids = CASE 
                            WHEN ba.case_ids IS NULL THEN [row.case_id]
                            WHEN row.case_id IN ba.case_ids THEN ba.case_ids
                            ELSE ba.case_ids + [row.case_id] END
                    MERGE (p:Person {case_id: row.case_id, golden_id: row.cluster_id})
                    MERGE (p)-[r:OWNS_ACCOUNT]->(ba)
                    SET r.case_id = row.case_id
                """, owns_acc_batch)

            if uses_handle_batch:
                run_batched("""
                    UNWIND $batch AS row
                    MERGE (s:SocialAccount {handle: row.handle})
                    SET s.platform = row.platform, 
                        s.case_id = row.case_id,
                        s.case_ids = CASE 
                            WHEN s.case_ids IS NULL THEN [row.case_id]
                            WHEN row.case_id IN s.case_ids THEN s.case_ids
                            ELSE s.case_ids + [row.case_id] END
                    MERGE (p:Person {case_id: row.case_id, golden_id: row.cluster_id})
                    MERGE (p)-[r:USES_HANDLE]->(s)
                    SET r.case_id = row.case_id
                """, uses_handle_batch)

        # ── 3. Sync Operational Telemetry & Transactions in Batches ──
        events = canonical_reader.iter_all_events(case_id=target_case_id, limit=3000)
        event_count = 0

        def is_empty(val):
            return not val or str(val).lower() in ("nan", "none", "")

        # Use high-performance aggregated edge maps to ensure O(distinct_pairs) graph writes
        used_device_map = {}
        sim_card_map = {}
        pinged_tower_map = {}
        assigned_ip_map = {}
        social_ip_map = {}
        person_ip_map = {}
        transacted_map = {}
        cashout_map = {}
        called_map = {}

        for ev in events:
            event_count += 1
            cluster_id = ev.get("z_cluster_id")
            telemetry = ev.get("telemetry", {})
            financial = ev.get("financial", {})
            identity = ev.get("normalized_identity") or ev.get("entities") or {}
            timestamp = ev.get("timestamp", "")
            phone = identity.get("phone")
            event_type = ev.get("event_type", "")
            attributes = ev.get("attributes") or {}

            # SIM Card (IMSI) → Phone (USES_SIM)
            imsi = telemetry.get("imsi") or ev.get("attributes", {}).get("imsi")
            if not is_empty(imsi) and not is_empty(phone):
                k = (str(phone).strip(), str(imsi).strip())
                if k not in sim_card_map or timestamp > sim_card_map[k]["last_seen"]:
                    sim_card_map[k] = {
                        "phone": k[0],
                        "imsi": k[1],
                        "last_seen": timestamp,
                        "operator": attributes.get("operator", "Telecom"),
                        "case_id": target_case_id
                    }

            # Device / IMEI → Phone (USES_DEVICE)
            imei = telemetry.get("imei") or ev.get("attributes", {}).get("imei") or ev.get("attributes", {}).get("device_id")
            if not is_empty(imei) and not is_empty(phone):
                k = (str(phone).strip(), str(imei).strip())
                if k not in used_device_map or timestamp > used_device_map[k]["last_seen"]:
                    used_device_map[k] = {
                        "phone": k[0],
                        "imei": k[1],
                        "duration": telemetry.get("duration_seconds", 0),
                        "user_agent": attributes.get("user_agent", ""),
                        "last_seen": timestamp,
                        "case_id": target_case_id
                    }

            # CellTower → Phone (LOCATED_AT)
            tower = telemetry.get("cell_tower_id") or ev.get("attributes", {}).get("cell_id")
            if not is_empty(tower) and not is_empty(phone):
                k = (str(phone).strip(), str(tower).strip())
                dur = float(telemetry.get("duration_seconds") or 0)
                if k not in pinged_tower_map:
                    pinged_tower_map[k] = {
                        "phone": k[0],
                        "tower": k[1],
                        "lat": telemetry.get("lat"),
                        "lng": telemetry.get("lng"),
                        "address": telemetry.get("address", "") or "",
                        "duration": dur,
                        "pings_count": 1,
                        "last_seen": timestamp,
                        "case_id": target_case_id
                    }
                else:
                    pinged_tower_map[k]["duration"] += dur
                    pinged_tower_map[k]["pings_count"] += 1
                    if timestamp > pinged_tower_map[k]["last_seen"]:
                        pinged_tower_map[k]["last_seen"] = timestamp

            # Logical IP Routing based on Domain (CONNECTS_VIA_IP)
            ip = telemetry.get("assigned_ip") or ev.get("attributes", {}).get("ip") or ev.get("attributes", {}).get("destination_ip")
            sport = telemetry.get("source_port") or attributes.get("source_port")
            domain = ev.get("domain") or ev.get("source_type")

            if not is_empty(ip):
                ip_str = str(ip).strip()
                if domain == "NETWORK" and not is_empty(phone):
                    k = (str(phone).strip(), ip_str)
                    if k not in assigned_ip_map or timestamp > assigned_ip_map[k]["last_seen"]:
                        assigned_ip_map[k] = {
                            "phone": k[0],
                            "ip": k[1],
                            "source_port": sport,
                            "destination_ip": telemetry.get("destination_ip"),
                            "app_protocol": attributes.get("protocol", "IPDR"),
                            "last_seen": timestamp,
                            "case_id": target_case_id
                        }
                elif domain == "SOCIAL" and not is_empty(identity.get("social_handle")):
                    k = (str(identity["social_handle"]).strip(), ip_str)
                    if k not in social_ip_map or timestamp > social_ip_map[k]["last_seen"]:
                        social_ip_map[k] = {
                            "handle": k[0],
                            "ip": k[1],
                            "source_port": sport,
                            "platform": identity.get("social_platform", "Social"),
                            "last_seen": timestamp,
                            "case_id": target_case_id
                        }
                elif cluster_id:
                    k = (cluster_id, ip_str)
                    if k not in person_ip_map or timestamp > person_ip_map[k]["last_seen"]:
                        person_ip_map[k] = {
                            "cluster_id": k[0],
                            "ip": k[1],
                            "source_port": sport,
                            "last_seen": timestamp,
                            "case_id": target_case_id
                        }

            # Financial Transactions between Bank Accounts (TRANSFERS_MONEY)
            acc = financial.get("account_number") or ev.get("attributes", {}).get("from_account")
            cp_acc = financial.get("counterparty") or ev.get("attributes", {}).get("to_account")
            if not is_empty(acc) and not is_empty(cp_acc):
                k = (str(acc).strip(), str(cp_acc).strip())
                amt = float(financial.get("amount_inr") or ev.get("attributes", {}).get("amount") or 0.0)
                if k not in transacted_map:
                    transacted_map[k] = {
                        "acc": k[0],
                        "cp": k[1],
                        "total_amount": amt,
                        "txn_count": 1,
                        "txn_type": financial.get("txn_type") or ev.get("attributes", {}).get("channel") or "TRANSFER",
                        "channel": financial.get("channel") or ev.get("attributes", {}).get("channel") or "TRANSFER",
                        "narration": financial.get("narration") or attributes.get("narration") or "",
                        "txn_id": attributes.get("transaction_id", f"TXN-{event_count}"),
                        "last_seen": timestamp,
                        "case_id": target_case_id
                    }
                else:
                    transacted_map[k]["total_amount"] += amt
                    transacted_map[k]["txn_count"] += 1
                    if timestamp > transacted_map[k]["last_seen"]:
                        transacted_map[k]["last_seen"] = timestamp

            # ATM Cashout (WITHDREW_CASH_AT)
            atm_id = ev.get("attributes", {}).get("atm_id")
            if not is_empty(acc) and not is_empty(atm_id):
                k = (str(acc).strip(), str(atm_id).strip())
                amt = float(financial.get("amount_inr", 0.0) or 0.0)
                if k not in cashout_map:
                    cashout_map[k] = {
                        "acc": k[0],
                        "atm_id": k[1],
                        "loc": telemetry.get("address") or ev.get("attributes", {}).get("location", ""),
                        "total_amount": amt,
                        "cashout_count": 1,
                        "last_seen": timestamp,
                        "case_id": target_case_id
                    }
                else:
                    cashout_map[k]["total_amount"] += amt
                    cashout_map[k]["cashout_count"] += 1
                    if timestamp > cashout_map[k]["last_seen"]:
                        cashout_map[k]["last_seen"] = timestamp

            # Telecom Calls: (caller:Phone)-[:CALLS]->(callee:Phone)
            called_number = ev.get("attributes", {}).get("called_number") or ev.get("attributes", {}).get("callee") or ev.get("normalized_identity", {}).get("counterparty_name")
            if (ev.get("event_type") == "CALL" or domain == "TELECOM") and not is_empty(phone) and not is_empty(called_number):
                k = (str(phone).strip(), str(called_number).strip())
                dur = float(telemetry.get("duration_seconds", 0) or 0)
                if k not in called_map:
                    called_map[k] = {
                        "caller": k[0],
                        "callee": k[1],
                        "total_duration": dur,
                        "call_count": 1,
                        "call_type": attributes.get("call_type", "CALL"),
                        "last_seen": timestamp,
                        "case_id": target_case_id
                    }
                else:
                    called_map[k]["total_duration"] += dur
                    called_map[k]["call_count"] += 1
                    if timestamp > called_map[k]["last_seen"]:
                        called_map[k]["last_seen"] = timestamp

        # Execute Batched Synced Edges (O(unique_pairs), runs in milliseconds)
        if sim_card_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (ph:Phone {number: row.phone})
                SET ph.case_id = row.case_id
                MERGE (sim:SIMCard {imsi: row.imsi})
                SET sim.home_network_operator = row.operator, sim.case_id = row.case_id
                MERGE (ph)-[r:USES_SIM]->(sim)
                SET r.last_seen = row.last_seen, r.case_id = row.case_id
            """, list(sim_card_map.values()))

        if used_device_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (ph:Phone {number: row.phone})
                SET ph.case_id = row.case_id,
                    ph.case_ids = CASE WHEN ph.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN ph.case_ids THEN ph.case_ids ELSE ph.case_ids + [row.case_id] END
                MERGE (i:IMEI {imei_number: row.imei})
                SET i:Device,
                    i.imei = row.imei,
                    i.imei_number = row.imei,
                    i.case_id = row.case_id,
                    i.case_ids = CASE WHEN i.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN i.case_ids THEN i.case_ids ELSE i.case_ids + [row.case_id] END
                MERGE (ph)-[r:USES_DEVICE]->(i)
                SET r.last_seen = row.last_seen, r.timestamp = row.last_seen, r.session_duration = row.duration, r.user_agent_string = row.user_agent, r.case_id = row.case_id
            """, list(used_device_map.values()))

        if pinged_tower_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (t:CellTower {tower_id: row.tower})
                SET t.lat = row.lat, t.lng = row.lng, t.address = row.address, t.case_id = row.case_id,
                    t.case_ids = CASE WHEN t.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN t.case_ids THEN t.case_ids ELSE t.case_ids + [row.case_id] END
                MERGE (ph:Phone {number: row.phone})
                SET ph.case_id = row.case_id,
                    ph.case_ids = CASE WHEN ph.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN ph.case_ids THEN ph.case_ids ELSE ph.case_ids + [row.case_id] END
                MERGE (ph)-[r:LOCATED_AT]->(t)
                SET r.last_seen = row.last_seen, r.timestamp = row.last_seen, r.signal_strength_dbm = row.duration, r.case_id = row.case_id
            """, list(pinged_tower_map.values()))

        if assigned_ip_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (i:IPAddress {address: row.ip})
                SET i.case_id = row.case_id,
                    i.case_ids = CASE WHEN i.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN i.case_ids THEN i.case_ids ELSE i.case_ids + [row.case_id] END
                MERGE (ph:Phone {number: row.phone})
                SET ph.case_id = row.case_id,
                    ph.case_ids = CASE WHEN ph.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN ph.case_ids THEN ph.case_ids ELSE ph.case_ids + [row.case_id] END
                MERGE (ph)-[r:CONNECTS_VIA_IP]->(i)
                SET r.last_seen = row.last_seen, r.timestamp = row.last_seen, r.source_port = row.source_port, r.destination_ip = row.destination_ip, r.app_protocol = row.app_protocol, r.case_id = row.case_id
            """, list(assigned_ip_map.values()))

        if social_ip_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (i:IPAddress {address: row.ip})
                SET i.case_id = row.case_id,
                    i.case_ids = CASE WHEN i.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN i.case_ids THEN i.case_ids ELSE i.case_ids + [row.case_id] END
                MERGE (s:SocialAccount {handle: row.handle})
                SET s.platform = row.platform, s.case_id = row.case_id,
                    s.case_ids = CASE WHEN s.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN s.case_ids THEN s.case_ids ELSE s.case_ids + [row.case_id] END
                MERGE (s)-[r:CONNECTS_VIA_IP]->(i)
                SET r.last_seen = row.last_seen, r.timestamp = row.last_seen, r.source_port = row.source_port, r.case_id = row.case_id
            """, list(social_ip_map.values()))

        if person_ip_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (i:IPAddress {address: row.ip})
                SET i.case_id = row.case_id,
                    i.case_ids = CASE WHEN i.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN i.case_ids THEN i.case_ids ELSE i.case_ids + [row.case_id] END
                MERGE (p:Person {case_id: row.case_id, golden_id: row.cluster_id})
                MERGE (p)-[r:CONNECTS_VIA_IP]->(i)
                SET r.last_seen = row.last_seen, r.timestamp = row.last_seen, r.source_port = row.source_port, r.case_id = row.case_id
            """, list(person_ip_map.values()))

        if transacted_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (ba:BankAccount {account_number: row.acc})
                SET ba.case_id = row.case_id,
                    ba.case_ids = CASE WHEN ba.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN ba.case_ids THEN ba.case_ids ELSE ba.case_ids + [row.case_id] END
                MERGE (cp:BankAccount {account_number: row.cp})
                SET cp.case_id = row.case_id,
                    cp.case_ids = CASE WHEN cp.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN cp.case_ids THEN cp.case_ids ELSE cp.case_ids + [row.case_id] END
                MERGE (ba)-[r:TRANSFERS_MONEY]->(cp)
                SET r.amount_inr = row.total_amount,
                    r.transaction_id = row.txn_id,
                    r.txn_mode = row.channel,
                    r.narration = row.narration,
                    r.timestamp = row.last_seen,
                    r.case_id = row.case_id
            """, list(transacted_map.values()))

        if cashout_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (ba:BankAccount {account_number: row.acc})
                SET ba.case_id = row.case_id,
                    ba.case_ids = CASE WHEN ba.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN ba.case_ids THEN ba.case_ids ELSE ba.case_ids + [row.case_id] END
                MERGE (atm:ATM {atm_id: row.atm_id})
                SET atm.location = row.loc, atm.case_id = row.case_id,
                    atm.case_ids = CASE WHEN atm.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN atm.case_ids THEN atm.case_ids ELSE atm.case_ids + [row.case_id] END
                MERGE (ba)-[r:WITHDREW_CASH_AT]->(atm)
                SET r.amount = row.total_amount,
                    r.total_amount = row.total_amount,
                    r.cashout_count = row.cashout_count,
                    r.timestamp = row.last_seen,
                    r.case_id = row.case_id
            """, list(cashout_map.values()))

        if called_map:
            run_batched("""
                UNWIND $batch AS row
                MERGE (caller:Phone {number: row.caller})
                SET caller.case_id = row.case_id,
                    caller.case_ids = CASE WHEN caller.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN caller.case_ids THEN caller.case_ids ELSE caller.case_ids + [row.case_id] END
                MERGE (callee:Phone {number: row.callee})
                SET callee.case_id = row.case_id,
                    callee.case_ids = CASE WHEN callee.case_ids IS NULL THEN [row.case_id] WHEN row.case_id IN callee.case_ids THEN callee.case_ids ELSE callee.case_ids + [row.case_id] END
                MERGE (caller)-[r:CALLS]->(callee)
                SET r.duration_seconds = row.total_duration,
                    r.call_type = row.call_type,
                    r.timestamp = row.last_seen,
                    r.case_id = row.case_id
            """, list(called_map.values()))

        logger.info(f"[GraphSync] Batched Synced {len(profile_dicts)} Golden Persons and {event_count} events to Neo4j for Case {target_case_id}.")

    return {"status": "success", "message": f"Graph sync completed successfully for Case {target_case_id}"}
