import io
import json
import logging
import time
from typing import List, Dict, Any, Optional
import pyarrow.parquet as pq
from app.core.config import settings
from app.core.storage import storage_service

logger = logging.getLogger("investigation.reader")

class CanonicalWarehouseReader:
    """
    Columnar query service reading canonical investigation events from
    the MinIO Parquet/Iceberg warehouse. Completely replaces MongoDB query APIs.
    """

    def __init__(self):
        self.bucket = settings.MINIO_BUCKET_WAREHOUSE
        self.prefix = "canonical_events/"
        self._keys_cache: Dict[str, Any] = {}
        self._cache_ttl = 30.0  # seconds

    def invalidate_cache(self, case_id: Optional[str] = None):
        """Invalidates the cached warehouse keys when new evidence is ingested or cleared."""
        if case_id:
            self._keys_cache.pop(case_id, None)
            self._keys_cache.pop("__all__", None)
        else:
            self._keys_cache.clear()

    def _list_parquet_keys(self, case_id: Optional[str] = None) -> List[str]:
        """List all parquet keys in the warehouse, optionally filtered by case_id prefix with TTL caching."""
        if not storage_service.is_storage_available():
            return []

        cache_key = case_id or "__all__"
        now = time.time()
        if cache_key in self._keys_cache:
            ts, cached_keys = self._keys_cache[cache_key]
            if now - ts < self._cache_ttl:
                return cached_keys

        keys = []
        try:
            prefix = f"{self.prefix}case_id={case_id}/" if case_id else self.prefix
            paginator = storage_service.s3_client.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                for obj in page.get('Contents', []):
                    if obj['Key'].endswith('.parquet'):
                        keys.append(obj['Key'])
        except Exception as e:
            logger.warning(f"[CanonicalReader] Error listing warehouse keys: {e}")

        self._keys_cache[cache_key] = (now, keys)
        return keys

    def _read_table_from_key(self, key: str) -> List[Dict[str, Any]]:
        """Reads and converts a single parquet object into canonical event dicts."""
        try:
            resp = storage_service.s3_client.get_object(Bucket=self.bucket, Key=key)
            buffer = io.BytesIO(resp['Body'].read())
            table = pq.read_table(buffer)
            return table.to_pylist()
        except Exception as e:
            logger.error(f"[CanonicalReader] Failed to read {key}: {e}")
            return []

    def iter_all_events(
        self,
        case_id: Optional[str] = None,
        source_type: Optional[str] = None,
        limit: Optional[int] = None
    ):
        """
        Memory-efficient streaming generator yielding canonical events one-by-one from Parquet.
        Avoids allocating massive lists in RAM.
        """
        keys = self._list_parquet_keys(case_id)
        yielded = 0
        per_file_limit = None
        if limit and keys:
            per_file_limit = max(150, limit // len(keys))

        for key in keys:
            file_yielded = 0
            rows = self._read_table_from_key(key)
            for r in rows:
                if source_type and r.get("source_type") != source_type:
                    continue

                # Reconstruct nested event structure compatible with downstream consumers
                attributes = {}
                attr_raw = r.get("attributes_json")
                if attr_raw and attr_raw != "{}":
                    try:
                        attributes = json.loads(attr_raw)
                    except Exception:
                        pass

                provenance = {}
                prov_raw = r.get("provenance_json")
                if prov_raw and prov_raw != "{}":
                    try:
                        provenance = json.loads(prov_raw)
                    except Exception:
                        pass

                event_dict = {
                    "event_id": r.get("event_id"),
                    "case_id": r.get("case_id"),
                    "evidence_id": r.get("evidence_id"),
                    "source_file": provenance.get("source_file", "unknown"),
                    "domain": r.get("source_type"),
                    "source_type": r.get("source_type"),
                    "event_type": r.get("event_type"),
                    "timestamp": r.get("timestamp"),
                    "z_cluster_id": r.get("z_cluster_id") or None,

                    "normalized_identity": {
                        "name": r.get("entity_name") or None,
                        "phone": r.get("entity_phone") or None,
                        "national_id": r.get("entity_national_id") or None,
                        "email": r.get("entity_email") or None,
                        "social_handle": r.get("entity_social_handle") or None,
                        "social_platform": r.get("entity_social_platform") or None
                    },

                    "telemetry": {
                        "imei": r.get("telemetry_imei") or None,
                        "cell_tower_id": r.get("telemetry_cell_tower_id") or None,
                        "lat": r.get("telemetry_lat"),
                        "lng": r.get("telemetry_lng"),
                        "address": r.get("telemetry_address") or None,
                        "assigned_ip": r.get("telemetry_assigned_ip") or None,
                        "destination_ip": r.get("telemetry_destination_ip") or None,
                        "service_port": r.get("telemetry_service_port"),
                        "duration_seconds": r.get("telemetry_duration_seconds"),
                        "bytes_transferred": r.get("telemetry_bytes_transferred")
                    },

                    "financial": {
                        "account_number": r.get("financial_account_number") or None,
                        "amount_inr": r.get("financial_amount_inr") or 0.0,
                        "txn_type": r.get("financial_txn_type") or None,
                        "channel": r.get("financial_channel") or None,
                        "counterparty": r.get("financial_counterparty") or None,
                        "narration": r.get("financial_narration") or None
                    },

                    "attributes": attributes,
                    "provenance": provenance
                }
                yield event_dict
                yielded += 1
                file_yielded += 1

                if per_file_limit and file_yielded >= per_file_limit:
                    break

                if limit and yielded >= limit:
                    return

    def read_all_events(
        self,
        case_id: Optional[str] = None,
        source_type: Optional[str] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves canonical events from the warehouse.
        Returns unified records with formatted nested identity, telemetry, and financial fields.
        """
        return list(self.iter_all_events(case_id=case_id, source_type=source_type, limit=limit))

    def backfill_cluster_ids(
        self,
        phone_to_cluster: Dict[str, str],
        handle_to_cluster: Dict[str, str],
        account_to_cluster: Optional[Dict[str, str]] = None,
        nid_to_cluster: Optional[Dict[str, str]] = None,
        name_to_cluster: Optional[Dict[str, str]] = None,
        case_id: Optional[str] = None
    ):
        """
        Dynamic resolution is handled on-the-fly via PostgreSQL GoldenProfileModel.
        Retained as an idempotent no-op to eliminate redundant disk writes and memory thrashing.
        """
        pass

    def clear_warehouse(self):
        """Drops all canonical parquet tables in the warehouse."""
        try:
            keys = self._list_parquet_keys()
            for key in keys:
                storage_service.s3_client.delete_object(Bucket=self.bucket, Key=key)
            self.invalidate_cache()
            logger.info(f"[CanonicalReader] Cleared {len(keys)} warehouse objects from MinIO.")
        except Exception as e:
            logger.warning(f"[CanonicalReader] Error clearing warehouse: {e}")

canonical_reader = CanonicalWarehouseReader()
