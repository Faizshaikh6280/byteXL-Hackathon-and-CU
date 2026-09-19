import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

def evaluate_dossier(json_contract_path: str, dossier_a_path: str, dossier_b_path: str):
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0)
    
    with open(json_contract_path, 'r') as f:
        contract = f.read()
    with open(dossier_a_path, 'r') as f:
        dossier_a = f.read()
    with open(dossier_b_path, 'r') as f:
        dossier_b = f.read()
        
    sys_prompt = """You are an Expert Law Enforcement LLM-as-a-Judge.
Compare Dossier A and Dossier B based on the raw JSON ground truth.
Score both out of 5 for:
1. Factual Grounding (No hallucinations of numbers/names not in JSON).
2. Investigative Depth (Explains WHY someone is a leader/broker).
3. Operational Utility (Provides actionable steps).

Respond with a JSON object:
{"dossier_a_scores": {"factual": 0, "depth": 0, "utility": 0}, "dossier_b_scores": {"factual": 0, "depth": 0, "utility": 0}, "winner": "A or B or Tie", "reason": "..."}
"""
    
    msg = llm.invoke([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=f"GROUND TRUTH JSON:\n{contract}\n\n--- DOSSIER A ---\n{dossier_a}\n\n--- DOSSIER B ---\n{dossier_b}")
    ])
    
    print("EVALUATION RESULT:")
    print(msg.content)

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 4:
        print("Usage: python test_evaluator.py <json_contract> <dossier_a> <dossier_b>")
    else:
        evaluate_dossier(sys.argv[1], sys.argv[2], sys.argv[3])
