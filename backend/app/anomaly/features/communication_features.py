from typing import List, Dict, Any
from datetime import datetime
import numpy as np

class CommunicationFeatureExtractor:
    """Extracts behavioral and statistical telemetry features from Telecom CDR events."""

    @staticmethod
    def extract_features(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Input: list of canonical CDR events for a single phone/entity.
        Output: Aggregated entity-level communication feature dictionary.
        """
        if not events:
            return {}

        total_calls = len(events)
        durations = []
        night_calls = 0
        counterparties = set()
        imeis = set()
        towers = set()
        timestamps = []

        for e in events:
            telemetry = e.get("telemetry", {})
            dur = telemetry.get("duration_seconds")
            if dur is not None:
                try:
                    durations.append(float(dur))
                except Exception:
                    pass

            ts_str = e.get("timestamp")
            if ts_str:
                try:
                    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    timestamps.append(dt)
                    if 1 <= dt.hour < 5:
                        night_calls += 1
                except Exception:
                    pass

            counterparty = e.get("entities", {}).get("counterparty_name") or e.get("attributes", {}).get("called_number")
            if counterparty:
                counterparties.add(str(counterparty))

            imei = telemetry.get("imei")
            if imei:
                imeis.add(str(imei))

            tower = telemetry.get("cell_tower_id")
            if tower:
                towers.add(str(tower))

        avg_dur = float(np.mean(durations)) if durations else 0.0
        max_dur = float(np.max(durations)) if durations else 0.0
        std_dur = float(np.std(durations)) if len(durations) > 1 else 0.0
        night_ratio = night_calls / total_calls if total_calls > 0 else 0.0

        # Communication burstiness (coefficient of variation of inter-arrival times)
        burstiness = 0.0
        if len(timestamps) > 2:
            sorted_ts = sorted(timestamps)
            intervals = [(sorted_ts[i+1] - sorted_ts[i]).total_seconds() for i in range(len(sorted_ts)-1)]
            if len(intervals) > 1 and np.mean(intervals) > 0:
                burstiness = float(np.std(intervals) / np.mean(intervals))

        return {
            "call_count": total_calls,
            "unique_contacts": len(counterparties),
            "unique_imeis": len(imeis),
            "unique_towers": len(towers),
            "avg_call_duration": round(avg_dur, 2),
            "max_call_duration": round(max_dur, 2),
            "std_call_duration": round(std_dur, 2),
            "night_call_count": night_calls,
            "night_activity_ratio": round(night_ratio, 3),
            "communication_burstiness": round(burstiness, 3),
            "observed_imeis": list(imeis),
            "observed_towers": list(towers)
        }

comm_features = CommunicationFeatureExtractor()
