import os
import sys
import time
import json
import requests

API_BASE = "http://127.0.0.1:8000"

NIGHT_LEDGER_DIR = r"c:\Users\soodr\Desktop\analytics_platform\operation_night_ledger_upload_pack"
RED_HAVEN_DIR = r"c:\Users\soodr\Desktop\analytics_platform\operation_red_haven_upload_pack"

def check_backend_health():
    print("[1] Checking Backend Health...")
    for i in range(15):
        try:
            resp = requests.get(f"{API_BASE}/api/cases", timeout=5)
            if resp.status_code == 200:
                print(" -> Backend is healthy and responding.")
                return True
        except Exception as e:
            time.sleep(2)
    print(" -> Backend health check failed.")
    return False

def create_case(case_name: str, description: str):
    import uuid
    print(f"\n[+] Creating Case: '{case_name}'...")
    payload = {
        "title": case_name,
        "description": description,
        "status": "OPEN",
        "priority": "HIGH",
        "case_reference": f"BENCH-{uuid.uuid4().hex[:8].upper()}"
    }
    resp = requests.post(f"{API_BASE}/api/cases", json=payload)
    resp.raise_for_status()
    data = resp.json()
    case_id = data.get("case_id") or data.get("id")
    print(f" -> Case Created: ID = {case_id}")
    return case_id

def upload_evidence(case_id: str, folder_path: str):
    print(f"\n[+] Uploading Evidence Files from: {folder_path}...")
    files_to_upload = ["kyc.csv", "bank_statement.csv", "cdr.csv", "ipdr.csv", "social_activity.csv"]
    uploaded = []

    for filename in files_to_upload:
        fpath = os.path.join(folder_path, filename)
        if not os.path.exists(fpath):
            print(f"  [!] Missing file: {fpath}")
            continue

        with open(fpath, "rb") as f:
            files = {"file": (filename, f, "text/csv")}
            data = {
                "source_type": "UNKNOWN",
                "description": f"Benchmark evidence {filename}"
            }
            resp = requests.post(f"{API_BASE}/api/cases/{case_id}/evidence", files=files, data=data)
            if resp.status_code == 200:
                edata = resp.json()
                print(f"  -> Uploaded {filename} (Evidence ID: {edata.get('evidence_id')}, Status: {edata.get('status')})")
                uploaded.append(edata)
            else:
                print(f"  [X] Failed uploading {filename}: {resp.status_code} {resp.text}")
    return uploaded

def run_pipeline(case_id: str):
    print(f"\n[+] Executing Investigative Pipeline for Case: {case_id}...")

    # Step 1: Entity Resolution
    print("  [Step 1] Triggering Multi-Anchor Entity Resolution (Zingg ER)...")
    er_resp = requests.post(f"{API_BASE}/api/zingg/execute?case_id={case_id}", timeout=120)
    print(f"   -> ER Response: {er_resp.status_code} {er_resp.text[:200]}")

    # Step 2: Graph Sync
    print("  [Step 2] Synchronizing Knowledge Graph (Neo4j)...")
    graph_resp = requests.post(f"{API_BASE}/api/graph/sync?case_id={case_id}", timeout=120)
    print(f"   -> Graph Sync Response: {graph_resp.status_code} {graph_resp.text[:200]}")

    # Step 3: Anomaly Analysis
    print("  [Step 3] Running 16-Engine Anomaly Detection & Narrative Synthesis...")
    anom_resp = requests.post(f"{API_BASE}/api/anomalies/analyze?case_id={case_id}&sync=true", timeout=300)
    print(f"   -> Anomaly Response: {anom_resp.status_code} {anom_resp.text[:200]}")

def inspect_results(case_id: str, case_label: str):
    print(f"\n=======================================================")
    print(f"   INSPECTION REPORT: {case_label} ({case_id})")
    print(f"=======================================================")

    # 1. Golden Profiles
    profiles_resp = requests.get(f"{API_BASE}/api/system/golden_profiles?case_id={case_id}")
    profiles = profiles_resp.json() if profiles_resp.status_code == 200 else []
    print(f"\n--- [1] Golden Profiles ({len(profiles)} resolved) ---")
    cluster_fallback_count = 0
    for p in profiles:
        name = p.get("primary_name")
        cid = p.get("z_cluster_id")
        aliases = p.get("known_aliases", [])
        phones = p.get("known_phones", [])
        accounts = p.get("known_accounts", [])
        handles = [h.get("handle") if isinstance(h, dict) else h for h in p.get("social_handles", [])]
        is_fallback = name.startswith("CLUSTER_") or "CLUSTER_" in str(name)
        if is_fallback:
            cluster_fallback_count += 1
        status_flag = "❌ DUMMY" if is_fallback else "✅ HUMAN"
        print(f"  {status_flag} Name: '{name}' | Cluster: {cid}")
        print(f"     Aliases: {aliases} | Phones: {phones} | Accounts: {accounts} | Handles: {handles}")

    # 2. Graph Topology
    topo_resp = requests.get(f"{API_BASE}/api/graph/topology?case_id={case_id}")
    topo = topo_resp.json() if topo_resp.status_code == 200 else {}
    nodes = topo.get("nodes", [])
    links = topo.get("links", [])
    print(f"\n--- [2] Knowledge Graph Topology ---")
    print(f"  Total Nodes: {len(nodes)} | Total Relationships: {len(links)}")
    node_types = {}
    for n in nodes:
        lbl = n.get("group") or n.get("type") or "Unknown"
        node_types[lbl] = node_types.get(lbl, 0) + 1
    print(f"  Node breakdown: {node_types}")

    # 3. Synthesized Findings
    anom_resp = requests.get(f"{API_BASE}/api/anomalies?case_id={case_id}&limit=100")
    findings_data = anom_resp.json() if anom_resp.status_code == 200 else {}
    findings = findings_data.get("anomalies") or findings_data.get("findings", []) if isinstance(findings_data, dict) else findings_data
    print(f"\n--- [3] Synthesized Investigative Findings ({len(findings)} total) ---")
    
    findings_by_pattern = {}
    for f in findings:
        title = f.get("title")
        pid = f.get("patternType") or f.get("type") or f.get("technical_details", {}).get("pattern_id") or "UNKNOWN"
        sev = f.get("severity")
        pri = f.get("investigativePriority") or f.get("investigative_priority")
        score = f.get("score") or f.get("anomaly_score")
        what = f.get("whatHappened") or f.get("what_happened")
        why = f.get("whyUnusual") or f.get("why_unusual")
        relevance = f.get("whyRelevant") or f.get("why_relevant")
        ents = [e.get("displayName") or e.get("display_name") or e.get("entityId") or e.get("entity_id") for e in (f.get("primaryEntities") or f.get("primary_entities") or [])]
        findings_by_pattern[pid] = findings_by_pattern.get(pid, 0) + 1
        
        print(f"\n  🔍 Finding: {title}")
        print(f"     [Pattern]: {pid} | [Severity]: {sev} | [Priority]: {pri} | [Score]: {score}")
        print(f"     [Primary Entities]: {ents}")
        print(f"     [What Happened]: {what}")
        print(f"     [Why Unusual]: {why}")
        print(f"     [Why Relevant]: {relevance}")

    print(f"\n--- Summary Metrics ---")
    print(f"  Golden Profiles: {len(profiles)} (Dummy Fallbacks: {cluster_fallback_count})")
    print(f"  Graph Elements: {len(nodes)} nodes, {len(links)} links")
    print(f"  Findings Count: {len(findings)} across patterns: {findings_by_pattern}")
    
    return {
        "case_id": case_id,
        "case_label": case_label,
        "profiles_count": len(profiles),
        "cluster_fallback_count": cluster_fallback_count,
        "nodes_count": len(nodes),
        "links_count": len(links),
        "findings_count": len(findings),
        "patterns": findings_by_pattern,
        "findings": findings
    }

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if not check_backend_health():
        sys.exit(1)

    print("\n=======================================================")
    print("   STARTING BENCHMARK TEST: OPERATION NIGHT LEDGER")
    print("=======================================================")
    case_1_id = create_case("Operation Night Ledger", "Investigation into financial structuring, layering, and burner coordination.")
    upload_evidence(case_1_id, NIGHT_LEDGER_DIR)
    run_pipeline(case_1_id)
    res_1 = inspect_results(case_1_id, "Operation Night Ledger")

    print("\n=======================================================")
    print("   STARTING BENCHMARK TEST: OPERATION RED HAVEN")
    print("=======================================================")
    case_2_id = create_case("Operation Red Haven", "Investigation into premeditated homicide, crime scene cell tower convergence, and fund liquidation.")
    upload_evidence(case_2_id, RED_HAVEN_DIR)
    run_pipeline(case_2_id)
    res_2 = inspect_results(case_2_id, "Operation Red Haven")

    # Save summary report for analysis
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "benchmark_test_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"night_ledger": res_1, "red_haven": res_2}, f, indent=2)
    print(f"\n[✔] Benchmark test run completed! Results saved to {out_path}")

    # Also save directly to brain artifacts directory
    artifact_report = r"C:\Users\soodr\.gemini\antigravity\brain\019b0244-fb2c-4086-909a-b94b620c93c1\benchmark_evaluation_report.json"
    try:
        with open(artifact_report, "w", encoding="utf-8") as f:
            json.dump({"night_ledger": res_1, "red_haven": res_2}, f, indent=2)
        print(f"[✔] Brain Artifact saved: {artifact_report}")
    except Exception as e:
        print(f"[!] Warning: Could not write artifact file: {e}")

if __name__ == "__main__":
    main()
