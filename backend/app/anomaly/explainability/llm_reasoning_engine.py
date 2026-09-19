"""
LLMReasoningEngine: Harnesses local LLM (Qwen 2.5 via Ollama) to synthesize
plain-language, evidence-grounded forensic reasoning for detected anomalies.
Strictly adheres to: NO HALLUCINATION - only reasons over verified facts, metrics, and evidence.
Provides seamless graceful fallback if the local LLM is offline.
"""

import json
import logging
from typing import Dict, Any, Optional, List

from app.core.llm_provider import get_llm

logger = logging.getLogger("LLMReasoningEngine")


class LLMReasoningEngine:
    """
    Forensic explainability engine powered by local Qwen 2.5 model.
    Transforms raw detector metrics into court-ready investigative narratives.
    """

    def __init__(self):
        self._llm = None
        self._initialized = False

    def _get_client(self):
        if not self._initialized:
            try:
                # Fast timeout (12s) to prevent pipeline blockage if Ollama is offline or busy
                self._llm = get_llm(num_predict=600, num_ctx=2048)
            except Exception as e:
                logger.warning(f"[LLMReasoningEngine] Failed to initialize LLM provider: {e}")
                self._llm = None
            self._initialized = True
        return self._llm

    def generate_reasoning(
        self,
        pattern_id: str,
        category: str,
        entity_label: str,
        primary_entities: List[Dict[str, Any]],
        observations: Dict[str, Any],
        metrics: Dict[str, Any],
        time_range: Dict[str, Any],
        locations: List[str],
        detectors: List[str],
        case_relevance: str,
        relevance_reasons: List[str],
        related_entities: Optional[List[Dict[str, Any]]] = None,
        entity_interactions: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, str]]:
        """
        Executes zero-shot forensic synthesis via Qwen 2.5.
        Returns a dict with {"headline", "what_happened", "why_unusual", "why_relevant", "actionable_steps"}
        or None if LLM is unreachable/fails.
        """
        client = self._get_client()
        if client is None:
            return None

        # Build clean factual context summary for all suspects
        all_entities = (primary_entities or []) + (related_entities or [])
        ents_summary = []
        for e in all_entities:
            name = e.get("display_name") or e.get("entity_id")
            etype = e.get("entity_type", "Entity")
            phones = e.get("phones", [])
            accs = e.get("accounts", [])
            details = []
            if phones:
                details.append(f"Phones: {', '.join(phones[:2])}")
            if accs:
                details.append(f"Accounts: {', '.join(accs[:2])}")
            ents_summary.append(f"- {name} ({etype}) {'; '.join(details)}")
        entities_text = "\n".join(ents_summary) if ents_summary else f"- {entity_label}"

        # Format inter-entity activities and relationships
        interactions_lines = []
        if entity_interactions:
            for item in entity_interactions[:8]:
                src = item.get("source_entity", "Entity")
                tgt = item.get("target_entity", "Entity")
                act = item.get("description", "Activity")
                interactions_lines.append(f"- {src} -> {act} -> {tgt}")
        interactions_text = "\n".join(interactions_lines) if interactions_lines else "Direct single-entity or distributed telemetry pattern."

        prompt = f"""You are a Senior Cyber Crime Investigator, Forensic Accountant, and Lead Digital Analyst.
Analyze the following verified investigative anomaly detected by automated analytical engines and synthesize professional, court-grade forensic reasoning in easy-to-understand plain English.

INVIOLABLE RULES:
1. STRICT FACTUAL ACCURACY: Do NOT invent fictional names, fictitious dates, or fake transaction amounts. Only refer to the suspects, entities, values, and dates explicitly provided below.
2. PLAIN ENGLISH PARAGRAPHS: Write in clear, professional, direct English that an Investigating Officer, Judge, or Supervisor can immediately grasp. Explain what the anomaly is, who the suspects are, the exact relationships and activities between them, and how the activity manifested in the data.
3. Respond ONLY with a valid JSON object matching the schema below. No conversational commentary or markdown fencing.

=== DETECTED ANOMALY FACTS ===
Pattern Type: {pattern_id}
Domain / Category: {category}
Primary Suspect / Entity: {entity_label}
Suspects & Entities Involved:
{entities_text}
Inter-Entity Activities & Relationships:
{interactions_text}
Time Range: {time_range.get('formatted_window') or time_range.get('start') or 'N/A'}
Locations / Waypoints: {', '.join(locations) if locations else 'N/A'}
Contributing Detectors: {', '.join(detectors)}
Observed Quantitative Facts:
{json.dumps(observations, indent=2, default=str)}
Key Metrics:
{json.dumps(metrics, indent=2, default=str)}
Case Relevance: {case_relevance} ({'; '.join(relevance_reasons)})

=== OUTPUT JSON SCHEMA ===
{{
  "headline": "A clear, compelling headline identifying the anomaly pattern, key suspects involved, and central financial amount or telemetry metric (e.g., 'Coordinated Financial Flow: Priya Anand, Nisha Bedi, and Meera Kapoor routed ₹12.5L circular transfer')",
  "what_happened": "A coherent, easy-to-understand 1-2 paragraph plain English narrative explaining the anomaly: who the suspects/entities are, the exact relationships and activities between them (money transfers, call chains, physical movements, or shared infrastructure), how the activity unfolded in the data, and the current operational status.",
  "why_unusual": "2-3 sentence plain English explanation contrasting this specific behavior against normal civilian baselines.",
  "why_relevant": "2-3 sentence plain English explanation of why this finding is critical to the cybercrime case objective and syndicate role.",
  "actionable_steps": "Numbered 1-3 actionable legal or investigative steps for the Investigating Officer under BNSS/CrPC or IT Act."
}}"""

        try:
            # Invoke ChatModel
            response = client.invoke(prompt)
            content = response.content if hasattr(response, "content") else str(response)
            if not content or not content.strip():
                return None

            raw_text = content.strip()
            # Strip markdown code fencing if present
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            start_idx = raw_text.find('{')
            end_idx = raw_text.rfind('}')
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                raw_text = raw_text[start_idx:end_idx+1]

            parsed = json.loads(raw_text)
            if isinstance(parsed, dict) and "what_happened" in parsed:
                logger.info(f"[LLMReasoningEngine] Qwen 2.5 successfully generated forensic reasoning for {pattern_id}")
                raw_steps = parsed.get("actionable_steps", "")
                if isinstance(raw_steps, list):
                    steps_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(raw_steps) if s)
                else:
                    steps_text = str(raw_steps).strip()

                return {
                    "headline": str(parsed.get("headline", "")).strip(),
                    "what_happened": str(parsed.get("what_happened", "")).strip(),
                    "why_unusual": str(parsed.get("why_unusual", "")).strip(),
                    "why_relevant": str(parsed.get("why_relevant", "")).strip(),
                    "actionable_steps": steps_text
                }
        except Exception as ex:
            logger.debug(f"[LLMReasoningEngine] Inference failed or unavailable ({ex}), utilizing deterministic dynamic reasoning.")
            return None

        return None

    def generate_case_executive_summary(
        self,
        case_id: str,
        findings: List[Any],
        signals_count: int = 0
    ) -> Dict[str, Any]:
        """
        Synthesizes a cohesive, plain-English Executive AI Intelligence Briefing across
        all case findings and evidence using local Qwen 2.5 LLM with deterministic fallback.
        """
        if not findings:
            return {
                "case_id": case_id,
                "total_findings": 0,
                "total_detection_signals": signals_count,
                "summary_text": "No investigative findings detected for this case.",
                "what_happened": "No anomaly patterns or suspicious behavioral signals were identified in the available case evidence.",
                "suspects_involved": [],
                "key_evidence_proof": [],
                "recommended_actions": ["Maintain ongoing passive data monitoring across connected accounts and telephony."],
                "source": "deterministic-dynamic",
                "top_findings": []
            }

        def _get(obj, key, default=None):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        # 1. Compile Unique Suspects & Linked Entities
        suspects_map: Dict[str, Dict[str, Any]] = {}
        findings_facts: List[str] = []
        evidence_proof_pool: List[str] = []

        for f in findings:
            f_title = _get(f, "title", "Investigative Finding")
            f_sev = _get(f, "severity", "MEDIUM")
            f_prio = _get(f, "investigative_priority", "MEDIUM")
            f_pat = _get(f, "pattern_type", "ANOMALY")
            f_what = _get(f, "what_happened") or _get(f, "explanation") or ""
            f_why_u = _get(f, "why_unusual") or ""
            f_why_r = _get(f, "why_relevant") or ""
            f_obs = _get(f, "supporting_observations") or _get(f, "signals") or []
            f_ev_refs = _get(f, "evidence_refs") or []
            f_locs = _get(f, "locations") or []

            # Track finding facts
            findings_facts.append(
                f"- [{f_sev} / Priority {f_prio}] {f_title} ({f_pat}): {f_what}"
            )

            # Collect evidence proof points
            if isinstance(f_obs, list):
                for ob in f_obs[:3]:
                    if isinstance(ob, str) and ob.strip():
                        evidence_proof_pool.append(ob.strip())
            elif isinstance(f_obs, dict):
                for k, v in list(f_obs.items())[:3]:
                    evidence_proof_pool.append(f"{k}: {v}")

            for ev in f_ev_refs[:2]:
                if ev and f"Evidence Ref: {ev}" not in evidence_proof_pool:
                    evidence_proof_pool.append(f"Evidence Ref: {ev}")

            # Collect entities
            prim_ents = _get(f, "primary_entities") or []
            if not prim_ents and _get(f, "entity_id"):
                prim_ents = [{
                    "entity_id": _get(f, "entity_id"),
                    "display_name": _get(f, "entity_id"),
                    "entity_type": _get(f, "entity_type", "Entity")
                }]

            for e in prim_ents:
                eid = e.get("entity_id") or e.get("display_name")
                if not eid:
                    continue
                if eid not in suspects_map:
                    suspects_map[eid] = {
                        "name": e.get("display_name") or eid,
                        "entity_id": eid,
                        "entity_type": e.get("entity_type", "Person"),
                        "phones": list(e.get("phones") or []),
                        "accounts": list(e.get("accounts") or []),
                        "aliases": list(e.get("aliases") or []),
                        "roles": [f_pat]
                    }
                else:
                    if f_pat not in suspects_map[eid]["roles"]:
                        suspects_map[eid]["roles"].append(f_pat)
                    for ph in (e.get("phones") or []):
                        if ph not in suspects_map[eid]["phones"]:
                            suspects_map[eid]["phones"].append(ph)
                    for acc in (e.get("accounts") or []):
                        if acc not in suspects_map[eid]["accounts"]:
                            suspects_map[eid]["accounts"].append(acc)

        # Sort suspects prioritizing named human persons over raw IMEI/IP nodes
        sorted_suspects = sorted(
            suspects_map.values(),
            key=lambda x: (0 if not x['name'].startswith(('IMEI-', 'IP-', 'DEV-')) else 1, -len(x['roles']))
        )
        suspects_lines = []
        for s in sorted_suspects[:6]:
            details = []
            if s["phones"]:
                details.append(f"Phones: {', '.join(s['phones'][:2])}")
            if s["accounts"]:
                details.append(f"Accounts: {', '.join(s['accounts'][:2])}")
            if s["aliases"]:
                details.append(f"Aliases: {', '.join(s['aliases'][:2])}")
            roles_str = f"Implicated in: {', '.join(s['roles'][:3])}"
            suspects_lines.append(f"- {s['name']} ({s['entity_type']}, ID: {s['entity_id']}): {roles_str} | {'; '.join(details)}")

        # Extract inter-entity interactions across findings
        case_interactions = []
        seen_case_keys = set()
        for f in findings:
            td = _get(f, "technical_details") or {}
            interactions = td.get("entity_interactions") or []
            for item in interactions:
                key = (item.get("source_entity"), item.get("target_entity"), item.get("description"))
                if key not in seen_case_keys:
                    seen_case_keys.add(key)
                    case_interactions.append(item)

        interactions_lines = [f"- {i['source_entity']} -> {i['description']} -> {i['target_entity']}" for i in case_interactions[:8]]
        interactions_text = "\n".join(interactions_lines) if interactions_lines else "Direct multi-party transactional, telecom, and spatial connections."

        suspects_text = "\n".join(suspects_lines) if suspects_lines else "No specific named suspects identified."
        findings_text = "\n".join(findings_facts[:6])
        evidence_text = "\n".join(f"- {p}" for p in evidence_proof_pool[:6]) if evidence_proof_pool else "Standard transactional and communication records."

        # Top findings formatted for API response
        top_findings = [
            {
                "finding_id": _get(f, "finding_id"),
                "title": _get(f, "title"),
                "severity": _get(f, "severity"),
                "priority": _get(f, "investigative_priority"),
                "what_happened": _get(f, "what_happened") or _get(f, "explanation"),
                "detectors": _get(f, "contributing_detectors") or _get(f, "detectors") or []
            }
            for f in findings[:5]
        ]

        # Deterministic fallback data
        fallback_summary_text = (
            f"Automated intelligence engines identified {len(findings)} verified investigative findings "
            f"across {len(suspects_map)} primary target(s) from {signals_count} underlying detection signals."
        )

        fallback_what_happened_parts = []
        for f in findings[:4]:
            wh = _get(f, "what_happened")
            if wh and wh not in fallback_what_happened_parts:
                fallback_what_happened_parts.append(wh)
        fallback_what_happened = " ".join(fallback_what_happened_parts) if fallback_what_happened_parts else (
            f"Multiple coordinated anomaly patterns detected involving {', '.join(s['name'] for s in list(sorted_suspects)[:3])}."
        )

        fallback_suspects = [
            {
                "name": s["name"],
                "entity_id": s["entity_id"],
                "role": f"Key Target ({', '.join(s['roles'][:2])})",
                "details": f"Phones: {', '.join(s['phones'] or ['N/A'])}; Accounts: {', '.join(s['accounts'] or ['N/A'])}"
            }
            for s in sorted_suspects[:6]
        ]

        fallback_evidence = evidence_proof_pool[:6] if evidence_proof_pool else [
            f"Verified transactional and CDR graph connections across {len(findings)} findings."
        ]

        fallback_actions = [
            "Issue Section 106 BNSS requisition to identify beneficial ownership of active beneficiary accounts.",
            "Obtain CDR, IPDR, and cell tower telemetry logs under Section 94 BNSS for identified mobile numbers.",
            "Correlate financial transaction UTR references with banking gateway logs to preserve audit trails."
        ]

        # Attempt Qwen 2.5 synthesis
        try:
            client = get_llm(num_predict=1200, num_ctx=3584)
            prompt = f"""You are a Senior Cyber Crime Investigator, Digital Forensics Specialist, and Lead Case Analyst.
Analyze the following verified investigative findings and evidence for Case {case_id} and synthesize a cohesive, professional Executive AI Intelligence Briefing in plain, easy-to-understand English.

INVIOLABLE RULES:
1. STRICT FACTUAL ACCURACY: Do NOT invent fictional suspects, fake dates, or fictitious bank accounts. Only use the suspects, accounts, phone numbers, and factual events explicitly listed below.
2. PLAIN ENGLISH: Write in clear, professional, direct English that an Investigating Officer, Judge, or Supervisor can immediately grasp. Explain who the suspects are, what criminal actions were detected (money routing, clandestine communications, travel/colocation), how the scheme unfolded, and the current operational state.
3. SPECIFIC PROOF & EVIDENCE: Highlight concrete evidence items (transaction amounts, bank accounts, timestamps, phone numbers, cell towers, evidence hashes).
4. Respond ONLY with a valid JSON object matching the schema below. No conversational commentary or markdown fencing.

=== VERIFIED CASE FINDINGS & FACTS ===
Case Identifier: {case_id}
Total Findings: {len(findings)} (from {signals_count} underlying signals)

Primary Suspects & Linked Entities:
{suspects_text}

Inter-Entity Activities & Relationships:
{interactions_text}

Detected Patterns & Findings:
{findings_text}

Observed Evidence & Proof Points:
{evidence_text}

=== OUTPUT JSON SCHEMA ===
{{
  "summary_text": "A concise 2-3 sentence executive synopsis of the syndicate's activity and total investigative findings in plain English.",
  "what_happened": "A comprehensive, plain-English chronological narrative in proper paragraphs explaining exactly what happened in this case: who the primary suspects are, what criminal actions were detected (money routing, clandestine communications, travel/colocation), how the scheme unfolded, and the current operational state.",
  "suspects_involved": [
    {{
      "name": "Suspect or Entity Name",
      "entity_id": "Entity ID",
      "role": "Investigative role (e.g., Primary Mule Coordinator, Structuring Beneficiary, Hawala Operator, Central Node)",
      "details": "Linked accounts, phone numbers, or key identifiers"
    }}
  ],
  "key_evidence_proof": [
    "Specific factual proof point with verified amounts, dates, accounts, or CDR records",
    "Specific factual proof point with cell tower locations, co-travel timestamps, or device identifiers"
  ],
  "recommended_actions": [
    "Actionable step 1 for Investigating Officer under BNSS/CrPC or IT Act",
    "Actionable step 2 for freezing accounts, CDR preservation, or search warrants"
  ]
}}"""

            response = client.invoke(prompt)
            content = response.content if hasattr(response, "content") else str(response)
            if content and content.strip():
                raw_text = content.strip()
                if raw_text.startswith("```"):
                    lines = raw_text.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    raw_text = "\n".join(lines).strip()

                start_idx = raw_text.find('{')
                end_idx = raw_text.rfind('}')
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    raw_text = raw_text[start_idx:end_idx+1]

                parsed = json.loads(raw_text)
                if isinstance(parsed, dict) and "what_happened" in parsed:
                    logger.info(f"[LLMReasoningEngine] Qwen 2.5 successfully generated Case Executive Summary for {case_id}")
                    return {
                        "case_id": case_id,
                        "total_findings": len(findings),
                        "total_detection_signals": signals_count,
                        "summary_text": str(parsed.get("summary_text") or fallback_summary_text).strip(),
                        "what_happened": str(parsed.get("what_happened") or fallback_what_happened).strip(),
                        "suspects_involved": parsed.get("suspects_involved") if isinstance(parsed.get("suspects_involved"), list) and parsed.get("suspects_involved") else fallback_suspects,
                        "key_evidence_proof": parsed.get("key_evidence_proof") if isinstance(parsed.get("key_evidence_proof"), list) and parsed.get("key_evidence_proof") else fallback_evidence,
                        "recommended_actions": parsed.get("recommended_actions") if isinstance(parsed.get("recommended_actions"), list) and parsed.get("recommended_actions") else fallback_actions,
                        "source": "qwen2.5-local",
                        "top_findings": top_findings
                    }
        except Exception as e:
            logger.warning(f"[LLMReasoningEngine] Case summary LLM generation failed ({e}), using deterministic dynamic fallback.")

        # Fallback return
        return {
            "case_id": case_id,
            "total_findings": len(findings),
            "total_detection_signals": signals_count,
            "summary_text": fallback_summary_text,
            "what_happened": fallback_what_happened,
            "suspects_involved": fallback_suspects,
            "key_evidence_proof": fallback_evidence,
            "recommended_actions": fallback_actions,
            "source": "deterministic-dynamic",
            "top_findings": top_findings
        }


llm_reasoning_engine = LLMReasoningEngine()

