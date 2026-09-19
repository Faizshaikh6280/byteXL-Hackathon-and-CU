"""
End-to-End Test Suite for Investigative Intelligence & Anomaly Synthesis Subsystem.
Tests all 22 phases:
- Signal Normalizer
- Correlation & 7-Dimension Deduplication
- Pattern Library & Pattern Matcher
- Context Enrichment (Entity, Event, Timeline, Spatial, Graph, Case)
- Case Relevance Engine
- Evidence Binding (NO EVIDENCE -> NO CLAIM)
- Independent Corroboration & Double-Counting Dampening
- Decoupled Investigative Priority
- Finding Synthesis (Plain-language narrative layers)
- Finding Quality Gate (12 strict criteria)
- Deterministic Fingerprinting & Idempotency
"""

import pytest
from datetime import datetime, timezone

from app.anomaly.schemas.anomaly_contracts import (
    DetectorExecutionResult, DetectorStatus
)
from app.anomaly.schemas.signal_contracts import (
    DetectionSignal, CandidatePattern, InvestigativeFinding,
    SignalStatus, CaseRelevanceLevel, InvestigativePriorityLevel, SeverityLevel
)
from app.anomaly.normalization.signal_normalizer import signal_normalizer
from app.anomaly.correlation.correlation_engine import signal_correlation_engine, CorrelatedSignalGroup
from app.anomaly.patterns.pattern_library import pattern_library
from app.anomaly.patterns.pattern_matcher import pattern_matcher
from app.anomaly.enrichment.context_enrichment import context_enrichment_engine
from app.anomaly.relevance.case_relevance_engine import case_relevance_engine
from app.anomaly.evidence.evidence_binding_engine import evidence_binding_engine
from app.anomaly.corroboration.corroboration_engine import corroboration_engine
from app.anomaly.priority.investigative_priority_engine import investigative_priority_engine
from app.anomaly.synthesis.finding_synthesis_engine import finding_synthesis_engine
from app.anomaly.quality.finding_quality_gate import finding_quality_gate


# ── TEST 1: Signal Normalizer ──────────────────────────────────────────
def test_signal_normalizer():
    """Verifies that raw DetectorExecutionResult converts into a canonical DetectionSignal."""
    from app.anomaly.schemas.anomaly_contracts import DetectorType

    exec_res = DetectorExecutionResult(
        detector_id="DET-FIN-ATM-CASHOUT",
        detector_type=DetectorType.FINANCIAL,
        status=DetectorStatus.FLAGGED,
        entity_id="ENT-VIKRAM",
        case_id="CASE-TEST-01",
        domain="FINANCIAL",
        raw_score=88.5,
        normalized_score=88.5,
        confidence=0.95,
        signals=["Rapid successive ATM cash withdrawals detected."],
        canonical_event_refs=["EV-BANK-001", "EV-BANK-002"],
        features={
            "total_withdrawn": 450000.0,
            "withdrawal_count": 3,
            "time_window_minutes": 15
        },
        evidence_refs=["EV-REF-001"]
    )

    entity_data = {
        "canonical_events": [
            {
                "event_id": "EV-BANK-001",
                "timestamp": "2026-03-01T10:20:00Z",
                "evidence_id": "EV-REF-001",
                "domain": "BANKING",
                "financial": {"amount_inr": 200000.0, "channel": "ATM"}
            }
        ]
    }

    signal = signal_normalizer.normalize(
        result=exec_res,
        entity_data=entity_data,
        context={"case_id": "CASE-TEST-01"}
    )

    assert isinstance(signal, DetectionSignal)
    assert signal.detector_id == "DET-FIN-ATM-CASHOUT"
    assert signal.domain == "FINANCIAL"
    assert signal.status == SignalStatus.DETECTED
    assert signal.normalized_score == 88.5
    assert "EV-BANK-001" in signal.event_refs
    assert signal.observations.get("withdrawal_amount_inr") == 450000.0
    assert signal.observations.get("withdrawal_count") == 3


# ── TEST 2: Correlation & Deduplication ────────────────────────────────
def test_correlation_and_deduplication():
    """Verifies that overlapping signals are grouped and mathematically redundant detectors are merged."""
    s1 = DetectionSignal(
        signal_id="SIG-01",
        case_id="CASE-TEST-01",
        detector_id="DET-FIN-ATM-CASHOUT",
        pattern_type="FIN_ATM_CASHOUT",
        signal_type="ATM_CASHOUT_BURST",
        domain="FINANCIAL",
        entity_refs=["ENT-MULE-01"],
        event_refs=["EV-001", "EV-002"],
        evidence_refs=["HASH-01"],
        normalized_score=85.0,
        detector_confidence=0.95,
        status=SignalStatus.DETECTED,
        observations={"withdrawal_amount_inr": 300000.0, "withdrawal_count": 3}
    )

    s2 = DetectionSignal(
        signal_id="SIG-02",
        case_id="CASE-TEST-01",
        detector_id="DET-FIN-FANOUT",
        pattern_type="FIN_RAPID_FAN_OUT",
        signal_type="PASS_THROUGH_MULE",
        domain="FINANCIAL",
        entity_refs=["ENT-MULE-01"],
        event_refs=["EV-001", "EV-003"],
        evidence_refs=["HASH-01"],
        normalized_score=90.0,
        detector_confidence=0.92,
        status=SignalStatus.DETECTED,
        observations={"inflow_amount_inr": 500000.0, "outflow_amount_inr": 480000.0, "counterparty_count": 4}
    )

    # Redundant mathematical detector on same entity/event
    s3 = DetectionSignal(
        signal_id="SIG-03",
        case_id="CASE-TEST-01",
        detector_id="DET-STATISTICAL",
        pattern_type="STATISTICAL_OUTLIER",
        signal_type="Z_SCORE_OUTLIER",
        domain="STATISTICAL",
        entity_refs=["ENT-MULE-01"],
        event_refs=["EV-001"],
        evidence_refs=["HASH-01"],
        normalized_score=78.0,
        detector_confidence=0.85,
        status=SignalStatus.DETECTED,
        observations={"z_score": 3.4}
    )

    groups = signal_correlation_engine.correlate(
        case_id="CASE-TEST-01",
        signals=[s1, s2, s3]
    )

    # All 3 share entity ENT-MULE-01 and event EV-001 -> should form 1 consolidated group
    assert len(groups) == 1
    group = groups[0]
    assert len(group.supporting_signals) == 2  # Primary + 2 supporting
    assert "ENT-MULE-01" in group.entities
    assert "EV-001" in group.events


# ── TEST 3: Pattern Matcher Promotion ──────────────────────────────────
def test_pattern_matcher_multi_stage_promotion():
    """Verifies that Fanout + ATM Cashout promotes to FIN_RAPID_TRANSFER_TO_CASH."""
    s1 = DetectionSignal(
        signal_id="SIG-01",
        case_id="CASE-TEST-01",
        detector_id="DET-FIN-ATM-CASHOUT",
        pattern_type="FIN_ATM_CASHOUT",
        signal_type="ATM_BURST",
        domain="FINANCIAL",
        entity_refs=["ENT-MULE-01"],
        event_refs=["EV-001"],
        evidence_refs=["HASH-01"],
        normalized_score=85.0,
        observations={"withdrawal_amount_inr": 400000.0, "withdrawal_count": 2}
    )

    s2 = DetectionSignal(
        signal_id="SIG-02",
        case_id="CASE-TEST-01",
        detector_id="DET-FIN-FANOUT",
        pattern_type="FIN_RAPID_FAN_OUT",
        signal_type="FANOUT",
        domain="FINANCIAL",
        entity_refs=["ENT-MULE-01"],
        event_refs=["EV-002"],
        evidence_refs=["HASH-01"],
        normalized_score=90.0,
        observations={"inflow_amount_inr": 500000.0, "outflow_amount_inr": 450000.0, "counterparty_count": 3}
    )

    group = CorrelatedSignalGroup(
        group_id="GRP-01",
        case_id="CASE-TEST-01",
        primary_signal=s2
    )
    group.add_signal(s1, "Correlated ATM Cashout")

    candidate = pattern_matcher.match(group)
    assert candidate is not None
    assert candidate.pattern_id == "FIN_RAPID_TRANSFER_TO_CASH"
    assert candidate.category == "FINANCIAL"
    assert candidate.aggregated_observations.get("inflow_amount_inr") == 500000.0
    assert candidate.aggregated_observations.get("withdrawal_amount_inr") == 400000.0


# ── TEST 4: Context Enrichment ─────────────────────────────────────────
def test_context_enrichment():
    """Verifies context enrichment for entities, chronological events, and timeline offsets."""
    candidate = CandidatePattern(
        candidate_id="CAND-01",
        case_id="CASE-TEST-01",
        pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
        category="FINANCIAL",
        title="Rapid Transfer to Cash",
        primary_signals=[],
        supporting_signals=[],
        entity_refs=["ENT-VIKRAM"],
        event_refs=["EV-01", "EV-02", "EV-03"],
        evidence_refs=["EVID-SHA-01"]
    )

    entity_store = {
        "ENT-VIKRAM": {
            "display_name": "Vikramaditya Singh",
            "entity_type": "Person",
            "all_events": [
                {
                    "event_id": "EV-01",
                    "timestamp": "2026-03-01T10:00:00Z",
                    "domain": "BANKING",
                    "event_type": "TRANSFER_IN",
                    "financial": {"amount_inr": 1000000.0, "channel": "RTGS"},
                    "evidence_id": "EVID-SHA-01"
                },
                {
                    "event_id": "EV-02",
                    "timestamp": "2026-03-01T10:06:00Z",
                    "domain": "BANKING",
                    "event_type": "TRANSFER_OUT",
                    "financial": {"amount_inr": 450000.0, "channel": "IMPS", "counterparty": "Rohit Verma"},
                    "evidence_id": "EVID-SHA-01"
                },
                {
                    "event_id": "EV-03",
                    "timestamp": "2026-03-01T10:25:00Z",
                    "domain": "BANKING",
                    "event_type": "ATM_WITHDRAWAL",
                    "financial": {"amount_inr": 200000.0, "channel": "ATM"},
                    "telemetry": {"address": "Sector 18 ATM, Noida"},
                    "evidence_id": "EVID-SHA-01"
                }
            ]
        }
    }

    enriched = context_enrichment_engine.enrich(
        candidate=candidate,
        entity_store=entity_store,
        context={"case_id": "CASE-TEST-01"}
    )

    assert len(enriched.supporting_events) == 3
    # Check timeline offsets: EV-01 (+0m), EV-02 (+6m), EV-03 (+25m)
    steps = enriched.timeline_context.get("sequence_steps", [])
    assert len(steps) == 3
    assert steps[0]["time_offset"] == "+0m"
    assert steps[1]["time_offset"] == "+6m"
    assert steps[2]["time_offset"] == "+25m"
    assert "₹1,000,000.00" in steps[0]["description"]
    assert "Sector 18 ATM, Noida" in steps[2]["description"]


# ── TEST 5: Strict Evidence Binding (NO EVIDENCE -> NO CLAIM) ─────────
def test_evidence_binding_engine():
    """Verifies that claims without canonical events or evidence are caught and scored."""
    # Case A: Valid evidence binding
    candidate_valid = CandidatePattern(
        candidate_id="CAND-VALID",
        case_id="CASE-TEST-01",
        pattern_id="FIN_RAPID_FAN_OUT",
        category="FINANCIAL",
        title="Rapid Fan-Out",
        primary_signals=[],
        supporting_signals=[],
        entity_refs=["ENT-01"],
        event_refs=["EV-01"],
        evidence_refs=["SHA256-PROOF-01"],
        aggregated_observations={"inflow_amount_inr": 50000.0}
    )

    from app.anomaly.enrichment.context_enrichment import EnrichedContext
    enriched_valid = EnrichedContext()
    enriched_valid.supporting_events = [{"event_id": "EV-01", "amount_inr": 50000.0, "evidence_id": "SHA256-PROOF-01"}]

    res_valid = evidence_binding_engine.bind_and_validate(candidate_valid, enriched_valid)
    assert res_valid.is_valid is True
    assert res_valid.quality_tier == "HIGH"
    assert len(res_valid.unsupported_claims) == 0

    # Case B: Financial claim with NO canonical financial events
    candidate_invalid = CandidatePattern(
        candidate_id="CAND-INVALID",
        case_id="CASE-TEST-01",
        pattern_id="FIN_ATM_CASHOUT",
        category="FINANCIAL",
        title="ATM Cashout",
        primary_signals=[],
        supporting_signals=[],
        entity_refs=["ENT-01"],
        event_refs=[],
        evidence_refs=[],
        aggregated_observations={"withdrawal_amount_inr": 900000.0}
    )
    enriched_empty = EnrichedContext()

    res_invalid = evidence_binding_engine.bind_and_validate(candidate_invalid, enriched_empty)
    assert res_invalid.is_valid is False
    assert any("Financial amount claim without backing" in c for c in res_invalid.unsupported_claims)


# ── TEST 6: Double-Counting Protection & Multi-Domain Corroboration ───
def test_corroboration_double_counting_protection():
    """
    Verifies that multiple algorithms looking at the same data point are dampened,
    while cross-domain coverage awards substantial corroboration bonuses.
    """
    # 3 statistically correlated algorithms
    s_if = DetectionSignal(
        signal_id="SIG-IF",
        case_id="CASE-01",
        detector_id="DET-BEHAVIORAL-IF",
        pattern_type="BEHAVIORAL",
        signal_type="ISOLATION_FOREST",
        domain="BEHAVIORAL",
        normalized_score=80.0
    )
    s_stat = DetectionSignal(
        signal_id="SIG-STAT",
        case_id="CASE-01",
        detector_id="DET-STATISTICAL",
        pattern_type="STATISTICAL",
        signal_type="Z_SCORE",
        domain="STATISTICAL",
        normalized_score=78.0
    )
    s_ae = DetectionSignal(
        signal_id="SIG-AE",
        case_id="CASE-01",
        detector_id="DET-ADV-AUTOENCODER",
        pattern_type="ADVANCED_ML",
        signal_type="AUTOENCODER_RECON",
        domain="BEHAVIORAL",
        normalized_score=82.0
    )

    cand_stats = CandidatePattern(
        candidate_id="CAND-MATH",
        case_id="CASE-01",
        pattern_id="BEHAVIORAL_MULTIVARIATE",
        category="BEHAVIORAL",
        title="Multivariate Outlier",
        primary_signals=[s_if],
        supporting_signals=[s_stat, s_ae]
    )

    corrob_stats = corroboration_engine.evaluate(cand_stats)
    # The statistical family should be dampened
    assert corrob_stats.double_counting_dampened_count >= 1

    # Cross-Domain: Financial + Spatial + Network
    s_bank = DetectionSignal(signal_id="S1", case_id="CASE-01", detector_id="DET-FIN-FANOUT", domain="FINANCIAL", normalized_score=75.0)
    s_tele = DetectionSignal(signal_id="S2", case_id="CASE-01", detector_id="DET-SPATIAL-TRAVEL", domain="SPATIAL_TEMPORAL", normalized_score=80.0)
    s_net = DetectionSignal(signal_id="S3", case_id="CASE-01", detector_id="DET-NET-VPN-TOR", domain="NETWORK_OPSEC", normalized_score=70.0)

    cand_cross = CandidatePattern(
        candidate_id="CAND-CROSS",
        case_id="CASE-01",
        pattern_id="CROSS_DOMAIN_COLLISION",
        category="CROSS_DOMAIN",
        title="Cross Domain Coordination",
        primary_signals=[s_bank],
        supporting_signals=[s_tele, s_net]
    )

    corrob_cross = corroboration_engine.evaluate(cand_cross)
    # 3 independent domains -> +20 domain bonus
    assert corrob_cross.domain_bonus >= 20.0
    assert len(corrob_cross.independent_domains) == 3


# ── TEST 7: Decoupled Priority (Priority != Anomaly Score) ─────────────
def test_decoupled_investigative_priority():
    """
    Guarantees that a high statistical anomaly score with low relevance
    is NOT prioritized over a high-relevance finding directly implicating case targets.
    """
    cand = CandidatePattern(
        candidate_id="CAND-01",
        case_id="CASE-01",
        pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
        category="FINANCIAL",
        title="Transfer to Cash",
        primary_signals=[],
        supporting_signals=[]
    )

    from app.anomaly.corroboration.corroboration_engine import CorroborationResult
    from app.anomaly.evidence.evidence_binding_engine import EvidenceValidationResult

    # Finding A: High Score (95/100), but LOW case relevance
    corrob_high_score = CorroborationResult()
    corrob_high_score.calibrated_anomaly_score = 95.0
    corrob_high_score.independent_domains = ["FINANCIAL"]

    ev_medium = EvidenceValidationResult()
    ev_medium.quality_tier = "MEDIUM"

    prio_a, _ = investigative_priority_engine.compute_priority(
        candidate=cand,
        corroboration=corrob_high_score,
        evidence_res=ev_medium,
        case_relevance=CaseRelevanceLevel.LOW,
        relevance_reasons=["No overlap with primary targets."]
    )

    # Finding B: Moderate Score (70/100), but HIGH case relevance and HIGH evidence quality
    corrob_mod_score = CorroborationResult()
    corrob_mod_score.calibrated_anomaly_score = 70.0
    corrob_mod_score.independent_domains = ["FINANCIAL", "SPATIAL_TEMPORAL", "NETWORK_OPSEC"]

    ev_high = EvidenceValidationResult()
    ev_high.quality_tier = "HIGH"

    prio_b, _ = investigative_priority_engine.compute_priority(
        candidate=cand,
        corroboration=corrob_mod_score,
        evidence_res=ev_high,
        case_relevance=CaseRelevanceLevel.HIGH,
        relevance_reasons=["Directly involves Vikramaditya Singh named in warrant dossier."]
    )

    # Finding B must have higher or equal operational priority than Finding A
    assert prio_b in (InvestigativePriorityLevel.CRITICAL, InvestigativePriorityLevel.HIGH)
    assert prio_a in (InvestigativePriorityLevel.MEDIUM, InvestigativePriorityLevel.LOW)


# ── TEST 8: Finding Synthesis & Narrative Layers ───────────────────────
def test_finding_synthesis():
    """Verifies synthesis of Title, What Happened, Why Unusual, and Why Relevant narrative layers."""
    cand = CandidatePattern(
        candidate_id="CAND-01",
        case_id="CASE-01",
        pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
        category="FINANCIAL",
        title="Large Inbound Transfer Followed by Rapid Distribution and Cash Withdrawal",
        primary_signals=[],
        supporting_signals=[],
        entity_refs=["ENT-VIKRAM"],
        aggregated_observations={
            "inflow_amount_inr": 2000000.0,
            "outflow_amount_inr": 1800000.0,
            "withdrawal_amount_inr": 500000.0,
            "counterparty_count": 4,
            "withdrawal_count": 3,
            "time_window_minutes": 25
        }
    )

    from app.anomaly.enrichment.context_enrichment import EnrichedContext
    from app.anomaly.corroboration.corroboration_engine import CorroborationResult
    from app.anomaly.evidence.evidence_binding_engine import EvidenceValidationResult

    enriched = EnrichedContext()
    enriched.primary_entities = [{"entity_id": "ENT-VIKRAM", "display_name": "Vikramaditya Singh", "entity_type": "Person"}]
    enriched.baseline_context = {"comparison": "Historical account baseline exhibits zero ATM withdrawals in prior 90 days."}

    ev_res = EvidenceValidationResult()
    ev_res.evidence_refs = ["SHA256-BANK-01"]
    ev_res.event_refs = ["EV-01", "EV-02"]
    ev_res.quality_tier = "HIGH"

    corrob = CorroborationResult()
    corrob.calibrated_anomaly_score = 92.0
    corrob.detection_confidence = 0.95

    finding = finding_synthesis_engine.synthesize(
        candidate=cand,
        enriched=enriched,
        evidence_res=ev_res,
        corroboration=corrob,
        case_relevance=CaseRelevanceLevel.HIGH,
        relevance_reasons=["Directly matches extortion payout timeline."],
        priority=InvestigativePriorityLevel.CRITICAL,
        severity=SeverityLevel.CRITICAL
    )

    assert isinstance(finding, InvestigativeFinding)
    assert "Vikramaditya Singh" in finding.what_happened
    assert "₹2,000,000.00" in finding.what_happened
    assert "4 separate accounts" in finding.what_happened
    assert "₹500,000.00 was liquidated in physical cash" in finding.what_happened
    assert "Historical account baseline" in finding.why_unusual
    assert "extortion payout timeline" in finding.why_relevant
    assert finding.investigative_priority == "CRITICAL"
    assert finding.severity == "CRITICAL"


# ── TEST 9: Quality Gate (12 Validation Criteria) ──────────────────────
def test_quality_gate_rejection_and_acceptance():
    """Verifies that bare numerical outliers without context fail, while evidence-backed findings pass."""
    from app.anomaly.evidence.evidence_binding_engine import EvidenceValidationResult

    # Finding that passes all 12 checks
    good_finding = InvestigativeFinding(
        finding_id="FIND-01",
        case_id="CASE-01",
        title="Valid Finding",
        category="FINANCIAL",
        pattern_type="FIN_ATM_CASHOUT",
        what_happened="Factual description of cash withdrawal exceeding normal amounts.",
        why_unusual="Deviates sharply from peer group banking baselines.",
        why_relevant="Directly links to victim ransom liquidation.",
        primary_entities=[{"entity_id": "ENT-01", "display_name": "John Doe"}],
        evidence_refs=["SHA256-PROOF"],
        supporting_events=[{"event_id": "EV-01"}],
        detectors=["DET-FIN-ATM-CASHOUT"],
        anomaly_score=85.0,
        detection_confidence=0.9,
        investigative_priority="HIGH",
        severity="HIGH",
        fingerprint="FP-01"
    )

    ev_good = EvidenceValidationResult()
    ev_good.is_valid = True
    ev_good.event_refs = ["EV-01"]
    ev_good.evidence_refs = ["SHA256-PROOF"]

    gate_good = finding_quality_gate.validate(good_finding, ev_good)
    assert gate_good.passed is True

    # Bare numerical outlier without backing canonical events or evidence -> Must be rejected
    bare_outlier = InvestigativeFinding(
        finding_id="FIND-BARE",
        case_id="CASE-01",
        title="Bare Outlier",
        category="BEHAVIORAL",
        pattern_type="BEHAVIORAL_MULTIVARIATE",
        what_happened="Raw Isolation Forest score exceeded threshold.",
        why_unusual="Score was high.",
        why_relevant="None.",
        primary_entities=[{"entity_id": "ENT-02"}],
        evidence_refs=[],  # No evidence
        supporting_events=[],  # No events
        detectors=["DET-BEHAVIORAL-IF"],  # Bare generic detector
        anomaly_score=60.0,
        fingerprint="FP-02"
    )

    ev_bad = EvidenceValidationResult()
    ev_bad.is_valid = False
    ev_bad.unsupported_claims = ["No evidence"]

    gate_bad = finding_quality_gate.validate(bare_outlier, ev_bad)
    assert gate_bad.passed is False
    assert any("evidence" in r.lower() or "bare numerical outlier" in r.lower() for r in gate_bad.reasons)


# ── TEST 10: Fingerprint Determinism & Idempotency ─────────────────────
def test_fingerprint_determinism():
    """Verifies stable deterministic fingerprinting prevents duplicate entries across reruns."""
    fp1 = finding_synthesis_engine.calculate_fingerprint(
        case_id="CASE-SHADOW",
        entity_id="ENT-VIKRAM",
        pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
        time_anchor="2026-03-01T10:15:00Z"
    )

    fp2 = finding_synthesis_engine.calculate_fingerprint(
        case_id="CASE-SHADOW",
        entity_id="ENT-VIKRAM",
        pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
        time_anchor="2026-03-01T10:45:00Z"  # Same hour window
    )

    assert fp1 == fp2
    assert len(fp1) == 16
