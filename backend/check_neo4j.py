from neo4j import GraphDatabase
d = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", "password123"), connection_timeout=10.0)
with d.session() as s:
    r = s.run("MATCH (n) RETURN DISTINCT labels(n) AS lbl, count(*) AS cnt ORDER BY cnt DESC")
    for rec in r:
        print(f"Labels {rec['lbl']}: {rec['cnt']}")
    r2 = s.run("MATCH ()-[r]->() RETURN DISTINCT type(r) AS t, count(*) AS cnt ORDER BY cnt DESC")
    for rec in r2:
        print(f"  REL {rec['t']}: {rec['cnt']}")
    r3 = s.run("MATCH (n) RETURN DISTINCT n.case_id AS cid, count(*) AS cnt")
    for rec in r3:
        print(f"  CaseID: {rec['cid']} -> {rec['cnt']} nodes")
d.close()
