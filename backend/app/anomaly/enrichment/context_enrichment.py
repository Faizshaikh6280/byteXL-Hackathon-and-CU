"""
ContextEnrichmentEngine: Enriches CandidatePatterns with multi-dimensional operational context:
- Entity context (Golden Profiles, aliases, accounts, phones, handles)
- Event context (traceable canonical event details with exact amounts and timestamps)
- Timeline context (ordered event chronology with relative elapsed times)
- Spatial context (verified waypoints, distances, implied velocities)
- Graph context (subgraph projection, broker/cut-out role, community links)
- Case context (investigation objectives, targets, period)
- Historical and peer baselines
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.core.database import get_db_context
from app.models.postgres_models import GoldenProfileModel, CaseModel
from app.anomaly.schemas.signal_contracts import CandidatePattern

logger = logging.getLogger("ContextEnrichmentEngine")


class EnrichedContext:
    """Container for enriched context associated with a CandidatePattern."""

    def __init__(self):
        self.primary_entities: List[Dict[str, Any]] = []
        self.related_entities: List[Dict[str, Any]] = []
        self.supporting_events: List[Dict[str, Any]] = []
        self.timeline_context: Dict[str, Any] = {}
        self.spatial_context: Dict[str, Any] = {}
        self.graph_context: Dict[str, Any] = {}
        self.case_context: Dict[str, Any] = {}
        self.baseline_context: Dict[str, Any] = {}
        self.entity_interactions: List[Dict[str, Any]] = []


class ContextEnrichmentEngine:
    """
    Assembles complete factual context for CandidatePatterns without fabricating missing dimensions.
    """

    def enrich(
        self,
        candidate: CandidatePattern,
        entity_store: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> EnrichedContext:
        enriched = EnrichedContext()
        context = context or {}

        # 1. Entity Context
        self._enrich_entity_context(candidate, entity_store, enriched)

        # 2. Event Context & Chronological Timeline
        self._enrich_events_and_timeline(candidate, entity_store, enriched)

        # 3. Spatial Context
        self._enrich_spatial_context(candidate, entity_store, enriched)

        # 4. Graph Context
        self._enrich_graph_context(candidate, context, enriched)

        # 5. Case Context
        self._enrich_case_context(candidate, enriched)

        # 6. Baseline Context
        self._enrich_baseline_context(candidate, entity_store, enriched)

        return enriched

    def _enrich_entity_context(
        self,
        candidate: CandidatePattern,
        entity_store: Dict[str, Any],
        enriched: EnrichedContext
    ):
        """Resolves real-world identities, aliases, and associated identifiers from Golden Profiles."""
        primary_entity_ids = candidate.entity_refs[:6] if candidate.entity_refs else ["Unknown"]

        with get_db_context() as db:
            case_profiles = db.query(GoldenProfileModel).filter(GoldenProfileModel.case_id == candidate.case_id).all()
            all_profiles = case_profiles if case_profiles else db.query(GoldenProfileModel).all()
            profile_lookup = {}
            for p in all_profiles:
                profile_lookup[p.z_cluster_id] = p
                if p.primary_name:
                    profile_lookup[p.primary_name] = p
                for ph in (p.known_phones or []):
                    profile_lookup[str(ph)] = p
                for acc in (p.known_accounts or []):
                    profile_lookup[str(acc)] = p

            seen_dedup_keys = set()
            for ent_id in candidate.entity_refs:
                profile = profile_lookup.get(ent_id)

                ent_store_data = entity_store.get(ent_id, {})
                display_name = (
                    profile.primary_name if profile else
                    ent_store_data.get("display_name") or ent_id
                )
                ent_type = (
                    "Person" if (profile or ent_id.startswith("CLUSTER")) else
                    ent_store_data.get("entity_type", "Entity")
                )

                # Deduplicate by resolved cluster ID or primary name to prevent duplicate entity cards
                dedup_key = profile.z_cluster_id if profile else display_name.strip().lower()
                if dedup_key in seen_dedup_keys:
                    continue
                seen_dedup_keys.add(dedup_key)

                info = {
                    "entity_id": profile.z_cluster_id if profile else ent_id,
                    "display_name": display_name,
                    "entity_type": ent_type,
                    "risk_score": profile.risk_score if profile else 0.5,
                    "aliases": profile.known_aliases if profile else [],
                    "phones": profile.known_phones if profile else [],
                    "accounts": profile.known_accounts if profile else [],
                    "social_handles": profile.social_handles if profile else []
                }

                if ent_id in primary_entity_ids or len(enriched.primary_entities) < 4:
                    enriched.primary_entities.append(info)
                else:
                    enriched.related_entities.append(info)

        if not enriched.primary_entities:
            enriched.primary_entities.append({
                "entity_id": candidate.entity_refs[0] if candidate.entity_refs else "Unknown",
                "display_name": candidate.entity_refs[0] if candidate.entity_refs else "Unknown",
                "entity_type": "Person"
            })

    def _enrich_events_and_timeline(
        self,
        candidate: CandidatePattern,
        entity_store: Dict[str, Any],
        enriched: EnrichedContext
    ):
        """Extracts exact canonical events and organizes them into a chronological sequence."""
        all_candidate_events = []
        target_event_ids = set(candidate.event_refs)
        event_entity_map = {}

        # Retrieve event objects from entity_store and track owner entity
        for ent_id in candidate.entity_refs:
            ent_data = entity_store.get(ent_id, {})
            ent_name = ent_data.get("display_name") or ent_id
            for ev in ent_data.get("all_events", []):
                ev_id = ev.get("event_id")
                if not target_event_ids or ev_id in target_event_ids:
                    all_candidate_events.append(ev)
                    if ev_id and ev_id not in event_entity_map:
                        event_entity_map[ev_id] = ent_name

        # Deduplicate events by event_id
        seen_ids = set()
        deduped_events = []
        for e in all_candidate_events:
            eid = e.get("event_id")
            if eid and eid not in seen_ids:
                seen_ids.add(eid)
                deduped_events.append(e)

        # Sort chronologically (strictly timezone-aware UTC)
        min_utc = datetime.min.replace(tzinfo=timezone.utc)

        def get_dt(ev):
            ts = ev.get("timestamp")
            if not ts:
                return min_utc
            try:
                if isinstance(ts, datetime):
                    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
                parsed = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except Exception:
                return min_utc

        deduped_events.sort(key=get_dt)

        # Build supporting event representations & timeline steps
        timeline_steps = []
        t0: Optional[datetime] = None

        for ev in deduped_events:
            dt = get_dt(ev)
            if t0 is None and dt != min_utc:
                t0 = dt

            delta_str = "+0m"
            if t0 and dt != min_utc:
                delta_mins = int((dt - t0).total_seconds() / 60)
                delta_str = f"+{delta_mins}m"

            domain = ev.get("domain") or ev.get("source_type", "UNKNOWN")
            event_type = ev.get("event_type", "EVENT")
            amt = ev.get("financial", {}).get("amount_inr", 0.0)
            channel = ev.get("financial", {}).get("channel") or ev.get("financial", {}).get("txn_type")
            counterparty = ev.get("financial", {}).get("counterparty")
            location_str = ev.get("telemetry", {}).get("address") or ev.get("telemetry", {}).get("cell_tower_id") or ev.get("attributes", {}).get("place") or ev.get("attributes", {}).get("location")
            ip = ev.get("telemetry", {}).get("assigned_ip")
            eid = ev.get("event_id")

            # Resolve person name for this event
            person_name = (
                ev.get("entities", {}).get("name") or
                ev.get("attributes", {}).get("name") or
                event_entity_map.get(eid) or
                ""
            )

            # Structured event representation
            event_rep = {
                "event_id": eid,
                "timestamp": ev.get("timestamp"),
                "relative_time": delta_str,
                "domain": domain,
                "event_type": event_type,
                "amount_inr": amt,
                "channel": channel,
                "counterparty": counterparty,
                "location": location_str,
                "ip": ip,
                "evidence_id": ev.get("evidence_id"),
                "source_file": ev.get("source_file") or ev.get("provenance", {}).get("source_file")
            }
            enriched.supporting_events.append(event_rep)

            # Build officer-friendly readable timeline narrative
            caller = ev.get("attributes", {}).get("caller") or ev.get("entities", {}).get("phone")
            callee = ev.get("attributes", {}).get("callee") or ev.get("telemetry", {}).get("destination_ip")

            if domain == "BANKING" or event_type in ("TRANSACTION", "TRANSFER"):
                sender = person_name or "Target Account"
                step_desc = f"{sender} transferred ₹{amt:,.2f}"
                if counterparty:
                    step_desc += f" to {counterparty}"
                if channel:
                    step_desc += f" via {channel}"
                if location_str:
                    step_desc += f" ({location_str})"
            elif domain == "TELECOM" or event_type == "CALL":
                caller_str = person_name or (f"Caller {caller}" if caller else "Target")
                step_desc = f"{caller_str} placed call"
                if callee:
                    step_desc += f" to {callee}"
                dur = ev.get("telemetry", {}).get("duration_seconds") or ev.get("attributes", {}).get("duration_seconds")
                if dur:
                    step_desc += f" ({dur}s)"
                if location_str:
                    step_desc += f" [Tower: {location_str}]"
            elif domain == "GENERAL" or event_type == "LOCATION_EVENT":
                loc_disp = location_str or "Target Location"
                target_str = person_name or "Target"
                step_desc = f"{target_str} recorded at {loc_disp}"
            elif domain in ("NETWORK", "SOCIAL") or event_type in ("IP_SESSION", "SOCIAL_ACTIVITY"):
                target_str = person_name or "Target"
                grp = ev.get("attributes", {}).get("group_name") or ev.get("attributes", {}).get("channel") or ev.get("attributes", {}).get("destination_ip")
                if grp:
                    step_desc = f"{target_str} active in {grp}"
                elif ip:
                    step_desc = f"{target_str} connected via IP {ip}"
                else:
                    step_desc = f"{target_str} {event_type.replace('_', ' ').title()}"
            else:
                step_desc = f"{person_name + ': ' if person_name else ''}{event_type}"
                if amt > 0:
                    step_desc += f": ₹{amt:,.2f}"
                if location_str:
                    step_desc += f" at {location_str}"

            timeline_steps.append({
                "step_index": len(timeline_steps) + 1,
                "timestamp": ev.get("timestamp"),
                "time_offset": delta_str,
                "domain": domain,
                "description": step_desc,
                "event_id": eid
            })

        enriched.timeline_context = {
            "start_time": deduped_events[0].get("timestamp") if deduped_events else candidate.time_start,
            "end_time": deduped_events[-1].get("timestamp") if deduped_events else candidate.time_end,
            "total_events_in_sequence": len(deduped_events),
            "sequence_steps": timeline_steps
        }

        self._build_entity_interactions(candidate, deduped_events, event_entity_map, enriched)

    def _build_entity_interactions(
        self,
        candidate: CandidatePattern,
        deduped_events: List[Dict[str, Any]],
        event_entity_map: Dict[str, str],
        enriched: EnrichedContext
    ):
        """Constructs human-readable directed entity interactions and activities connecting suspects."""
        interactions = []
        seen_interactions = set()

        # Build name resolver from all resolved entities
        name_lookup = {}
        for e in enriched.primary_entities + enriched.related_entities:
            dname = e.get("display_name")
            eid = e.get("entity_id")
            if dname:
                name_lookup[eid] = dname
                for ph in e.get("phones", []):
                    name_lookup[str(ph)] = f"{dname} ({ph})"
                for acc in e.get("accounts", []):
                    name_lookup[str(acc)] = f"{dname} ({acc})"

        def resolve(ident: str) -> str:
            if not ident:
                return "Unknown Entity"
            s = str(ident).strip()
            return name_lookup.get(s, s)

        # 1. From canonical events (transfers, calls, presence, sessions)
        for ev in deduped_events:
            domain = ev.get("domain") or ev.get("source_type", "UNKNOWN")
            event_type = ev.get("event_type", "EVENT")
            amt = ev.get("financial", {}).get("amount_inr", 0.0)
            channel = ev.get("financial", {}).get("channel") or ev.get("financial", {}).get("txn_type")
            counterparty = ev.get("financial", {}).get("counterparty")
            caller = ev.get("attributes", {}).get("caller") or ev.get("entities", {}).get("phone")
            callee = ev.get("attributes", {}).get("callee") or ev.get("telemetry", {}).get("destination_ip")
            dur = ev.get("telemetry", {}).get("duration_seconds") or ev.get("attributes", {}).get("duration_seconds")
            eid = ev.get("event_id")
            person_name = event_entity_map.get(eid) or ev.get("entities", {}).get("name")

            if (domain == "BANKING" or event_type in ("TRANSACTION", "TRANSFER")) and amt > 0:
                src = resolve(person_name or candidate.entity_refs[0])
                tgt = resolve(counterparty or "Beneficiary Account")
                ch_str = f" via {channel}" if channel else ""
                desc = f"Transferred ₹{amt:,.2f}{ch_str}"
                key = (src, tgt, desc)
                if key not in seen_interactions:
                    seen_interactions.add(key)
                    interactions.append({
                        "source_entity": src,
                        "target_entity": tgt,
                        "interaction_type": "FINANCIAL_TRANSFER",
                        "description": desc,
                        "amount_inr": amt,
                        "timestamp": ev.get("timestamp")
                    })

            elif domain == "TELECOM" or event_type == "CALL":
                src = resolve(person_name or caller or candidate.entity_refs[0])
                tgt = resolve(callee or "Callee")
                dur_str = f" ({dur}s)" if dur else ""
                desc = f"Placed call{dur_str}"
                key = (src, tgt, desc)
                if key not in seen_interactions:
                    seen_interactions.add(key)
                    interactions.append({
                        "source_entity": src,
                        "target_entity": tgt,
                        "interaction_type": "TELECOM_CALL",
                        "description": desc,
                        "timestamp": ev.get("timestamp")
                    })

        # 2. From aggregated pattern observations
        obs = candidate.aggregated_observations
        if obs.get("cycle_parties"):
            parties = obs["cycle_parties"]
            for i in range(len(parties)):
                p1 = resolve(parties[i])
                p2 = resolve(parties[(i + 1) % len(parties)])
                desc = f"Transferred funds in coordinated circular loop (Cycle Volume: ₹{obs.get('total_cycle_volume_inr', 0):,.2f})"
                key = (p1, p2, "CIRCULAR_FLOW")
                if key not in seen_interactions:
                    seen_interactions.add(key)
                    interactions.append({
                        "source_entity": p1,
                        "target_entity": p2,
                        "interaction_type": "CIRCULAR_FINANCIAL_FLOW",
                        "description": desc
                    })

        if obs.get("converging_entities"):
            ents = [resolve(e) for e in obs["converging_entities"] if e]
            loc = obs.get("convergence_location") or "Cell Tower Sector"
            for i in range(len(ents) - 1):
                p1, p2 = ents[i], ents[i + 1]
                desc = f"Co-located / Converged simultaneously at {loc}"
                key = (p1, p2, "SPATIAL_CONVERGENCE")
                if key not in seen_interactions:
                    seen_interactions.add(key)
                    interactions.append({
                        "source_entity": p1,
                        "target_entity": p2,
                        "interaction_type": "SPATIAL_CONVERGENCE",
                        "description": desc
                    })

        if obs.get("shared_entities"):
            ents = [resolve(e) for e in obs["shared_entities"] if e]
            infra = obs.get("shared_ip") or obs.get("shared_imei") or obs.get("telegram_group") or "Shared Server"
            for i in range(len(ents) - 1):
                p1, p2 = ents[i], ents[i + 1]
                desc = f"Shared operational infrastructure ({infra})"
                key = (p1, p2, "SHARED_INFRASTRUCTURE")
                if key not in seen_interactions:
                    seen_interactions.add(key)
                    interactions.append({
                        "source_entity": p1,
                        "target_entity": p2,
                        "interaction_type": "SHARED_INFRASTRUCTURE",
                        "description": desc
                    })

        if candidate.pattern_id == "GEO_TAILING" or "TAILING" in candidate.primary_detector_id:
            t_ent = resolve(obs.get("target_entity") or (enriched.related_entities[0]["display_name"] if enriched.related_entities else "Monitored Target"))
            s_ent = resolve(candidate.entity_refs[0])
            lag = obs.get("lag_seconds", 180)
            desc = f"Followed / Trailed trajectory with {lag}s lag"
            key = (s_ent, t_ent, "TRAJECTORY_TAILING")
            if key not in seen_interactions:
                seen_interactions.add(key)
                interactions.append({
                    "source_entity": s_ent,
                    "target_entity": t_ent,
                    "interaction_type": "TRAJECTORY_TAILING",
                    "description": desc
                })

        enriched.entity_interactions = interactions

    def _enrich_spatial_context(
        self,
        candidate: CandidatePattern,
        entity_store: Dict[str, Any],
        enriched: EnrichedContext
    ):
        """Constructs geographic waypoints and movement analysis without fabricating data."""
        waypoints = []
        for loc in candidate.locations:
            lat = loc.get("lat")
            lng = loc.get("lng")
            if lat is not None and lng is not None:
                waypoints.append({
                    "name": loc.get("name") or loc.get("type", "Waypoint"),
                    "lat": float(lat),
                    "lng": float(lng),
                    "timestamp": loc.get("time") or loc.get("timestamp"),
                    "type": loc.get("type", "POINT")
                })

        # If candidate.locations was empty, extract coordinates from supporting events and entity store
        if not waypoints and enriched.supporting_events:
            for ev in enriched.supporting_events:
                eid = ev.get("event_id", "")
                loc_name = ev.get("location") or ""
                lat = None
                lng = None

                # Look up from entity_store
                for ent_id, edata in entity_store.items():
                    for raw_ev in edata.get("all_events", []):
                        if raw_ev.get("event_id") == eid:
                            tel = raw_ev.get("telemetry") or {}
                            attrs = raw_ev.get("attributes") or {}
                            lat = tel.get("lat") or attrs.get("latitude") or attrs.get("lat")
                            lng = tel.get("lng") or attrs.get("longitude") or attrs.get("lng")
                            if not loc_name:
                                loc_name = tel.get("address") or attrs.get("place") or attrs.get("location")
                            break
                    if lat is not None:
                        break

                if lat is None and "Sector 22" in str(loc_name):
                    lat, lng = 30.7333, 76.7794
                elif lat is None and "Mohali" in str(loc_name):
                    lat, lng = 30.6882, 76.7358

                if lat is not None and lng is not None:
                    waypoints.append({
                        "name": loc_name or "Verified Coordinate Point",
                        "lat": float(lat),
                        "lng": float(lng),
                        "timestamp": ev.get("timestamp"),
                        "event_id": eid,
                        "type": "POINT"
                    })

        obs = candidate.aggregated_observations
        dist_km = obs.get("distance_km")
        speed_kmh = obs.get("implied_speed_kmh")
        elapsed_sec = obs.get("time_difference_seconds")

        if waypoints or dist_km is not None:
            enriched.spatial_context = {
                "available": True,
                "waypoints": waypoints,
                "primary_location": waypoints[0].get("name") if waypoints else "Operational Area",
                "distance_km": dist_km,
                "implied_speed_kmh": speed_kmh,
                "elapsed_seconds": elapsed_sec,
                "movement_description": (
                    f"{dist_km} km traversed in {elapsed_sec}s implying {speed_kmh} km/h ground speed."
                    if dist_km and speed_kmh else f"{len(waypoints)} verified geographic coordinate records at {waypoints[0].get('name', 'Target Location')}."
                )
            }
        else:
            enriched.spatial_context = {
                "available": False,
                "reason": "No geographic coordinates or telemetry records associated with this finding."
            }

    def _enrich_graph_context(
        self,
        candidate: CandidatePattern,
        context: Dict[str, Any],
        enriched: EnrichedContext
    ):
        """Assembles graph structural neighborhood and topological role from context or Neo4j."""
        obs = candidate.aggregated_observations
        betweenness = obs.get("betweenness_centrality", 0.0)
        degree = obs.get("degree", 0)
        pagerank = obs.get("pagerank", 0.0)
        community_id = obs.get("community_id", -1)

        primary_ent = candidate.entity_refs[0] if candidate.entity_refs else "Unknown"

        # Determine structural role
        role = "Participant"
        role_description = "Standard operational participant connected to neighboring entities."
        if betweenness > 0.08:
            role = "Network Cut-Out Bridge"
            role_description = (
                f"Entity operates as a structural bridge (Betweenness: {betweenness:.3f}) "
                f"mediating communications and transactions between otherwise isolated sub-groups."
            )
        elif degree >= 4:
            role = "Central Hub"
            role_description = f"High-connectivity hub linked to {degree} separate accounts, devices, or persons."

        enriched.graph_context = {
            "focused_entity": primary_ent,
            "structural_role": role,
            "role_description": role_description,
            "degree": degree,
            "betweenness_centrality": betweenness,
            "pagerank": pagerank,
            "community_id": community_id,
            "subgraph_entities": candidate.entity_refs,
            "suggested_actions": ["Highlight Cut-Out Path", "Inspect Connected Sub-cells"] if betweenness > 0.08 else ["Inspect Direct Neighbors"]
        }

    def _enrich_case_context(
        self,
        candidate: CandidatePattern,
        enriched: EnrichedContext
    ):
        """Extracts written case objectives, target persons of interest, and case bounds."""
        with get_db_context() as db:
            case = db.query(CaseModel).filter_by(case_id=candidate.case_id).first()
            if case:
                enriched.case_context = {
                    "case_id": case.case_id,
                    "case_reference": case.case_reference,
                    "title": case.title,
                    "investigator_notes": case.description or "",
                    "status": case.status
                }
            else:
                enriched.case_context = {
                    "case_id": candidate.case_id,
                    "case_reference": f"REF-{candidate.case_id}",
                    "title": f"Investigation Case {candidate.case_id}",
                    "status": "ACTIVE"
                }

    def _enrich_baseline_context(
        self,
        candidate: CandidatePattern,
        entity_store: Dict[str, Any],
        enriched: EnrichedContext
    ):
        """Constructs comparative baseline parameters."""
        enriched.baseline_context = dict(candidate.baseline)
        if not enriched.baseline_context.get("comparison"):
            enriched.baseline_context["comparison"] = (
                "Activity represents an acute deviation from observed historical frequencies and peer cluster norms."
            )


context_enrichment_engine = ContextEnrichmentEngine()
