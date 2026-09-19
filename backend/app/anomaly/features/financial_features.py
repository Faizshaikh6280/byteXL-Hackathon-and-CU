from typing import List, Dict, Any
from datetime import datetime
import numpy as np

class FinancialFeatureExtractor:
    """Extracts monetary, velocity, and counterparty features from Banking events."""

    @staticmethod
    def extract_features(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Input: list of canonical Banking events for an account or entity.
        Output: Financial behavioral feature vector.
        """
        if not events:
            return {}

        amounts = []
        inflow_amounts = []
        outflow_amounts = []
        counterparties = set()
        channels = set()
        timestamps = []
        round_amounts = 0

        for e in events:
            fin = e.get("financial", {})
            amt = fin.get("amount_inr")
            txn_type = str(fin.get("txn_type", "")).upper()

            if amt is not None:
                try:
                    val = float(amt)
                    amounts.append(val)
                    if val > 0 and (val % 1000 == 0 or val % 50000 == 0 or val % 100000 == 0):
                        round_amounts += 1

                    if txn_type in ("CREDIT", "DEPOSIT", "INFLOW"):
                        inflow_amounts.append(val)
                    elif txn_type in ("DEBIT", "TRANSFER", "WITHDRAWAL", "OUTFLOW"):
                        outflow_amounts.append(val)
                    else:
                        outflow_amounts.append(val)
                except Exception:
                    pass

            cp = fin.get("counterparty")
            if cp:
                counterparties.add(str(cp))

            ch = fin.get("channel")
            if ch:
                channels.add(str(ch))

            ts_str = e.get("timestamp")
            if ts_str:
                try:
                    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    timestamps.append(dt)
                except Exception:
                    pass

        total_txns = len(events)
        total_volume = float(np.sum(amounts)) if amounts else 0.0
        total_inflow = float(np.sum(inflow_amounts)) if inflow_amounts else 0.0
        total_outflow = float(np.sum(outflow_amounts)) if outflow_amounts else 0.0
        avg_amount = float(np.mean(amounts)) if amounts else 0.0
        max_amount = float(np.max(amounts)) if amounts else 0.0
        std_amount = float(np.std(amounts)) if len(amounts) > 1 else 0.0

        inflow_outflow_ratio = total_outflow / total_inflow if total_inflow > 0 else 1.0
        round_ratio = round_amounts / total_txns if total_txns > 0 else 0.0

        # Velocity: transactions per day
        velocity_per_day = 0.0
        if len(timestamps) > 1:
            span_days = max(1.0, (max(timestamps) - min(timestamps)).total_seconds() / 86400.0)
            velocity_per_day = total_txns / span_days

        return {
            "transaction_count": total_txns,
            "total_volume_inr": round(total_volume, 2),
            "total_inflow_inr": round(total_inflow, 2),
            "total_outflow_inr": round(total_outflow, 2),
            "avg_transaction_inr": round(avg_amount, 2),
            "max_transaction_inr": round(max_amount, 2),
            "std_transaction_inr": round(std_amount, 2),
            "inflow_outflow_ratio": round(inflow_outflow_ratio, 3),
            "round_amount_ratio": round(round_ratio, 3),
            "unique_counterparties": len(counterparties),
            "velocity_per_day": round(velocity_per_day, 2),
            "observed_channels": list(channels)
        }

financial_features = FinancialFeatureExtractor()
