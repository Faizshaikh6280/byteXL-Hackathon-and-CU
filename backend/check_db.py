from app.core.database import SessionFactory
from sqlalchemy import text

db = SessionFactory()
case_id = "CASE-32907DCF"

print("--- ALL SIGNALS FOR DET-SPATIAL-CONVERGENCE ---")
rows = db.execute(text("SELECT detector_id, entity_refs, status, raw_score, normalized_score, observations FROM detection_signals WHERE case_id=:cid AND detector_id='DET-SPATIAL-CONVERGENCE'"), {"cid": case_id}).fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(r)

print("\n--- ALL FLAGGED SIGNALS IN CASE ---")
rows = db.execute(text("SELECT detector_id, entity_refs, status, normalized_score, event_refs FROM detection_signals WHERE case_id=:cid AND status != 'NORMAL'"), {"cid": case_id}).fetchall()
print(f"Total Flagged: {len(rows)}")
for r in rows:
    print(r[0], r[1], r[2], r[3], r[4])

print("\n--- ALL FINDINGS IN CASE ---")
rows = db.execute(text("SELECT finding_id, pattern_type, title, severity, unified_score, primary_detector_type FROM anomaly_findings WHERE case_id=:cid"), {"cid": case_id}).fetchall()
for r in rows:
    print(r)

db.close()
