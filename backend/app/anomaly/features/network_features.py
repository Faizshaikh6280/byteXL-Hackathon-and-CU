from typing import List, Dict, Any
import numpy as np
from app.anomaly.config.anomaly_config import anomaly_config

class NetworkFeatureExtractor:
    """Extracts IP, port, and bandwidth telemetry features from IPDR / session logs."""

    @staticmethod
    def extract_features(events: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not events:
            return {}

        assigned_ips = set()
        dest_ips = set()
        ports = []
        bytes_transferred = []
        tor_ports_hit = 0
        vpn_ports_hit = 0

        tor_ports = set(anomaly_config.network.tor_default_ports)
        vpn_ports = set(anomaly_config.network.vpn_default_ports)

        for e in events:
            telemetry = e.get("telemetry", {})
            ip = telemetry.get("assigned_ip")
            if ip:
                assigned_ips.add(str(ip))

            dip = telemetry.get("destination_ip")
            if dip:
                dest_ips.add(str(dip))

            port = telemetry.get("service_port")
            if port is not None:
                try:
                    p = int(port)
                    ports.append(p)
                    if p in tor_ports:
                        tor_ports_hit += 1
                    if p in vpn_ports:
                        vpn_ports_hit += 1
                except Exception:
                    pass

            b = telemetry.get("bytes_transferred")
            if b is not None:
                try:
                    bytes_transferred.append(float(b))
                except Exception:
                    pass

        total_sessions = len(events)
        total_bytes = float(np.sum(bytes_transferred)) if bytes_transferred else 0.0
        avg_bytes = float(np.mean(bytes_transferred)) if bytes_transferred else 0.0
        max_bytes = float(np.max(bytes_transferred)) if bytes_transferred else 0.0

        return {
            "session_count": total_sessions,
            "unique_assigned_ips": len(assigned_ips),
            "unique_destination_ips": len(dest_ips),
            "observed_assigned_ips": list(assigned_ips),
            "observed_destination_ips": list(dest_ips),
            "total_bytes_transferred": round(total_bytes, 2),
            "avg_bytes_per_session": round(avg_bytes, 2),
            "max_bytes_session": round(max_bytes, 2),
            "tor_port_hits": tor_ports_hit,
            "vpn_port_hits": vpn_ports_hit,
            "is_vpn_tor_suspect": bool(tor_ports_hit > 0 or vpn_ports_hit > 0)
        }

network_features = NetworkFeatureExtractor()
