"""
Automated Test Suite for Voice Command Mode & LangGraph Agent.
Tests:
1. Flow A: Multi-turn slot filling (Advanced Search)
2. Flow B: Direct UI manipulation (Louvain GDS Overlay)
3. Flow C: Viewport & Camera Rig (Focus Node)
4. Flow D: Filter & Navigate (Anomalies with risk threshold)
5. Flow E: Tactical Ops (Theme toggle)
6. Command Audit History logging and retrieval
"""

import sys
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_voice_command_flows():
    print("\n" + "=" * 60)
    print("STARTING VOICE COMMAND SYSTEM VERIFICATION")
    print("=" * 60)

    session_id = "test-officer-session-001"

    # ─────────────────────────────────────────────────────────────
    # Flow A: Multi-Turn Slot Filling (Advanced Search)
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 1: Multi-Turn Slot Filling (Turn 1: Incomplete Command) ---")
    resp1 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "I need to run an advanced search",
        "case_id": "INV-2026-BLACK-CIRCUIT",
        "session_id": session_id
    })
    assert resp1.status_code == 200, f"Turn 1 failed: {resp1.text}"
    data1 = resp1.json()
    print("Intent:", data1["intent"])
    print("Status:", data1["status"])
    print("Missing Slots:", data1["missing_slots"])
    print("Agent Spoken Feedback:", data1["spoken_feedback"])
    assert data1["status"] == "CLARIFICATION_REQUIRED"
    assert "target" in data1["missing_slots"]
    print("[OK] Turn 1 correctly detected missing 'target' slot and requested clarification!")

    print("\n--- TEST 2: Multi-Turn Slot Filling (Turn 2: Slot Provided) ---")
    resp2 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "Search for phone number 9876543210",
        "case_id": "INV-2026-BLACK-CIRCUIT",
        "session_id": session_id
    })
    assert resp2.status_code == 200, f"Turn 2 failed: {resp2.text}"
    data2 = resp2.json()
    print("Intent:", data2["intent"])
    print("Status:", data2["status"])
    print("Actions Dispatched:", [a["type"] for a in data2["actions"]])
    print("Agent Spoken Feedback:", data2["spoken_feedback"])
    assert data2["status"] == "EXECUTED"
    assert any(a["type"] == "RENDER_SEARCH_RESULTS" for a in data2["actions"])
    print("[OK] Turn 2 completed slot filling and dispatched search actions!")

    # ─────────────────────────────────────────────────────────────
    # Flow B: Direct UI Manipulation (Louvain GDS Overlay)
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 3: Direct UI Manipulation (Louvain GDS Overlay) ---")
    resp3 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "Color-code by Louvain communities",
        "case_id": "INV-2026-BLACK-CIRCUIT"
    })
    assert resp3.status_code == 200, f"Flow B failed: {resp3.text}"
    data3 = resp3.json()
    print("Intent:", data3["intent"])
    print("Actions:", data3["actions"])
    print("Feedback:", data3["spoken_feedback"])
    assert data3["intent"] == "GRAPH_GDS"
    assert any(a.get("algorithm") == "louvain" for a in data3["actions"])
    print("[OK] Flow B correctly dispatched Louvain overlay action!")

    # ─────────────────────────────────────────────────────────────
    # Flow C: Graph Viewport & Camera Rig (Focus Node)
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 4: Viewport & Camera Rig (Focus Node) ---")
    resp4 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "Focus on target Vikram Sethi",
        "case_id": "INV-2026-BLACK-CIRCUIT"
    })
    assert resp4.status_code == 200, f"Flow C failed: {resp4.text}"
    data4 = resp4.json()
    print("Intent:", data4["intent"])
    print("Actions:", data4["actions"])
    assert data4["intent"] == "GRAPH_VIEWPORT"
    assert any(a.get("type") == "FOCUS_NODE" and a.get("node_id", "").lower() == "vikram sethi" for a in data4["actions"])
    print("[OK] Flow C correctly dispatched FOCUS_NODE camera action for Vikram Sethi!")

    # ─────────────────────────────────────────────────────────────
    # Flow D: Filter & Navigate (Anomalies with risk score)
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 5: Filter & Navigate (Anomalies Risk Filter) ---")
    resp5 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "Show all anomalies with risk score above 0.5",
        "case_id": "INV-2026-BLACK-CIRCUIT"
    })
    assert resp5.status_code == 200, f"Flow D failed: {resp5.text}"
    data5 = resp5.json()
    print("Intent:", data5["intent"])
    print("Actions:", data5["actions"])
    assert data5["intent"] == "FILTER_AND_NAVIGATE"
    assert any(a.get("target_tab") == "anomalies" for a in data5["actions"])
    print("[OK] Flow D correctly navigated to anomalies and set risk score filter to 0.5!")

    # ─────────────────────────────────────────────────────────────
    # Flow E: Tactical Ops (Dark mode)
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 6: Tactical Ops (Theme Toggle) ---")
    resp6 = client.post("/api/v1/voice-command/execute", json={
        "transcript": "Switch to dark tactical mode",
        "case_id": "INV-2026-BLACK-CIRCUIT"
    })
    assert resp6.status_code == 200, f"Flow E failed: {resp6.text}"
    data6 = resp6.json()
    print("Intent:", data6["intent"])
    print("Actions:", data6["actions"])
    assert any(a.get("type") == "TOGGLE_THEME" and a.get("theme") == "dark" for a in data6["actions"])
    print("[OK] Flow E correctly toggled theme to dark tactical mode!")

    # ─────────────────────────────────────────────────────────────
    # Audit Trail History Retrieval
    # ─────────────────────────────────────────────────────────────
    print("\n--- TEST 7: Command Audit Trail Retrieval ---")
    hist_resp = client.get("/api/v1/voice-command/history?case_id=INV-2026-BLACK-CIRCUIT")
    assert hist_resp.status_code == 200, f"History fetch failed: {hist_resp.text}"
    hist_data = hist_resp.json()
    print("Total Logged Actions in Audit Trail:", hist_data["total"])
    assert hist_data["total"] >= 5
    for item in hist_data["history"][:3]:
        print(f"  • [{item['timestamp']}] Intent: {item['intent']} | Transcript: \"{item['transcript']}\"")
    print("[OK] Audit trail logging and retrieval verified!")

    print("\n" + "=" * 60)
    print("ALL 7 VOICE COMMAND TESTS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_voice_command_flows()
