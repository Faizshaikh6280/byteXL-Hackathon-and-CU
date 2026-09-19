from typing import List, Dict, Type
from app.anomaly.engines.base import BaseDetector
from app.anomaly.engines.behavioral.isolation_forest import BehavioralIsolationForestDetector
from app.anomaly.engines.network.graph_engine import NetworkGraphAnomalyEngine
from app.anomaly.engines.spatial_temporal.impossible_travel import ImpossibleTravelDetector
from app.anomaly.engines.spatial_temporal.st_dbscan import STDBSCANConvergenceDetector
from app.anomaly.engines.spatial_temporal.trajectory_tailing import TrajectoryTailingDetector
from app.anomaly.engines.spatial_temporal.dark_period import DarkPeriodDetector
from app.anomaly.engines.financial.structuring import StructuringSmurfingDetector
from app.anomaly.engines.financial.rapid_fan_out import RapidFanOutDetector
from app.anomaly.engines.financial.dormant_awakening import DormantAccountAwakeningDetector
from app.anomaly.engines.financial.atm_cashout import ATMCashoutDetector
from app.anomaly.engines.social.synchronous_activity import SynchronousSocialActivityDetector
from app.anomaly.engines.social.shared_infrastructure import SharedInfrastructureDetector
from app.anomaly.engines.vpn_network.vpn_tor_engine import VPNTorAnonymizerDetector
from app.anomaly.engines.cross_domain.collision_engine import CrossDomainCollisionEngine
from app.anomaly.engines.identity.discrepancy_engine import IdentityDiscrepancyEngine
from app.anomaly.engines.graph.gds_engine import GraphDataScienceEngine

from app.anomaly.engines.financial.coordinated_flow import CoordinatedFinancialFlowDetector
from app.anomaly.engines.financial.transaction_burst import HighValueTransactionBurstDetector
from app.anomaly.engines.communication.synchronized_communication import SynchronizedCommunicationDetector
from app.anomaly.engines.spatial_temporal.trajectory_engine import GeospatialTrajectoryDetector

class DetectorRegistry:
    """
    Central registry of specialized, domain-specific investigative detection engines.
    Manages instantiation, health tracking, domain routing, and execution pipelines.
    Excludes black-box statistical outliers and arbitrary deterministic rules.
    """

    def __init__(self):
        self._detectors: List[BaseDetector] = []
        self._register_default_engines()

    def _register_default_engines(self):
        # High-fidelity domain-specific investigative engines only
        self.register(BehavioralIsolationForestDetector())
        self.register(ATMCashoutDetector())
        self.register(RapidFanOutDetector())
        self.register(DormantAccountAwakeningDetector())
        self.register(StructuringSmurfingDetector())
        self.register(CoordinatedFinancialFlowDetector())
        self.register(HighValueTransactionBurstDetector())
        self.register(SynchronizedCommunicationDetector())
        self.register(ImpossibleTravelDetector())
        self.register(STDBSCANConvergenceDetector())
        self.register(TrajectoryTailingDetector())
        self.register(GeospatialTrajectoryDetector())
        self.register(DarkPeriodDetector())
        self.register(SharedInfrastructureDetector())
        self.register(SynchronousSocialActivityDetector())
        self.register(VPNTorAnonymizerDetector())
        self.register(CrossDomainCollisionEngine())
        self.register(IdentityDiscrepancyEngine())
        self.register(NetworkGraphAnomalyEngine())
        self.register(GraphDataScienceEngine())

    def register(self, detector: BaseDetector):
        self._detectors.append(detector)

    def get_all_detectors(self) -> List[BaseDetector]:
        return list(self._detectors)

    def get_detectors_for_domain(self, domain: str) -> List[BaseDetector]:
        return [
            d for d in self._detectors
            if domain in d.get_metadata().applicable_domains or "CROSS_DOMAIN" in d.get_metadata().applicable_domains
        ]

    def get_detector_by_id(self, detector_id: str) -> BaseDetector:
        for d in self._detectors:
            if d.get_metadata().detector_id == detector_id:
                return d
        raise KeyError(f"Detector with ID {detector_id} not found in registry.")

detector_registry = DetectorRegistry()
