import urllib.request, json

req = urllib.request.Request('http://localhost:8000/api/system/golden_profiles', method='GET')
with urllib.request.urlopen(req, timeout=30) as r:
    profiles = json.loads(r.read())

print(f'Total Golden Profiles: {len(profiles)}')
print()
for p in profiles:
    cid = p["z_cluster_id"]
    name = p["primary_name"]
    aliases = p["known_aliases"]
    phones = p["known_phones"]
    risk = p["risk_score"]
    social = p.get("social_handles", [])
    print(f'CLUSTER: {cid}')
    print(f'  Primary Name : {name}')
    print(f'  Aliases      : {aliases}')
    print(f'  Phones       : {phones}')
    print(f'  Risk Score   : {risk}')
    print(f'  Social       : {social}')
    print()
