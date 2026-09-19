from app.core.neo4j_client import neo4j_client
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel

with neo4j_client.driver.session() as s:
    r = s.run('MATCH (n) RETURN count(n) AS total').single()
    print('Total nodes in Neo4j:', r['total'])

    r2 = s.run('MATCH (n) WHERE n.number STARTS WITH "+919999" OR n.identifier STARTS WITH "TEST_" OR n.target_val STARTS WITH "TEST_" RETURN count(n) AS cnt').single()
    print('Dummy test nodes in Neo4j:', r2['cnt'])

    r3 = s.run('MATCH (n) WHERE labels(n) = [] RETURN count(n) AS cnt').single()
    print('Nodes without labels in Neo4j:', r3['cnt'])

    # Labels breakdown
    res_labels = s.run('MATCH (n) RETURN labels(n) AS lbl, count(n) AS cnt ORDER BY cnt DESC')
    for rec in res_labels:
        print(f"  Label: {rec['lbl']} -> {rec['cnt']}")

with get_db_context() as db:
    profs = db.query(GoldenProfileModel).filter(GoldenProfileModel.primary_name.like('%+919999%')).all()
    print('Dummy profiles in Postgres Golden Profiles:', len(profs))
