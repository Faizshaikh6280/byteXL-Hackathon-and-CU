from pydantic import BaseModel, Field
from typing import Dict, Any, List

class EngineWeightsConfig(BaseModel):
    behavioral: float = 0.20
    rules: float = 0.20
    statistical: float = 0.10
    network: float = 0.20
    spatial: float = 0.10
    temporal: float = 0.05
    cross_domain: float = 0.10
    identity: float = 0.05

class SpatioTemporalThresholds(BaseModel):
    max_plausible_speed_kmh: float = 850.0       # Air/transit plausibility limit
    domestic_fast_speed_kmh: float = 120.0       # Road travel speed threshold
    st_dbscan_eps_km: float = 2.0                # Spatial neighborhood radius (km)
    st_dbscan_eps_time_sec: int = 5400           # Temporal neighborhood window (90 mins)
    st_dbscan_min_samples: int = 3               # Convergence cluster minimum events
    trajectory_tailing_distance_km: float = 0.5  # Proximity for tailing detection
    trajectory_tailing_lag_seconds: int = 300    # Maximum lag for follower tracking
    signal_silence_threshold_hours: float = 18.0  # Dark period duration before incident (18h+ eliminates overnight sleep false positives)

class FinancialThresholds(BaseModel):
    high_value_transaction_inr: float = 1000000.0 # High value alert trigger (₹10 Lakhs)
    structuring_daily_cap_inr: float = 500000.0   # Regulatory reporting limit threshold (₹5 Lakhs)
    structuring_lower_bound_ratio: float = 0.70   # Near-threshold lower bound (70% - 99%)
    structuring_min_transactions: int = 2         # Minimum txns in window
    structuring_window_hours: int = 48            # Window to aggregate candidate structuring
    rapid_fanout_window_seconds: int = 3600       # 60-minute inflow to split outflow window
    rapid_fanout_min_counterparties: int = 2      # Minimum outgoing recipients
    rapid_fanout_depletion_ratio: float = 0.60    # Outflow / Inflow ratio threshold
    dormant_account_days_inactive: int = 90       # Inactivity dormancy threshold
    atm_cashout_window_seconds: int = 3600        # Rapid ATM cashout window (1 hr)

class NetworkDeviceThresholds(BaseModel):
    burner_phone_imei_switch_limit: int = 2      # Max IMEIs per phone number in 24h
    device_sharing_identities_limit: int = 2     # Max personas per physical IMEI
    shared_ip_personas_limit: int = 2            # Max distinct personas per dynamic IP
    suspicious_night_start_hour: int = 1         # 01:00 AM
    suspicious_night_end_hour: int = 5           # 05:00 AM
    tor_default_ports: List[int] = [9001, 9030, 9050, 9051]
    vpn_default_ports: List[int] = [1194, 500, 4500, 1701, 1723]

class AnomalySubsystemConfig(BaseModel):
    config_version: str = "v2.0.0"
    isolation_forest_contamination: float = 0.10
    isolation_forest_estimators: int = 200
    z_score_threshold: float = 3.0
    robust_z_threshold: float = 3.5
    iqr_multiplier: float = 1.5

    # Weights and domain thresholds
    weights: EngineWeightsConfig = Field(default_factory=EngineWeightsConfig)
    spatial: SpatioTemporalThresholds = Field(default_factory=SpatioTemporalThresholds)
    financial: FinancialThresholds = Field(default_factory=FinancialThresholds)
    network: NetworkDeviceThresholds = Field(default_factory=NetworkDeviceThresholds)

    # Severity bands
    severity_critical_threshold: float = 85.0
    severity_high_threshold: float = 65.0
    severity_medium_threshold: float = 40.0

anomaly_config = AnomalySubsystemConfig()
