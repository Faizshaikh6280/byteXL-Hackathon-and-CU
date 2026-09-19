import os
import logging
from typing import Dict, Any, Optional
import datetime

from app.core.storage import storage_service
from app.core.database import get_db_context
from app.models.postgres_models import EvidenceModel, QuarantineRecordModel, DataQualityReportModel
from app.ingestion.detector import source_detector
from app.ingestion.parsers.registry import parser_registry
from app.ingestion.validator import event_validator
from app.ingestion.deduplication import ingestion_deduplicator
from app.ingestion.quality import data_quality_engine
from app.processing.spark_pipeline import spark_pipeline

logger = logging.getLogger("investigation.ingestion")

async def process_file(
    file_path: str,
    domain: Optional[str] = None,
    case_id: str = "CASE-DEFAULT-001",
    evidence_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Ingests an evidence file through the new distributed pipeline:
    1. Reads raw bytes & computes deterministic SHA-256
    2. Encrypts with AES-256-GCM & stores in immutable MinIO object storage
    3. Automatically detects source domain if unlabelled (or uses hint)
    4. Selects parser adapter from registry
    5. Normalizes records into CanonicalEvent schemas
    6. Validates records & routes invalid rows to PostgreSQL quarantine
    7. Performs exact/near-exact deduplication
    8. Calculates data quality metrics & logs quality report in PostgreSQL
    9. Writes canonical events to MinIO Parquet/Iceberg warehouse
    10. Updates Evidence metadata in PostgreSQL
    Zero MongoDB dependency.
    """
    filename = os.path.basename(file_path)
    if not evidence_id:
        import uuid
        evidence_id = f"EV-{uuid.uuid4().hex[:8].upper()}"

    with open(file_path, "rb") as f:
        raw_bytes = f.read()

    file_size = len(raw_bytes)

    # 1. Store encrypted immutable copy in MinIO
    storage_path, sha256_hash, enc_meta = storage_service.store_encrypted_evidence(
        case_id=case_id,
        evidence_id=evidence_id,
        filename=filename,
        raw_bytes=raw_bytes
    )

    # 2. Automatic Source Detection
    detection_res = source_detector.detect(filename, raw_bytes)
    detected_source = domain or detection_res.detected_type
    confidence = 1.0 if domain else detection_res.confidence

    # 3. Select Parser Adapter
    parser = parser_registry.get_parser(detected_source, filename)
    if not parser:
        raise ValueError(f"No parser adapter found for detected source type: {detected_source}")

    # 4. Parse Raw Evidence into Canonical Events
    raw_events = parser.parse(
        content_bytes=raw_bytes,
        case_id=case_id,
        evidence_id=evidence_id,
        filename=filename,
        evidence_sha256=sha256_hash
    )
    total_parsed = len(raw_events)

    # 5. Validation & Quarantine
    valid_events, quarantined_rows = event_validator.validate_batch(raw_events)
    invalid_count = len(quarantined_rows)

    # 6. Deduplication
    unique_events, duplicate_count = ingestion_deduplicator.deduplicate(valid_events)

    # 7. Data Quality Metrics
    quality_summary = data_quality_engine.calculate_quality_metrics(
        total_records=total_parsed,
        valid_events=unique_events,
        invalid_count=invalid_count,
        duplicate_count=duplicate_count
    )

    # 8. Write Canonical Events to MinIO Parquet Warehouse
    parquet_key = spark_pipeline.write_canonical_events(
        case_id=case_id,
        evidence_id=evidence_id,
        events=unique_events
    )

    # 9. Persist Evidence & Quality Metadata in PostgreSQL
    with get_db_context() as db:
        # Create or update Evidence record
        ev_record = db.query(EvidenceModel).filter_by(evidence_id=evidence_id).first()
        if not ev_record:
            ev_record = EvidenceModel(
                evidence_id=evidence_id,
                case_id=case_id,
                original_filename=filename,
                mime_type="application/octet-stream",
                file_size=file_size,
                sha256=sha256_hash,
                encryption_metadata=enc_meta,
                storage_path=storage_path,
                received_by="INGESTION_SERVICE",
                processing_status="COMPLETED" if not detection_res.needs_review else "NEEDS_REVIEW",
                detected_source_type=detected_source,
                detected_source_confidence=confidence,
                detector_version=detection_res.detector_version,
                parser_version=parser.parser_version,
                schema_version=parser.schema_version,
                record_count=total_parsed,
                valid_record_count=len(unique_events),
                invalid_record_count=invalid_count,
                duplicate_record_count=duplicate_count,
                quality_score=quality_summary["quality_score"],
                error_info=None,
                provenance_info={
                    "reasons": detection_res.reasons,
                    "matched_signatures": detection_res.matched_signatures,
                    "parquet_key": parquet_key
                }
            )
            db.add(ev_record)
        else:
            ev_record.processing_status = "COMPLETED"
            ev_record.record_count = total_parsed
            ev_record.valid_record_count = len(unique_events)
            ev_record.invalid_record_count = invalid_count
            ev_record.duplicate_record_count = duplicate_count
            ev_record.quality_score = quality_summary["quality_score"]

        # Persist Quarantined Records in bulk
        if quarantined_rows:
            db.add_all([
                QuarantineRecordModel(
                    evidence_id=evidence_id,
                    row_index=q["row_index"],
                    reason=q["reason"],
                    raw_payload=q["raw_payload"]
                ) for q in quarantined_rows
            ])

        # Persist Quality Report
        db.add(DataQualityReportModel(
            evidence_id=evidence_id,
            case_id=case_id,
            total_records=total_parsed,
            valid_records=len(unique_events),
            invalid_records=invalid_count,
            duplicate_records=duplicate_count,
            missing_field_ratios=quality_summary["missing_field_ratios"],
            quality_score=quality_summary["quality_score"]
        ))

    logger.info(
        f"[Ingestion] Processed {filename} -> {detected_source} | Parsed: {total_parsed}, Valid: {len(unique_events)}, Dups: {duplicate_count}, Invalid: {invalid_count}, Score: {quality_summary['quality_score']}"
    )

    return {
        "status": "success",
        "evidence_id": evidence_id,
        "filename": filename,
        "detected_source": detected_source,
        "confidence": confidence,
        "total_records": total_parsed,
        "valid_records": len(unique_events),
        "duplicate_records": duplicate_count,
        "invalid_records": invalid_count,
        "quality_score": quality_summary["quality_score"],
        "storage_path": storage_path,
        "parquet_key": parquet_key,
        "needs_review": detection_res.needs_review
    }
