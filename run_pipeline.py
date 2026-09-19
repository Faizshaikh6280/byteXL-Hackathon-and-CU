"""Full pipeline: reset → ingest → ER → graph sync"""
import urllib.request, json, time

BASE = 'http://127.0.0.1:8000'

def post(url):
    req = urllib.request.Request(url, method='POST')
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())

def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())

print("1/4  Resetting Neo4j + MongoDB...")
print(post(f'{BASE}/api/system/reset'))

print("\n2/4  Ingesting all data files...")
r = post(f'{BASE}/api/ingest/trigger_all')
print(f"     {len(r.get('results',[]))} files ingested")

print("\n3/4  Entity Resolution (Zingg)...")
r = post(f'{BASE}/api/zingg/execute')
print(f"     method={r.get('method')} | records={r.get('total_records')} | clusters={r.get('clusters_resolved')}")

print("\n4/4  Graph sync to Neo4j...")
r = post(f'{BASE}/api/graph/sync')
print(f"     {r}")

print("\nVerifying graph...")
r = get(f'{BASE}/api/graph/topology')
import collections
counts = collections.Counter(n['type'] for n in r['nodes'])
print(f"  Total nodes: {len(r['nodes'])}  edges: {len(r['edges'])}")
for t, c in sorted(counts.items()):
    print(f"    {t}: {c}")
print("\nDONE")
