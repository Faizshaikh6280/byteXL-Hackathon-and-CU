from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage
import time

print("Starting LLM call...")
start = time.time()
llm = ChatOllama(base_url="http://localhost:11434", model="qwen2.5:7b", temperature=0.0)
try:
    res = llm.invoke([HumanMessage(content="Hello! Are you there? Just say 'Yes'.")])
    print("Response:", res.content)
except Exception as e:
    print("Error:", str(e))
print("Time taken:", time.time() - start)
