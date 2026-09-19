import os
import io
import json
import logging
from typing import List, Dict, Any, Optional
import pyarrow as pa
import pyarrow.parquet as pq
from app.core.config import settings
from app.core.storage import storage_service
from app.schemas.canonical_event import CanonicalEvent

logger = logging.getLogger("investigation.pipeline")

# Explicit PyArrow schema to prevent null-type inference errors across heterogeneous event batches
CANONICAL_PYARROW_SCHEMA = pa.schema([
    ("event_id", pa.string()),
    ("case_id", pa.string()),
    ("evidence_id", pa.string()),
    ("event_type", pa.string()),
    ("source_type", pa.string()),
    ("timestamp", pa.string()),
    ("date_partition", pa.string()),
    ("z_cluster_id", pa.string()),
    ("entity_name", pa.string()),
    ("entity_phone", pa.string()),
    ("entity_national_id", pa.string()),
    ("entity_email", pa.string()),
    ("entity_social_handle", pa.string()),
    ("entity_social_platform", pa.string()),
    ("entity_counterparty_name", pa.string()),
    ("telemetry_imei", pa.string()),
    ("telemetry_cell_tower_id", pa.string()),
    ("telemetry_lat", pa.float64()),
    ("telemetry_lng", pa.float64()),
    ("telemetry_address", pa.string()),
    ("telemetry_assigned_ip", pa.string()),
    ("telemetry_destination_ip", pa.string()),
    ("telemetry_service_port", pa.int64()),
    ("telemetry_duration_seconds", pa.int64()),
    ("telemetry_bytes_transferred", pa.int64()),
    ("financial_account_number", pa.string()),
    ("financial_amount_inr", pa.float64()),
    ("financial_txn_type", pa.string()),
    ("financial_channel", pa.string()),
    ("financial_counterparty", pa.string()),
    ("financial_narration", pa.string()),
    ("attributes_json", pa.string()),
    ("provenance_json", pa.string())
])

def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        s = str(val).strip().replace(",", "")
        if not s or s.lower() in ("nan", "none", "null", "undefined", ""):
            return None
        return float(s)
    except (ValueError, TypeError):
        return None

def _safe_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    try:
        s = str(val).strip().replace(",", "")
        if not s or s.lower() in ("nan", "none", "null", "undefined", ""):
            return None
        return int(float(s))
    except (ValueError, TypeError):
        return None

class SparkIcebergPipeline:
    """
    Distributed processing and Iceberg / Parquet warehouse pipeline.
    Writes normalized canonical events into MinIO S3 object storage partitioned
    by source_type and date for high-performance predicate pushdown and column pruning.
    """

    def __init__(self):
        self.bucket = settings.MINIO_BUCKET_WAREHOUSE
        self.table_prefix = "canonical_events"

    @staticmethod
    def _events_to_pyarrow_table(events: List[CanonicalEvent]) -> pa.Table:
        """Serializes CanonicalEvent models to a columnar PyArrow Table with explicit strict schema."""
        records = []
        for e in events:
            date_part = e.timestamp[:10] if e.timestamp else "1970-01-01"

            port = _safe_int(e.telemetry.service_port)
            duration = _safe_int(e.telemetry.duration_seconds)
            bytes_tf = _safe_int(e.telemetry.bytes_transferred)

            records.append({
                "event_id": str(e.event_id or ""),
                "case_id": str(e.case_id or ""),
                "evidence_id": str(e.evidence_id or ""),
                "event_type": str(e.event_type or ""),
                "source_type": str(e.source_type or ""),
                "timestamp": str(e.timestamp or ""),
                "date_partition": str(date_part),
                "z_cluster_id": str(e.z_cluster_id or ""),

                # Entities
                "entity_name": str(e.entities.name or ""),
                "entity_phone": str(e.entities.phone or ""),
                "entity_national_id": str(e.entities.national_id or ""),
                "entity_email": str(e.entities.email or ""),
                "entity_social_handle": str(e.entities.social_handle or ""),
                "entity_social_platform": str(e.entities.social_platform or ""),
                "entity_counterparty_name": str(e.entities.counterparty_name or ""),

                # Telemetry
                "telemetry_imei": str(e.telemetry.imei or ""),
                "telemetry_cell_tower_id": str(e.telemetry.cell_tower_id or ""),
                "telemetry_lat": _safe_float(e.telemetry.lat),
                "telemetry_lng": _safe_float(e.telemetry.lng),
                "telemetry_address": str(e.telemetry.address or ""),
                "telemetry_assigned_ip": str(e.telemetry.assigned_ip or ""),
                "telemetry_destination_ip": str(e.telemetry.destination_ip or ""),
                "telemetry_service_port": port,
                "telemetry_duration_seconds": duration,
                "telemetry_bytes_transferred": bytes_tf,

                # Financial
                "financial_account_number": str(e.financial.account_number or ""),
                "financial_amount_inr": _safe_float(e.financial.amount_inr) or 0.0,
                "financial_txn_type": str(e.financial.txn_type or ""),
                "financial_channel": str(e.financial.channel or ""),
                "financial_counterparty": str(e.financial.counterparty or ""),
                "financial_narration": str(e.financial.narration or ""),

                # Raw Attributes & Provenance JSON
                "attributes_json": json.dumps(e.attributes or {}),
                "provenance_json": json.dumps(e.provenance.dict() if hasattr(e.provenance, 'dict') else e.provenance.model_dump())
            })

        return pa.Table.from_pylist(records, schema=CANONICAL_PYARROW_SCHEMA)

    def write_canonical_events(
        self,
        case_id: str,
        evidence_id: str,
        events: List[CanonicalEvent]
    ) -> str:
        """
        Writes canonical events to Parquet files in MinIO warehouse under:
        s3a://iceberg-warehouse/canonical_events/case_id={case_id}/evidence_id={evidence_id}/data.parquet
        """
        if not events:
            logger.info("[Pipeline] No events to write.")
            return ""

        storage_service.ensure_buckets()
        table = self._events_to_pyarrow_table(events)

        # Buffer parquet in memory
        buffer = io.BytesIO()
        pq.write_table(
            table,
            buffer,
            compression="SNAPPY",
            use_dictionary=True
        )
        buffer.seek(0)

        s3_key = f"{self.table_prefix}/case_id={case_id}/evidence_id={evidence_id}/data.parquet"

        storage_service.s3_client.put_object(
            Bucket=self.bucket,
            Key=s3_key,
            Body=buffer.getvalue(),
            ContentType="application/octet-stream"
        )

        try:
            from app.processing.canonical_reader import canonical_reader
            canonical_reader.invalidate_cache(case_id)
        except Exception:
            pass

        logger.info(f"[Pipeline] Successfully wrote {len(events)} canonical events to MinIO: {s3_key}")
        return s3_key

spark_pipeline = SparkIcebergPipeline()
