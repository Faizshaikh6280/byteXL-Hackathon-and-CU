import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath("."))

from app.agents.graph import investigation_workflow
from app.services.gds_engine import extract_community_subgraph
from app.core.neo4j_client import neo4j_client

async def main():
    with neo4j_client.driver.session() as session:
        # Use a community ID that exists (e.g. 32 or 1)
        community_json = extract_community_subgraph(session, 32)
        
    try:
        async for event in investigation_workflow.astream(
            {"community_json": community_json},
            stream_mode="updates"
        ):
            print(event.keys())
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("ERROR:", str(e))

asyncio.run(main())
