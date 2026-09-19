'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, MessageSquare, Mic, MicOff, Send, X, Minimize2, 
  Maximize2, Sparkles, Share2, AlertTriangle, Database, 
  Terminal, ShieldAlert, RotateCcw, ChevronDown, ChevronUp,
  User, Check, Volume2, Cpu, ArrowUpRight,
  FileText, Briefcase, Layers, Table2, Loader2
} from 'lucide-react';
import { 
  apiClient, ChatbotResponse, ChatbotResolvedEntity, 
  ChatbotAnomaly, ChatbotAlert 
} from '../services/apiClient';
import { cn } from '../utils/cn';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_used?: string;
  generated_cypher?: string;
  sql_query?: string;
  records_count?: number;
  records?: any[];
  resolved_entities?: ChatbotResolvedEntity[];
  anomalies?: ChatbotAnomaly[];
  alerts?: ChatbotAlert[];
  suggested_followups?: string[];
  model_used?: string;
}

interface AIForensicChatbotProps {
  activeCaseId?: string;
  onPivotToGraph?: (entityId: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Simple Markdown Renderer component
const MarkdownRenderer = ({ content }: { content: string }) => {
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];
  
  const parseInline = (text: string, lineIndex: number) => {
    // Process bold (**text**)
    let parts = text.split(/(\*\*.*?\*\*)/g);
    let parsedParts = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      }
      // Process italic (*text*)
      let subParts = part.split(/(\*.*?\*)/g);
      return subParts.map((subPart, j) => {
        if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
          return <em key={`${i}-${j}`} className="italic">{subPart.slice(1, -1)}</em>;
        }
        return subPart;
      });
    });
    return parsedParts;
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const itemContent = line.trim().replace(/^[-*]\s+/, '');
      currentListItems.push(
        <li key={`li-${index}`} className="ml-4 list-disc my-0.5">
          {parseInline(itemContent, index)}
        </li>
      );
    } else {
      if (currentListItems.length > 0) {
        renderedElements.push(
          <ul key={`ul-${index}`} className="my-2">
            {currentListItems}
          </ul>
        );
        currentListItems = [];
      }
      
      if (line.trim() === '') {
        renderedElements.push(<br key={`br-${index}`} />);
      } else {
        renderedElements.push(
          <div key={`p-${index}`} className="my-1 break-words leading-relaxed">
            {parseInline(line, index)}
          </div>
        );
      }
    }
  });

  if (currentListItems.length > 0) {
    renderedElements.push(
      <ul key={`ul-end`} className="my-2">
        {currentListItems}
      </ul>
    );
  }

  return <div className="text-xs">{renderedElements}</div>;
};

// Tool Badge component
const ToolBadge = ({ tool }: { tool: string }) => {
  switch (tool) {
    case 'NEO4J_GRAPH':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 mt-0.5">
          <Share2 className="w-3 h-3" /> Knowledge Graph
        </span>
      );
    case 'POSTGRES_ANOMALIES':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
          <AlertTriangle className="w-3 h-3" /> Anomaly Engine
        </span>
      );
    case 'POSTGRES_ALERTS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-[10px] font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
          <ShieldAlert className="w-3 h-3" /> CEP Alerts
        </span>
      );
    case 'POSTGRES_PROFILES':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-[10px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
          <User className="w-3 h-3" /> Entity Profiles
        </span>
      );
    case 'POSTGRES_EVIDENCE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
          <Database className="w-3 h-3" /> Evidence Registry
        </span>
      );
    case 'POSTGRES_REPORTS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
          <FileText className="w-3 h-3" /> AI Reports
        </span>
      );
    case 'POSTGRES_CASES':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-500/10 border border-slate-500/30 text-[10px] font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
          <Briefcase className="w-3 h-3" /> Case Management
        </span>
      );
    case 'MULTI_SOURCE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 mt-0.5">
          <Layers className="w-3 h-3" /> Cross-Database
        </span>
      );
    default:
      return null;
  }
};

export const AIForensicChatbot: React.FC<AIForensicChatbotProps> = ({
  activeCaseId,
  onPivotToGraph,
  isOpen: externalIsOpen,
  onOpenChange
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) onOpenChange(open);
    setInternalIsOpen(open);
  };

  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [activeCypherCollapses, setActiveCypherCollapses] = useState<Record<string, boolean>>({});
  const [activeSqlCollapses, setActiveSqlCollapses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: "Hello Investigator. I am **Officer TRACE**, your autonomous forensic intelligence copilot powered by local **Qwen 2.5** on GPU.\n\nYou can query in plain English or use voice commands to explore **criminal networks**, **multi-hop transactions**, **anomalies**, and **specialist agent reports**.",
      timestamp: 'Just now',
      suggested_followups: [
        "Who are the highest risk suspects in this case?",
        "Find all bank transfers above ₹100,000",
        "Show critical cross-domain anomalies"
      ]
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load persistent conversation history whenever activeCaseId changes
  useEffect(() => {
    let isSubscribed = true;
    if (!activeCaseId) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await apiClient.getChatHistory(activeCaseId);
        if (isSubscribed) {
          if (res && res.messages && res.messages.length > 0) {
            setMessages(res.messages);
          } else {
            setMessages([
              {
                id: `welcome-${activeCaseId}`,
                role: 'assistant',
                content: `Hello Investigator. I am **Officer TRACE**, your autonomous forensic intelligence partner powered by local **Qwen 2.5** on GPU.\n\nActive Investigation: **${activeCaseId}**.\n\nYou can query in plain English or use voice commands to explore **criminal networks**, **multi-hop transactions**, **anomalies**, and **specialist agent reports**.`,
                timestamp: 'Just now',
                suggested_followups: [
                  "Who are the highest risk suspects in this case?",
                  "Find all bank transfers above ₹100,000",
                  "Show critical cross-domain anomalies"
                ]
              }
            ]);
          }
        }
      } catch (err) {
        console.warn("[Chatbot] Could not load case history:", err);
      } finally {
        if (isSubscribed) setIsLoadingHistory(false);
      }
    };

    fetchHistory();
    return () => { isSubscribed = false; };
  }, [activeCaseId]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsRecording(true);
        };

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          if (currentTranscript) {
            setInputMessage(currentTranscript);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("[Voice Command Warning]", event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Global keyboard shortcut (Ctrl+J or Cmd+J) and custom event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    const handleCustomOpen = () => setIsOpen(true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-forensic-chatbot', handleCustomOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-forensic-chatbot', handleCustomOpen);
    };
  }, [isOpen]);

  const toggleVoiceRecording = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert("Speech Recognition is not supported by your current browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("Could not start speech recognition:", err);
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: nowStr
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Build conversation history for context continuity
      const historyPayload = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res: ChatbotResponse = await apiClient.sendChatMessage({
        message: text,
        case_id: activeCaseId,
        history: historyPayload
      });

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tool_used: res.tool_used,
        generated_cypher: res.generated_cypher,
        sql_query: res.sql_query,
        records_count: res.records_count,
        records: res.records,
        resolved_entities: res.resolved_entities,
        anomalies: res.anomalies,
        alerts: res.alerts,
        suggested_followups: res.suggested_followups,
        model_used: res.model_used
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("[Chatbot Query Error]", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an operational issue processing that query: ${err.message || 'Server timeout'}. Please verify backend status.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCypherCollapse = (msgId: string) => {
    setActiveCypherCollapses(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const toggleSqlCollapse = (msgId: string) => {
    setActiveSqlCollapses(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const handleResetConversation = async () => {
    if (activeCaseId) {
      try {
        await apiClient.clearChatHistory(activeCaseId);
      } catch (err) {
        console.warn("[Chatbot] Could not clear history on server:", err);
      }
    }
    setMessages([
      {
        id: `welcome-${activeCaseId || 'reset'}`,
        role: 'assistant',
        content: `Conversation history reset for case **${activeCaseId || 'Active Case'}**. Ask me anything about suspects, bank flows, cellular movement, or anomalies.`,
        timestamp: 'Just now',
        suggested_followups: [
          "Who are the highest risk suspects in this case?",
          "Find all bank transfers above ₹100,000",
          "Show critical cross-domain anomalies"
        ]
      }
    ]);
  };

  if (!mounted) return null;

  return (
    <>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Floating Outer Officer Mascot Launcher (Bottom-Right Corner)     */}
      {/* Shows the ENTIRE mascot character without cutting or cropping    */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {!isOpen && (
        <div
          onClick={() => setIsOpen(true)}
          className="fixed bottom-0 right-4 sm:right-6 z-[60] flex flex-col items-end cursor-pointer select-none group transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
          title="Ask the Officer - TRACE AI Forensic Copilot [Ctrl+J]"
        >
          {/* Beautiful Speech Bubble / Callout Badge */}
          <div className="mb-1.5 mr-3 flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-card/95 dark:bg-card/95 backdrop-blur-xl border border-primary/40 shadow-2xl group-hover:scale-105 group-hover:border-primary transition-all duration-300 ring-1 ring-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold tracking-wide text-foreground flex items-center gap-1">
              Ask Officer
              <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" />
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-bold">
              Ctrl+J
            </span>
          </div>

          {/* Entire Officer Mascot Image — Completely uncut, standing at the corner */}
          <div className="relative">
            <img
              src="/chatbot-mascot.png"
              alt="Officer TRACE"
              className="h-36 sm:h-44 md:h-48 w-auto object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.55)] group-hover:scale-105 group-hover:-translate-y-1.5 transition-all duration-300"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/chatbot-avatar.png';
              }}
            />
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Main Chatbot Window with Officer Standing at the Corner        */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isOpen && (
        <div 
          className={cn(
            "fixed z-[60] transition-all duration-300 ease-out flex flex-col bg-card/95 backdrop-blur-2xl border border-border shadow-2xl rounded-3xl",
            isExpanded
              ? "inset-4 sm:inset-10"
              : "bottom-6 right-6 w-[94vw] sm:w-[490px] h-[650px] max-h-[85vh]"
          )}
        >
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-border/80 bg-secondary/40 flex items-center justify-between flex-shrink-0 rounded-t-3xl">
            <div className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 flex items-center justify-center flex-shrink-0">
                <img 
                  src="/chatbot-mascot.png" 
                  alt="Officer TRACE" 
                  className="h-10 w-auto object-contain drop-shadow-md" 
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/chatbot-avatar.png';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground">Officer TRACE • Forensic Copilot</h3>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    ONLINE
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                  <Cpu className="w-3 h-3 text-primary" />
                  <span>Qwen 2.5 7B</span>
                  <span>•</span>
                  <span className="text-foreground font-semibold truncate max-w-[160px]">{activeCaseId || 'Active Case'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-muted-foreground z-10">
              <button
                onClick={handleResetConversation}
                className="p-1.5 rounded-lg hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                title="Reset Case Conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                title="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Case History Loading Banner */}
          {isLoadingHistory && (
            <div className="px-4 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-center gap-2 text-[10px] font-mono text-primary animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Retrieving stored conversation history for {activeCaseId}...</span>
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={cn(
                  "flex flex-col space-y-1.5",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                {/* Bubble */}
                <div 
                  className={cn(
                    "p-3.5 max-w-[92%] sm:max-w-[88%] rounded-2xl shadow-sm text-xs leading-relaxed",
                    msg.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-tr-sm font-medium"
                      : "bg-secondary/70 text-foreground border border-border/80 rounded-tl-sm space-y-2.5"
                  )}
                >
                  {/* Assistant Identity Header */}
                  {msg.role === 'assistant' && (
                    <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-border/40">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary font-mono">
                        <img 
                          src="/chatbot-mascot.png" 
                          alt="Officer" 
                          className="w-5 h-5 object-contain flex-shrink-0 drop-shadow-sm" 
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/chatbot-avatar.png';
                          }}
                        />
                        <span>Officer TRACE</span>
                      </div>
                      {msg.tool_used && (
                        <ToolBadge tool={msg.tool_used} />
                      )}
                    </div>
                  )}

                  {/* Text content with markdown formatting */}
                  <div>
                    {msg.role === 'user' ? (
                       <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                       <MarkdownRenderer content={msg.content} />
                    )}
                  </div>

                  {/* Generated Cypher Accordion */}
                  {msg.generated_cypher && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <button
                        onClick={() => toggleCypherCollapse(msg.id)}
                        className="flex items-center justify-between w-full text-[10px] font-mono text-cyan-500 hover:text-cyan-400 transition-colors py-1 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-bold">
                          <Terminal className="w-3 h-3" /> Executed Neo4j Cypher ({msg.records_count ?? 0} records)
                        </span>
                        {activeCypherCollapses[msg.id] ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                      {activeCypherCollapses[msg.id] && (
                        <div className="p-2.5 mt-1 rounded-xl bg-black/60 border border-cyan-500/20 font-mono text-[11px] text-cyan-300 overflow-x-auto whitespace-pre">
                          {msg.generated_cypher}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generated SQL Accordion */}
                  {msg.sql_query && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <button
                        onClick={() => toggleSqlCollapse(msg.id)}
                        className="flex items-center justify-between w-full text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors py-1 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-bold">
                          <Terminal className="w-3 h-3" /> Executed SQL Query ({msg.records_count ?? 0} records)
                        </span>
                        {activeSqlCollapses[msg.id] ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                      {activeSqlCollapses[msg.id] && (
                        <div className="p-2.5 mt-1 rounded-xl bg-black/60 border border-indigo-500/20 font-mono text-[11px] text-indigo-300 overflow-x-auto whitespace-pre">
                          {msg.sql_query}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Data Table for Records */}
                  {msg.records && msg.records.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Table2 className="w-3 h-3 text-primary" />
                          Records Data ({msg.records_count ?? msg.records.length})
                        </span>
                      </div>
                      <div className="max-h-48 overflow-auto rounded-xl border border-border/80 bg-background/60 scrollbar-thin">
                        <table className="w-full text-left text-[10px] font-mono">
                          <thead className="bg-secondary/70 sticky top-0 backdrop-blur-sm border-b border-border/60">
                            <tr>
                              {Object.keys(msg.records[0]).map((key, i) => (
                                <th key={i} className="px-2.5 py-1.5 font-bold text-foreground">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.records.slice(0, 10).map((record, rIdx) => (
                              <tr key={rIdx} className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors">
                                {Object.values(record).map((val: any, cIdx) => (
                                  <td key={cIdx} className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">
                                    {val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Resolved Entities Knowledge Chips */}
                  {msg.resolved_entities && msg.resolved_entities.length > 0 && (
                    <div className="pt-2 border-t border-border/60 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Database className="w-3 h-3 text-primary" />
                        Resolved Case Entities ({msg.resolved_entities.length})
                      </div>
                      <div className="space-y-1">
                        {msg.resolved_entities.slice(0, 4).map((ent, eIdx) => (
                          <div 
                            key={eIdx}
                            className="p-2 rounded-xl bg-card border border-border/80 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                {ent.name ? ent.name[0].toUpperCase() : 'E'}
                              </div>
                              <div className="truncate">
                                <span className="font-bold text-foreground truncate block">{ent.name}</span>
                                {ent.details && (
                                  <span className="text-[9px] text-muted-foreground font-mono truncate block">{ent.details}</span>
                                )}
                              </div>
                            </div>

                            {onPivotToGraph && ent.pivot_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  onPivotToGraph(ent.pivot_id);
                                }}
                                className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                                title="Pivot to Graph Visualizer"
                              >
                                <Share2 className="w-3 h-3" /> Pivot
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-Domain Anomalies Badges */}
                  {msg.anomalies && msg.anomalies.length > 0 && (
                    <div className="pt-2 border-t border-border/60 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Correlated Anomalies
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.anomalies.slice(0, 3).map((ano, aIdx) => (
                          <span 
                            key={aIdx}
                            className="px-2 py-0.5 rounded-lg bg-card border border-border text-[10px] flex items-center gap-1"
                          >
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              ano.severity === 'CRITICAL' ? "bg-rose-500" :
                              ano.severity === 'HIGH' ? "bg-amber-500" : "bg-blue-400"
                            )} />
                            <strong className="text-foreground">{ano.title}</strong>
                            <span className="text-muted-foreground font-mono font-semibold">({Math.round(ano.score * 100)}%)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Follow-up Quick Chips */}
                {msg.suggested_followups && msg.suggested_followups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1 max-w-[90%]">
                    {msg.suggested_followups.map((sugg, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleSendMessage(sugg)}
                        className="px-2.5 py-1 rounded-xl bg-secondary/80 hover:bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-left cursor-pointer shadow-sm"
                      >
                        <span>{sugg}</span>
                        <ArrowUpRight className="w-2.5 h-2.5 text-primary" />
                      </button>
                    ))}
                  </div>
                )}

                <span className="text-[9px] text-muted-foreground font-mono px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-secondary/50 border border-border/60 w-fit text-xs text-muted-foreground animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-spin" />
                <span>Officer TRACE is analyzing cross-domain graph & database...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Voice Command Recording Banner */}
          {isRecording && (
            <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/30 flex items-center justify-between text-xs text-rose-400 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="font-bold">Listening... Speak your investigative query</span>
              </div>
              <button
                onClick={toggleVoiceRecording}
                className="text-[10px] font-bold underline cursor-pointer hover:text-rose-300"
              >
                Stop
              </button>
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3 border-t border-border bg-card/80 flex items-center gap-2 flex-shrink-0 rounded-b-3xl">
            {/* Voice Input Button */}
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={cn(
                "p-2.5 rounded-2xl border transition-all cursor-pointer flex-shrink-0",
                isRecording
                  ? "bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/30 animate-pulse"
                  : speechSupported
                    ? "bg-secondary hover:bg-secondary/80 text-foreground border-border"
                    : "opacity-40 cursor-not-allowed bg-secondary text-muted-foreground border-border"
              )}
              title={speechSupported ? (isRecording ? "Stop Recording" : "Voice Command (Speak to Officer)") : "Speech not supported in this browser"}
              disabled={!speechSupported}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              placeholder={isRecording ? "Listening to your voice..." : "Ask Officer TRACE (e.g. 'Show transactions > ₹100,000')..."}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-2xl bg-secondary/60 text-xs text-foreground placeholder:text-muted-foreground outline-none border border-border focus:border-primary/50 transition-all"
            />

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              className="p-2.5 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold transition-all shadow-md cursor-pointer flex-shrink-0"
              title="Send Query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
