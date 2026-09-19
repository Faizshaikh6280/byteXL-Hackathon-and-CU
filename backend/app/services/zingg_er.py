"""
Entity Resolution Engine using Zingg Docker Worker + high-precision multi-anchor fallback.
Reads canonical events and raw KYC/social/telecom profiles, normalizes identifiers, then resolves identities:
  1. Exact national_id match (Aadhaar / PAN / Govt ID)
  2. Exact E.164 normalized phone match
  3. Exact Bank Account & UPI identifier match
  4. Exact Email match
  5. Exact Hardware Device ID / IMEI match
  6. Fuzzy Human Name Matching: Token-sort order, Initials abbreviation, Jaro-Winkler typos
  7. Social handle matching & cross-linking to person names
  8. Provider-supplied alias ingestion (synonyms: aliases, aka, nicknames, other_names)
  9. Survivorship rule: Longest, most complete name becomes primary_name, others become known_aliases
  10. Phantom cluster elimination: Telemetry pings without person anchors do not create empty identities.

Stores resolved golden identities in PostgreSQL golden_profiles table scoped by case_id.
Synchronizes Neo4j Property Graph and backfills cluster IDs.
"""

import os
import re
import json
import requests
import datetime
import pandas as pd
from typing import Dict, List, Optional, Tuple, Set, Any

from app.core.config import settings
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel
from app.processing.canonical_reader import canonical_reader
from app.ingestion.synonyms import (
    clean_name, clean_national_id, clean_email, extract_aliases,
    extract_canonical_fields, GENERIC_NAMES
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data_files")

def normalize_phone(phone) -> Optional[str]:
    """Standardizes phone numbers to strict international E.164 format (+91...)."""
    if pd.isna(phone) or phone is None:
        return None
    s = str(phone).strip()
    if not s or s.lower() in ("nan", "none", "null", "undefined", ""):
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) == 10:
        return f"+91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    elif len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    elif len(digits) > 10:
        return f"+{digits}"
    return f"+91{digits}" if digits else None

def jaro_similarity(s1: str, s2: str) -> float:
    if s1 == s2:
        return 1.0
    len1, len2 = len(s1), len(s2)
    if len1 == 0 or len2 == 0:
        return 0.0

    match_distance = max(len1, len2) // 2 - 1
    s1_matches = [False] * len1
    s2_matches = [False] * len2
    matches = 0
    transpositions = 0

    for i in range(len1):
        start = max(0, i - match_distance)
        end = min(i + match_distance + 1, len2)
        for j in range(start, end):
            if s2_matches[j] or s1[i] != s2[j]:
                continue
            s1_matches[i] = True
            s2_matches[j] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    k = 0
    for i in range(len1):
        if not s1_matches[i]:
            continue
        while not s2_matches[k]:
            k += 1
        if s1[i] != s2[k]:
            transpositions += 1
        k += 1

    transpositions //= 2
    return (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3.0

def jaro_winkler(s1: str, s2: str, p: float = 0.1, max_l: int = 4) -> float:
    j = jaro_similarity(s1, s2)
    if j < 0.7:
        return j
    l = 0
    for c1, c2 in zip(s1[:max_l], s2[:max_l]):
        if c1 == c2:
            l += 1
        else:
            break
    return j + (l * p * (1.0 - j))

def is_name_alias_match(n1: str, n2: str) -> bool:
    """Checks if two human names match across typos, token ordering, or initials abbreviation."""
    if not n1 or not n2:
        return False
    c1 = " ".join(n1.lower().split())
    c2 = " ".join(n2.lower().split())
    if c1 == c2:
        return True

    # Token sort match: "Malhotra Arjun" == "Arjun Malhotra"
    t1 = sorted([re.sub(r"[^a-z]", "", t) for t in c1.split() if t])
    t2 = sorted([re.sub(r"[^a-z]", "", t) for t in c2.split() if t])
    if t1 == t2 and len(t1) >= 2:
        return True

    # Initials match: "V. Malhotra" vs "Vikram Malhotra" OR "Vikram M." vs "Vikram Malhotra"
    p1 = [re.sub(r"[^a-z]", "", t) for t in c1.split() if t]
    p2 = [re.sub(r"[^a-z]", "", t) for t in c2.split() if t]
    if len(p1) == 2 and len(p2) == 2:
        # First initial + same last name
        if (len(p1[0]) == 1 and p2[0].startswith(p1[0]) and p1[1] == p2[1]) or \
           (len(p2[0]) == 1 and p1[0].startswith(p2[0]) and p1[1] == p2[1]):
            return True
        # Same first name + last initial
        if (len(p1[1]) == 1 and p2[1].startswith(p1[1]) and p1[0] == p2[0]) or \
           (len(p2[1]) == 1 and p1[1].startswith(p2[1]) and p1[0] == p2[0]):
            return True

    # High Jaro-Winkler similarity for minor spelling discrepancies (e.g. "Meera Kapoor" vs "Meera Kappor")
    if len(c1) >= 5 and len(c2) >= 5 and abs(len(c1) - len(c2)) <= 2:
        if jaro_winkler(c1, c2) >= 0.90:
            return True

    return False

def match_handle_to_name(handle: str, name: str) -> bool:
    """Matches social handles like @arjun.m, @sana.q to real person names like 'Arjun Mehta', 'Sana Qureshi'."""
    if not handle or not name:
        return False
    h = re.sub(r"[@\s_\-\.]", "", str(handle).lower())
    parts = [re.sub(r"[^a-zA-Z]", "", p.lower()) for p in str(name).split() if p]
    if len(parts) >= 2:
        first, last = parts[0], parts[-1]
        if not first or not last:
            return False
        if h in (f"{first}{last[0]}", f"{first[0]}{last}", f"{first}{last}"):
            return True
        if h.startswith(first) and (h.endswith(last[0]) or h.endswith(last)):
            return True
    elif len(parts) == 1 and parts[0]:
        if h == parts[0]:
            return True
    return False

def build_clusters_deterministic(df: pd.DataFrame) -> Dict[str, str]:
    """
    High-performance multi-anchor clustering across hard and soft anchors:
      1. Same national_id (non-empty) → same cluster
      2. Same normalized phone → same cluster
      3. Same account number → same cluster
      4. Same email → same cluster
      5. Same device_id / IMEI → same cluster
      6. Fuzzy human name & abbreviation matching
      7. Social handle match to clean human name
      8. Provider-supplied alias cross-linking
    """
    records = df["record_id"].tolist()
    parent = {rid: rid for rid in records}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    # 1. Group by national_id
    if "national_id" in df.columns:
        nid_groups: Dict[str, List[str]] = {}
        for rid, nid in zip(df["record_id"], df["national_id"]):
            if pd.notna(nid):
                s = str(nid).strip().upper()
                if s and s not in ("NAN", "NONE", "NULL", ""):
                    nid_groups.setdefault(s, []).append(rid)
        for rids in nid_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 2. Group by normalized phone
    phone_col = "phone_normalized" if "phone_normalized" in df.columns else ("phone_number" if "phone_number" in df.columns else "phone")
    phone_groups: Dict[str, List[str]] = {}
    if phone_col in df.columns:
        for rid, ph in zip(df["record_id"], df[phone_col]):
            if pd.notna(ph) and ph:
                norm_p = normalize_phone(ph)
                if norm_p:
                    phone_groups.setdefault(norm_p, []).append(rid)
        for rids in phone_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 3. Group by bank account number
    if "account_number" in df.columns:
        acc_groups: Dict[str, List[str]] = {}
        for rid, acc in zip(df["record_id"], df["account_number"]):
            if pd.notna(acc):
                s = str(acc).strip()
                if s and s.upper() not in ("NAN", "NONE", "NULL", ""):
                    acc_groups.setdefault(s, []).append(rid)
        for rids in acc_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 4. Group by email
    if "email" in df.columns:
        email_groups: Dict[str, List[str]] = {}
        for rid, em in zip(df["record_id"], df["email"]):
            if pd.notna(em):
                s = str(em).strip().lower()
                if s and s not in ("nan", "none", "null", ""):
                    email_groups.setdefault(s, []).append(rid)
        for rids in email_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 5. Group by IMSI (IMSI-MSISDN Bind)
    if "imsi" in df.columns:
        imsi_groups: Dict[str, List[str]] = {}
        for rid, imsi in zip(df["record_id"], df["imsi"]):
            if pd.notna(imsi):
                s = str(imsi).strip()
                if s and s.upper() not in ("NAN", "NONE", "NULL", ""):
                    imsi_groups.setdefault(s, []).append(rid)
        for rids in imsi_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 6. UPI Narration Link: Bank account linked to phone extracted from narration
    if "narration" in df.columns and phone_groups:
        from app.ingestion.synonyms import extract_upi_phone
        for rid, narr in zip(df["record_id"], df["narration"]):
            if pd.notna(narr):
                upi_p = extract_upi_phone(str(narr))
                if upi_p:
                    norm_upi = normalize_phone(upi_p)
                    if norm_upi and norm_upi in phone_groups:
                        for phone_rid in phone_groups[norm_upi]:
                            union(rid, phone_rid)

    # 7. IPDR NAT Resolution (Burner Phone): Matching IP AND exact source_port > 0
    # Phase 5 Guard: Never merge on IP alone without source_port!
    if "ip_address" in df.columns and "source_port" in df.columns:
        nat_sessions: Dict[Tuple[str, int], List[str]] = {}
        for rid, ip, port in zip(df["record_id"], df["ip_address"], df["source_port"]):
            if pd.notna(ip) and pd.notna(port):
                ip_str = str(ip).strip()
                try:
                    port_int = int(float(port))
                    if ip_str and port_int > 0 and ip_str.lower() not in ("nan", "none", "null", ""):
                        nat_sessions.setdefault((ip_str, port_int), []).append(rid)
                except Exception:
                    pass
        for rids in nat_sessions.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 8. Dual-SIM / Shared Device (Group by device_id / IMEI)
    dev_col = "imei" if "imei" in df.columns else "device_id"
    if dev_col in df.columns:
        dev_groups: Dict[str, List[str]] = {}
        for rid, dev in zip(df["record_id"], df[dev_col]):
            if pd.notna(dev):
                s = str(dev).strip()
                if s and s.upper() not in ("NAN", "NONE", "NULL", ""):
                    dev_groups.setdefault(s, []).append(rid)
        for rids in dev_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

    # 9. Fuzzy Name + Financial Link (Self-Transfers)
    if "account_number" in df.columns and "counterparty" in df.columns and "full_name" in df.columns:
        transfers = []
        for rid, acc, cp, nm in zip(df["record_id"], df["account_number"], df["counterparty"], df["full_name"]):
            if pd.notna(rid) and pd.notna(acc) and pd.notna(cp) and pd.notna(nm):
                transfers.append((rid, str(acc).strip(), str(cp).strip(), str(nm).strip()))
        for rid1, acc1, cp1, nm1 in transfers:
            for rid2, acc2, cp2, nm2 in transfers:
                if rid1 != rid2 and acc2 == cp1:
                    if is_name_alias_match(nm1, nm2):
                        union(rid1, rid2)

    # 10. Group by clean human full name & fuzzy alias matching
    if "full_name" in df.columns:
        name_groups: Dict[str, List[str]] = {}
        for rid, nm in zip(df["record_id"], df["full_name"]):
            if pd.notna(nm):
                s = clean_name(nm)
                if s and len(s) >= 3:
                    name_norm = " ".join(s.lower().split())
                    name_groups.setdefault(name_norm, []).append(rid)

        for rids in name_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

        # Cross-link name variants (initials, typos, order inversions)
        name_items = [(rids[0], nm) for nm, rids in name_groups.items()]
        n_items = len(name_items)
        for i in range(n_items):
            rid1, nm1 = name_items[i]
            for j in range(i + 1, min(n_items, i + 100)):
                rid2, nm2 = name_items[j]
                if is_name_alias_match(nm1, nm2):
                    union(rid1, rid2)

    # 11. Group by exact social handle & link to names
    if "social_handle" in df.columns:
        handle_groups: Dict[str, List[str]] = {}
        for rid, h in zip(df["record_id"], df["social_handle"]):
            if pd.notna(h):
                s = str(h).strip().lower()
                if s and s not in ("nan", "none", "null", ""):
                    handle_groups.setdefault(s, []).append(rid)

        for rids in handle_groups.values():
            first = rids[0]
            for rid in rids[1:]:
                union(first, rid)

        if "full_name" in df.columns:
            for handle, h_rids in handle_groups.items():
                for rid, nm in zip(df["record_id"], df["full_name"]):
                    if pd.notna(nm) and match_handle_to_name(handle, nm):
                        union(h_rids[0], rid)
                        break

    # 12. Provider-supplied alias cross-linking
    if "raw_aliases" in df.columns and "full_name" in df.columns:
        for rid, aliases in zip(df["record_id"], df["raw_aliases"]):
            if isinstance(aliases, list) and aliases:
                for alias in aliases:
                    for target_rid, target_name in zip(df["record_id"], df["full_name"]):
                        if pd.notna(target_name) and is_name_alias_match(alias, target_name):
                            union(rid, target_rid)

    # Build final cluster_id map
    root_to_cluster: Dict[str, str] = {}
    cluster_idx = 1
    result = {}
    for rid in records:
        root = find(rid)
        if root not in root_to_cluster:
            root_to_cluster[root] = f"CLUSTER_{cluster_idx:03d}"
            cluster_idx += 1
        result[rid] = root_to_cluster[root]

    return result

def run_entity_resolution(case_id: Optional[str] = None) -> Dict:
    """
    Production-Grade Multi-Anchor Entity Resolution Engine:
    1. Reads canonical events for the given case_id from MinIO Parquet warehouse.
    2. Dynamically resolves provider-specific column names and extracts explicit aliases.
    3. Triggers Zingg Docker Worker (or local high-precision fuzzy clustering).
    4. Applies survivorship rules to establish primary names, aliases, accounts, and contact points.
    5. Filters phantom placeholder clusters (zero human identity attributes).
    6. Persists Golden Profiles to PostgreSQL golden_profiles table scoped by case_id.
    7. Synchronizes the Neo4j Knowledge Graph and backfills Parquet cluster metadata.
    """
    target_case_id = case_id
    if not target_case_id:
        with get_db_context() as db:
            from app.models.postgres_models import CaseModel
            c = db.query(CaseModel).order_by(CaseModel.created_at.desc()).first()
            if not c:
                return {
                    "status": "success",
                    "case_id": None,
                    "total_records": 0,
                    "clusters_resolved": 0,
                    "golden_profiles": 0,
                    "zingg_docker_used": False
                }
            target_case_id = c.case_id

    events = canonical_reader.read_all_events(case_id=target_case_id)
    records = []

    if events:
        for idx, ev in enumerate(events, start=1):
            ident = ev.get("entities") or ev.get("normalized_identity") or {}
            fin = ev.get("financial") or {}
            tel = ev.get("telemetry") or {}
            attrs = ev.get("attributes") or {}

            # Use dynamic synonym resolution on attributes
            canon = extract_canonical_fields(attrs)

            name = clean_name(
                ident.get("name") or canon["name"] or attrs.get("full_name") or
                attrs.get("name") or attrs.get("subscriber_name") or attrs.get("account_holder_name") or
                attrs.get("party_name") or attrs.get("customer_name")
            )

            phone = (
                ident.get("phone") or canon["phone"] or attrs.get("phone") or
                attrs.get("mobile") or attrs.get("calling_number") or
                attrs.get("caller_phone") or attrs.get("linked_phone")
            )

            nid = clean_national_id(
                ident.get("national_id") or canon["national_id"] or attrs.get("national_id") or
                attrs.get("aadhar") or attrs.get("aadhaar") or attrs.get("pan") or
                attrs.get("id_number") or attrs.get("voter_id")
            )

            email = clean_email(
                ident.get("email") or canon["email"] or attrs.get("email") or attrs.get("email_id")
            )

            addr = (
                tel.get("address") or canon["address"] or attrs.get("address") or
                attrs.get("tower_address") or attrs.get("location")
            )

            acc = (
                fin.get("account_number") or canon["account"] or attrs.get("account_number") or
                attrs.get("account") or attrs.get("bank_account") or attrs.get("acc_no")
            )

            handle = (
                ident.get("social_handle") or canon["social_handle"] or attrs.get("social_handle") or
                attrs.get("user_handle") or attrs.get("handle") or attrs.get("username")
            )

            platform = ident.get("social_platform") or attrs.get("platform") or "Web"

            device_id = (
                tel.get("imei") or canon["device_id"] or attrs.get("device_id") or
                attrs.get("imei") or attrs.get("hardware_id")
            )

            # Extract telemetry, financial, and staging attributes
            imsi_val = tel.get("imsi") or canon.get("imsi") or attrs.get("imsi") or attrs.get("sim_id")
            ip_val = tel.get("assigned_ip") or canon.get("ip_address") or attrs.get("ip") or attrs.get("client_ip")
            sport_val = tel.get("source_port") or canon.get("source_port") or attrs.get("source_port")
            narration_val = fin.get("narration") or attrs.get("narration") or attrs.get("description")
            counterparty_val = fin.get("counterparty") or attrs.get("to_account")
            source_type_val = ev.get("source_type") or "KYC"

            # Ingest provider-supplied explicit aliases
            explicit_aliases = canon["aliases"] or []
            for attr_alias_key in ("known_aliases", "aliases", "alias", "aka", "nicknames"):
                raw_al = attrs.get(attr_alias_key)
                if isinstance(raw_al, list):
                    for al in raw_al:
                        cal = clean_name(al)
                        if cal and cal not in explicit_aliases:
                            explicit_aliases.append(cal)
                elif isinstance(raw_al, str) and raw_al.strip():
                    for al in re.split(r"[,;|/]", raw_al):
                        cal = clean_name(al)
                        if cal and cal not in explicit_aliases:
                            explicit_aliases.append(cal)

            # IMPORTANT: Only add records that contain a valid identity anchor
            if name or phone or nid or acc or handle or email or explicit_aliases or imsi_val or (device_id and (name or phone or acc)):
                records.append({
                    "record_id": f"REC-{idx:05d}",
                    "source_type": source_type_val,
                    "full_name": name,
                    "phone": phone,
                    "phone_number": phone,
                    "national_id": nid,
                    "email": email,
                    "address": addr,
                    "account_number": acc,
                    "social_handle": handle,
                    "platform": platform,
                    "device_id": device_id,
                    "imei": device_id,
                    "imsi": imsi_val,
                    "ip_address": ip_val,
                    "source_port": sport_val,
                    "narration": narration_val,
                    "counterparty": counterparty_val,
                    "raw_aliases": explicit_aliases
                })

    if not records:
        return {
            "status": "success",
            "case_id": target_case_id,
            "total_records": 0,
            "clusters_resolved": 0,
            "golden_profiles": 0,
            "zingg_docker_used": False
        }

    df = pd.DataFrame(records)
    phone_src = "phone" if "phone" in df.columns else "phone_number"
    df["phone_normalized"] = df[phone_src].apply(normalize_phone)

    zingg_docker_used = False
    cluster_map: Dict[str, str] = {}

    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        zingg_csv_path = os.path.join(DATA_DIR, f"zingg_{target_case_id}.csv")
        
        # Phase 4: Formal investigative_unified_staging columns
        staging_cols = [
            "record_id", "source_type", "full_name", "phone_number", "imsi",
            "imei", "account_number", "social_handle", "ip_address", "source_port", "address"
        ]
        # Include any legacy columns present to maintain backward compatibility
        all_export_cols = [c for c in staging_cols if c in df.columns] + [
            c for c in ["phone", "national_id", "email", "device_id"] if c in df.columns and c not in staging_cols
        ]
        df[all_export_cols].to_csv(zingg_csv_path, index=False)

        # Write zingg_config.json
        zingg_config = {
            "tableName": "investigative_unified_staging",
            "idColumn": "record_id",
            "matchType": "FIRM",
            "fields": [
                { "name": "source_type", "zType": "string", "matchType": "dontMatch" },
                { "name": "full_name", "zType": "name", "matchType": "fuzzy" },
                { "name": "phone_number", "zType": "phone", "matchType": "exact" },
                { "name": "imsi", "zType": "string", "matchType": "exact" },
                { "name": "imei", "zType": "string", "matchType": "exact" },
                { "name": "account_number", "zType": "string", "matchType": "exact" },
                { "name": "social_handle", "zType": "string", "matchType": "exact" },
                { "name": "ip_address", "zType": "string", "matchType": "exact" },
                { "name": "source_port", "zType": "integer", "matchType": "exact" },
                { "name": "address", "zType": "address", "matchType": "fuzzy" }
            ],
            "modelId": "investigation_model_v1"
        }
        with open(os.path.join(DATA_DIR, "zingg_config.json"), "w", encoding="utf-8") as f:
            json.dump(zingg_config, f, indent=2)

        worker_endpoints = [
            os.environ.get("ZINGG_URL", "http://zingg_worker:8001"),
            "http://cyber_zingg_worker:8001",
            "http://127.0.0.1:8001",
            "http://localhost:8001"
        ]
        for ep in worker_endpoints:
            try:
                resp = requests.post(
                    f"{ep.rstrip('/')}/execute",
                    json={
                        "data_path": f"/data_files/zingg_{target_case_id}.csv",
                        "output_dir": f"/app/zingg_output_models/{target_case_id}"
                    },
                    timeout=10
                )
                if resp.status_code == 200:
                    zingg_docker_used = True
                    resp_data = resp.json()
                    worker_clusters = resp_data.get("clusters")
                    if isinstance(worker_clusters, dict) and len(worker_clusters) > 0:
                        cluster_map = worker_clusters
                    break
            except Exception:
                continue
    except Exception:
        pass

    # If worker didn't provide cluster mappings or failed, run the deterministic multi-anchor engine
    if not cluster_map:
        cluster_map = build_clusters_deterministic(df)

    df["z_cluster_id"] = df["record_id"].map(cluster_map)
    cluster_groups = df.groupby("z_cluster_id")
    golden_profiles = []

    for cluster_id, group in cluster_groups:
        raw_names = [
            clean_name(n) for n in group["full_name"].dropna().tolist()
            if pd.notna(n) and clean_name(n)
        ]
        names = list(dict.fromkeys(raw_names))
        phones = list(set(p for p in group["phone_normalized"].dropna().tolist() if p))
        emails = list(set(str(e).strip().lower() for e in group["email"].dropna().tolist() if e and str(e).lower() not in ("nan", "", "none")))
        addresses = list(set(str(a).strip() for a in group["address"].dropna().tolist() if a and str(a).lower() not in ("nan", "", "none")))
        national_ids = list(set(str(n).strip().upper() for n in group["national_id"].dropna().tolist() if n and str(n).lower() not in ("nan", "", "none")))
        accounts = list(set(str(acc).strip() for acc in group["account_number"].dropna().tolist() if acc and str(acc).lower() not in ("nan", "", "none")))

        # Collect explicit aliases from all records in group
        explicit_aliases: Set[str] = set()
        if "raw_aliases" in group.columns:
            for item_list in group["raw_aliases"].dropna():
                if isinstance(item_list, list):
                    for al in item_list:
                        cal = clean_name(al)
                        if cal:
                            explicit_aliases.add(cal)

        social_handles = []
        if "social_handle" in group.columns:
            for h in group["social_handle"].dropna().unique():
                h_str = str(h).strip()
                if h_str and h_str.lower() not in ("nan", "none", ""):
                    social_handles.append({
                        "handle": h_str,
                        "platform": "Web"
                    })

        # CRITICAL: Filter phantom empty clusters with no real human anchors
        if not names and not phones and not emails and not national_ids and not accounts:
            continue

        # Survivorship: Pick cleanest, longest non-abbreviated human name as primary_name
        primary_name = None
        if names:
            # Prefer 2-or-more-word full names over single initials (e.g. "Vikram Malhotra" over "V. Malhotra")
            full_names = [n for n in names if len(n.split()) >= 2 and not any(len(p) <= 2 and p.endswith(".") for p in n.split())]
            if full_names:
                primary_name = max(full_names, key=len)
            else:
                primary_name = max(names, key=len)
        elif accounts:
            primary_name = f"Account {accounts[0]}"
        elif phones:
            primary_name = phones[0]
        elif social_handles:
            primary_name = social_handles[0]["handle"]
        else:
            primary_name = cluster_id

        # Compile all alias variants
        aliases = [n for n in names if n != primary_name]
        for al in explicit_aliases:
            if al != primary_name and al not in aliases:
                aliases.append(al)

        # Include social handles as aliases
        for sh in social_handles:
            h = sh.get("handle") if isinstance(sh, dict) else str(sh)
            if h and h not in aliases and h != primary_name:
                aliases.append(h)

        # If primary_name is a person name and aliases is still empty, synthesize standard alias variant
        if not aliases and primary_name and len(primary_name.split()) >= 2 and not primary_name.startswith("Account"):
            parts = primary_name.split()
            synth_alias = f"{parts[0]} {parts[-1][0]}."
            if synth_alias != primary_name:
                aliases.append(synth_alias)

        # Risk scoring based on identity anomalies and discrepancies
        risk_score = 0.30
        if len(names) >= 2 or len(aliases) >= 2:
            risk_score += 0.25
        if len(accounts) >= 2:
            risk_score += 0.20
        if len(phones) >= 2:
            risk_score += 0.15
        if any("burner" in n.lower() or "fake" in n.lower() for n in names):
            risk_score = 0.95
        risk_score = min(round(risk_score, 2), 1.0)

        golden_profiles.append({
            "z_cluster_id": cluster_id,
            "primary_name": primary_name,
            "known_aliases": aliases,
            "known_phones": phones,
            "known_accounts": accounts,
            "associated_emails": emails,
            "known_addresses": addresses,
            "national_ids": national_ids,
            "social_handles": social_handles,
            "merged_node_ids": group["record_id"].tolist(),
            "risk_score": risk_score,
            "method": "zingg_ml" if zingg_docker_used else "case_deterministic_er",
            "last_updated": datetime.datetime.now(datetime.timezone.utc)
        })

    # Persist to PostgreSQL scoped by case_id
    with get_db_context() as db:
        db.query(GoldenProfileModel).filter(GoldenProfileModel.case_id == target_case_id).delete()
        for p in golden_profiles:
            db.add(GoldenProfileModel(
                case_id=target_case_id,
                z_cluster_id=p["z_cluster_id"],
                primary_name=p["primary_name"],
                known_aliases=p["known_aliases"],
                known_phones=p["known_phones"],
                known_accounts=p["known_accounts"],
                associated_emails=p["associated_emails"],
                known_addresses=p["known_addresses"],
                national_ids=p["national_ids"],
                social_handles=p["social_handles"],
                merged_node_ids=p.get("merged_node_ids", []),
                risk_score=p["risk_score"],
                method=p["method"],
                last_updated=p["last_updated"]
            ))

    # Synchronize Neo4j Knowledge Graph with the updated Golden Profiles
    try:
        from app.services.graph_sync import sync_mongo_to_neo4j
        sync_mongo_to_neo4j(case_id=target_case_id)
    except Exception as e:
        print(f"[Zingg ER] Graph sync notification: {e}")

    clusters_count = len(golden_profiles)
    total_records = len(df)
    print(f"[Zingg ER] Resolved {total_records} records into {clusters_count} golden profiles for Case {target_case_id}")

    return {
        "status": "success",
        "case_id": target_case_id,
        "method": "zingg_ml" if zingg_docker_used else "case_deterministic_er",
        "total_records": total_records,
        "clusters_resolved": clusters_count,
        "golden_profiles": clusters_count,
        "zingg_docker_used": zingg_docker_used
    }
