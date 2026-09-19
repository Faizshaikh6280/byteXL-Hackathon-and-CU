from app.core.database import SessionFactory
from app.anomaly.features.feature_factory import feature_factory
from app.anomaly.engines.spatial_temporal.st_dbscan import STDBSCANConvergenceDetector
from app.anomaly.config.anomaly_config import anomaly_config

case_id = "CASE-32907DCF"
store = feature_factory.build_entity_feature_store(case_id)
ctx = {"all_entity_store": store}

print(f"Entities in store: {list(store.keys())}")
for eid, edata in store.items():
    wps = edata.get("spatial", {}).get("waypoints", [])
    print(f"Entity {eid} ({edata.get('display_name')}) waypoints count: {len(wps)}")
    for w in wps:
        print(f"  wp: event_id={w.get('event_id')} dt={w.get('dt')} lat={w.get('lat')} lng={w.get('lng')} tower={w.get('cell_tower_id')}")

detector = STDBSCANConvergenceDetector()
print(f"\nConfig eps_km: {anomaly_config.spatial.st_dbscan_eps_km}, eps_sec: {anomaly_config.spatial.st_dbscan_eps_time_sec}")

for eid, edata in store.items():
    res = detector.run_detection(case_id, eid, edata, ctx)
    print(f"\nResult for {eid} ({edata.get('display_name')}): status={res.status} score={res.normalized_score}")
    print(f"  signals={res.signals}")
    print(f"  canonical_event_refs={res.canonical_event_refs}")
    print(f"  features={res.features}")
