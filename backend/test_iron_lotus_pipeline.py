import os
import sys
import time
import json
import requests

API_BASE = "http://127.0.0.1:8000"
IRON_LOTUS_DIR = r"c:\Users\soodr\Desktop\analytics_platform\operation_iron_lotus_integrated_test_pack"

def run_iron_lotus_test():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    print("====================================================================")
    print("      RUNNING BENCHMARK PIPELINE: OPERATION IRON LOTUS")
    print("====================================================================")

    # 1. Create Case
    ref = f"INV-2026-IRON-LOTUS-{int(time.time())}"
    payload = {
        "title": "Operation Iron Lotus",
        "description": "Fictional integrated test case for financial cycle, spatial convergence, communication episodes, shared infrastructure, and device discrepancies.",
        "status": "OPEN",
        "priority": "HIGH",
        "case_reference": ref
    }
    resp = requests.post(f"{API_BASE}/api/cases", json=payload, timeout=30)
    resp.raise_for_status()
    case_data = resp.json()
    case_id = case_data.get("case_id") or case_data.get("id")
    print(f"[+] Case Created: ID = {case_id} (Ref: {case_data.get('case_reference')})", flush=True)

    # 2. Upload Evidence Files
    evidence_files = [
        ("kyc.csv", "KYC"),
        ("bank_statement.csv", "BANKING"),
        ("cdr.csv", "TELECOM"),
        ("geospatial.csv", "GENERAL"),
        ("ipdr.csv", "NETWORK"),
        ("social_activity.csv", "SOCIAL")
    ]

    uploaded_evidence = {}
    for fname, domain in evidence_files:
        fpath = os.path.join(IRON_LOTUS_DIR, fname)
        if not os.path.exists(fpath):
            print(f"[!] Missing file: {fpath}", flush=True)
            continue

        with open(fpath, "rb") as f:
            files = {"file": (fname, f, "text/csv")}
            data = {"source_type": domain, "description": f"Evidence {fname}"}
            up_resp = requests.post(f"{API_BASE}/api/cases/{case_id}/evidence", files=files, data=data, timeout=30)
            if up_resp.status_code == 200:
                edata = up_resp.json()
                uploaded_evidence[fname] = edata
                print(f"  -> Uploaded {fname} (ID: {edata.get('evidence_id')}, Domain: {domain}, Status: {edata.get('status')})", flush=True)
            else:
                print(f"  [X] Failed uploading {fname}: {up_resp.status_code} {up_resp.text}", flush=True)

    # 3. Step 1: Trigger Zingg Entity Resolution
    print("\n[Step 1] Triggering Multi-Anchor Entity Resolution (Zingg ER)...")
    er_resp = requests.post(f"{API_BASE}/api/zingg/execute?case_id={case_id}", timeout=120)
    print(f"  -> ER Status: {er_resp.status_code}, Response: {er_resp.json()}")

    # 4. Step 2: Trigger Knowledge Graph Sync
    print("\n[Step 2] Synchronizing Knowledge Graph (Neo4j)...")
    graph_resp = requests.post(f"{API_BASE}/api/graph/sync?case_id={case_id}", timeout=120)
    print(f"  -> Graph Status: {graph_resp.status_code}, Response: {graph_resp.json()}")

    # 5. Step 3: Trigger Anomaly Detection
    print("\n[Step 3] Running Anomaly Detection & Narrative Synthesis...")
    anom_resp = requests.post(f"{API_BASE}/api/anomalies/analyze?case_id={case_id}&sync=true", timeout=300)
    print(f"  -> Anomaly Status: {anom_resp.status_code}, Response: {anom_resp.json()}")

    # 6. Retrieve Golden Profiles
    print("\n--------------------------------------------------------------------")
    print("                    RESOLVED GOLDEN PROFILES")
    print("--------------------------------------------------------------------")
    prof_resp = requests.get(f"{API_BASE}/api/system/golden_profiles?case_id={case_id}")
    profiles = prof_resp.json() if prof_resp.status_code == 200 else []
    for p in profiles:
        print(f"  * Name: {p.get('primary_name')} | Cluster: {p.get('z_cluster_id')}")
        print(f"    Aliases: {p.get('known_aliases')} | Phones: {p.get('known_phones')} | Accounts: {p.get('known_accounts')}")

    # 7. Retrieve Graph Topology
    print("\n--------------------------------------------------------------------")
    print("                    KNOWLEDGE GRAPH TOPOLOGY")
    print("--------------------------------------------------------------------")
    topo_resp = requests.get(f"{API_BASE}/api/graph/topology?case_id={case_id}")
    topo = topo_resp.json() if topo_resp.status_code == 200 else {}
    nodes = topo.get("nodes", [])
    edges = topo.get("edges", [])
    print(f"  * Total Nodes: {len(nodes)} | Total Edges: {len(edges)}")
    node_types = {}
    for n in nodes:
        t = n.get("type", "Unknown")
        node_types[t] = node_types.get(t, 0) + 1
    print(f"  * Node Types: {node_types}")

    # 8. Retrieve Findings
    print("\n--------------------------------------------------------------------")
    print("                   SYNTHESIZED INVESTIGATIVE FINDINGS")
    print("--------------------------------------------------------------------")
    findings_resp = requests.get(f"{API_BASE}/api/anomalies?case_id={case_id}&limit=100")
    findings_data = findings_resp.json() if findings_resp.status_code == 200 else {}
    findings = findings_data.get("anomalies") or findings_data.get("findings", []) if isinstance(findings_data, dict) else findings_data
    print(f"  * Total Findings: {len(findings)}")
    for f in findings:
        title = f.get("title")
        pattern = f.get("patternType") or f.get("type")
        sev = f.get("severity")
        score = f.get("score") or f.get("anomaly_score")
        ents = [e.get("displayName") or e.get("display_name") for e in (f.get("primaryEntities") or f.get("primary_entities") or [])]
        print(f"\n  [Finding] {title}")
        print(f"    Pattern: {pattern} | Severity: {sev} | Score: {score}")
        evs = [ev.get("eventId") or ev.get("event_id") for ev in (f.get("supportingEvents") or f.get("supporting_events") or [])]
        print(f"    Events ({len(evs)}): {evs}")
        print(f"    What: {f.get('whatHappened') or f.get('what_happened')}")
        print(f"    Why Unusual: {f.get('whyUnusual') or f.get('why_unusual')}")

    # Save results to json
    out_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "iron_lotus_pipeline_run.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "case_id": case_id,
            "profiles": profiles,
            "nodes_count": len(nodes),
            "edges_count": len(edges),
            "findings": findings
        }, f, indent=2)
    print(f"\n[+] Raw results saved to: {out_file}")

if __name__ == "__main__":
    run_iron_lotus_test()
