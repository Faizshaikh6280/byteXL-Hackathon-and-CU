from langgraph.graph import StateGraph, START, END
from app.agents.state import InvestigationState
from app.agents.specialists import (
    financial_agent_node,
    temporal_agent_node,
    geographic_agent_node,
    aggregator_agent_node
)

# Dummy nodes to signal to the SSE stream that an agent is STARTING
def start_financial(state): return {}
def start_temporal(state): return {}
def start_spatial(state): return {}
def start_lead(state): return {}

builder = StateGraph(InvestigationState)

# Status nodes
builder.add_node("start_financial", start_financial)
builder.add_node("start_temporal", start_temporal)
builder.add_node("start_spatial", start_spatial)
builder.add_node("start_lead", start_lead)

# Specialist Nodes
builder.add_node("financial_agent", financial_agent_node)
builder.add_node("temporal_agent", temporal_agent_node)
builder.add_node("spatial_agent", geographic_agent_node)
builder.add_node("lead_detective", aggregator_agent_node)

# Sequential Flow
builder.add_edge(START, "start_financial")
builder.add_edge("start_financial", "financial_agent")

builder.add_edge("financial_agent", "start_temporal")
builder.add_edge("start_temporal", "temporal_agent")

builder.add_edge("temporal_agent", "start_spatial")
builder.add_edge("start_spatial", "spatial_agent")

builder.add_edge("spatial_agent", "start_lead")
builder.add_edge("start_lead", "lead_detective")

builder.add_edge("lead_detective", END)

investigation_workflow = builder.compile()
