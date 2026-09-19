import asyncio
import json
from app.agents.graph import investigation_workflow
from app.services.gds_engine import extract_community_subgraph
from app.core.neo4j_client import neo4j_client

async def test():
    with neo4j_client.driver.session() as session:
        community_json = extract_community_subgraph(session, 32)
    print(f"Graph data extracted: {len(json.dumps(community_json))} chars")
    print("Starting pipeline...")
    
    async for event in investigation_workflow.astream(
        {"community_id": 32, "community_json": community_json},
        stream_mode="updates"
    ):
        for node_name, state_updates in event.items():
            if node_name == "lead_detective":
                dossier = state_updates.get("final_intelligence_dossier", {})
                print(f"\n=== LEAD AGENT OUTPUT ===")
                print(json.dumps(dossier, indent=2)[:3000])
            else:
                print(f"  [{node_name}] done")

if __name__ == "__main__":
    asyncio.run(test())
