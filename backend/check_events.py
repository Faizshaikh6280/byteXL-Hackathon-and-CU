from app.processing.canonical_reader import canonical_reader

case_id = "CASE-32907DCF"
events = canonical_reader.read_all_events(case_id=case_id)
print(f"Total canonical events in warehouse: {len(events)}")
by_domain = {}
geo_events = []
for ev in events:
    d = ev.get("domain") or ev.get("source_type")
    by_domain[d] = by_domain.get(d, 0) + 1
    if "G0" in str(ev.get("event_id")) or d == "GENERAL":
        geo_events.append(ev)

print(f"Events by domain: {by_domain}")
print(f"Total geo events: {len(geo_events)}")
for g in geo_events[:5]:
    print(f"  event_id={g.get('event_id')} entities={g.get('entities')} attributes={g.get('attributes')} telemetry={g.get('telemetry')}")
