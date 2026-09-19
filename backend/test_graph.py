import asyncio
from app.core.database import SessionFactory
from app.agents.graph import investigation_workflow
from app.services.gds_engine import extract_community_subgraph
from app.core.neo4j_client import neo4j_client

async def test():
    with neo4j_client.driver.session() as session:
        community_json = extract_community_subgraph(session, 32)
    print("Starting graph...")
    try:
        async for event in investigation_workflow.astream({"community_id": 32, "community_json": community_json}):
            print("Event:", event.keys())
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
