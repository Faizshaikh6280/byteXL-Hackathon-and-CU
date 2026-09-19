# Multi-Engine Anomaly Intelligence & Hidden Anomaly Discovery Subsystem

## 1. Subsystem Architecture & Philosophy

The **Multi-Engine Anomaly Intelligence & Hidden Anomaly Discovery Subsystem** (Feature-3) operates as the analytical detection core of the Unified Investigative Analytics Platform. It is engineered to identify sophisticated criminal conspiracies, financial fraud rings, burner device hopping, impossible transit, and clandestine coordination that evade single-point detection mechanisms.

Rather than relying on a single monolithic heuristic, the subsystem deploys **11 independent analytical lenses** operating over three distinct data layers:
1. **Columnar Event Warehouse (MinIO / Apache Iceberg / Parquet)**: Granular CDRs, IPDRs, banking transactions, social logins, and KYC filings.
2. **PostgreSQL Relational Registry**: Resolved golden identity clusters (`golden_profiles`), case metadata, and evidence chains.
3. **Neo4j 5.12 Property Graph**: Entity topologies, multi-hop relationship edges, and community structures.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │    MINIO / ICEBERG CANONICAL WAREHOUSE (Parquet)        │
                  │    (CDRs, IPDRs, Banking Tranches, Social, KYC)         │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │    COLUMNAR PYSPARK / VECTOR FEATURE FACTORY            │
                  │    (Entity × Time-Window Aggregations & Metrics)        │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                                               ▼
             ┌───────────────────────────────────────────────────────────────────┐
             │            MULTI-ENGINE ANOMALY ORCHESTRATOR                      │
             │       (Failure-Isolated Parallel & Sequential Dispatch)          │
             └─────────────────────────────────┬─────────────────────────────────┘
                                               │
     ┌──────────────────┬──────────────────────┼──────────────────────┬──────────────────┐
     ▼                  ▼                      ▼                      ▼                  ▼
1. Behavioural     2. Rules               3. Statistical         4. Graph Topology  5. Spatio-Temporal
(Isolation Forest) (Configurable Rules)   (MAD / Robust Z / IQR) (Betweenness/Louv) (Travel/ST-DBSCAN)
     │                  │                      │                      │                  │
     ├──────────────────┴──────────────────────┼──────────────────────┴──────────────────┤
     ▼                                         ▼                                         ▼
6. Financial Anomaly                      7. Social & Coordination                  8. VPN & Tor Evasion
(Structuring/Fan-Out/Dormant)             (Sync Cosine / FP-Growth)                 (Port / LOF Analysis)
     │                                         │                                         │
     ├─────────────────────────────────────────┴─────────────────────────────────────────┤
     ▼                                                                                   ▼
9. Cross-Domain Collision Engine                                            10. Identity Discrepancy
(Bank + Social + Telecom + IPDR within Δt)                                   (Zingg Cluster Conflicts)
     │                                                                                   │
     └─────────────────────────────────────────┬─────────────────────────────────────────┘
                                               ▼
                                 11. Advanced Graph & Temporal ML
                                 (Autoencoder, Node2Vec, GNN, TGN)
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │          UNIFIED SCORING & CALIBRATION ENGINE           │
                  │    (Multi-Lens Evidence Fusion & Fingerprint Dedup)     │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │          EXPLAINABILITY GENERATOR & PROVENANCE          │
                  │    (Deterministic Evidence-Grounded Factual Synthesis)  │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                     ┌─────────────────────────┴─────────────────────────┐
                     ▼                                                   ▼
      PostgreSQL Registry (`anomaly_findings`)            Neo4j Graph (`:Anomaly` Nodes)
```

---

## 2. Engine Specifications & Algorithms

### Engine #1 — Behavioural Anomaly Engine
* **Identifier**: `DET-BEHAVIORAL-IF`
* **Algorithm**: Scikit-Learn `IsolationForest` over standardized feature vectors.
* **Feature Vector**:
  $$\vec{x} = \begin{bmatrix} \text{call\_count}, \text{unique\_contacts}, \text{night\_ratio}, \text{unique\_imeis}, \text{txn\_count}, \text{volume\_inr}, \text{distance\_km}, \text{session\_count} \end{bmatrix}$$
* **Mathematical Principle**: Recursively partitions feature space using random hyperplanes. Anomalous entities require fewer split steps to isolate:
  $$s(x, n) = 2^{-\frac{E(h(x))}{c(n)}}$$
  where $h(x)$ is path length, $E(h(x))$ is expectation over all trees, and $c(n)$ is average path length of unsuccessful searches in BST.
* **Output**: Calibrated 0–100 score relative to case population baseline.
* **When to Use**: Broad behavioral outliers where no explicit deterministic rule is violated.

### Engine #2 — Deterministic Rule Engine
* **Identifier**: `DET-RULE-ENGINE`
* **Algorithm**: Declarative rule evaluation over verified thresholds:
  * `RULE-FIN-01`: High-Value Transaction ($\ge ₹10,00,000$).
  * `RULE-DEV-01`: Burner Phone / IMEI Hopping ($\ge 2$ physical handsets swapped in 24 hours).
  * `RULE-NET-02`: Nocturnal Bursts ($>25\%$ of communications occurring between 01:00 and 05:00 AM).
  * `RULE-GEO-01`: Physically Impossible Travel ($>800$ km/h ground speed).
  * `RULE-NET-03`: Darknet / VPN Routing (traffic hitting ports 9001, 9030, 1194, 500).
* **Confidence**: Fixed at $1.0$ (deterministic factual triggers).
* **When to Use**: Immediate regulatory, operational, or legal threshold violations.

### Engine #3 — Statistical Deviation Engine
* **Identifier**: `DET-STATISTICAL`
* **Algorithm**: Robust Z-Score using Median Absolute Deviation (MAD) alongside Interquartile Range (IQR):
  $$\text{Robust } Z = \frac{0.6745 \cdot (x_i - \tilde{x})}{\text{MAD}}$$
  $$\text{IQR Cutoff} = Q_3 + 1.5 \cdot (Q_3 - Q_1)$$
* **Designation**: Flagged findings are explicitly classified as `STATISTICAL_OUTLIER`.
* **When to Use**: Quantitative data distributions (transaction sums, call counts, data volume) to discover heavy-tailed distribution anomalies without Gaussian assumptions.

### Engine #4 — Network & Hidden Anomaly Engine
* **Identifier**: `DET-GRAPH-NETWORK`
* **Algorithm**: Graph structural topology analysis over Neo4j NetworkX projections:
  * **Betweenness Centrality**:
    $$C_B(v) = \sum_{s \neq v \neq t} \frac{\sigma_{st}(v)}{\sigma_{st}}$$
    Identifies *cut-out brokers* mediating traffic between disjoint criminal cells.
  * **PageRank**: Measures structural influence within the conspiracy network.
  * **Louvain Community Detection**: Discovers modular clandestine clusters.
* **Resilience**: Pure Python NetworkX execution backed by pure Cypher, ensuring execution on any Neo4j instance without requiring external GDS compute plugins.
* **When to Use**: Identifying syndicate leaders, communication bridges, and hidden money conduits.

### Engine #5 — Spatio-Temporal Anomaly Engine
Comprises four specialized sub-detectors:
* **5A: Impossible Travel (`DET-SPATIAL-TRAVEL`)**:
  Calculates Haversine great-circle distance and implied velocity:
  $$d = 2R \arcsin \left( \sqrt{\sin^2(\Delta \phi / 2) + \cos \phi_1 \cos \phi_2 \sin^2(\Delta \lambda / 2)} \right)$$
  $$v = \frac{d}{\Delta t} \cdot 3600 \quad [\text{km/h}]$$
  Flags transitions where $v > 800$ km/h.
* **5B: ST-DBSCAN Convergence (`DET-SPATIAL-CONVERGENCE`)**:
  Density-based clustering over spatial radius ($Eps_1 \le 2$ km) and temporal window ($Eps_2 \le 60$ min). Identifies physical meetings and clandestine gatherings between suspects.
* **5C: Trajectory Tailing (`DET-SPATIAL-TAILING`)**:
  Calculates discrete Fréchet Distance and Longest Common Subsequence (LCSS) with temporal lag ($\Delta t \le 300$s) to identify vehicle or suspect tailing.
* **5D: Dark Period / Radio Silence (`DET-SPATIAL-DARKPERIOD`)**:
  Bayesian change-point detection identifying unexpected signal cessation ($\ge 6$ hours) on an active device immediately preceding a crime, followed by resumption.

### Engine #6 — Financial Anomaly & Pattern Engine
* **6A: Structuring / Smurfing (`DET-FIN-STRUCTURING`)**:
  Detects transaction clusters systematically placed between 70% and 99% of regulatory reporting limits (e.g. ₹3,50,000 to ₹4,99,999 against a ₹5,00,000 threshold).
* **6B: Rapid Fan-Out / Mule Conduit (`DET-FIN-FANOUT`)**:
  Identifies large inbound tranches followed by $\ge 80\%$ fund dissipation across $\ge 3$ distinct outgoing counterparties within 30 minutes.
* **6C: Dormant Account Awakening (`DET-FIN-DORMANT`)**:
  Flags accounts with prolonged inactivity suddenly reactivated with high volume and velocity.
* **6D: Rapid ATM Cash-Out (`DET-FIN-ATM-CASHOUT`)**:
  Flags digital transfers immediately liquidated into physical cash at ATMs across multiple locations.

### Engine #7 — Social / Coordination Anomaly Engine
* **7A: Synchronous Activity (`DET-SOC-SYNC`)**:
  Computes cosine alignment of activity timelines across separate handles to identify bot-nets or coordinated disinformation campaigns.
* **7B: Shared Clandestine Infrastructure (`DET-SOC-INFRA`)**:
  Frequent itemset mining (FP-Growth) discovering multiple operational personas sharing the exact same physical handset IMEI or dynamic IP lease.

### Engine #8 — VPN / TOR / Anonymizer Detection
* **Identifier**: `DET-NET-VPN-TOR`
* **Algorithm**: Port fingerprinting (Tor 9001/9030/9050, OpenVPN 1194, IPSec 500/4500) and Local Outlier Factor (LOF) on byte throughput distributions.
* **Purpose**: Unmasks deliberate operational security (OPSEC) evasion by targets.

### Engine #9 — Cross-Domain Collision Engine
* **Identifier**: `DET-CROSS-COLLISION`
* **Algorithm**: Multi-modal temporal join:
  $$\text{Banking Outflow} \xrightarrow{\Delta t \le 30\text{m}} \text{Social Login / Telegram Ping} \xrightarrow{\text{Same Cell Tower}} \text{Voice Call}$$
* **Purpose**: Correlates actions across banking, cellular towers, and cyber messaging into a unified high-confidence criminal conspiracy finding.

### Engine #10 — Identity / Entity Discrepancy Engine
* **Identifier**: `DET-ID-DISCREPANCY`
* **Algorithm**: Inspects Zingg-resolved `golden_profiles` for synthetic identity markers: multiple conflicting national IDs (Aadhar), alias proliferation, and multi-persona phone sharing.

### Engine #11 — Advanced Graph & Temporal ML Engine
* **11A: Neural Autoencoder (`DET-ADV-AUTOENCODER`)**: Non-linear bottleneck compression model scoring anomalies via Mean Squared Error (MSE) reconstruction loss.
* **11B: Node2Vec (`DET-ADV-NODE2VEC`)**: Biased second-order random walks generating continuous low-dimensional structural embeddings to isolate topological outliers.
* **11C: Multi-Relational GNN (`DET-ADV-RGCN`)**: GraphSAGE / RGCN neighborhood aggregation scoring heterogeneous relation discordance across `OWNS_PHONE`, `OWNS_ACCOUNT`, and `TRANSACTED_WITH`.
* **11D: Temporal Graph Network (`DET-ADV-TGN`)**: Continuous-time interaction sequence modeling detecting abnormal dynamic edge creation bursts.

---

## 3. Unified Scoring & Calibration

To prevent alert fatigue and eliminate duplicate findings across overlapping lenses, the system applies **Multi-Lens Evidence Fusion**:

$$\text{Unified Score} = \min\left(100.0, \; \max_{d \in \text{Triggered}}(S_d) + \text{Corroboration Bonus}\right)$$
$$\text{Corroboration Bonus} = \min\left(25.0, \; (N_{\text{triggered}} - 1) \times 8.0\right)$$

* **Confidence Calibration**: Scaled by verified data quality and presence of corroborating domain evidence ($0.85$ to $1.0$).
* **Deterministic Fingerprint**:
  $$\text{Fingerprint} = \text{SHA256}(\text{case\_id} \,\|\, \text{entity\_id} \,\|\, \text{primary\_pattern})[:16]$$
  Guarantees that re-running analysis idempotently updates existing findings rather than polluting the case dossier with duplicates.

---

## 4. Explainability & Provenance

Every finding synthesizes human-readable factual bullet points grounded in verified evidence:
* Exact transaction values and counterparty account numbers.
* Exact cellular towers, geographic coordinates, and speeds.
* Specific physical device IMEIs and phone subscriptions.
* Hash-linked evidence references (`evidence_refs` and `canonical_event_refs`) pointing directly to raw MinIO objects and SHA-256 signatures.

---

## 5. Storage & Database Models

### PostgreSQL (`anomaly_findings` & `anomaly_runs`)
* Fully tracked in relational tables with foreign keys cascading from `cases.case_id`.
* Stores complete JSON signals, metrics dictionaries, evidence references, and model metadata.

### Neo4j Property Graph (`:Anomaly`)
* Creates `:Anomaly` nodes containing `score`, `severity`, `type`, `reasons`, `metrics`, `detectedAt`, and `status`.
* Creates relationships `(:Person|Phone|BankAccount)-[:HAS_ANOMALY]->(:Anomaly)`.
* **100% Backward Compatible** with the existing Next.js frontend (`AnomaliesTab`, `AnomalyInvestigationDrawer`, `AnomalyThreatRadar`).

---

## 6. REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/anomalies/analyze?case_id={id}` | Triggers multi-engine analysis (Celery async with direct fallback) |
| `GET` | `/api/anomalies?severity={s}&entity_type={t}&search={q}` | Lists anomaly findings with filters (frontend contract) |
| `GET` | `/api/anomalies/stats` | Aggregated severity counts (`total`, `critical`, `high`, `medium`, `low`) |
| `GET` | `/api/anomalies/health` | Operational health and metadata of all 11+ engines |
| `GET` | `/api/anomalies/{finding_id}` | Detailed finding with metrics, signals, and evidence references |
| `GET` | `/api/anomalies/cases/{case_id}/findings` | All findings scoped to a specific case |

---

## 7. Execution

The entire multi-engine pipeline can be executed manually at any time via:
```powershell
python run_pipeline_v2.py
```
Or via REST API:
```bash
curl -X POST "http://localhost:8000/api/anomalies/analyze"
```
