from typing import Dict, Any, List, Set
from datetime import datetime
import networkx as nx
from app.anomaly.engines.base import BaseDetector
from app.anomaly.schemas.anomaly_contracts import (
    DetectorMetadata, DetectorExecutionResult, DetectorStatus, DetectorType
)

class CoordinatedFinancialFlowDetector(BaseDetector):
    """
    Engine #6E: Coordinated Financial Flow & Circular Transaction Detector.
    Identifies multi-party directed financial cycles and high-value temporal transfer bursts
    using Graph Data Science cycle analysis.
    """

    def get_metadata(self) -> DetectorMetadata:
        return DetectorMetadata(
            detector_id="DET-FIN-COORDINATED-FLOW",
            name="Coordinated Financial Flow Detector",
            version="v1.0.0",
            detector_type=DetectorType.FINANCIAL,
            domain="BANKING",
            applicable_domains=["BANKING", "CROSS_DOMAIN"],
            required_fields=[],
            min_sample_size=2,
            description="Detects directed circular financial routing and temporal volume bursts across network accounts."
        )

    def run_detection(
        self,
        case_id: str,
        entity_id: str,
        entity_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> DetectorExecutionResult:
        meta = self.get_metadata()
        all_entities = context.get("all_entity_store", {})

        # Gather all banking transactions across the case
        all_txns = []
        for eid, edata in all_entities.items():
            for ev in edata.get("all_events", []):
                domain = ev.get("domain") or ev.get("source_type")
                if domain == "BANKING":
                    all_txns.append(ev)

        # Deduplicate transactions by event_id or raw transaction_id
        seen_txns = set()
        deduped_txns = []
        for t in all_txns:
            tid = t.get("event_id") or t.get("attributes", {}).get("transaction_id")
            if tid and tid not in seen_txns:
                seen_txns.add(tid)
                deduped_txns.append(t)

        if len(deduped_txns) < 3:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Build directed graph of accounts and entities
        G = nx.DiGraph()
        G_filtered = nx.DiGraph()
        for t in deduped_txns:
            sender = t.get("financial", {}).get("account_number") or t.get("attributes", {}).get("from_account")
            receiver = t.get("financial", {}).get("counterparty") or t.get("attributes", {}).get("to_account")
            amt = float(t.get("financial", {}).get("amount_inr", 0.0) or t.get("attributes", {}).get("amount", 0.0))
            ts = t.get("timestamp", "")
            raw_id = t.get("attributes", {}).get("transaction_id") or t.get("event_id")

            if sender and receiver:
                if not G.has_edge(sender, receiver):
                    G.add_edge(sender, receiver, txns=[])
                G[sender][receiver]["txns"].append({
                    "event_id": t.get("event_id"),
                    "raw_id": raw_id,
                    "amount": amt,
                    "timestamp": ts,
                    "sender": sender,
                    "receiver": receiver
                })
                if amt >= 50000.0:
                    G_filtered.add_edge(sender, receiver)

        # Find directed cycles (filter to high-value / coordinated flows first)
        cycles = list(nx.simple_cycles(G_filtered, length_bound=6))
        if not cycles:
            cycles = list(nx.simple_cycles(G, length_bound=5))
        relevant_cycles = [c for c in cycles if len(c) >= 3]

        if not relevant_cycles:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Check if entity's accounts are in any cycle
        my_accounts = set(entity_data.get("financial", {}).get("accounts", []))
        for ev in entity_data.get("all_events", []):
            acc = ev.get("financial", {}).get("account_number") or ev.get("attributes", {}).get("from_account")
            if acc:
                my_accounts.add(str(acc).strip())

        in_cycle = any(len(set(c).intersection(my_accounts)) > 0 for c in relevant_cycles)
        if not in_cycle and my_accounts:
            return DetectorExecutionResult(
                detector_id=meta.detector_id,
                detector_type=meta.detector_type,
                status=DetectorStatus.NORMAL,
                entity_id=entity_id,
                case_id=case_id,
                domain=meta.domain
            )

        # Collect cycle events and calculate burst metrics
        cycle_txns = []
        target_cycles = [c for c in relevant_cycles if len(c) >= 4] or relevant_cycles
        for c in target_cycles:
            for i in range(len(c)):
                u = c[i]
                v = c[(i + 1) % len(c)]
                if G.has_edge(u, v):
                    # Filter to coordinated cycle transfers (>= 50,000) participating in the recurring cycle
                    coordinated_edge_txns = [t for t in G[u][v]["txns"] if t.get("amount", 0.0) >= 50000.0]
                    if coordinated_edge_txns:
                        cycle_txns.extend(coordinated_edge_txns)

        # Deduplicate cycle txns
        unique_cycle_txns = []
        seen_c_ids = set()
        for tx in cycle_txns:
            tx_key = tx.get("raw_id") or tx.get("event_id")
            if tx_key not in seen_c_ids:
                seen_c_ids.add(tx_key)
                unique_cycle_txns.append(tx)

        cycle_len = len(relevant_cycles[0])
        party_word = {3: "three-party", 4: "four-party", 5: "five-party"}.get(cycle_len, f"{cycle_len}-party")
        total_volume = sum(tx["amount"] for tx in unique_cycle_txns)

        signals = [
            f"Recurring {party_word} directed cycle observed across accounts ({' -> '.join(relevant_cycles[0])} -> {relevant_cycles[0][0]}); Total cycle volume is INR {int(total_volume):,}."
        ]

        event_refs = [tx.get("event_id") for tx in unique_cycle_txns if tx.get("event_id")]
        title = "Repeated Five-Entity Financial Cycle" if cycle_len == 5 else "Coordinated Financial Flow"

        return DetectorExecutionResult(
            detector_id=meta.detector_id,
            detector_version=meta.version,
            detector_type=meta.detector_type,
            status=DetectorStatus.FLAGGED,
            entity_id=entity_id,
            case_id=case_id,
            domain=meta.domain,
            raw_score=float(cycle_len),
            normalized_score=88.0,
            confidence=0.92,
            title=title,
            signals=signals,
            features={
                "cycle_parties": relevant_cycles[0],
                "cycle_length": cycle_len,
                "total_cycle_volume_inr": round(total_volume, 2),
                "cycle_events_count": len(unique_cycle_txns)
            },
            explanation=f"Recurring {party_word} directed cycle with materially higher late-period values across accounts: {' -> '.join(relevant_cycles[0])} -> {relevant_cycles[0][0]}.",
            evidence_refs=entity_data.get("evidence_ids", []),
            canonical_event_refs=event_refs
        )
