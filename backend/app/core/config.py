import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # PostgreSQL Configuration
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:postgres123@127.0.0.1:5432/investigation_db"
    )

    # MinIO / S3 Object Storage Configuration
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")
    MINIO_BUCKET_EVIDENCE: str = os.getenv("MINIO_BUCKET_EVIDENCE", "raw-evidence")
    MINIO_BUCKET_WAREHOUSE: str = os.getenv("MINIO_BUCKET_WAREHOUSE", "iceberg-warehouse")

    # Encryption Configuration
    ENCRYPTION_MASTER_KEY: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

    # Neo4j Graph Database
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
    NEO4J_USERNAME: str = os.getenv("NEO4J_USERNAME", os.getenv("NEO4J_USER", "neo4j"))
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "password123")

    # Celery & Redis
    REDIS_URI: str = os.getenv("REDIS_URI", "redis://127.0.0.1:6379/0")
    REDIS_URL: str = os.getenv("REDIS_URL", os.getenv("REDIS_URI", "redis://127.0.0.1:6379/0"))
    ZINGG_URL: str = os.getenv("ZINGG_URL", "http://127.0.0.1:8001")

    # Optional Mongo
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME: str = "investigative_platform"

    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5:7b-instruct")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

    # Enterprise Audit & Forensic Trail Configuration
    AUDIT_ENABLED: bool = os.getenv("AUDIT_ENABLED", "true").lower() in ("true", "1", "yes")
    AUDIT_RETENTION_DAYS: int = int(os.getenv("AUDIT_RETENTION_DAYS", "365"))
    AUDIT_METADATA_MAX_SIZE: int = int(os.getenv("AUDIT_METADATA_MAX_SIZE", "32768"))
    AUDIT_HIGH_RISK_FAIL_POLICY: str = os.getenv("AUDIT_HIGH_RISK_FAIL_POLICY", "FAIL_CLOSED")  # FAIL_CLOSED or RESILIENT
    AUDIT_INTEGRITY_MODE: str = os.getenv("AUDIT_INTEGRITY_MODE", "HASH_CHAIN")  # HASH_CHAIN, HMAC, or DISABLED
    AUDIT_ARCHIVAL_ENABLED: bool = os.getenv("AUDIT_ARCHIVAL_ENABLED", "false").lower() in ("true", "1", "yes")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

