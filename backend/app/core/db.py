"""
MongoDB compatibility module.
The primary application data layer has been migrated to PostgreSQL + MinIO + Iceberg.
This stub is preserved as a dormant interface for potential future external connectors.
"""

class MongoDB:
    client = None
    db = None
    events_col = None
    golden_col = None

db_client = MongoDB()

async def init_mongo():
    """Dormant initializer. Primary pipeline now uses PostgreSQL and MinIO."""
    pass
