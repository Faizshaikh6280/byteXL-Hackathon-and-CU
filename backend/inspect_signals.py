from app.core.database import SessionFactory
from sqlalchemy import text
import json

db = SessionFactory()

print("=== FINDINGS ===")
findings = db.execute(text("SELECT finding_id, pattern_type, title, severity, unified_score, event_refs, primary_entities FROM anomaly_findings WHERE case_id='CASE-43EB8A0B'")).fetchall()
for f in findings:
    print(f"Finding: {f[1]} | Title: {f[2]} | Score: {f[4]} | Events: {f[5]}")

print("\n=== FLAGGED SIGNALS ===")
signals = db.execute(text("SELECT detector_id, entity_refs, status, normalized_score, event_refs FROM detection_signals WHERE case_id='CASE-43EB8A0B' AND status IN ('DETECTED', 'CORRELATED')")).fetchall()
for s in signals:
    print(f"Detector: {s[0]} | Entities: {s[1]} | Status: {s[2]} | Score: {s[3]} | Events ({len(s[4]) if s[4] else 0}): {s[4]}")

db.close()
