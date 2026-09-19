import sys
import asyncio
sys.path.insert(0, r"C:\Users\Faiz Alam\OneDrive\Desktop\Cyber Platform\backend")

import asyncio

async def main():
    from app.core.db import init_mongo
    await init_mongo()
    from app.services.graph_sync import sync_mongo_to_neo4j
    result = await sync_mongo_to_neo4j()
    print(result)

asyncio.run(main())
