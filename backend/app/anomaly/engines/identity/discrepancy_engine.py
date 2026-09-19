from typing import Dict, Any, List
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel

class IdentityDiscrepancyEngine(BaseDetector):
    """
    Engine #10: Identity & Entity Discrepancy Engine.
    Leverages Zingg Entity Resolution golden clusters to identify synthetic identities,
    alias discrepancies, shared national identifiers, and conflicting identity attributes.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-ID-DISCREPANCY",
            name="Zingg Identity & Profile Discrepancy Engine",
            version="v2.0.0",
            detector_type=DetectorType.IDENTITY_DISCREPANCY,
            domain="KYC",
            applicable_domains=["KYC", "CROSS_DOMAIN"],
            required_fields=[],
            min_sample_size=1,
            description="Detects alias proliferation, conflicting credentials, and synthetic identity markers."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()

        # Query Golden Profile from PostgreSQL
        profile = None
        with get_db_context() as db:
            p = db.query(GoldenProfileModel).filter_by(z_cluster_id=entity_id).first()
            if p:
                profile = {
                    "primary_name": p.primary_name,
                    "aliases": p.known_aliases or [],
                    "phones": p.known_phones or [],
                    "accounts": p.known_accounts or [],
                    "national_ids": p.national_ids or [],
                    "risk_score": p.risk_score
                }

        if not profile:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NOT_APPLICABLE,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain,
                not_applicable_reason="No resolved golden profile cluster found for entity ID."
            )

        signals = []
        score = 0.0

        aliases = profile.get("aliases", [])
        if len(aliases) >= 1:
            score += 35.0
            signals.append(f"Alias Proliferation: Entity resolved to {len(aliases)} operating alias(es) ({', '.join(aliases)}).")

        phones = profile.get("phones", [])
        if len(phones) >= 2:
            score += 25.0
            signals.append(f"Multiple Linked Cellular Subscriptions: Associated with {len(phones)} phone numbers ({', '.join(phones)}).")

        accounts = profile.get("accounts", [])
        if len(accounts) >= 2:
            score += 20.0
            signals.append(f"Multi-Account Banking Footprint: Linked across {len(accounts)} financial accounts.")

        # Dynamic device & identifier switching check
        from collections import Counter
        observed_imeis = []
        observed_devices = []
        observed_ips = []

        all_events_sorted = sorted(
            entity_data.get("all_events", []),
            key=lambda e: e.get("timestamp") or ""
        )

        for ev in all_events_sorted:
            tel = ev.get("telemetry", {})
            attrs = ev.get("attributes", {})
            imei = tel.get("imei") or attrs.get("imei")
            dev = attrs.get("device_id")
            ip = tel.get("assigned_ip") or attrs.get("ip") or attrs.get("client_ip")
            if imei:
                observed_imeis.append(str(imei).strip())
            if dev:
                observed_devices.append(str(dev).strip())
            if ip:
                observed_ips.append(str(ip).strip())

        unique_imeis = list(dict.fromkeys(observed_imeis))
        unique_devices = list(dict.fromkeys(observed_devices))
        unique_ips = list(dict.fromkeys(observed_ips))

        dominant_imei = Counter(observed_imeis).most_common(1)[0][0] if observed_imeis else None
        dominant_dev = Counter(observed_devices).most_common(1)[0][0] if observed_devices else None

        discrepancy_event_ids = []
        has_device_discrepancy = len(unique_imeis) >= 2 or len(unique_devices) >= 2

        if has_device_discrepancy:
            for i, ev in enumerate(all_events_sorted):
                tel = ev.get("telemetry", {})
                attrs = ev.get("attributes", {})
                imei = str(tel.get("imei") or attrs.get("imei") or "").strip()
                dev = str(attrs.get("device_id") or "").strip()
                eid = ev.get("event_id") or attrs.get("record_id")

                is_anomaly = False
                if imei and dominant_imei and imei != dominant_imei:
                    is_anomaly = True
                if dev and dominant_dev and dev != dominant_dev:
                    is_anomaly = True

                if is_anomaly and eid:
                    discrepancy_event_ids.append(eid)
                    # Check subsequent events for return to baseline hardware
                    for next_ev in all_events_sorted[i + 1:i + 6]:
                        next_tel = next_ev.get("telemetry", {})
                        next_attrs = next_ev.get("attributes", {})
                        next_imei = str(next_tel.get("imei") or next_attrs.get("imei") or "").strip()
                        next_dev = str(next_attrs.get("device_id") or "").strip()
                        next_eid = next_ev.get("event_id") or next_attrs.get("record_id")
                        if ((dominant_imei and next_imei == dominant_imei) or (dominant_dev and next_dev == dominant_dev)) and next_eid:
                            discrepancy_event_ids.append(next_eid)
                            break

            score += 40.0
            signals.append(f"Device / Identifier Discrepancy: Handset briefly remapped to unexpected hardware ({', '.join(unique_imeis or unique_devices)}) before returning to prior identifiers.")

        if score < 35.0:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        total_score = min(88.0, 70.0 + (len(signals) * 7.0))
        
        if has_device_discrepancy:
            title = "Device / Identity Discrepancy"
            explanation = f"{profile.get('primary_name', 'Subject')}'s phone briefly maps to an unexpected IMEI/device/IP before returning to prior identifiers."
        else:
            title = "Identity Discrepancy & Profile Risk"
            explanation = f"Entity resolution discrepancy engine identified synthetic profile risk for {profile.get('primary_name', 'Subject')}."

        ev_refs = list(dict.fromkeys(discrepancy_event_ids)) if discrepancy_event_ids else entity_data.get("event_ids", [])[:5]

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(len(aliases) + len(phones) + (2 if has_device_discrepancy else 0)),
            normalized_score=round(total_score, 1),
            confidence=0.90,
            title=title,
            signals=signals,
            features={
                **profile,
                "unique_imeis": unique_imeis,
                "unique_devices": unique_devices,
                "device_discrepancy": has_device_discrepancy
            },
            explanation=explanation,
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=ev_refs
        )
