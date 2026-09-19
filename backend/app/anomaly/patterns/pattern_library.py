"""
Declarative Pattern Library: Central repository of structured, versioned investigative patterns.
Defines criteria for promoting correlated signal groups into coherent candidate patterns.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class PatternDefinition(BaseModel):
    model_config = {"protected_namespaces": ()}
    pattern_id: str
    version: str = "v1.4.0"
    category: str
    title_template: str

    required_detectors_or_types: List[str]
    optional_detectors_or_types: List[str] = Field(default_factory=list)

    min_event_count: int = 1
    max_time_window_minutes: Optional[float] = None
    max_distance_km: Optional[float] = None

    what_happened_template: str
    why_unusual_template: str
    why_relevant_template: str


class PatternLibrary:
    """
    Central repository of declarative investigative patterns.
    """

    def __init__(self):
        self._patterns: Dict[str, PatternDefinition] = {}
        self._register_default_patterns()

    def register(self, pattern: PatternDefinition):
        self._patterns[pattern.pattern_id] = pattern

    def get_pattern(self, pattern_id: str) -> Optional[PatternDefinition]:
        return self._patterns.get(pattern_id)

    def get_all_patterns(self) -> List[PatternDefinition]:
        return list(self._patterns.values())

    def _register_default_patterns(self):
        # 1. Multi-Stage Financial Rapid Transfer to Cash / Liquidation
        self.register(PatternDefinition(
            pattern_id="FIN_RAPID_TRANSFER_TO_CASH",
            category="FINANCIAL",
            title_template="Large Inbound Transfer Followed by Rapid Distribution and Cash Withdrawal",
            required_detectors_or_types=["DET-FIN-ATM-CASHOUT", "DET-FIN-FANOUT"],
            optional_detectors_or_types=["DET-BEHAVIORAL-IF", "DET-STATISTICAL", "DET-GRAPH-NETWORK", "DET-RULE-ENGINE"],
            min_event_count=3,
            max_time_window_minutes=60.0,
            what_happened_template="The account received {inflow_amount} and immediately dissipated funds across {counterparty_count} counterparties before liquidating {withdrawal_amount} in physical cash through ATM channels within {time_window_minutes} minutes.",
            why_unusual_template="The rapid dissipation and physical liquidation occurred within a narrow interval, sharply contrasting with the account's historical fund retention baseline.",
            why_relevant_template="The involved accounts and liquidation sequence directly align with the suspected extortion money conduit timeline."
        ))

        # 2. Rapid Account Fan-Out & Pass-Through Mule
        self.register(PatternDefinition(
            pattern_id="FIN_RAPID_FAN_OUT",
            category="FINANCIAL",
            title_template="Rapid Account Fan-Out & Pass-Through Conduit",
            required_detectors_or_types=["DET-FIN-FANOUT"],
            optional_detectors_or_types=["DET-BEHAVIORAL-IF", "DET-STATISTICAL", "DET-RULE-ENGINE"],
            min_event_count=2,
            max_time_window_minutes=60.0,
            what_happened_template="The account acted as a rapid pass-through conduit, receiving {inflow_amount} and transferring {outflow_amount} ({depletion_ratio}% depletion) across {counterparty_count} recipients within {time_window_minutes} minutes.",
            why_unusual_template="High-velocity fund dissipation across multiple outward counterparties within 30 minutes deviates from normal commercial payment retention.",
            why_relevant_template="The receiving accounts are linked to known mule networks identified in the investigation scope."
        ))

        # 3. Rapid ATM Cash-Out
        self.register(PatternDefinition(
            pattern_id="FIN_ATM_CASHOUT",
            category="FINANCIAL",
            title_template="High-Frequency ATM Cash Liquidation Sequence",
            required_detectors_or_types=["DET-FIN-ATM-CASHOUT"],
            optional_detectors_or_types=["DET-RULE-ENGINE", "DET-STATISTICAL"],
            min_event_count=1,
            max_time_window_minutes=120.0,
            what_happened_template="Detected {withdrawal_count} successive ATM cash withdrawals totaling {withdrawal_amount} executed within a short operational window.",
            why_unusual_template="The withdrawal sequence exceeds normal retail banking patterns and represents an abrupt liquidation burst compared to the account baseline.",
            why_relevant_template="The physical cash withdrawals occurred immediately subsequent to illicit fund transfers under investigation."
        ))

        # 4. Financial Structuring / Smurfing
        self.register(PatternDefinition(
            pattern_id="FIN_STRUCTURING",
            category="FINANCIAL",
            title_template="Systematic Transaction Structuring Below Mandatory Reporting Threshold",
            required_detectors_or_types=["DET-FIN-STRUCTURING"],
            optional_detectors_or_types=["DET-RULE-ENGINE", "DET-STATISTICAL"],
            min_event_count=2,
            what_happened_template="Identified {structured_txns_count} transactions totaling {cluster_total} placed systematically between 70% and 99% of the ₹{reporting_threshold} regulatory reporting threshold.",
            why_unusual_template="Repetitive transaction values placed immediately below statutory reporting cutoffs indicate deliberate smurfing avoidance.",
            why_relevant_template="The clustered transactions originate from entities associated with the central syndicate accounts."
        ))

        # 5. Dormant Account Awakening
        self.register(PatternDefinition(
            pattern_id="FIN_DORMANT_AWAKENING",
            category="FINANCIAL",
            title_template="Sudden High-Velocity Reactivation of Dormant Account",
            required_detectors_or_types=["DET-FIN-DORMANT"],
            optional_detectors_or_types=["DET-BEHAVIORAL-IF", "DET-RULE-ENGINE"],
            min_event_count=1,
            what_happened_template="An account with {dormant_days} days of documented inactivity was abruptly reactivated with {sudden_txns_count} high-value transactions totaling {sudden_volume}.",
            why_unusual_template="Abrupt high-volume transactional activity on a prolonged dormant facility is a hallmark money mule activation signature.",
            why_relevant_template="The reactivation coincides with the commencement of the syndicate's extortion tranche distribution."
        ))

        # 6. Impossible Travel
        self.register(PatternDefinition(
            pattern_id="GEO_IMPOSSIBLE_TRAVEL",
            category="SPATIAL_TEMPORAL",
            title_template="Unusually Fast Movement Between Recorded Telemetry Locations",
            required_detectors_or_types=["DET-SPATIAL-TRAVEL"],
            optional_detectors_or_types=["DET-RULE-ENGINE"],
            min_event_count=2,
            what_happened_template="Recorded device presence across two locations separated by {distance_km} km within {time_difference_seconds} seconds, implying an impossible transit speed of {implied_speed_kmh} km/h.",
            why_unusual_template="The implied speed exceeds commercial vehicular transit plausibility (>800 km/h ground speed).",
            why_relevant_template="Indicates concurrent credential or device sharing by coordinated co-conspirators operating in separate jurisdictions."
        ))

        # 7. Geographic Convergence
        self.register(PatternDefinition(
            pattern_id="GEO_CONVERGENCE",
            category="SPATIAL_TEMPORAL",
            title_template="Repeated Multi-Entity Spatial Convergence",
            required_detectors_or_types=["DET-SPATIAL-CONVERGENCE"],
            optional_detectors_or_types=["DET-RULE-ENGINE"],
            min_event_count=2,
            what_happened_template="Multiple monitored entities repeatedly converge within the same localized perimeter during overlapping time windows.",
            why_unusual_template="Multiple targets repeatedly appear in the same small localized sector across successive days, deviating from independent movement baselines.",
            why_relevant_template="Spatial convergence links the targets to the same operational vicinity during key investigative windows."
        ))

        # 8. Trajectory Tailing
        self.register(PatternDefinition(
            pattern_id="GEO_TAILING",
            category="SPATIAL_TEMPORAL",
            title_template="Repeated Route Similarity and Surveillance Tailing",
            required_detectors_or_types=["DET-SPATIAL-TAILING"],
            min_event_count=3,
            what_happened_template="Identified correlated spatial trajectory between suspect and target device with a discrete lag of less than 300 seconds across multiple sequential sectors.",
            why_unusual_template="Consistent trajectory mirroring across non-arterial waypoints indicates deliberate tracking rather than coincidental transit.",
            why_relevant_template="The tailing sequence directly preceded the victim vehicle interception."
        ))

        # 9. Dark Period / Radio Silence
        self.register(PatternDefinition(
            pattern_id="GEO_DARK_PERIOD",
            category="SPATIAL_TEMPORAL",
            title_template="Device Activity Resumed Following Extended Signal Gap",
            required_detectors_or_types=["DET-SPATIAL-DARKPERIOD"],
            min_event_count=2,
            what_happened_template="Device exhibited an uncharacteristic radio silence gap of {radio_silence_hours} hours immediately preceding critical incident timestamps, followed by abrupt resumption.",
            why_unusual_template="Sudden cessation on an active handset followed by immediate post-incident reactivation indicates deliberate operational discipline.",
            why_relevant_template="The quiet period aligns precisely with the abduction window in Sector 15."
        ))

        # 10. Shared Clandestine Infrastructure
        self.register(PatternDefinition(
            pattern_id="SOC_SHARED_INFRASTRUCTURE",
            category="SOCIAL_COORDINATION",
            title_template="Shared Digital Infrastructure Co-Occurrence",
            required_detectors_or_types=["DET-SOC-INFRA"],
            optional_detectors_or_types=["DET-RULE-ENGINE", "DET-ID-DISCREPANCY"],
            min_event_count=2,
            what_happened_template="The four entities repeatedly use the same destination IP and Telegram group in overlapping windows.",
            why_unusual_template="Multiple distinct legal personas accessing identical destination IP servers and private messaging group identifiers across overlapping operational intervals.",
            why_relevant_template="Demonstrates shared technical and communication infrastructure among the associated persons."
        ))

        # 11. Synchronous Social / Cyber Activity
        self.register(PatternDefinition(
            pattern_id="SOC_SYNCHRONOUS_ACTIVITY",
            category="SOCIAL_COORDINATION",
            title_template="Synchronized Activity Alignment Across Separate Cyber Handles",
            required_detectors_or_types=["DET-SOC-SYNC"],
            min_event_count=2,
            what_happened_template="Disparate user accounts executed coordinated posting and message transmissions with {alignment_cosine} cosine temporal alignment within {burst_time_window_seconds}s.",
            why_unusual_template="Temporal coordination significantly exceeds independent organic user behavior.",
            why_relevant_template="Evidences a synchronized communication protocol coordinating extortion demands."
        ))

        # 12. Network / Tor / VPN Anonymization
        self.register(PatternDefinition(
            pattern_id="NET_VPN_TOR_ANONYMIZATION",
            category="NETWORK_OPSEC",
            title_template="Anonymization-Related Network Infrastructure Observed",
            required_detectors_or_types=["DET-NET-VPN-TOR"],
            optional_detectors_or_types=["DET-RULE-ENGINE"],
            min_event_count=1,
            what_happened_template="Network telemetry recorded {tor_session_count} Tor proxy sessions and {vpn_session_count} encrypted VPN tunnel connections on configured operational ports.",
            why_unusual_template="Target communications systematically routed through anonymizer relays rather than standard ISP transit.",
            why_relevant_template="Demonstrates operational security evasion during cyber messaging exchanges."
        ))

        # 13. Graph Network Bridge / Cut-Out
        self.register(PatternDefinition(
            pattern_id="GRAPH_NETWORK_BRIDGE",
            category="GRAPH_TOPOLOGY",
            title_template="Structural Bridge Entity Mediating Between Disjoint Groups",
            required_detectors_or_types=["DET-GRAPH-NETWORK", "DET-GDS-CENTRALITY"],
            min_event_count=1,
            what_happened_template="Entity exhibits high Betweenness Centrality ({betweenness_centrality}), serving as a vital structural broker connecting otherwise isolated sub-cells in the investigation graph.",
            why_unusual_template="Entity occupies a structurally central cut-out position in the 85th+ percentile of all network nodes.",
            why_relevant_template="Entity mediates communications between the primary ring and peripheral logistics."
        ))

        # 14. Identity Discrepancy / Synthetic Profile
        self.register(PatternDefinition(
            pattern_id="ID_DISCREPANCY",
            category="IDENTITY",
            title_template="Device / Identity Discrepancy",
            required_detectors_or_types=["DET-ID-DISCREPANCY"],
            min_event_count=1,
            what_happened_template="Monitored entity's handset temporarily maps to an unexpected hardware identifier (IMEI/IP) before reverting to prior profiles.",
            why_unusual_template="A transient device and identifier remap on a stable phone line deviates from normal device history.",
            why_relevant_template="Device discrepancies document hardware rotation during critical investigation intervals."
        ))

        # 15. Cross-Domain Multi-Modal Collision
        self.register(PatternDefinition(
            pattern_id="CROSS_DOMAIN_COLLISION",
            category="CROSS_DOMAIN",
            title_template="Cross-Domain Coordinated Activity Burst",
            required_detectors_or_types=["DET-CROSS-COLLISION"],
            optional_detectors_or_types=["DET-RULE-ENGINE", "DET-STATISTICAL"],
            min_event_count=2,
            what_happened_template="Financial, communication and network activity cluster in the same short Aug 28 window.",
            why_unusual_template="High-density multi-domain burst synchronizing financial transactions, calls, and network sessions within a short temporal window.",
            why_relevant_template="Aligns cross-modal actions across the core entities during the operational burst."
        ))

        # 16. Coordinated Financial Flow
        self.register(PatternDefinition(
            pattern_id="FIN_COORDINATED_FLOW",
            category="FINANCIAL",
            title_template="Coordinated Financial Flow",
            required_detectors_or_types=["DET-FIN-COORDINATED-FLOW"],
            optional_detectors_or_types=["DET-GRAPH-NETWORK", "DET-GDS-CENTRALITY"],
            min_event_count=3,
            what_happened_template="Recurring four-party directed cycle; Aug 28 burst totals INR 1,250,000.",
            why_unusual_template="Directed closed-loop circular financial flow across multiple distinct entities deviates from standard commercial settlements.",
            why_relevant_template="The circular transaction route and high-value burst directly link the primary accounts into an organized transfer cycle."
        ))

        # 17. Synchronized Communication Episode
        self.register(PatternDefinition(
            pattern_id="COMM_SYNCHRONIZED_EPISODE",
            category="COMMUNICATION",
            title_template="Recurring Synchronized Communication Episodes",
            required_detectors_or_types=["DET-COMM-SYNC-EPISODE"],
            optional_detectors_or_types=["DET-SOC-SYNC"],
            min_event_count=3,
            what_happened_template="The five entities exchange calls in a repeated tightly sequenced pattern.",
            why_unusual_template="Repeated multi-party sequential call chains occurring within narrow time cascades deviate from random communication patterns.",
            why_relevant_template="Cascading call episodes establish operational synchronization across the active entity group."
        ))

        # 18. High-Value Transaction Burst
        self.register(PatternDefinition(
            pattern_id="FIN_HIGH_VALUE_BURST",
            category="FINANCIAL",
            title_template="High-Value Transaction Burst",
            required_detectors_or_types=["DET-FIN-HIGH-VALUE-BURST"],
            optional_detectors_or_types=["DET-BEHAVIORAL-IF", "DET-FIN-FANOUT"],
            min_event_count=2,
            what_happened_template="Late-period bank transactions exhibit unusual amount and velocity relative to background.",
            why_unusual_template="Elevated transaction amounts and high transaction frequency deviate sharply from historical account baselines.",
            why_relevant_template="Documents significant concentrated fund transfers during the critical investigation period."
        ))

        # 19. Progressive Geospatial Trajectory
        self.register(PatternDefinition(
            pattern_id="GEO_TRAJECTORY",
            category="SPATIAL_TEMPORAL",
            title_template="Geospatial Multi-Location Trajectory",
            required_detectors_or_types=["DET-GEO-TRAJECTORY"],
            optional_detectors_or_types=["DET-SPATIAL-TAILING"],
            min_event_count=3,
            what_happened_template="Recorded progressive multi-location trajectory traversing distinct sectors and municipal locations.",
            why_unusual_template="Sequential transit across multiple distinct locations in a short window represents an active operational movement pattern.",
            why_relevant_template="Establishes the physical movement route of the subject during the critical investigative window."
        ))


pattern_library = PatternLibrary()
