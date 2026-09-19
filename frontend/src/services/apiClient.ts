/**
 * Centralized API Client for Cyber Investigation & Intelligence Platform
 * Purely backend-driven: Zero mock data.
 */

const API_BASE = typeof window !== 'undefined'
  ? ''
  : (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000');

// ==========================================
// IDENTITY & ACCESS MANAGEMENT (IAM) TYPES
// ==========================================

export interface UserProfile {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  official_email: string;
  phone_number?: string;
  role: string;
  role_display?: string;
  unit?: string;
  unit_code?: string;
  organization?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'PENDING_APPROVAL' | 'REJECTED';
  mfa_enabled: boolean;
  last_login_at?: string;
}

export interface CaseMembership {
  case_id: string;
  case_role: string;
}

export interface AuthStateResponse {
  status: string;
  mfa_required?: boolean;
  challenge_token?: string;
  message?: string;
  user?: UserProfile;
  permissions?: string[];
  case_memberships?: CaseMembership[];
}

export interface UserSession {
  id: number;
  session_id: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
  active: boolean;
}

export interface AuditLogEntry {
  id: number;
  audit_id: string;
  audit_event_id?: string;
  timestamp: string;
  user_id?: string;
  actor: string;
  actor_type?: string;
  role?: string;
  organization_id?: string;
  unit_id?: string;
  case_id?: string;
  evidence_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  result: string;
  decision?: string;
  reason_code?: string;
  reason?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
  http_method?: string;
  details?: Record<string, any>;
  previous_state_hash?: string;
  new_state_hash?: string;
  event_hash?: string;
  previous_event_hash?: string;
  audit_schema_version?: number;
  created_at?: string;
  request_id?: string;
  correlation_id?: string;
}

export interface AuditStats {
  total_events: number;
  denied_actions: number;
  evidence_exports: number;
  evidence_downloads: number;
  finding_approvals: number;
  admin_changes: number;
  auth_failures: number;
  recent_security_events: Array<{
    audit_id: string;
    timestamp: string;
    actor: string;
    role?: string;
    action: string;
    case_id?: string;
    result: string;
    reason?: string;
    ip_address?: string;
  }>;
}

export interface AuditVerifyResult {
  status: 'VALID' | 'INTEGRITY_ANOMALY_DETECTED';
  records_checked: number;
  chain_intact: boolean;
  first_event_id?: string;
  latest_event_id?: string;
  latest_hash?: string;
  anomalies: Array<{
    id: number;
    audit_event_id: string;
    type: string;
    message: string;
  }>;
}

export interface NFCCardRecord {
  id: string;
  user_id: string;
  officer_name: string;
  employee_id: string;
  officer_role?: string;
  officer_unit?: string;
  card_uid: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  issued_at: string;
  activated_at?: string;
  last_used_at?: string;
  failed_attempt_count: number;
  is_locked: boolean;
  locked_until?: string;
}

export interface NFCInitiateResponse {
  status: string;
  transaction_id: string;
  expires_in_seconds: number;
  message?: string;
}

export interface NFCVerifyPinResponse {
  status: string;
  message: string;
  target_case_id: string | null;
  user: UserProfile;
}

// ==========================================
// FORENSIC NFC CRIME SCENE EVIDENCE TYPES
// ==========================================

export interface NFCDerivedIdentifier {
  field: string;
  value: string;
  source_record_index: number;
  extraction_method: string;
  confidence: number;
  status: string;
}

export interface NFCEntityResolutionCandidate {
  cluster_id: string;
  primary_name: string;
  risk_score: number;
  score: number;
  reasons: string[];
  conflicts?: string[];
  known_phones?: string[];
}

export interface NFCEntityResolutionResult {
  match_tier: 'MATCHED' | 'POSSIBLE_MATCH' | 'NO_MATCH';
  matched_cluster_id: string;
  matched_name: string;
  confidence: number;
  is_provisional: boolean;
  reasons: string[];
  conflicts?: string[];
  candidates?: NFCEntityResolutionCandidate[];
  source_evidence_id: string;
}

export interface NFCCaseCorrelations {
  telecom_cdr: { count: number; summary: string };
  financial_banking: { count: number; summary: string };
  network_ipdr: { count: number; summary: string };
  social_logs: { count: number; summary: string };
  timeline_events: { count: number; summary: string };
  geospatial_proximity: { proximity_detected: boolean; min_distance_km?: number; summary: string };
  anomaly_signals: { count: number; signals: string[] };
  existing_findings: { count: number; findings: Array<{ id: string; title: string; severity: string }> };
}

export interface NFCAcquisitionRecord {
  record_type: string;
  media_type?: string;
  encoding?: string;
  lang?: string;
  data_text?: string;
  data_bytes_hex?: string;
}

export interface NFCAcquisitionPayload {
  raw_payload: {
    serial_number?: string;
    card_uid?: string;
    records: NFCAcquisitionRecord[];
  };
  location_metadata?: {
    latitude?: number;
    longitude?: number;
    location_name?: string;
    crime_scene_id?: string;
  };
  hardware_metadata?: {
    device_model?: string;
    scanner_type?: string;
    scan_protocol?: string;
  };
  allow_duplicate?: boolean;
}

export interface NFCAcquisitionDossier {
  acquisition_id: string;
  evidence_id: string;
  case_id: string;
  acquired_by: string;
  acquired_at: string;
  card_uid?: string;
  nfc_format: string;
  record_count: number;
  raw_sha256: string;
  raw_payload_uri: string;
  acquisition_status: string;
  error_message?: string;
  hardware_metadata: Record<string, any>;
  location_metadata: Record<string, any>;
  derived_identifiers: NFCDerivedIdentifier[];
  entity_resolution: NFCEntityResolutionResult;
  case_correlations: NFCCaseCorrelations;
  finding_id?: string;
  investigator_assessment: string;
  provenance_info: Record<string, any>;
}

export interface NFCScannerStatus {
  status: string;
  case_id: string;
  supported_technologies: string[];
  max_message_bytes: number;
  max_record_bytes: number;
  system_time_utc: string;
}

export interface NFCFixtureCard {
  id: string;
  label: string;
  description: string;
  card_uid?: string;
  records: NFCAcquisitionRecord[];
  expected_outcome: string;
}

export interface Case {
  case_id: string;
  case_reference: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  created_by: string;
}

export interface CaseCreatePayload {
  title: string;
  description?: string;
  case_reference?: string;
  created_by?: string;
}

export interface EvidenceItem {
  evidence_id: string;
  filename: string;
  source_type: string;
  confidence: number;
  status: string;
  records: number;
  quality_score: number;
  sha256: string;
}

export interface CaseDetail extends Case {
  evidence_count: number;
  evidence: EvidenceItem[];
}

export interface GoldenProfile {
  z_cluster_id: string;
  primary_name: string;
  known_aliases: string[];
  known_phones: string[];
  known_accounts: string[];
  social_handles: Array<{ handle: string; platform: string }>;
  risk_score: number;
  source_records?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  riskScore?: number;
  color?: string;
  properties?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  properties?: Record<string, any>;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimelineEventItem {
  id: string;
  time_ms: number;
  domain: string;
  event_type: string;
  identity?: { phone?: string; name?: string; social_handle?: string };
  financial?: { account_number?: string; amount_inr?: number; txn_type?: string };
  telemetry?: { client_ip?: string; tower_address?: string; destination_ip?: string; lat?: number; lng?: number };
}

export interface GeospatialWaypoint {
  cluster_id: string;
  path: number[][];
  timestamps: number[];
}

export interface GeoSyncData {
  timeline: TimelineEventItem[];
  waypoints: GeospatialWaypoint[];
}

export interface TimelineCanonicalEvent {
  event_id: string;
  case_id: string;
  event_type: string;
  domain: string;
  start_time: string;
  end_time?: string;
  raw_timestamp: string;
  normalized_timestamp: string;
  timestamp_ms: number;
  timezone_offset?: string;
  timestamp_precision: string;
  timestamp_confidence: number;
  source_type: string;
  source_record_id?: string;
  evidence_id: string;
  evidence_filename?: string;
  evidence_sha256?: string;
  actor_entities: string[];
  target_entities: string[];
  related_entities: string[];
  z_cluster_id?: string;
  entity_name?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  location_source?: string;
  location_confidence: number;
  amount_inr?: number;
  channel?: string;
  txn_type?: string;
  counterparty?: string;
  narration?: string;
  duration_seconds?: number;
  bytes_transferred?: number;
  client_ip?: string;
  destination_ip?: string;
  cell_tower_id?: string;
  imei?: string;
  attributes: Record<string, any>;
  anomaly_score: number;
  risk_level: string;
  anomaly_ids: string[];
  anomaly_reasons: string[];
  confidence_score: number;
  correlation_ids: string[];
  epistemic_status: string;
  provenance: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TemporalCorrelation {
  correlation_id: string;
  case_id: string;
  event_a_id: string;
  event_b_id: string;
  relationship_type: string;
  time_delta_seconds: number;
  time_delta_formatted: string;
  correlation_score: number;
  rules_triggered: string[];
  supporting_evidence: string[];
  description: string;
  epistemic_status: string;
  actor_a?: string;
  actor_b?: string;
  domain_a?: string;
  domain_b?: string;
  timestamp_a: string;
  timestamp_b: string;
}

export interface ActivityBurst {
  burst_id: string;
  case_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  event_count: number;
  entity_count: number;
  domain_counts: Record<string, number>;
  entities: string[];
  event_ids: string[];
  severity: string;
  description: string;
}

export interface TemporalInconsistency {
  inconsistency_id: string;
  case_id: string;
  entity_id: string;
  entity_name?: string;
  event_a_id: string;
  event_b_id: string;
  start_time: string;
  end_time: string;
  time_delta_seconds: number;
  location_a: Record<string, any>;
  location_b: Record<string, any>;
  distance_km: number;
  required_speed_kmh: number;
  confidence: number;
  evidence_refs: string[];
  description: string;
}

export interface StorylineStep {
  step_index: number;
  event_id: string;
  timestamp: string;
  time_offset_from_start: string;
  time_offset_from_prev: string;
  domain: string;
  event_type: string;
  summary: string;
  actors: string[];
  amount_inr?: number;
  location?: string;
  evidence_id?: string;
  is_anomaly: boolean;
  anomaly_title?: string;
}

export interface StorylineSequence {
  sequence_id: string;
  case_id: string;
  title: string;
  summary: string;
  category: string;
  domain_span: string[];
  start_time: string;
  end_time: string;
  total_duration_formatted: string;
  steps: StorylineStep[];
  event_ids: string[];
  correlation_ids: string[];
  intelligence_assessment: string;
  confidence_score: number;
}

export interface TimeBucketDensity {
  bucket_key: string;
  start_ms: number;
  end_ms: number;
  event_count: number;
  domain_counts: Record<string, number>;
  anomaly_count: number;
}

export interface TimelineSummaryStats {
  total_events: number;
  total_entities: number;
  total_anomalies: number;
  total_correlations: number;
  total_bursts: number;
  total_inconsistencies: number;
  domain_breakdown: Record<string, number>;
  min_timestamp?: string;
  max_timestamp?: string;
}

export interface TimelineQueryResponse {
  case_id: string;
  summary: TimelineSummaryStats;
  events: TimelineCanonicalEvent[];
  correlations: TemporalCorrelation[];
  bursts: ActivityBurst[];
  inconsistencies: TemporalInconsistency[];
  density_buckets: TimeBucketDensity[];
  entities: Array<{
    id: string;
    name: string;
    cluster_id?: string;
    event_count: number;
    risk_score?: number;
  }>;
  has_more: boolean;
  next_cursor?: string;
}

export interface AnomalyStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DetectorEngineMeta {
  detector_id: string;
  name: string;
  type: string;
  domain: string;
  version: string;
  applicable_domains: string[];
  description: string;
}

export interface DetectorHealthResponse {
  status: string;
  total_detectors: number;
  engines: DetectorEngineMeta[];
}

export interface AnomalyFinding {
  id: string;
  entityId: string;
  entityType: string;
  type: string;
  category?: string;
  patternType?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  confidence?: number;
  investigativePriority?: string;
  caseRelevance?: string;
  relevanceReasons?: string[];
  domain?: string;
  title?: string;
  whatHappened?: string;
  whyUnusual?: string;
  whyRelevant?: string;
  status: string;
  reasons: string[];
  contributingDetectors?: string[];
  detectors?: string[];
  detectorSummary?: Array<{
    detector_id: string;
    name: string;
    domain: string;
    score: number;
    confidence: number;
    status: string;
    observations: Record<string, any>;
  }>;
  primaryEntities?: Array<{
    entity_id: string;
    display_name: string;
    entity_type: string;
    risk_score?: number;
    role?: string;
    aliases?: string[];
    phones?: string[];
    accounts?: string[];
  }>;
  relatedEntities?: Array<{
    entity_id: string;
    display_name: string;
    entity_type: string;
    role?: string;
    aliases?: string[];
    phones?: string[];
    accounts?: string[];
  }>;
  supportingObservations?: string[];
  supportingSignals?: Array<any>;
  supportingEvents?: Array<{
    event_id: string;
    timestamp: string;
    relative_time?: string;
    domain: string;
    event_type: string;
    amount_inr?: number;
    channel?: string;
    counterparty?: string;
    location?: string;
    ip?: string;
    evidence_id?: string;
    source_file?: string;
  }>;
  timelineContext?: {
    start_time?: string;
    end_time?: string;
    total_events_in_sequence?: number;
    sequence_steps?: Array<{
      step_index: number;
      timestamp: string;
      time_offset: string;
      domain: string;
      description: string;
      event_id?: string;
    }>;
  };
  graphContext?: {
    focused_entity?: string;
    structural_role?: string;
    role_description?: string;
    degree?: number;
    betweenness_centrality?: number;
    pagerank?: number;
    community_id?: number;
    subgraph_entities?: string[];
    suggested_actions?: string[];
  };
  spatialContext?: {
    available: boolean;
    waypoints?: Array<{
      name: string;
      lat: number;
      lng: number;
      timestamp?: string;
      type: string;
    }>;
    distance_km?: number;
    implied_speed_kmh?: number;
    elapsed_seconds?: number;
    movement_description?: string;
    reason?: string;
  };
  metrics: Record<string, any>;
  technicalDetails?: Record<string, any>;
  evidence_refs?: string[];
  canonical_event_refs?: string[];
  evidenceQuality?: string;
  detectedAt?: string;
  entityInteractions?: Array<{
    source_entity: string;
    target_entity: string;
    interaction_type: string;
    description: string;
    amount_inr?: number;
    timestamp?: string;
  }>;
}

export interface AnomalyRunResult {
  status: string;
  run_id?: string;
  case_id?: string;
  message?: string;
  summary?: {
    total_entities_analyzed: number;
    total_findings: number;
    total_signals_generated?: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    duration_seconds: number;
  };
  detectors_executed?: string[];
  detectors_failed?: string[];
}

async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      // Keep default statusText
    }
    throw new Error(`API Error (${res.status}): ${errorDetail}`);
  }
  return res.json();
}

// Lightweight in-memory cache for high-frequency queries
const _apiCache = new Map<string, { data: any; expires: number }>();
const _inflightRequests = new Map<string, Promise<any>>();

async function cachedFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = _apiCache.get(key);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.data as T;
  }
  if (_inflightRequests.has(key)) {
    return _inflightRequests.get(key) as Promise<T>;
  }
  const promise = fetcher()
    .then((data) => {
      _apiCache.set(key, { data, expires: Date.now() + ttlMs });
      _inflightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      _inflightRequests.delete(key);
      throw err;
    });
  _inflightRequests.set(key, promise);
  return promise;
}

export const apiClient = {
  // === GENERIC REQUEST ===
  async request<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await authFetch(url, options);
    return handleResponse<T>(res);
  },

  // === CASES & EVIDENCE ===
  async listCases(): Promise<Case[]> {
    return cachedFetch<Case[]>('list_cases', 4000, async () => {
      const res = await authFetch(`${API_BASE}/api/cases`);
      return handleResponse<Case[]>(res);
    });
  },

  async getCaseDetails(caseId: string): Promise<CaseDetail> {
    return cachedFetch<CaseDetail>(`case_detail_${caseId}`, 8000, async () => {
      const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}`);
      return handleResponse<CaseDetail>(res);
    });
  },

  async createCase(payload: CaseCreatePayload): Promise<Case> {
    _apiCache.delete('list_cases');
    const res = await authFetch(`${API_BASE}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Case>(res);
  },

  async deleteCase(caseId: string): Promise<any> {
    _apiCache.delete('list_cases');
    _apiCache.delete(`case_detail_${caseId}`);
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'DELETE',
    });
    return handleResponse<any>(res);
  },

  async deleteAllCases(): Promise<any> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/cases`, {
      method: 'DELETE',
    });
    return handleResponse<any>(res);
  },

  async uploadEvidenceFile(caseId: string, file: File, notes?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (notes) formData.append('notes', notes);

    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<any>(res);
  },

  // === NFC CRIME SCENE EVIDENCE ===
  async getNfcScannerStatus(caseId: string): Promise<NFCScannerStatus> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence/nfc/status`);
    return handleResponse<NFCScannerStatus>(res);
  },

  async getNfcFixtures(caseId: string): Promise<{ fixtures: NFCFixtureCard[] }> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence/nfc/fixtures`);
    return handleResponse<{ fixtures: NFCFixtureCard[] }>(res);
  },

  async submitNfcAcquisition(caseId: string, payload: NFCAcquisitionPayload): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence/nfc/acquisitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async getNfcAcquisitionDossier(caseId: string, acquisitionId: string): Promise<NFCAcquisitionDossier> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence/nfc/acquisitions/${encodeURIComponent(acquisitionId)}`);
    return handleResponse<NFCAcquisitionDossier>(res);
  },

  // === INGESTION & PIPELINE ===
  async triggerAllIngestion(caseId?: string): Promise<any> {
    const url = caseId
      ? `${API_BASE}/api/ingest/trigger_all?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/ingest/trigger_all`;
    const res = await authFetch(url, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async getIngestedEvents(caseId?: string, limit: number = 20): Promise<any[]> {
    const url = caseId 
      ? `${API_BASE}/api/ingest/events?case_id=${encodeURIComponent(caseId)}&limit=${limit}`
      : `${API_BASE}/api/ingest/events?limit=${limit}`;
    const res = await authFetch(url);
    return handleResponse<any[]>(res);
  },

  // === ENTITY RESOLUTION ===
  async executeZinggER(caseId?: string): Promise<any> {
    const url = caseId 
      ? `${API_BASE}/api/zingg/execute?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/zingg/execute`;
    const res = await authFetch(url, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async getGoldenProfiles(caseId?: string): Promise<GoldenProfile[]> {
    const key = `golden_profiles_${caseId || 'default'}`;
    return cachedFetch<GoldenProfile[]>(key, 8000, async () => {
      const url = caseId 
        ? `${API_BASE}/api/system/golden_profiles?case_id=${encodeURIComponent(caseId)}`
        : `${API_BASE}/api/system/golden_profiles`;
      const res = await authFetch(url);
      return handleResponse<GoldenProfile[]>(res);
    });
  },

  // === GRAPH TOPOLOGY ===
  async syncGraph(caseId?: string): Promise<any> {
    _apiCache.delete(`graph_topology_${caseId || 'default'}`);
    const url = caseId 
      ? `${API_BASE}/api/graph/sync?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/graph/sync`;
    const res = await authFetch(url, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async getGraphTopology(caseId?: string, communityId?: number | string): Promise<GraphTopology> {
    const key = `graph_topology_${caseId || 'default'}_${communityId ?? 'all'}`;
    return cachedFetch<GraphTopology>(key, 10000, async () => {
      try {
        const searchParams = new URLSearchParams();
        if (caseId) searchParams.append('case_id', caseId);
        if (communityId !== undefined && communityId !== null) searchParams.append('community_id', String(communityId));
        const url = `${API_BASE}/api/graph/topology?${searchParams.toString()}`;
        const res = await authFetch(url);
        return await handleResponse<GraphTopology>(res);
      } catch (err) {
        console.warn('Graph topology retrieval skipped/fallback:', err);
        return { nodes: [], edges: [] };
      }
    });
  },

  async addConnectedRelation(payload: {
    case_id?: string;
    source_node_id: string;
    source_node_type?: string;
    source_node_label?: string;
    target_node_type: string;
    target_node_value: string;
    target_node_attributes?: Record<string, any>;
    relationship_type: string;
    direction?: 'outgoing' | 'incoming' | 'bidirectional';
    relationship_attributes?: Record<string, any>;
    rerun_pipeline?: boolean;
  }): Promise<{
    status: string;
    message: string;
    created_node: any;
    created_relationship: any;
    pipeline_result?: any;
  }> {
    const res = await authFetch(`${API_BASE}/api/graph/nodes/add-relation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await handleResponse<any>(res);
    this.invalidateCache();
    return data;
  },

  invalidateCache(pattern?: string): void {
    if (!pattern) {
      _apiCache.clear();
    } else {
      for (const key of Array.from(_apiCache.keys())) {
        if (key.includes(pattern)) {
          _apiCache.delete(key);
        }
      }
    }
  },

  // === TIMELINE & GEOSPATIAL ===
  async getGeoSyncData(caseId?: string): Promise<GeoSyncData> {
    const url = caseId 
      ? `${API_BASE}/api/geo/sync-data?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/geo/sync-data`;
    const res = await authFetch(url);
    return handleResponse<GeoSyncData>(res);
  },

  // === ANOMALY INTELLIGENCE ===
  async getDetectorHealth(): Promise<DetectorHealthResponse> {
    return cachedFetch<DetectorHealthResponse>('detector_health', 15000, async () => {
      const res = await authFetch(`${API_BASE}/api/anomalies/health`);
      return handleResponse<DetectorHealthResponse>(res);
    });
  },

  async getAnomalyStats(caseId?: string): Promise<AnomalyStats> {
    const key = `anomaly_stats_${caseId || 'default'}`;
    return cachedFetch<AnomalyStats>(key, 8000, async () => {
      const url = caseId 
        ? `${API_BASE}/api/anomalies/stats?case_id=${encodeURIComponent(caseId)}`
        : `${API_BASE}/api/anomalies/stats`;
      const res = await authFetch(url);
      return handleResponse<AnomalyStats>(res);
    });
  },

  async getAnomalies(params?: { search?: string; limit?: number; caseId?: string }): Promise<{ anomalies: AnomalyFinding[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.caseId) query.append('case_id', params.caseId);

    const url = `${API_BASE}/api/anomalies${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await authFetch(url);
    return handleResponse<{ anomalies: AnomalyFinding[]; total: number }>(res);
  },

  async getAnomalyById(findingId: string): Promise<AnomalyFinding> {
    const res = await authFetch(`${API_BASE}/api/anomalies/${encodeURIComponent(findingId)}`);
    return handleResponse<AnomalyFinding>(res);
  },

  async runAnomalyAnalysis(caseId?: string): Promise<{ message: string; result: AnomalyRunResult }> {
    const url = caseId 
      ? `${API_BASE}/api/anomalies/analyze?case_id=${encodeURIComponent(caseId)}&sync=true`
      : `${API_BASE}/api/anomalies/analyze?sync=true`;
    const res = await authFetch(url, { method: 'POST' });
    return handleResponse<{ message: string; result: AnomalyRunResult }>(res);
  },

  async getCaseSummary(caseId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/cases/${encodeURIComponent(caseId)}/summary`);
    return handleResponse<any>(res);
  },

  async getCaseSignals(caseId: string, limit: number = 200): Promise<{ case_id: string; total_signals: number; signals: any[] }> {
    const res = await authFetch(`${API_BASE}/api/anomalies/cases/${encodeURIComponent(caseId)}/signals?limit=${limit}`);
    return handleResponse<{ case_id: string; total_signals: number; signals: any[] }>(res);
  },

  async getFindingEvidence(findingId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/evidence`);
    return handleResponse<any>(res);
  },

  async getFindingTimeline(findingId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/timeline`);
    return handleResponse<any>(res);
  },

  async getFindingGraphContext(findingId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/graph-context`);
    return handleResponse<any>(res);
  },

  async getFindingSpatialContext(findingId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/spatial-context`);
    return handleResponse<any>(res);
  },

  // === SYSTEM RESET ===
  async resetSystem(): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/system/reset`, { method: 'POST' });
    return handleResponse<any>(res);
  },

  // === TIMELINE & DIGITAL FOOTPRINT RECONSTRUCTION ===
  async getTimelineEvents(params: {
    case_id?: string;
    entities?: string[];
    domains?: string[];
    event_types?: string[];
    start_time?: string;
    end_time?: string;
    risk?: string[];
    only_anomalies?: boolean;
    min_confidence?: number;
    search?: string;
    zoom?: string;
    limit?: number;
    offset?: number;
  }): Promise<TimelineQueryResponse> {
    const query = new URLSearchParams();
    if (params.case_id) query.append('case_id', params.case_id);
    if (params.entities && params.entities.length > 0) query.append('entities', params.entities.join(','));
    if (params.domains && params.domains.length > 0) query.append('domains', params.domains.join(','));
    if (params.event_types && params.event_types.length > 0) query.append('event_types', params.event_types.join(','));
    if (params.start_time) query.append('start_time', params.start_time);
    if (params.end_time) query.append('end_time', params.end_time);
    if (params.risk && params.risk.length > 0) query.append('risk', params.risk.join(','));
    if (params.only_anomalies) query.append('only_anomalies', 'true');
    if (params.min_confidence !== undefined) query.append('min_confidence', params.min_confidence.toString());
    if (params.search) query.append('search', params.search);
    if (params.zoom) query.append('zoom', params.zoom);
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.offset) query.append('offset', params.offset.toString());

    const url = `${API_BASE}/api/timeline/events${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await authFetch(url);
    return handleResponse<TimelineQueryResponse>(res);
  },

  async getTimelineEventDetail(eventId: string, caseId?: string): Promise<TimelineCanonicalEvent> {
    const url = caseId
      ? `${API_BASE}/api/timeline/events/${encodeURIComponent(eventId)}?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/timeline/events/${encodeURIComponent(eventId)}`;
    const res = await authFetch(url);
    return handleResponse<TimelineCanonicalEvent>(res);
  },

  async getTimelineEventContext(eventId: string, windowMinutes: number = 15, caseId?: string): Promise<{
    target_event: TimelineCanonicalEvent;
    window_minutes: number;
    context_events: TimelineCanonicalEvent[];
  }> {
    const query = new URLSearchParams({ window_minutes: windowMinutes.toString() });
    if (caseId) query.append('case_id', caseId);
    const url = `${API_BASE}/api/timeline/events/${encodeURIComponent(eventId)}/context?${query.toString()}`;
    const res = await authFetch(url);
    return handleResponse<any>(res);
  },

  async getTimelineCorrelations(caseId?: string): Promise<TemporalCorrelation[]> {
    const url = caseId
      ? `${API_BASE}/api/timeline/correlations?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/timeline/correlations`;
    const res = await authFetch(url);
    return handleResponse<TemporalCorrelation[]>(res);
  },

  async getTimelineBursts(caseId?: string): Promise<ActivityBurst[]> {
    const url = caseId
      ? `${API_BASE}/api/timeline/bursts?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/timeline/bursts`;
    const res = await authFetch(url);
    return handleResponse<ActivityBurst[]>(res);
  },

  async getTimelineInconsistencies(caseId?: string): Promise<TemporalInconsistency[]> {
    const url = caseId
      ? `${API_BASE}/api/timeline/inconsistencies?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/timeline/inconsistencies`;
    const res = await authFetch(url);
    return handleResponse<TemporalInconsistency[]>(res);
  },

  async getTimelineStorylines(caseId?: string): Promise<StorylineSequence[]> {
    const url = caseId
      ? `${API_BASE}/api/timeline/storylines?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/timeline/storylines`;
    const res = await authFetch(url);
    return handleResponse<StorylineSequence[]>(res);
  },

  async getTimelineCompare(entities: string[], caseId?: string): Promise<Record<string, TimelineCanonicalEvent[]>> {
    const query = new URLSearchParams({ entities: entities.join(',') });
    if (caseId) query.append('case_id', caseId);
    const url = `${API_BASE}/api/timeline/compare?${query.toString()}`;
    const res = await authFetch(url);
    return handleResponse<Record<string, TimelineCanonicalEvent[]>>(res);
  },

  // Geospatial Intelligence API
  async getGeoInvestigation(caseId: string, params?: {
    entity_ids?: string[];
    domains?: string[];
    start_time?: string;
    end_time?: string;
    min_confidence?: number;
    bbox?: [number, number, number, number];
  }): Promise<GeoInvestigationResponse> {
    const query = new URLSearchParams({ case_id: caseId });
    if (params?.entity_ids?.length) query.append('entity_ids', params.entity_ids.join(','));
    if (params?.domains?.length) query.append('domains', params.domains.join(','));
    if (params?.start_time) query.append('start_time', params.start_time);
    if (params?.end_time) query.append('end_time', params.end_time);
    if (params?.min_confidence !== undefined) query.append('min_confidence', params.min_confidence.toString());
    if (params?.bbox && params.bbox.length === 4) {
      query.append('min_lng', params.bbox[0].toString());
      query.append('min_lat', params.bbox[1].toString());
      query.append('max_lng', params.bbox[2].toString());
      query.append('max_lat', params.bbox[3].toString());
    }
    const res = await authFetch(`${API_BASE}/api/geo/investigation?${query.toString()}`);
    return handleResponse<GeoInvestigationResponse>(res);
  },

  async getGeoMovements(caseId: string, entityIds?: string[]): Promise<MovementSegment[]> {
    const query = new URLSearchParams({ case_id: caseId });
    if (entityIds?.length) query.append('entity_ids', entityIds.join(','));
    const res = await authFetch(`${API_BASE}/api/geo/movements?${query.toString()}`);
    return handleResponse<MovementSegment[]>(res);
  },

  async getGeoCoLocations(caseId: string): Promise<CoLocationFinding[]> {
    const res = await authFetch(`${API_BASE}/api/geo/co-locations?case_id=${encodeURIComponent(caseId)}`);
    return handleResponse<CoLocationFinding[]>(res);
  },

  async getGeoCommonPlaces(caseId: string): Promise<CommonPlace[]> {
    const res = await authFetch(`${API_BASE}/api/geo/common-places?case_id=${encodeURIComponent(caseId)}`);
    return handleResponse<CommonPlace[]>(res);
  },

  async postGeoAreaQuery(payload: {
    case_id: string;
    center_lat: number;
    center_lng: number;
    radius_meters?: number;
    start_time?: string;
    end_time?: string;
  }): Promise<AreaInvestigationResult> {
    const res = await authFetch(`${API_BASE}/api/geo/area-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<AreaInvestigationResult>(res);
  },

  async getGeoSegmentContext(caseId: string, eventId: string, windowSeconds: number = 1800): Promise<any> {
    const query = new URLSearchParams({
      case_id: caseId,
      event_id: eventId,
      window_seconds: windowSeconds.toString()
    });
    const res = await authFetch(`${API_BASE}/api/geo/segment-context?${query.toString()}`);
    return handleResponse<any>(res);
  },

  async exportGeoDossier(caseId: string, format: 'geojson' | 'json' = 'geojson'): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/geo/export?case_id=${encodeURIComponent(caseId)}&format=${format}`);
    return handleResponse<any>(res);
  },

  // === CCTV LOCATION & ROUTE INTELLIGENCE ===
  async getCCTVContext(caseId: string): Promise<CCTVIncidentLocation> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/context`);
    return handleResponse<CCTVIncidentLocation>(res);
  },

  async analyzeCCTV(caseId: string, payload: {
    latitude: number;
    longitude: number;
    address?: string;
    sector?: string;
    landmark?: string;
    incident_date?: string;
    incident_time?: string;
    search_radius_meters?: number;
  }): Promise<CCTVIntelligenceResponse> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<CCTVIntelligenceResponse>(res);
  },

  async getCCTVResults(caseId: string): Promise<CCTVIntelligenceResponse> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/results`);
    return handleResponse<CCTVIntelligenceResponse>(res);
  },

  async verifyCCTVSource(caseId: string, sourceId: string, payload: {
    new_status: string;
    reason?: string;
    camera_count_confirmed?: number;
    notes?: string;
  }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/sources/${encodeURIComponent(sourceId)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async addManualCCTVSource(caseId: string, payload: {
    name: string;
    category?: string;
    owner_type?: string;
    address?: string;
    latitude: number;
    longitude: number;
    phone?: string;
    notes?: string;
    cctv_present?: boolean;
  }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/sources/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async addCCTVSourceToCase(caseId: string, sourceId: string, payload?: {
    item_type?: string;
    notes?: string;
  }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/sources/${encodeURIComponent(sourceId)}/add-to-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || { item_type: 'SOURCE' })
    });
    return handleResponse<any>(res);
  },

  async updateCCTVLocation(caseId: string, payload: any): Promise<CCTVIntelligenceResponse> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/cctv/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<CCTVIntelligenceResponse>(res);
  },

  // === IDENTITY & ACCESS MANAGEMENT (IAM) ===
  async login(payload: { identifier: string; password: string }): Promise<AuthStateResponse> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AuthStateResponse>(res);
  },

  async register(payload: {
    employee_id: string;
    full_name: string;
    official_email: string;
    password: string;
    role_name?: string;
    unit_id?: string;
    phone_number?: string;
  }): Promise<AuthStateResponse> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AuthStateResponse>(res);
  },

  async verifyInvite(token: string): Promise<{
    valid: boolean;
    invitation_id: string;
    official_email: string;
    employee_id: string;
    full_name: string;
    role_name: string;
    role_display: string;
    unit_name: string;
    expires_at: string;
  }> {
    const res = await authFetch(`${API_BASE}/api/auth/invite/verify?token=${encodeURIComponent(token)}`);
    return handleResponse<any>(res);
  },

  async acceptInvite(payload: { token: string; password: string }): Promise<AuthStateResponse> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/invite/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AuthStateResponse>(res);
  },

  async verifyMfa(payload: { challenge_token: string; code: string; is_backup_code?: boolean }): Promise<AuthStateResponse> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AuthStateResponse>(res);
  },

  async getMe(): Promise<AuthStateResponse> {
    const res = await authFetch(`${API_BASE}/api/auth/me`);
    return handleResponse<AuthStateResponse>(res);
  },

  async logout(): Promise<any> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async changePassword(payload: { current_password: string; new_password: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/auth/password/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async setupMfa(): Promise<{ secret: string; provisioning_uri: string; backup_codes: string[]; message: string }> {
    const res = await authFetch(`${API_BASE}/api/auth/mfa/setup`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async confirmMfa(code: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/auth/mfa/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    return handleResponse<any>(res);
  },

  async getActiveSessions(): Promise<{ sessions: UserSession[] }> {
    const res = await authFetch(`${API_BASE}/api/auth/sessions`);
    return handleResponse<any>(res);
  },

  // === ADMIN & USER MANAGEMENT ===
  async getUsers(params?: { unit_id?: string; role?: string; status?: string; search?: string }): Promise<{ users: UserProfile[] }> {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await authFetch(`${API_BASE}/api/admin/users${query ? `?${query}` : ''}`);
    return handleResponse<any>(res);
  },

  async getRoles(): Promise<{ roles: Array<{ name: string; display_name: string; description: string; permissions: string[] }> }> {
    const res = await authFetch(`${API_BASE}/api/admin/roles`);
    return handleResponse<any>(res);
  },

  async getUnits(): Promise<{ units: Array<{ id: string; name: string; code: string; description: string }> }> {
    const res = await authFetch(`${API_BASE}/api/admin/units`);
    return handleResponse<any>(res);
  },

  async inviteUser(payload: {
    employee_id: string;
    full_name: string;
    official_email: string;
    role_name: string;
    unit_id?: string;
    phone_number?: string;
  }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async updateUserStatus(userId: string, status: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<any>(res);
  },

  async approveUser(userId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<any>(res);
  },

  async rejectUser(userId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<any>(res);
  },

  async updateUserRole(userId: string, roleName: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_name: roleName }),
    });
    return handleResponse<any>(res);
  },

  async updateUserUnit(userId: string, unitId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/unit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: unitId }),
    });
    return handleResponse<any>(res);
  },

  async revokeSession(sessionId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    return handleResponse<any>(res);
  },

  // === AUDIT TRAIL ===
  async getAuditLogs(params?: {
    action?: string;
    actor?: string;
    role?: string;
    case_id?: string;
    result?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '' && value !== 'undefined') {
          searchParams.append(key, String(value));
        }
      }
    }
    const query = searchParams.toString();
    const res = await authFetch(`${API_BASE}/api/audit/logs${query ? `?${query}` : ''}`);
    return handleResponse<any>(res);
  },

  async getAuditLogDetail(auditId: string): Promise<AuditLogEntry> {
    const res = await authFetch(`${API_BASE}/api/audit/logs/${encodeURIComponent(auditId)}`);
    return handleResponse<AuditLogEntry>(res);
  },

  async getAuditStats(): Promise<AuditStats> {
    const res = await authFetch(`${API_BASE}/api/audit/stats`);
    return handleResponse<AuditStats>(res);
  },

  async verifyAuditChain(limit: number = 5000): Promise<AuditVerifyResult> {
    const res = await authFetch(`${API_BASE}/api/audit/verify?limit=${limit}`);
    return handleResponse<AuditVerifyResult>(res);
  },

  async getCaseActivityTimeline(caseId: string, actionFilter?: string): Promise<{ case_id: string; total_records: number; activities: any[] }> {
    const query = actionFilter ? `?action_filter=${encodeURIComponent(actionFilter)}` : '';
    const res = await authFetch(`${API_BASE}/api/audit/cases/${encodeURIComponent(caseId)}/timeline${query}`);
    return handleResponse<any>(res);
  },

  async getUserActivity(userId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/audit/users/${encodeURIComponent(userId)}/activity`);
    return handleResponse<any>(res);
  },

  async exportAuditLogs(format: string = 'csv'): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/audit/export?format=${encodeURIComponent(format)}`);
    if (!res.ok) {
      throw new Error(`Audit Export Failed (${res.status}): ${res.statusText}`);
    }
    return res.blob();
  },

  // === EVIDENCE FORENSIC OPERATIONS ===
  async downloadEvidence(evidenceId: string): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/cases/evidence/${encodeURIComponent(evidenceId)}/download`);
    if (!res.ok) {
      throw new Error(`Evidence Download Failed (${res.status}): ${res.statusText}`);
    }
    return res.blob();
  },

  async exportEvidence(evidenceId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/evidence/${encodeURIComponent(evidenceId)}/export`);
    return handleResponse<any>(res);
  },

  // === ENTITY RESOLUTION MERGE & SPLIT ===
  async mergeEntities(payload: { case_id: string; target_cluster_id: string; source_cluster_ids: string[]; reason?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/zingg/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  async splitEntities(payload: { case_id: string; cluster_id: string; new_cluster_id: string; primary_name?: string; detached_phones?: string[]; detached_accounts?: string[]; detached_emails?: string[]; reason?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/zingg/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // === CASE MEMBERSHIP ===
  async getCaseMembers(caseId: string): Promise<{ case_id: string; members: any[] }> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/members`);
    return handleResponse<any>(res);
  },

  async assignCaseMember(caseId: string, payload: { user_id: string; case_role: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
  },

  async removeCaseMember(caseId: string, userId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    return handleResponse<any>(res);
  },

  // === FINDINGS APPROVAL HIERARCHY ===
  async approveFinding(findingId: string, notes?: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    return handleResponse<any>(res);
  },

  async dismissFinding(findingId: string, reason?: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/anomalies/findings/${encodeURIComponent(findingId)}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return handleResponse<any>(res);
  },

  // === NFC CARD AUTHENTICATION & MANAGEMENT ===
  async initiateNfcAuth(credential: string): Promise<NFCInitiateResponse> {
    const res = await authFetch(`${API_BASE}/api/auth/nfc/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    return handleResponse<NFCInitiateResponse>(res);
  },

  async verifyNfcPin(transactionId: string, pin: string): Promise<NFCVerifyPinResponse> {
    const res = await authFetch(`${API_BASE}/api/auth/nfc/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, pin }),
    });
    return handleResponse<NFCVerifyPinResponse>(res);
  },

  async getNfcDevCards(): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/api/auth/nfc/dev-cards`);
    return handleResponse<any[]>(res);
  },

  async listNfcCards(): Promise<NFCCardRecord[]> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards`);
    return handleResponse<NFCCardRecord[]>(res);
  },

  async issueNfcCard(userId: string, pin: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, pin }),
    });
    return handleResponse<any>(res);
  },

  async activateNfcCard(cardId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards/${encodeURIComponent(cardId)}/activate`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async suspendNfcCard(cardId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards/${encodeURIComponent(cardId)}/suspend`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async revokeNfcCard(cardId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards/${encodeURIComponent(cardId)}/revoke`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },

  async replaceNfcCard(cardId: string, newPin: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/admin/nfc-cards/${encodeURIComponent(cardId)}/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_pin: newPin }),
    });
    return handleResponse<any>(res);
  },

  // === CASE MANAGEMENT & EXTRA UTILITIES ===
  async signup(payload: {
    full_name: string;
    official_email: string;
    password: string;
    employee_id?: string;
    role_name?: string;
    phone_number?: string;
    unit_code?: string;
  }): Promise<AuthStateResponse> {
    _apiCache.clear();
    const res = await authFetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AuthStateResponse>(res);
  },


  async updateCase(caseId: string, payload: { title?: string; description?: string; status?: string; case_reference?: string }): Promise<Case> {
    _apiCache.delete('list_cases');
    _apiCache.delete(`case_detail_${caseId}`);
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Case>(res);
  },


  async getCaseEvidence(caseId: string): Promise<{ case_id: string; case_reference: string; evidence_count: number; evidence: EvidenceItem[] }> {
    _apiCache.delete(`case_evidence_${caseId}`);
    const res = await authFetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/evidence`);
    return handleResponse<{ case_id: string; case_reference: string; evidence_count: number; evidence: EvidenceItem[] }>(res);
  },

  // === AUTOMATED CEP ALERTS (FEATURE 8) ===
  async evaluateAlerts(caseId?: string): Promise<{ status: string; count: number; alerts: CEPAlert[] }> {
    const url = caseId 
      ? `${API_BASE}/api/v1/alerts/evaluate?case_id=${encodeURIComponent(caseId)}`
      : `${API_BASE}/api/v1/alerts/evaluate`;
    const res = await authFetch(url, { method: 'POST' });
    return handleResponse<any>(res);
  },

  async getAlerts(caseId?: string, status?: string, riskLevel?: string): Promise<{ case_id: string; total: number; alerts: CEPAlert[] }> {
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    if (status && status !== 'ALL') params.append('status', status);
    if (riskLevel && riskLevel !== 'ALL') params.append('risk_level', riskLevel);
    const url = `${API_BASE}/api/v1/alerts${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await authFetch(url);
    return handleResponse<any>(res);
  },

  async triageAlert(alertId: string, status: string, notes?: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/api/v1/alerts/${encodeURIComponent(alertId)}/triage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes })
    });
    return handleResponse<any>(res);
  },

  // === ADVANCED OMNI-SEARCH & NL QUERY (FEATURE 9) ===
  async omniSearch(payload: {
    query: string;
    case_id?: string;
    match_mode?: 'all' | 'exact' | 'fuzzy';
    mode?: 'all' | 'exact' | 'fuzzy';
    filters?: Record<string, any>;
    min_confidence?: number;
    time_buffer_mins?: number;
    temporal_anchor?: string;
    min_risk?: number;
    min_degree?: number;
  }): Promise<OmniSearchResponse> {
    const formattedPayload = {
      query: payload.query,
      case_id: payload.case_id,
      match_mode: payload.match_mode || payload.mode || 'exact',
      filters: payload.filters || {
        min_confidence: payload.min_confidence,
        time_window_mins: payload.time_buffer_mins,
        min_risk_score: payload.min_risk,
        min_degree: payload.min_degree
      }
    };
    const res = await authFetch(`${API_BASE}/api/v1/search/omni`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formattedPayload)
    });
    return handleResponse<OmniSearchResponse>(res);
  },

  async nlQuery(payload: {
    prompt: string;
    case_id?: string;
  }): Promise<NLQueryResponse> {
    const res = await authFetch(`${API_BASE}/api/v1/search/nl-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<NLQueryResponse>(res);
  },

  async getSearchHistory(caseId?: string, limit: number = 10): Promise<{ history: SearchHistoryItem[] }> {
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    params.append('limit', limit.toString());
    const res = await authFetch(`${API_BASE}/api/v1/search/history?${params.toString()}`);
    return handleResponse<any>(res);
  },

  // === AI FORENSIC CHATBOT (VOICE + TEXT) ===
  async sendChatMessage(payload: {
    message: string;
    case_id?: string;
    history?: Array<{ role: string; content: string }>;
  }): Promise<ChatbotResponse> {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/chatbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await handleResponse<ChatbotResponse>(res);
    } catch (err: any) {
      // Resilient failover: If Next.js proxy dropped socket or timed out, attempt direct backend connection
      if (typeof window !== 'undefined' && !API_BASE) {
        try {
          const directUrl = `http://${window.location.hostname}:8000/api/v1/chatbot/chat`;
          const directRes = await fetch(directUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
          });
          return await handleResponse<ChatbotResponse>(directRes);
        } catch {
          // Fall through to throw original error
        }
      }
      throw err;
    }
  },

  async getChatHistory(caseId?: string): Promise<{ case_id: string | null; count: number; messages: any[] }> {
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    const res = await authFetch(`${API_BASE}/api/v1/chatbot/history?${params.toString()}`);
    return handleResponse<{ case_id: string | null; count: number; messages: any[] }>(res);
  },

  async clearChatHistory(caseId?: string): Promise<{ status: string; case_id: string | null; cleared: number }> {
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    const res = await authFetch(`${API_BASE}/api/v1/chatbot/history?${params.toString()}`, {
      method: 'DELETE'
    });
    return handleResponse<{ status: string; case_id: string | null; cleared: number }>(res);
  },

  // === REPORTING & EVIDENCE MANAGEMENT (FEATURE 10) ===
  async getCourtDossierData(params?: {
    caseId?: string;
    investigatorName?: string;
    investigatorId?: string;
    agencyName?: string;
    classification?: string;
  }): Promise<CourtDossierData> {
    const searchParams = new URLSearchParams();
    if (params?.caseId) searchParams.append('case_id', params.caseId);
    if (params?.investigatorName) searchParams.append('investigator_name', params.investigatorName);
    if (params?.investigatorId) searchParams.append('investigator_id', params.investigatorId);
    if (params?.agencyName) searchParams.append('agency_name', params.agencyName);
    if (params?.classification) searchParams.append('classification', params.classification);
    const res = await authFetch(`${API_BASE}/api/reports/court-dossier-data?${searchParams.toString()}`);
    return handleResponse<CourtDossierData>(res);
  },

  async downloadCourtDossierPdf(params?: {
    caseId?: string;
    title?: string;
    investigatorName?: string;
    investigatorId?: string;
    agencyName?: string;
    classification?: string;
  } | string, titleArg?: string): Promise<Blob> {
    const searchParams = new URLSearchParams();
    if (typeof params === 'string') {
      searchParams.append('case_id', params);
      if (titleArg) searchParams.append('title', titleArg);
    } else if (params) {
      if (params.caseId) searchParams.append('case_id', params.caseId);
      if (params.title) searchParams.append('title', params.title);
      if (params.investigatorName) searchParams.append('investigator_name', params.investigatorName);
      if (params.investigatorId) searchParams.append('investigator_id', params.investigatorId);
      if (params.agencyName) searchParams.append('agency_name', params.agencyName);
      if (params.classification) searchParams.append('classification', params.classification);
    }
    const res = await authFetch(`${API_BASE}/api/reports/pdf?${searchParams.toString()}`);
    if (!res.ok) throw new Error(`PDF Export Failed (${res.status}): ${res.statusText}`);
    return res.blob();
  },

  async downloadSection65BCertificatePdf(params?: { caseId?: string; officerName?: string } | string, officerNameArg?: string): Promise<Blob> {
    return this.downloadSection65bPdf(params, officerNameArg);
  },

  async downloadSection65bPdf(params?: { caseId?: string; officerName?: string } | string, officerNameArg?: string): Promise<Blob> {
    const searchParams = new URLSearchParams();
    if (typeof params === 'string') {
      searchParams.append('case_id', params);
      if (officerNameArg) searchParams.append('officer_name', officerNameArg);
    } else if (params) {
      if (params.caseId) searchParams.append('case_id', params.caseId);
      if (params.officerName) searchParams.append('officer_name', params.officerName);
    }
    const res = await authFetch(`${API_BASE}/api/reports/section-65b?${searchParams.toString()}`);
    if (!res.ok) throw new Error(`Section 65B Export Failed (${res.status}): ${res.statusText}`);
    return res.blob();
  },

  async verifyCustody(caseId?: string): Promise<EvidenceCustodyResponse> {
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    const res = await authFetch(`${API_BASE}/api/reports/verify-custody?${params.toString()}`);
    return handleResponse<EvidenceCustodyResponse>(res);
  }
};

export const api = apiClient;

// ==========================================
// GEOSPATIAL INTELLIGENCE INTERFACES
// ==========================================

export const GeoLocationType = {
  GPS: 'GPS',
  CELL_TOWER: 'CELL_TOWER',
  ATM: 'ATM',
  BANK_BRANCH: 'BANK_BRANCH',
  MERCHANT: 'MERCHANT',
  SOCIAL_GEOTAG: 'SOCIAL_GEOTAG',
  IP_GEOLOCATION: 'IP_GEOLOCATION',
  UNKNOWN: 'UNKNOWN'
} as const;

export type GeoLocationType = (typeof GeoLocationType)[keyof typeof GeoLocationType];

export interface GeoCanonicalEvent {
  geo_event_id: string;
  event_id: string;
  case_id: string;
  entity_id?: string;
  entity_name?: string;
  timestamp: string;
  timestamp_ms: number;
  raw_timestamp: string;
  timezone_offset?: string;
  location_type: GeoLocationType;
  latitude: number;
  longitude: number;
  accuracy_radius_meters: number;
  location_confidence: number;
  location_name?: string;
  address?: string;
  cell_tower_id?: string;
  device_id?: string;
  domain: string;
  event_type: string;
  raw_evidence_id: string;
  evidence_filename?: string;
  evidence_sha256?: string;
  anomaly_score: number;
  anomaly_reasons: string[];
  epistemic_status: string;
  metadata: Record<string, any>;
  created_at?: string;
}

export interface MovementSegment {
  segment_id: string;
  entity_id: string;
  entity_name?: string;
  from_event_id: string;
  to_event_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  start_coords: [number, number]; // [lng, lat]
  end_coords: [number, number];   // [lng, lat]
  distance_km: number;
  speed_kmh: number;
  is_gap: boolean;
  gap_reason?: string;
  path_points: [number, number][];
}

export interface CoLocationFinding {
  co_location_id: string;
  case_id: string;
  co_location_type: string;
  entity_ids: string[];
  entity_names: string[];
  start_time: string;
  end_time: string;
  duration_seconds: number;
  latitude: number;
  longitude: number;
  location_name?: string;
  cell_tower_id?: string;
  distance_between_meters: number;
  occurrence_count: number;
  distinct_days_count: number;
  correlation_score: number;
  supporting_events: string[];
  epistemic_note: string;
}

export interface CommonPlace {
  place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  location_type: GeoLocationType;
  radius_meters: number;
  total_visits: number;
  unique_entities: string[];
  unique_entity_count: number;
  entity_visit_counts: Record<string, number>;
  time_spans: string[];
  dominant_domain: string;
}

export interface ActivityDensityCell {
  cell_id: string;
  latitude: number;
  longitude: number;
  event_count: number;
  entity_count: number;
  domains: Record<string, number>;
}

export interface SpatialStoryCard {
  card_id: string;
  entity_id: string;
  entity_name?: string;
  step_index: number;
  timestamp: string;
  time_range_formatted: string;
  location_name: string;
  coordinates: [number, number]; // [lat, lng]
  action_summary: string;
  distance_from_previous_km?: number;
  travel_time_from_previous_sec?: number;
  implied_speed_kmh?: number;
  evidence_refs: string[];
  anomalies: string[];
}

export interface AreaInvestigationResult {
  center: [number, number];
  radius_meters: number;
  start_time?: string;
  end_time?: string;
  entities_present: Array<{
    entity_id: string;
    name: string;
    event_count: number;
    first_seen: string;
    last_seen: string;
    confidence: number;
    primary_domains: string[];
  }>;
  events_inside: GeoCanonicalEvent[];
  domain_distribution: Record<string, number>;
  total_events: number;
  total_entities: number;
}

export interface GeoInvestigationResponse {
  case_id: string;
  total_events: number;
  events: GeoCanonicalEvent[];
  movements: MovementSegment[];
  co_locations: CoLocationFinding[];
  common_places: CommonPlace[];
  density_grid: ActivityDensityCell[];
  story_cards: SpatialStoryCard[];
  summary_metrics: Record<string, any>;
  trips_waypoints?: any[];
}

// ==========================================
// CCTV LOCATION & ROUTE INTELLIGENCE INTERFACES
// ==========================================

export interface CCTVIncidentLocation {
  address?: string;
  sector?: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  incident_date?: string;
  incident_time?: string;
  incident_type?: string;
  location_source?: string;
}

export interface CCTVSource {
  id: string;
  name: string;
  type: 'GOVERNMENT_CCTV' | 'GOVERNMENT_DEPLOYMENT' | 'POTENTIAL_PRIVATE' | 'INVESTIGATOR_VERIFIED';
  category: string;
  status: 'VERIFIED' | 'GOVERNMENT_DEPLOYMENT_EVIDENCE' | 'POTENTIAL' | 'INVESTIGATOR_VERIFIED' | 'ABSENT' | 'UNKNOWN';
  address?: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  phone?: string;
  website?: string;
  why_relevant: string;
  source_provenance: string;
  tender_reference?: string;
  camera_count?: number;
  deployment_precision?: string;
  is_verified: boolean;
  is_added_to_case: boolean;
  coverage_area_geometry?: any;
}

export interface CCTVCoverageGap {
  gap_id: string;
  road_name: string;
  start_coord: [number, number];
  end_coord: [number, number];
  distance_meters: number;
  explanation: string;
}

export interface CCTVSequenceItem {
  sequence_order: number;
  source_id: string;
  source_name: string;
  source_type: string;
  road_name: string;
  distance_from_start_meters: number;
  estimated_observation_window: string;
  why_relevant: string;
}

export interface RouteHypothesis {
  route_id: string;
  route_name: string;
  route_type: 'APPROACH' | 'DEPARTURE' | 'BOTH';
  origin_area: string;
  destination: string;
  direction: string;
  distance_km: number;
  distance_meters: number;
  estimated_travel_time_min: string;
  estimated_travel_time_seconds: number;
  surveillance_sources_count: number;
  government_count: number;
  private_count: number;
  coverage_score: 'High' | 'Medium' | 'Low';
  coverage_score_num: number;
  coverage_gaps_count: number;
  coverage_gaps: CCTVCoverageGap[];
  why_relevant: string;
  relevance_score: number;
  is_recommended: boolean;
  route_geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  cctv_sequence: CCTVSequenceItem[];
}

export interface CCTVIntelligenceSummary {
  total_sources: number;
  government_sources: number;
  private_sources: number;
  verified_sources: number;
  possible_routes: number;
  approach_routes: number;
  departure_routes: number;
  coverage_gaps: number;
  recommended_route_id?: string;
  recommended_starting_point?: string;
}

export interface CCTVIntelligenceResponse {
  case_id: string;
  incident_location: CCTVIncidentLocation;
  summary: CCTVIntelligenceSummary;
  sources: CCTVSource[];
  routes: RouteHypothesis[];
  deployment_polygons: Array<{
    id: string;
    name: string;
    sector?: string;
    coordinates: [number, number][];
  }>;
}

// ==========================================
// AUTOMATED CEP ALERTS TYPES (FEATURE 8)
// ==========================================
export interface CEPAlertMicroTimelineItem {
  step: number;
  type: string;
  icon: string;
  label: string;
  timestamp: string;
  details?: string;
}

export interface CEPAlert {
  alert_id: string;
  case_id: string;
  pattern_name: string;
  entity_id?: string;
  entity_name?: string;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  risk_score: number;
  status: 'PENDING' | 'INVESTIGATING' | 'ASSIGNED' | 'DISMISSED';
  evidence_narrative: string;
  micro_timeline: CEPAlertMicroTimelineItem[];
  metadata_info?: Record<string, any>;
  created_at?: string;
  triaged_at?: string;
  triaged_by?: string;
}

// ==========================================
// ADVANCED OMNI-SEARCH TYPES (FEATURE 9)
// ==========================================
export interface OmniSearchCard {
  entity_id: string;
  primary_name: string;
  type: string;
  risk_score: number;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  known_aliases: string[];
  verified_phones: string[];
  bank_accounts: string[];
  social_handles: string[];
  match_confidence: number;
  match_reason: string;
  connected_nodes_count: number;
  resolved_person?: {
    name: string;
    cluster_id?: string;
    risk_score?: number;
    role?: string;
  };
  associated_anomalies?: Array<{
    finding_id: string;
    title: string;
    severity: string;
    score: number;
    domain: string;
    detector?: string;
    what_happened?: string;
  }>;
  associated_alerts?: Array<{
    alert_id: string;
    pattern_name: string;
    risk_level: string;
    risk_score: number;
  }>;
  timeline_snippet: Array<{
    type: string;
    icon: string;
    label: string;
    time: string;
  }>;
  graph_pivot_id?: string;
}

export interface OmniSearchResponse {
  query: string;
  detected_type: string;
  classification: {
    type: string;
    normalized: string;
    confidence: number;
    label: string;
  };
  match_mode: string;
  total_results: number;
  cards: OmniSearchCard[];
}

export interface NLQueryResponse {
  prompt: string;
  cypher_query: string;
  case_id: string;
  total_records: number;
  records: any[];
  result_count?: number;
  generated_cypher?: string;
}

export interface SearchHistoryItem {
  id: number;
  query: string;
  detected_type?: string;
  search_mode?: string;
  results_count?: number;
  created_at: string;
}

// ==========================================
// EVIDENCE CUSTODY TYPES (FEATURE 10)
// ==========================================
export interface EvidenceCustodyResponse {
  status: string;
  case_id: string;
  evidence_files_count: number;
  evidence_manifest: Array<{
    filename: string;
    sha256: string;
    file_size: number;
    received_at?: string;
    status: string;
  }>;
  audit_integrity: {
    status: string;
    total_audited: number;
    verified_valid: number;
    legacy_unhashed: number;
    tampered_entries: number;
    tamper_free: boolean;
    verified_at?: string;
  };
  tamper_free: boolean;
  legal_admissibility: string;
  verified_at: string;
}

// ==========================================
// AI FORENSIC CHATBOT TYPES
// ==========================================
export interface ChatbotResolvedEntity {
  id: string;
  name: string;
  type: string;
  risk_score: number;
  cluster_id?: string;
  pivot_id: string;
  details?: string;
}

export interface ChatbotAnomaly {
  finding_id: string;
  title: string;
  severity: string;
  score: number;
  domain: string;
  what_happened?: string;
}

export interface ChatbotAlert {
  pattern_name: string;
  risk_level: string;
  risk_score: number;
  explanation?: string;
}

export interface ChatbotResponse {
  reply: string;
  tool_used?: string;
  generated_cypher?: string;
  sql_query?: string;
  records_count: number;
  records: any[];
  resolved_entities: ChatbotResolvedEntity[];
  anomalies: ChatbotAnomaly[];
  alerts?: ChatbotAlert[];
  suggested_followups: string[];
  model_used: string;
}

// ==========================================
// COURT-READY INVESTIGATION DOSSIER (7 SECTIONS)
// ==========================================

export interface CourtCaseMetadata {
  case_file_id: string;
  case_reference: string;
  agency_name: string;
  investigating_officer_id: string;
  investigating_officer_name: string;
  target_operation_name: string;
  report_generation_timestamp_utc: string;
  report_generation_timestamp_local: string;
  security_classification: string;
}

export interface IngestedEvidenceItem {
  source_file_name: string;
  original_source_system: string;
  records_ingested: string;
  ingestion_timestamp: string;
  primary_sha256_hash: string;
  system_operator_id: string;
}

export interface Section1Custody {
  case_metadata: CourtCaseMetadata;
  evidence_cryptographic_inventory: IngestedEvidenceItem[];
  legal_declaration_statute: string;
  legal_declaration_text: string;
}

export interface RiskScoreComponent {
  weight: number;
  score: number;
  contribution: number;
}

export interface MasterCompositeRiskScore {
  total_composite_score: number;
  risk_level: string;
  formula: string;
  rule_violation_component: RiskScoreComponent;
  anomaly_component: RiskScoreComponent;
  centrality_component: RiskScoreComponent;
}

export interface PipelineExecutionStep {
  step_number: number;
  pipeline_stage: string;
  engine_specification: string;
  execution_status: string;
  integrity_result: string;
}

export interface Section2Synthesis {
  executive_briefing_narrative: string;
  master_composite_risk_score: MasterCompositeRiskScore;
  pipeline_execution_audit: PipelineExecutionStep[];
}

export interface TargetCanonicalProfile {
  canonical_id: string;
  canonical_name: string;
  resolved_aliases: string[];
  primary_contact: string;
  primary_contact_match: string;
  associated_national_id: string;
  national_id_match: string;
  primary_device_imei: string;
  device_imei_match: string;
  mapped_bank_accounts: string[];
  active_ip_subnets: string[];
  entity_link_score: string;
}

export interface DiscrepancyMatrixItem {
  attribute_field: string;
  bank_statement_record: string;
  cdr_record: string;
  social_media_profile: string;
  match_confidence_score: string;
  evidentiary_weight: string;
}

export interface ResolvedEntityItem {
  canonical_id: string;
  primary_name: string;
  known_aliases: string[];
  known_phones: string[];
  known_accounts: string[];
  associated_emails: string[];
  national_ids: string[];
  social_handles: any[];
  known_addresses: string[];
  risk_score: number;
  risk_level: string;
  resolution_method: string;
  last_updated?: string;
}

export interface Section3EntityDossier {
  all_resolved_entities?: ResolvedEntityItem[];
  target_canonical_profile: TargetCanonicalProfile;
  attribute_discrepancy_matrix: DiscrepancyMatrixItem[];
}

export interface AnomalyRegistryItem {
  anomaly_id: string;
  title?: string;
  threat_classification?: string;
  detection_classification: string;
  domain?: string;
  colliding_modalities: string;
  severity?: string;
  unified_score?: number;
  confidence_score: string;
  severity_score?: string;
  detection_engine?: string;
  legal_significance: string;
  status?: string;
}

export interface AnomalyProofBrief {
  brief_code: string;
  title: string;
  severity: string;
  domain?: string;
  what_happened?: string;
  why_unusual?: string;
  why_relevant?: string;
  narrative?: string;
  narrative_proof?: string;
  forensic_indicators?: Record<string, any>;
}

export interface Section4Anomalies {
  flagged_anomaly_registry: AnomalyRegistryItem[];
  deep_dive_proof_briefs: AnomalyProofBrief[];
  high_priority_alerts?: HighPriorityAlert[];
}

export interface HighPriorityAlert {
  alert_id: string;
  pattern_name: string;
  entity_id: string;
  entity_name: string;
  risk_level: string;
  risk_score: number;
  status: string;
  evidence_narrative: string;
  micro_timeline: Array<{
    step?: number;
    type?: string;
    icon?: string;
    label?: string;
    timestamp?: string;
    details?: string;
  }>;
  metadata_info?: Record<string, any>;
  created_at?: string;
}

export interface AiForensicScience {
  report_id?: number;
  community_id?: number;
  status?: string;
  lead_investigator_assessment?: {
    executive_assessment?: string;
    syndicate_workflow?: string[];
    priority_entities?: string[];
    priority_actions?: string[];
    contradictions?: string[];
    evidence_gaps?: string[];
    final_conclusion?: string;
  };
  specialist_agents?: {
    financial_forensics?: {
      analysis_status?: string;
      investigation_summary?: string;
      tactical_conclusion?: string;
      insights?: string[];
    };
    geospatial_forensics?: {
      analysis_status?: string;
      investigation_summary?: string;
      tactical_conclusion?: string;
      insights?: string[];
    };
    temporal_forensics?: {
      analysis_status?: string;
      investigation_summary?: string;
      tactical_conclusion?: string;
      insights?: string[];
    };
  };
}

export interface GdsStructuralMetric {
  node_identifier: string;
  entity_node_id?: string;
  entity_name?: string;
  betweenness_centrality: string;
  pagerank_score: string;
  leiden_community: string;
  leiden_community_cluster?: string;
  inferred_criminal_role: string;
  inferred_network_role?: string;
}

export interface CovertBridgeFinding {
  target_node: string;
  finding_summary: string;
  legal_implication: string;
}

export interface Section5GdsTopology {
  graph_structural_metrics: GdsStructuralMetric[];
  covert_bridge_finding: CovertBridgeFinding;
  gds_key_findings?: {
    covert_bridge_identification?: string;
    leiden_community_detection?: string;
  };
}

export interface MasterEvidenceLogEntry {
  timestamp_utc: string;
  domain: string;
  data_source_domain?: string;
  raw_event_summary: string;
  normalized_entity_id: string;
  anomaly_risk_flag: string;
  evidence_source: string;
}

export interface Section6ChronologicalLog {
  total_events_collated: number;
  evidence_timeline_master: MasterEvidenceLogEntry[];
}

export interface ImmutableAuditRecord {
  activity_id: string;
  investigator_id: string;
  action_type: string;
  parameters: string;
  sha256_signature: string;
}

export interface FinalVerificationSeal {
  generated_pdf_sha256_placeholder: string;
  digital_verification_signature: string;
  attestation_statement: string;
  certifying_officer: string;
  certifying_officer_id: string;
  certifying_badge?: string;
  attestation_date: string;
  verified_at?: string;
  legal_warning: string;
}

export interface Section7AuditAnnexure {
  immutable_user_activity_audit_log: ImmutableAuditRecord[];
  final_verification_seal: FinalVerificationSeal;
}

export interface CourtDossierData {
  case_id: string;
  case_reference: string;
  case_title: string;
  high_priority_alerts?: HighPriorityAlert[];
  ai_forensic_science?: AiForensicScience;
  section_1_custody: Section1Custody;
  section_2_synthesis: Section2Synthesis;
  section_3_entity_dossier: Section3EntityDossier;
  section_4_anomalies: Section4Anomalies;
  section_5_gds_topology: Section5GdsTopology;
  section_6_chronological_log: Section6ChronologicalLog;
  section_7_audit_annexure: Section7AuditAnnexure;
}
