"""Diagnostic: Cross-check PostgreSQL cases against Neo4j graph data"""
from app.core.database import get_db_context
from app.models.postgres_models import CaseModel, EvidenceModel, GoldenProfileModel

print("=== PostgreSQL Cases ===", flush=True)
with get_db_context() as db:
    cases = db.query(CaseModel).all()
    for c in cases:
        ev_count = db.query(EvidenceModel).filter_by(case_id=c.case_id).count()
        gp_count = db.query(GoldenProfileModel).filter_by(case_id=c.case_id).count()
        print(f"  {c.case_id} | {c.case_reference} | Evidence: {ev_count} | GoldenProfiles: {gp_count}", flush=True)
    if not cases:
        print("  No cases found!", flush=True)

print("\n=== Neo4j Graph by Case ID ===", flush=True)
try:
    from neo4j import GraphDatabase
    d = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", "password123"), connection_timeout=10.0)
    with d.session() as s:
        r = s.run("MATCH (n) RETURN DISTINCT n.case_id AS cid, count(*) AS cnt ORDER BY cnt DESC")
        for rec in r:
            print(f"  CaseID: {rec['cid']} -> {rec['cnt']} nodes", flush=True)
    d.close()
except Exception as e:
    print(f"  Neo4j error: {e}", flush=True)

print("\n=== Testing /api/graph/topology endpoint ===", flush=True)
from fastapi.testclient import TestClient
from app.main import app
import time

client = TestClient(app)

with get_db_context() as db:
    cases = db.query(CaseModel).all()
    for c in cases:
        t0 = time.time()
        res = client.get(f"/api/graph/topology?case_id={c.case_id}")
        elapsed = time.time() - t0
        data = res.json()
        nodes = len(data.get("nodes", []))
        edges = len(data.get("edges", []))
        print(f"  {c.case_id}: {nodes} nodes, {edges} edges (status={res.status_code}, {elapsed:.2f}s)", flush=True)
        if nodes == 0:
            print(f"    WARNING: Empty graph for {c.case_id}!", flush=True)
