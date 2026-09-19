import urllib.request, json, collections

with urllib.request.urlopen('http://localhost:8000/api/graph/topology', timeout=30) as r:
    data = json.loads(r.read())

nodes = data['nodes']
edges = data['edges']
print(f'Nodes: {len(nodes)} | Edges: {len(edges)}')
print()

type_counts = collections.Counter(n['type'] for n in nodes)
for t, c in sorted(type_counts.items()):
    print(f'  {t}: {c}')

print()
print('=== PERSON NODES (Golden Clusters) ===')
for n in nodes:
    if n['type'] == 'Person':
        p = n.get('properties', {})
        cid = p.get('golden_id', '?')
        name = n['label']
        aliases = p.get('known_aliases', [])
        phones = p.get('known_phones', [])
        risk = p.get('risk_score', 0)
        print(f'  [{cid}] {name}  | aliases={aliases} | phones={phones} | risk={risk}')

print()
print('=== SOCIAL ACCOUNTS ===')
for n in nodes:
    if n['type'] == 'SocialAccount':
        p = n.get('properties', {})
        print(f'  {p.get("handle")} ({p.get("platform")})')
