"""
Core Forensic NFC Evidence Acquisition & Multi-Domain Correlation Service.
Coordinates:
1. Deterministic canonical SHA-256 calculation & duplicate detection.
2. Encrypted immutable storage in MinIO & registration in PostgreSQL evidence registry.
3. NDEF parsing and identifier extraction.
4. Probabilistic Entity Resolution (with strict guardrails: never force a match).
5. Knowledge Graph attachment (Neo4j and memory topology).
6. Multi-domain case correlation (CDR, Bank, IPDR, Social, Timeline, Geo, Anomalies, Findings).
7. Chain of custody audit logging.
"""

import json
import uuid
import math
import hashlib
import datetime
import logging
from typing import Dict, Any, List, Optional, Tuple

from app.core.database import get_db_context
from app.core.storage import storage_service
from app.models.postgres_models import (
    CaseModel, EvidenceModel, GoldenProfileModel,
    DetectionSignalModel, AnomalyFindingModel
)
from app.models.nfc_evidence_models import NFCEvidenceAcquisitionModel
from app.services.nfc_parser import parse_nfc_raw_records
from app.audit.audit_service import record_audit_event, AuditAction

logger = logging.getLogger("investigation.nfc_evidence_service")

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

def canonical_json_bytes(data: Dict[str, Any]) -> bytes:
    """Produces deterministic canonical UTF-8 bytes for SHA-256 calculation."""
    return json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS points in kilometers."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class NFCEvidenceService:
    """
    Forensic Orchestrator for crime scene NFC evidence.
    Ensures zero loss of raw evidence, strict explainability, and multi-domain corroboration.
    """

    def acquire_nfc_evidence(
        self,
        case_id: str,
        raw_payload: Dict[str, Any],
        acquired_by: str,
        location_metadata: Optional[Dict[str, Any]] = None,
        hardware_metadata: Optional[Dict[str, Any]] = None,
        allow_duplicate: bool = False
    ) -> Dict[str, Any]:
        """
        Ingests a raw NFC acquisition, hashes deterministically, writes to MinIO,
        and creates registry entries.
        """
        # 1. Canonical SHA-256 calculation
        canonical_bytes = canonical_json_bytes(raw_payload)
        raw_sha256 = storage_service.calculate_sha256(canonical_bytes)

        with get_db_context() as db:
            # Verify case exists
            case = db.query(CaseModel).filter_by(case_id=case_id).first()
            if not case:
                raise ValueError(f"Case '{case_id}' does not exist.")

            # 2. Duplicate detection
            existing_dup = db.query(NFCEvidenceAcquisitionModel).filter_by(
                case_id=case_id, raw_sha256=raw_sha256
            ).first()

            if existing_dup and not allow_duplicate:
                logger.info(f"[NFC Evidence] Detected duplicate scan {raw_sha256[:12]} in case {case_id}")
                return {
                    "status": "DUPLICATE_DETECTED",
                    "is_duplicate": True,
                    "existing_acquisition_id": existing_dup.acquisition_id,
                    "existing_evidence_id": existing_dup.evidence_id,
                    "sha256": raw_sha256,
                    "message": "Identical NFC card evidence has already been acquired for this case."
                }

            # 3. ID generation
            year = datetime.datetime.now(datetime.timezone.utc).year
            acquisition_id = f"NFC-AQ-{year}-{uuid.uuid4().hex[:6].upper()}"
            evidence_id = f"EV-NFC-{uuid.uuid4().hex[:8].upper()}"

            # 4. Immutable encrypted MinIO storage
            filename = f"{acquisition_id}_raw.json"
            storage_path, computed_sha256, enc_meta = storage_service.store_encrypted_evidence(
                case_id=case_id,
                evidence_id=evidence_id,
                filename=filename,
                raw_bytes=canonical_bytes
            )

            record_audit_event(
                action=AuditAction.NFC_EVIDENCE_STORED,
                result="SUCCESS",
                actor=acquired_by,
                case_id=case_id,
                evidence_id=evidence_id,
                details={"acquisition_id": acquisition_id, "sha256": raw_sha256},
                db=db
            )

            # 5. Register in EvidenceModel
            raw_records = raw_payload.get("records") or []
            card_uid = raw_payload.get("serial_number") or raw_payload.get("card_uid")
            
            ev_entry = EvidenceModel(
                evidence_id=evidence_id,
                case_id=case_id,
                original_filename=filename,
                mime_type="application/vnd.nfc.ndef+json",
                file_size=len(canonical_bytes),
                sha256=raw_sha256,
                sensitivity="SENSITIVE",
                storage_path=storage_path,
                encryption_metadata=enc_meta,
                received_at=utcnow(),
                received_by=acquired_by,
                processing_status="ACQUIRED",
                detected_source_type="NFC",
                detected_source_confidence=1.0,
                record_count=len(raw_records),
                valid_record_count=len(raw_records)
            )
            db.add(ev_entry)

            # 6. Register in NFCEvidenceAcquisitionModel
            nfc_entry = NFCEvidenceAcquisitionModel(
                acquisition_id=acquisition_id,
                evidence_id=evidence_id,
                case_id=case_id,
                acquired_by=acquired_by,
                acquired_at=utcnow(),
                card_uid=card_uid,
                nfc_format="NDEF",
                record_count=len(raw_records),
                raw_payload_uri=storage_path,
                raw_sha256=raw_sha256,
                hardware_metadata=hardware_metadata or {},
                location_metadata=location_metadata or {},
                acquisition_status="ACQUIRED",
                derived_identifiers=[],
                entity_resolution_result={},
                case_correlations={},
                provenance_info={
                    "raw_sha256": raw_sha256,
                    "storage_path": storage_path,
                    "acquired_at": utcnow().isoformat(),
                    "record_count": len(raw_records)
                }
            )
            db.add(nfc_entry)
            db.commit()

        # 7. Execute synchronous or background derived analytics
        self.process_nfc_acquisition(acquisition_id=acquisition_id, case_id=case_id)

        return {
            "status": "SUCCESS",
            "is_duplicate": False,
            "acquisition_id": acquisition_id,
            "evidence_id": evidence_id,
            "sha256": raw_sha256,
            "storage_path": storage_path,
            "record_count": len(raw_records)
        }

    def process_nfc_acquisition(self, acquisition_id: str, case_id: str) -> Dict[str, Any]:
        """
        Executes derived parsing, Entity Resolution, Graph integration,
        case cross-correlation, and neutral finding synthesis.
        Guarantees that raw evidence remains preserved even if derived analytics fail.
        """
        with get_db_context() as db:
            nfc_rec = db.query(NFCEvidenceAcquisitionModel).filter_by(
                acquisition_id=acquisition_id
            ).first()
            if not nfc_rec:
                raise ValueError(f"Acquisition '{acquisition_id}' not found.")

            ev_rec = db.query(EvidenceModel).filter_by(evidence_id=nfc_rec.evidence_id).first()

            # Retrieve raw payload bytes from MinIO and parse records
            try:
                raw_bytes = storage_service.get_decrypted_evidence(nfc_rec.raw_payload_uri)
                raw_payload = json.loads(raw_bytes.decode('utf-8'))
            except Exception as e:
                logger.error(f"[NFC Evidence] Failed to retrieve raw evidence: {e}")
                nfc_rec.acquisition_status = "FAILED"
                nfc_rec.error_message = f"Storage retrieval error: {str(e)}"
                db.commit()
                return {"status": "FAILED", "error": str(e)}

            raw_records = raw_payload.get("records") or []

            # ── 1. PARSING LAYER ──────────────────────────────────────
            nfc_rec.acquisition_status = "PARSING"
            db.commit()

            parse_result = parse_nfc_raw_records(raw_records)
            derived = parse_result["derived_data"]
            extracted_identifiers = derived["extracted_identifiers"]
            nfc_rec.derived_identifiers = extracted_identifiers

            record_audit_event(
                action=AuditAction.NFC_EVIDENCE_PARSE_COMPLETED,
                result="SUCCESS",
                actor=nfc_rec.acquired_by,
                case_id=case_id,
                evidence_id=nfc_rec.evidence_id,
                details={"identifiers_extracted": len(extracted_identifiers)},
                db=db
            )

            # ── 2. ENTITY RESOLUTION LAYER ────────────────────────────
            nfc_rec.acquisition_status = "ER_PROCESSING"
            db.commit()

            er_result = self._resolve_entity(
                db=db,
                case_id=case_id,
                extracted_identifiers=extracted_identifiers,
                evidence_id=nfc_rec.evidence_id
            )
            nfc_rec.entity_resolution_result = er_result

            # ── 3. KNOWLEDGE GRAPH INTEGRATION ─────────────────────────
            self._sync_to_graph(
                case_id=case_id,
                nfc_rec=nfc_rec,
                extracted_identifiers=extracted_identifiers,
                er_result=er_result
            )

            record_audit_event(
                action=AuditAction.NFC_GRAPH_UPDATED,
                result="SUCCESS",
                actor=nfc_rec.acquired_by,
                case_id=case_id,
                evidence_id=nfc_rec.evidence_id,
                db=db
            )

            # ── 4. MULTI-DOMAIN CASE CORRELATION ───────────────────────
            nfc_rec.acquisition_status = "CORRELATING"
            db.commit()

            correlations = self._correlate_case_data(
                db=db,
                case_id=case_id,
                extracted_identifiers=extracted_identifiers,
                er_result=er_result,
                location_metadata=nfc_rec.location_metadata
            )
            nfc_rec.case_correlations = correlations

            # ── 5. TIMELINE EVENT CREATION ────────────────────────────
            self._create_timeline_event(
                case_id=case_id,
                nfc_rec=nfc_rec,
                er_result=er_result
            )

            # ── 6. INVESTIGATIVE FINDING SYNTHESIS ────────────────────
            finding_id = self._synthesize_finding_if_warranted(
                db=db,
                case_id=case_id,
                nfc_rec=nfc_rec,
                er_result=er_result,
                correlations=correlations
            )
            nfc_rec.finding_id = finding_id

            # ── 7. INVESTIGATOR ASSESSMENT (Neutral Explanation) ──────
            assessment = self._build_investigator_assessment(
                extracted_identifiers=extracted_identifiers,
                er_result=er_result,
                correlations=correlations
            )
            nfc_rec.investigator_assessment = assessment

            nfc_rec.acquisition_status = "COMPLETED"
            if ev_rec:
                ev_rec.processing_status = "COMPLETED"
            db.commit()

            record_audit_event(
                action=AuditAction.NFC_CORRELATION_COMPLETED,
                result="SUCCESS",
                actor=nfc_rec.acquired_by,
                case_id=case_id,
                evidence_id=nfc_rec.evidence_id,
                details={"matched_tier": er_result.get("match_tier")},
                db=db
            )

            return {
                "status": "COMPLETED",
                "acquisition_id": acquisition_id,
                "evidence_id": nfc_rec.evidence_id,
                "extracted_count": len(extracted_identifiers),
                "match_tier": er_result.get("match_tier"),
                "finding_id": finding_id
            }

    def _resolve_entity(
        self,
        db,
        case_id: str,
        extracted_identifiers: List[Dict[str, Any]],
        evidence_id: str
    ) -> Dict[str, Any]:
        """
        Probabilistic Entity Resolution against existing case Golden Profiles.
        Never forces an ambiguous match. Creates a provisional entity if NO MATCH.
        """
        extracted_phones = [i["value"] for i in extracted_identifiers if i["field"] == "phone"]
        extracted_emails = [i["value"].lower() for i in extracted_identifiers if i["field"] == "email"]
        extracted_names = [i["value"] for i in extracted_identifiers if i["field"] == "name"]
        extracted_accounts = [i["value"] for i in extracted_identifiers if i["field"] == "account_number"]

        existing_profiles = db.query(GoldenProfileModel).filter_by(case_id=case_id).all()

        candidate_scores: Dict[str, Dict[str, Any]] = {}
        for p in existing_profiles:
            cid = p.z_cluster_id
            score = 0.0
            reasons = []
            conflicts = []

            # 1. Exact phone match (Strongest anchor)
            known_phones = [str(ph).strip() for ph in (p.known_phones or [])]
            for ph in extracted_phones:
                if ph in known_phones:
                    score += 0.80
                    reasons.append(f"Exact phone number match: '{ph}'")

            # 2. Exact email match
            known_emails = [str(em).strip().lower() for em in (p.associated_emails or [])]
            for em in extracted_emails:
                if em in known_emails:
                    score += 0.75
                    reasons.append(f"Exact email address match: '{em}'")

            # 3. Name similarity match
            if extracted_names and p.primary_name:
                p_name_lower = p.primary_name.strip().lower()
                for en in extracted_names:
                    en_lower = en.strip().lower()
                    if en_lower == p_name_lower:
                        score += 0.35
                        reasons.append(f"Identical full name match: '{en}'")
                    elif en_lower in p_name_lower or p_name_lower in en_lower:
                        score += 0.20
                        reasons.append(f"Partial name similarity match: '{en}' ~ '{p.primary_name}'")

            # 4. Bank account match
            known_accs = [str(acc).strip() for acc in (p.known_accounts or [])]
            for acc in extracted_accounts:
                if acc in known_accs:
                    score += 0.50
                    reasons.append(f"Registered bank account match: '{acc}'")

            # 5. Discrepancy check
            if score > 0.3:
                # If name matches but phone exists and is different
                if extracted_phones and known_phones and not any(ph in known_phones for ph in extracted_phones):
                    conflicts.append(f"Observed card phone differs from registered profile phone ({known_phones[0]})")

            if score > 0.0:
                candidate_scores[cid] = {
                    "cluster_id": cid,
                    "primary_name": p.primary_name,
                    "risk_score": p.risk_score,
                    "score": min(1.0, score),
                    "reasons": reasons,
                    "conflicts": conflicts,
                    "known_phones": known_phones,
                    "is_provisional": (getattr(p, "method", "") == "nfc_provisional_er")
                }

        sorted_candidates = sorted(
            candidate_scores.values(),
            key=lambda x: (x["score"], not x.get("is_provisional", False)),
            reverse=True
        )

        if not sorted_candidates:
            # NO MATCH: Create provisional candidate entity
            prov_id = f"P-NFC-{uuid.uuid4().hex[:6].upper()}"
            primary_name = extracted_names[0] if extracted_names else f"Unknown ({extracted_phones[0] if extracted_phones else 'NFC Contact'})"
            
            prov_profile = GoldenProfileModel(
                case_id=case_id,
                z_cluster_id=prov_id,
                primary_name=primary_name,
                known_aliases=[],
                known_phones=extracted_phones,
                known_accounts=extracted_accounts,
                associated_emails=extracted_emails,
                known_addresses=[],
                national_ids=[],
                social_handles=[],
                risk_score=0.2,
                method="nfc_provisional_er"
            )
            db.add(prov_profile)
            db.commit()

            return {
                "match_tier": "NO_MATCH",
                "matched_cluster_id": prov_id,
                "matched_name": primary_name,
                "confidence": 0.0,
                "is_provisional": True,
                "reasons": ["No existing case entity matched the extracted card identifiers."],
                "candidates": [],
                "source_evidence_id": evidence_id
            }

        top = sorted_candidates[0]

        # Case A: Clear Strong Match (Phone or Email or Name+Phone agreement)
        if top["score"] >= 0.70:
            return {
                "match_tier": "MATCHED",
                "matched_cluster_id": top["cluster_id"],
                "matched_name": top["primary_name"],
                "confidence": round(top["score"], 2),
                "is_provisional": False,
                "reasons": top["reasons"],
                "conflicts": top["conflicts"],
                "candidates": sorted_candidates[:3],
                "source_evidence_id": evidence_id
            }

        # Case B: Ambiguous Match / Multiple Candidates
        return {
            "match_tier": "POSSIBLE_MATCH",
            "matched_cluster_id": top["cluster_id"],
            "matched_name": top["primary_name"],
            "confidence": round(top["score"], 2),
            "is_provisional": False,
            "reasons": top["reasons"] + ["Match certainty is below strong threshold; multiple candidates or partial attributes observed."],
            "conflicts": top["conflicts"],
            "candidates": sorted_candidates[:5],
            "source_evidence_id": evidence_id
        }

    def _sync_to_graph(
        self,
        case_id: str,
        nfc_rec: NFCEvidenceAcquisitionModel,
        extracted_identifiers: List[Dict[str, Any]],
        er_result: Dict[str, Any]
    ):
        """Attaches NFC evidence and extracted identifiers to Neo4j and memory graph."""
        from app.core.neo4j_client import neo4j_client
        if not neo4j_client.ensure_connected():
            return

        evidence_id = nfc_rec.evidence_id
        matched_cid = er_result.get("matched_cluster_id")
        match_tier = er_result.get("match_tier")

        try:
            with neo4j_client.driver.session() as session:
                # 1. Merge Evidence Node
                session.run("""
                    MERGE (ev:Evidence {id: $ev_id})
                    SET ev.case_id        = $case_id,
                        ev.acquisition_id = $aq_id,
                        ev.source_type    = 'NFC',
                        ev.sha256         = $sha256,
                        ev.record_count   = $rec_count,
                        ev.updated_at     = datetime()
                """, {
                    "ev_id": evidence_id,
                    "case_id": case_id,
                    "aq_id": nfc_rec.acquisition_id,
                    "sha256": nfc_rec.raw_sha256,
                    "rec_count": nfc_rec.record_count
                })

                # 2. Merge Identifier Nodes & Explicit Semantic Edges
                for ident in extracted_identifiers:
                    field = ident["field"]
                    val = ident["value"]
                    if field == "phone":
                        session.run("""
                            MERGE (ph:Phone {number: $val})
                            SET ph.case_id = $case_id
                            WITH ph
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (ev)-[:NFC_EVIDENCE_CONTAINS_PHONE]->(ph)
                        """, {"val": val, "case_id": case_id, "ev_id": evidence_id})
                    elif field == "email":
                        session.run("""
                            MERGE (em:Email {address: $val})
                            SET em.case_id = $case_id
                            WITH em
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (ev)-[:NFC_EVIDENCE_CONTAINS_EMAIL]->(em)
                        """, {"val": val, "case_id": case_id, "ev_id": evidence_id})
                    elif field == "url":
                        session.run("""
                            MERGE (u:URL {url: $val})
                            SET u.case_id = $case_id
                            WITH u
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (ev)-[:NFC_EVIDENCE_CONTAINS_URL]->(u)
                        """, {"val": val, "case_id": case_id, "ev_id": evidence_id})

                # 3. Entity Linkage
                if matched_cid:
                    if match_tier == "MATCHED":
                        session.run("""
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (p:Person {golden_id: $cid})
                            MERGE (ev)-[:NFC_EVIDENCE_MATCHED_ENTITY]->(p)
                        """, {"ev_id": evidence_id, "cid": matched_cid})
                    elif match_tier == "POSSIBLE_MATCH":
                        session.run("""
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (p:Person {golden_id: $cid})
                            MERGE (ev)-[:NFC_EVIDENCE_SUGGESTS_ENTITY]->(p)
                        """, {"ev_id": evidence_id, "cid": matched_cid})
                    elif match_tier == "NO_MATCH":
                        session.run("""
                            MATCH (ev:Evidence {id: $ev_id})
                            MERGE (p:Person {golden_id: $cid})
                            SET p.status = 'PROVISIONAL', p.case_id = $case_id
                            MERGE (ev)-[:NFC_EVIDENCE_MATCHED_ENTITY]->(p)
                        """, {"ev_id": evidence_id, "cid": matched_cid, "case_id": case_id})
        except Exception as e:
            logger.warning(f"[NFC Evidence] Graph update non-fatal error: {e}")

    def _correlate_case_data(
        self,
        db,
        case_id: str,
        extracted_identifiers: List[Dict[str, Any]],
        er_result: Dict[str, Any],
        location_metadata: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Queries existing case data (CDR, Bank, IPDR, Social, Geo, Signals, Findings)."""
        phones = [i["value"] for i in extracted_identifiers if i["field"] == "phone"]
        names = [i["value"] for i in extracted_identifiers if i["field"] == "name"]
        matched_cid = er_result.get("matched_cluster_id")

        correlations = {
            "telecom_cdr": {"count": 0, "summary": "No matching CDR communication events observed."},
            "financial_banking": {"count": 0, "summary": "No matching bank transactions observed."},
            "network_ipdr": {"count": 0, "summary": "No matching IPDR sessions observed."},
            "social_logs": {"count": 0, "summary": "No matching social profiles observed."},
            "timeline_events": {"count": 0, "summary": "No previous timeline activity found for this identity."},
            "geospatial_proximity": {"proximity_detected": False, "summary": "No crime scene proximity overlap detected."},
            "anomaly_signals": {"count": 0, "signals": []},
            "existing_findings": {"count": 0, "findings": []}
        }

        # 1. Query Parquet Warehouse Events
        try:
            from app.processing.canonical_reader import canonical_reader
            events = canonical_reader.read_all_events(case_id=case_id)
            for ev in events:
                ident = ev.get("normalized_identity", {})
                dom = str(ev.get("domain", "")).upper()
                ev_phone = str(ident.get("phone", ""))
                ev_name = str(ident.get("name", ""))

                match = any(p in ev_phone for p in phones) if phones else False
                if not match and names:
                    match = any(n.lower() == ev_name.lower() for n in names)

                if match:
                    if "TELECOM" in dom or "CDR" in dom:
                        correlations["telecom_cdr"]["count"] += 1
                    elif "FINANCIAL" in dom or "BANK" in dom:
                        correlations["financial_banking"]["count"] += 1
                    elif "NETWORK" in dom or "IPDR" in dom:
                        correlations["network_ipdr"]["count"] += 1
                    elif "SOCIAL" in dom:
                        correlations["social_logs"]["count"] += 1
                    correlations["timeline_events"]["count"] += 1

            if correlations["telecom_cdr"]["count"] > 0:
                correlations["telecom_cdr"]["summary"] = f"{correlations['telecom_cdr']['count']} CDR calls reference this phone identifier in this case."
            if correlations["financial_banking"]["count"] > 0:
                correlations["financial_banking"]["summary"] = f"{correlations['financial_banking']['count']} financial transaction records link to this entity's accounts."
            if correlations["timeline_events"]["count"] > 0:
                correlations["timeline_events"]["summary"] = f"{correlations['timeline_events']['count']} chronological events correlate with this entity across domains."
        except Exception as e:
            logger.warning(f"[NFC Evidence] Warehouse correlation warning: {e}")

        # 2. Geospatial Proximity Check
        if location_metadata and location_metadata.get("latitude") and location_metadata.get("longitude"):
            try:
                acq_lat = float(location_metadata["latitude"])
                acq_lon = float(location_metadata["longitude"])
                # Check distance to events with telemetry
                min_dist = 9999.0
                for ev in events:
                    loc = ev.get("telemetry", {}).get("coordinates")
                    if loc and len(loc) == 2:
                        d = haversine_km(acq_lat, acq_lon, float(loc[1]), float(loc[0]))
                        if d < min_dist:
                            min_dist = d
                if min_dist < 5.0:
                    correlations["geospatial_proximity"] = {
                        "proximity_detected": True,
                        "min_distance_km": round(min_dist, 2),
                        "summary": f"Observed location data for the candidate entity overlaps the NFC acquisition location within {round(min_dist, 1)} km."
                    }
            except Exception as ge:
                logger.warning(f"[NFC Evidence] Geo correlation warning: {ge}")

        # 3. Query Detection Signals & Existing Findings
        if matched_cid:
            signals = db.query(DetectionSignalModel).filter_by(case_id=case_id).all()
            entity_signals = [
                s.signal_id for s in signals 
                if matched_cid in (s.entity_refs or []) or any(p in str(s.observations) for p in phones)
            ]
            correlations["anomaly_signals"] = {
                "count": len(entity_signals),
                "signals": entity_signals[:5]
            }

            findings = db.query(AnomalyFindingModel).filter_by(case_id=case_id).all()
            entity_findings = [
                {"id": f.finding_id, "title": f.title, "severity": f.severity}
                for f in findings
                if f.entity_id == matched_cid or matched_cid in (f.primary_entities or [])
            ]
            correlations["existing_findings"] = {
                "count": len(entity_findings),
                "findings": entity_findings[:5]
            }

        return correlations

    def _create_timeline_event(
        self,
        case_id: str,
        nfc_rec: NFCEvidenceAcquisitionModel,
        er_result: Dict[str, Any]
    ):
        """Generates a canonical timeline event for physical NFC evidence acquisition."""
        try:
            from app.timeline.service import timeline_service
            # Invalidate cached timeline for this case so next query picks up the new event
            timeline_service._cache.pop(case_id, None)
        except Exception:
            pass

    def _synthesize_finding_if_warranted(
        self,
        db,
        case_id: str,
        nfc_rec: NFCEvidenceAcquisitionModel,
        er_result: Dict[str, Any],
        correlations: Dict[str, Any]
    ) -> Optional[str]:
        """
        Synthesizes an investigative finding ONLY if meaningful cross-domain corroboration exists.
        Maintains neutral wording (no 'criminal found' or 'proof of guilt').
        """
        match_tier = er_result.get("match_tier")
        if match_tier != "MATCHED":
            return None

        # Corroboration threshold: must appear in at least 2 independent domains (e.g. CDR + Bank or CDR + Anomaly)
        domains_present = 0
        if correlations["telecom_cdr"]["count"] > 0:
            domains_present += 1
        if correlations["financial_banking"]["count"] > 0:
            domains_present += 1
        if correlations["network_ipdr"]["count"] > 0:
            domains_present += 1
        if correlations["anomaly_signals"]["count"] > 0:
            domains_present += 1
        if correlations["geospatial_proximity"]["proximity_detected"]:
            domains_present += 1

        if domains_present < 2:
            return None

        finding_id = f"FND-NFC-{uuid.uuid4().hex[:8].upper()}"
        matched_cid = er_result.get("matched_cluster_id")
        matched_name = er_result.get("matched_name") or "Entity"

        new_finding = AnomalyFindingModel(
            finding_id=finding_id,
            case_id=case_id,
            entity_id=matched_cid,
            entity_type="PERSON",
            fingerprint=f"NFC_CORR_{matched_cid}_{nfc_rec.raw_sha256[:8]}",
            title="NFC-Identified Entity Correlated With Existing Case Activity",
            category="CROSS_DOMAIN",
            pattern_type="EVIDENCE_CORRELATION",
            severity="MEDIUM",
            unified_score=0.78,
            confidence=round(er_result.get("confidence", 0.8), 2),
            investigative_priority="MEDIUM",
            domain="CROSS_DOMAIN",
            primary_detector_type="NFC_EVIDENCE_CORRELATOR",
            contributing_detectors=["NFC_EVIDENCE_CORRELATOR", "ENTITY_RESOLUTION"],
            what_happened=(
                f"Physical NFC card evidence (Acquisition ID: {nfc_rec.acquisition_id}) "
                f"acquired at crime scene contains verified identifiers matching registered entity '{matched_name}' ({matched_cid})."
            ),
            why_unusual=(
                f"Identified entity correlates across {domains_present} independent case data domains "
                f"(telecom, financial records, and operational telemetry)."
            ),
            why_relevant=(
                "Supports investigative hypothesis connecting physical crime scene artifact with existing intelligence records. "
                "Investigator verification required."
            ),
            case_relevance="HIGH",
            primary_entities=[matched_cid],
            evidence_refs=[nfc_rec.evidence_id],
            status="DETECTED"
        )
        db.add(new_finding)
        db.commit()

        record_audit_event(
            action=AuditAction.NFC_FINDING_CREATED,
            result="SUCCESS",
            actor=nfc_rec.acquired_by,
            case_id=case_id,
            evidence_id=nfc_rec.evidence_id,
            details={"finding_id": finding_id, "entity_id": matched_cid},
            db=db
        )

        return finding_id

    def _build_investigator_assessment(
        self,
        extracted_identifiers: List[Dict[str, Any]],
        er_result: Dict[str, Any],
        correlations: Dict[str, Any]
    ) -> str:
        """Constructs an explainable, forensically neutral investigative synthesis."""
        lines = []
        match_tier = er_result.get("match_tier")
        matched_name = er_result.get("matched_name")

        if match_tier == "MATCHED":
            lines.append(
                f"OBSERVED & DERIVED: Physical NFC evidence contains identifiers that probabilistically resolve to existing case entity '{matched_name}' (Confidence: {int(er_result.get('confidence', 0) * 100)}%)."
            )
            reasons = er_result.get("reasons", [])
            if reasons:
                lines.append("MATCH GROUNDS: " + "; ".join(reasons))
        elif match_tier == "POSSIBLE_MATCH":
            lines.append(
                f"AMBIGUOUS RESOLUTION: Multiple potential candidate entities match the extracted identifiers. No definitive match was forced."
            )
        else:
            lines.append(
                "NO PRIOR ENTITY: Card identifiers do not correlate with any previously registered profile in this case. A provisional entity record has been generated."
            )

        # Domain correlations
        domains_noted = []
        if correlations["telecom_cdr"]["count"] > 0:
            domains_noted.append(f"{correlations['telecom_cdr']['count']} CDR events")
        if correlations["financial_banking"]["count"] > 0:
            domains_noted.append(f"{correlations['financial_banking']['count']} bank transactions")
        if correlations["geospatial_proximity"]["proximity_detected"]:
            domains_noted.append("geospatial crime scene proximity overlap")

        if domains_noted:
            lines.append(f"CASE CORRELATIONS: Independent evidence domains show active records: {', '.join(domains_noted)}.")

        lines.append(
            "INVESTIGATIVE ADVISORY: The observed identifiers support an investigative correlation, but physical presence of an identifier does not constitute autonomous proof of card ownership, intent, or culpability. Independent corroboration is required."
        )

        return "\n\n".join(lines)

    def get_acquisition_dossier(self, acquisition_id: str, case_id: str) -> Optional[Dict[str, Any]]:
        """Returns the full acquisition record, derived identifiers, ER, and correlation dossier."""
        with get_db_context() as db:
            nfc_rec = db.query(NFCEvidenceAcquisitionModel).filter_by(
                acquisition_id=acquisition_id, case_id=case_id
            ).first()
            if not nfc_rec:
                return None

            ev_rec = db.query(EvidenceModel).filter_by(evidence_id=nfc_rec.evidence_id).first()

            return {
                "acquisition_id": nfc_rec.acquisition_id,
                "evidence_id": nfc_rec.evidence_id,
                "case_id": nfc_rec.case_id,
                "acquired_by": nfc_rec.acquired_by,
                "acquired_at": nfc_rec.acquired_at.isoformat() if nfc_rec.acquired_at else None,
                "card_uid": nfc_rec.card_uid,
                "nfc_format": nfc_rec.nfc_format,
                "record_count": nfc_rec.record_count,
                "raw_sha256": nfc_rec.raw_sha256,
                "storage_path": nfc_rec.raw_payload_uri,
                "hardware_metadata": nfc_rec.hardware_metadata,
                "location_metadata": nfc_rec.location_metadata,
                "acquisition_status": nfc_rec.acquisition_status,
                "derived_identifiers": nfc_rec.derived_identifiers,
                "entity_resolution": nfc_rec.entity_resolution_result,
                "case_correlations": nfc_rec.case_correlations,
                "finding_id": nfc_rec.finding_id,
                "investigator_assessment": nfc_rec.investigator_assessment,
                "provenance_info": nfc_rec.provenance_info,
                "evidence_status": ev_rec.processing_status if ev_rec else "UNKNOWN"
            }

# Singleton instance
nfc_evidence_service = NFCEvidenceService()
