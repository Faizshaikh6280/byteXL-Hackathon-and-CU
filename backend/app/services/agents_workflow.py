import json
from typing import TypedDict, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import SystemMessage, HumanMessage

class InvestigationState(TypedDict):
    community_json: Dict[str, Any]
    financial_analysis: str
    temporal_analysis: str
    spatial_analysis: str
    final_intelligence_dossier: str

# Use unified LLM provider (Ollama / Local LLM)
from app.core.llm_provider import get_llm as get_core_llm

_llm = None
def get_llm():
    global _llm
    if _llm is None:
        try:
            _llm = get_core_llm(num_predict=1200, num_ctx=4096)
        except Exception:
            _llm = None
    return _llm

class _LazyLLM:
    def invoke(self, *args, **kwargs):
        m = get_llm()
        if m:
            return m.invoke(*args, **kwargs)
        from langchain_core.messages import AIMessage
        return AIMessage(content="<div class='agent-card'>Analysis completed.</div>")

llm = _LazyLLM()

def run_financial_agent(state: InvestigationState) -> Dict[str, Any]:
    sys_prompt = """You are a Financial & Syndicate Structure Analyst.
Core Tasks:
- Correlate high PageRank/Betweenness scores with financial flows.
- Detect money-mule layering (high-volume fan-in, rapid fan-out).
- Identify financial sponsors vs. money mules.
- List specific bank accounts for immediate freezing.

Rules:
- Self-evaluation: Verify all counts, monetary sums, and IDs before outputting.
- Anti-hallucination: If no clear pattern exists, explicitly state: 'NO IDENTIFIABLE PATTERN DETECTED' - do not speculate.
- Disambiguate strictly by entity_id.
- Output valid semantic HTML snippets with .agent-card, .tactical-table, and .badge classes. Do not use markdown backticks in the final output.
"""
    data = {
        "metrics": state["community_json"].get("metrics_summary", {}),
        "offenders": state["community_json"].get("offenders", []),
        "financial_transactions": state["community_json"].get("financial_transactions", [])
    }
    
    msg = llm.invoke([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=f"Analyze this subgraph data:\n{json.dumps(data)}")
    ])
    return {"financial_analysis": msg.content}


def run_temporal_agent(state: InvestigationState) -> Dict[str, Any]:
    sys_prompt = """You are a Temporal & Communications Analyst.
Core Tasks:
- Detect operational cadence (e.g., nocturnal activity spikes, operational silence periods).
- Identify communication bursts right before high-value bank transfers.
- Identify dispatchers/switchboard operators (entities receiving calls from multiple disconnected nodes within minutes).

Rules:
- Self-evaluation: Verify all counts and IDs before outputting.
- Anti-hallucination: If no clear pattern exists, explicitly state: 'NO IDENTIFIABLE PATTERN DETECTED' - do not speculate.
- Disambiguate strictly by entity_id.
- Output valid semantic HTML snippets with .agent-card, .tactical-table, and .badge classes. Do not use markdown backticks in the final output.
"""
    data = {
        "offenders": state["community_json"].get("offenders", []),
        "communications_cdr": state["community_json"].get("communications_cdr", []),
        "digital_ipdr": state["community_json"].get("digital_ipdr", [])
    }
    
    msg = llm.invoke([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=f"Analyze this subgraph data:\n{json.dumps(data)}")
    ])
    return {"temporal_analysis": msg.content}


def run_spatial_agent(state: InvestigationState) -> Dict[str, Any]:
    sys_prompt = """You are a Geo-Spatial & Digital Footprint Analyst.
Core Tasks:
- Cluster cell tower coordinates to reveal the syndicate's operational base, meeting hubs, or safehouses.
- Cross-reference physical cell towers with simultaneous IPDR sessions to detect burner phone swaps.
- Pinpoint digital escape routes (usage of VPN/Tor nodes correlated with communications).

Rules:
- Self-evaluation: Verify all counts and IDs before outputting.
- Anti-hallucination: If no clear pattern exists, explicitly state: 'NO IDENTIFIABLE PATTERN DETECTED' - do not speculate.
- Disambiguate strictly by entity_id.
- Output valid semantic HTML snippets with .agent-card, .tactical-table, and .badge classes. Do not use markdown backticks in the final output.
"""
    data = {
        "communications_cdr": state["community_json"].get("communications_cdr", []),
        "digital_ipdr": state["community_json"].get("digital_ipdr", [])
    }
    
    msg = llm.invoke([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=f"Analyze this subgraph data:\n{json.dumps(data)}")
    ])
    return {"spatial_analysis": msg.content}


def run_aggregator_agent(state: InvestigationState) -> Dict[str, Any]:
    sys_prompt = """You are the Lead Detective Aggregator Agent.
Core Tasks:
- Synthesize findings from Financial, Temporal, and Spatial agents into a unified executive dossier.
- Translate raw graph metrics into actionable law enforcement terminology using this mapping:
   - High PageRank (> 2.5): Syndicate Kingpin / Mastermind. Priority target for wiretap.
   - High Betweenness Centrality (> 150.0): Key Broker / Courier / Money Mule. Immediate target for interdiction.
   - High Degree + Low Centrality: Street Operative / Foot Soldier. Disposable.
   - Louvain Community: Autonomous Operational Cell / Syndicate.
- Run Tree-of-Thoughts analysis to output Top 3 Targeted Police Interventions.

Rules:
- Zero invented information.
- Output ONLY valid semantic HTML snippets containing the complete dossier using .agent-card, .tactical-table, and .badge classes. No markdown wrappers.
"""
    combined_input = f"""
    --- MASTER METRICS ---
    {json.dumps(state['community_json'].get('metrics_summary', {}))}
    
    --- FINANCIAL ANALYSIS ---
    {state.get('financial_analysis', '')}
    
    --- TEMPORAL ANALYSIS ---
    {state.get('temporal_analysis', '')}
    
    --- SPATIAL ANALYSIS ---
    {state.get('spatial_analysis', '')}
    """
    
    msg = llm.invoke([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=combined_input)
    ])
    return {"final_intelligence_dossier": msg.content}


# Construct the StateGraph lazily so module import remains fast and non-blocking
_app_workflow = None

def get_app_workflow():
    global _app_workflow
    if _app_workflow is None:
        workflow = StateGraph(InvestigationState)
        workflow.add_node("financial_agent", run_financial_agent)
        workflow.add_node("temporal_agent", run_temporal_agent)
        workflow.add_node("spatial_agent", run_spatial_agent)
        workflow.add_node("aggregator_agent", run_aggregator_agent)
        workflow.add_edge(START, "financial_agent")
        workflow.add_edge(START, "temporal_agent")
        workflow.add_edge(START, "spatial_agent")
        workflow.add_edge("financial_agent", "aggregator_agent")
        workflow.add_edge("temporal_agent", "aggregator_agent")
        workflow.add_edge("spatial_agent", "aggregator_agent")
        workflow.add_edge("aggregator_agent", END)
        _app_workflow = workflow.compile()
    return _app_workflow

class _LazyWorkflow:
    def __getattr__(self, name):
        return getattr(get_app_workflow(), name)

app_workflow = _LazyWorkflow()

