# AI-Powered Investigation Platform: Architecture & Workflow Guide (V2 Redesign)

This document is the definitive engineering reference and workflow manual for the **AI-Powered Cyber Intelligence & Investigation Platform**. It details the V2 distributed architecture, data pipeline stages, security models, algorithms, and operational workflows.

---

## 1. System Vision & Investigation Scenario

### Problem Space
The platform resolves complex cross-domain identity fragmentation and criminal activity footprints across:
- **Telecom (CDR)**: Cell phone calls, durations, cell tower IDs, IMEI device numbers.
- **Network Leases (IPDR)**: Dynamic client IP leases, destination IPs, session timestamps.
- **Banking / Fintech**: Bank accounts, UPI IDs, transactions, amounts, counterparties.
- **Social Media Logs**: User handles, platforms, registered numbers, client IPs.
- **Identity / KYC**: Legal names, national IDs (Aadhar), declared residential addresses.

### Reference Scenario: "Operation Shadow Syndicate"
The dataset in `data_files/` models an extortion/kidnapping syndicate operating in Delhi NCR:
- **Vikramaditya Singh / Vicky Gujjar**: Extortion ringleader in Sector 15 Noida using Telegram (`@vicky_shooter_007`).
- **Rohit Verma**: Infiltrator chauffeur in Sangam Vihar South Delhi.
- **Manish Yadav / Munna Bhai**: Logistics operator in Gurugram swapping devices.
- **Pooja Devi & Suraj Bhan**: Mule bank account holders receiving ₹2,500,000 RTGS tranches from industrialist Vikram Malhotra.
- **Aarav Malhotra**: Abducted student tracked through tower and IPDR timestamps.

---

## 2. Distributed Architecture & Service Topology

```
RAW UNLABELLED EVIDENCE FILES (CSV, XLSX, JSON, PDF) + WRITTEN CASE CONTEXT
                                   │
                                   ▼
          FastAPI Request Intake & Case Registry (`/api/cases`)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
        SHA-256 Integrity Hash            AES-256-GCM Encryption
                    │                             │
                    ▼                             ▼
        PostgreSQL 16 Registry            MinIO Immutable Storage
     (Cases, Evidence, Audit, Run)        (cases/{case_id}/evidence/)
                    │                             │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                   Automatic Source Detection Engine
         (Deterministic rule-based fingerprinting: Telecom,
          Banking, Network/IPDR, Social, KYC; confidence scoring)
                                   │
                                   ▼
                       Parser Adapter Framework
               (CDR, IPDR, Banking, Social, KYC parsers)
                                   │
                                   ▼
                    PySpark Distributed Processing
        (Normalization, Validation & Quarantine, Deduplication,
         Data Quality scoring, Parquet/Iceberg Table Generation)
                                   │
                                   ▼
                   Apache Iceberg Canonical Events
                   (s3a://iceberg-warehouse/canonical_events)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
        Zingg Entity Resolution           Timeline & Geospatial
       (Reads Iceberg, writes to          (Reads Iceberg Parquet
       Postgres Golden Profiles)          for temporal/GPS paths)
                    │
                    ▼
           Neo4j 5.12 Graph
     (7 Node Labels, 8 Edge Types,
      Graph ML Anomaly Detection)
                    │
                    ▼
          Next.js Visual Console
       (Cytoscape.js, Deck.gl, Radar)
```

---

## 3. Core Subsystems

### 3.1 Case & Evidence Registry (PostgreSQL 16)
- **Files**: `backend/app/core/database.py`, `backend/app/models/postgres_models.py`
- Relational tables:
  - `cases`: Tracks case IDs, references, titles, and written investigator notes.
  - `evidence`: Stores file size, SHA-256 hash, AES-256-GCM encryption metadata, storage paths, detected source type, confidence, and lifecycle status (`RECEIVED`, `ENCRYPTED`, `STORED`, `PARSING`, `VALIDATING`, `DEDUPLICATING`, `COMPLETED`, `NEEDS_REVIEW`).
  - `quarantine_records`: Preserves malformed or invalid rows with exact failure reasons and raw payloads.
  - `data_quality_reports`: Records valid/invalid/duplicate ratios, missing-field statistics, and composite quality scores (0–100).
  - `golden_profiles`: Stores resolved, deduplicated entity identities synthesized by Entity Resolution.
  - `audit_logs`: Immutable audit trail for chain-of-custody tracking.

### 3.2 Immutable Object Storage & Encryption (MinIO S3)
- **File**: `backend/app/core/storage.py`
- **Authenticated Encryption**: Raw evidence is encrypted client-side using AES-256-GCM with a 96-bit random nonce prior to transmission to MinIO.
- **Immutability**: Raw files are stored at `cases/{case_id}/evidence/{evidence_id}/original/{filename}.enc` and never overwritten.
- **Tamper-Evident Verification**: The platform verifies the chain of custody by decrypting in memory, recalculating the SHA-256 hash, and verifying equivalence with the PostgreSQL registry hash.

### 3.3 Automatic Source Detection Engine
- **File**: `backend/app/ingestion/detector.py`
- **Deterministic & Explainable**: Inspects file headers, extensions, JSON keys, and PDF text.
- **Domain Signatures**:
  - `TELECOM` (CDR): calling_number, called_number, imei, cell_tower_id, duration.
  - `NETWORK` (IPDR): assigned_ip, destination_ip, service_port, bytes_transferred.
  - `BANKING`: account_number, amount_inr, txn_type, counterparty_identifier, channel.
  - `SOCIAL`: user_handle, platform, registered_phone, client_ip.
  - `KYC`: full_name, national_id, occupation, address, phone.
- Emits `confidence`, matched signatures, and sets `needs_review` if confidence is below threshold.

### 3.4 Parser Adapter Framework
- **Files**: `backend/app/ingestion/parsers/`
- Modular, versioned parsers implementing `BaseParser`:
  - `CDRParser`: Telephony call detail records.
  - `IPDRParser`: ISP network session logs.
  - `BankingParser`: CSV, XLSX, and structured tabular PDF statements.
  - `SocialParser`: Social media activity logs.
  - `KYCParser`: Official identity profiles.
- Registered with `ParserRegistry` for automatic adapter resolution.

### 3.5 Validation, Deduplication & Quality Scoring
- **Validation**: `backend/app/ingestion/validator.py` routes records with invalid timestamps, out-of-range coordinates, malformed IPs, or negative amounts to quarantine.
- **Deduplication**: `backend/app/ingestion/deduplication.py` computes deterministic semantic hashes across core fields to collapse duplicate ingestions without confusing ingestion deduplication with Entity Resolution.
- **Data Quality**: `backend/app/ingestion/quality.py` scores incoming evidence from 0.0 to 100.0.

### 3.6 Columnar Parquet / Iceberg Warehouse
- **Writer**: `backend/app/processing/spark_pipeline.py` writes canonical events to `s3a://iceberg-warehouse/canonical_events/`.
- **Reader**: `backend/app/processing/canonical_reader.py` provides high-speed columnar access for downstream consumers (Timeline, Geospatial, Graph Sync, ER) without MongoDB.

### 3.7 Entity Resolution & Neo4j Graph Synchronization
- **Entity Resolution**: `backend/app/services/zingg_er.py` resolves multiple fragmented identities into Golden Profiles using Union-Find clustering and survivorship rules, storing them in PostgreSQL `golden_profiles` and backfilling `z_cluster_id` in the Parquet warehouse.
- **Graph Sync**: `backend/app/services/graph_sync.py` reads Golden Profiles from PostgreSQL and operational events from MinIO Parquet, creating 7 node labels and 8 relationship types in Neo4j with full idempotency.
- **Anomaly Detection**: `backend/app/services/anomaly_engine.py` extracts graph structural features (degree, triangles) and detects outliers using Scikit-Learn Isolation Forest.

---

## 4. How to Run Manually

### Start the Infrastructure
```powershell
docker compose up -d --build
```

### Run the Verification Pipeline
```powershell
python run_pipeline_v2.py
```
