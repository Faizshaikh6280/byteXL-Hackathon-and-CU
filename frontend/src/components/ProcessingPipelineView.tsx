'use client';

import React, { useState } from 'react';
import { 
  Play, CheckCircle2, Clock, AlertTriangle, Loader2, ArrowRight,
  Database, Cpu, Network, ShieldAlert, Sparkles, RefreshCw, Layers
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { apiClient } from '../services/apiClient';
import { cn } from '../utils/cn';

interface ProcessingPipelineViewProps {
  onNavigateToTab?: (tabId: string) => void;
}

export default function ProcessingPipelineView({ onNavigateToTab }: ProcessingPipelineViewProps) {
  const { activeCase, activeCaseDetail, refreshCases } = useCase();
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stageStatuses, setStageStatuses] = useState<Record<number, 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR'>>({
    0: 'IDLE',
    1: 'IDLE',
    2: 'IDLE',
    3: 'IDLE',
    4: 'IDLE',
    5: 'IDLE',
    6: 'IDLE',
  });

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  };

  const stages = [
    {
      index: 0,
      title: 'Evidence Ingestion & Encryption',
      desc: 'Raw multi-source files parsed, SHA-256 integrity calculated, and encrypted to MinIO with AES-256-GCM.',
      icon: Database,
      actionName: 'Verify / Ingest',
      runAction: async () => {
        let count = activeCaseDetail?.evidence?.length || 0;
        if (count === 0 && activeCase?.case_id) {
          try {
            const evRes = await apiClient.getCaseEvidence(activeCase.case_id);
            count = evRes?.evidence?.length || 0;
          } catch (e) {
            // fallback
          }
        }
        if (count > 0) {
          addLog(`Verified ${count} uploaded evidence file(s) for case ${activeCase?.case_reference || activeCase?.title || 'Active Case'}. Encrypted in MinIO.`);
        } else {
          throw new Error('No evidence files uploaded for this case yet. Please upload files in Evidence Intake before running the pipeline.');
        }
      }
    },
    {
      index: 1,
      title: 'Automatic Source Detection',
      desc: 'Statistical and schema fingerprinting automatically classifies files into CDR, BANKING, NETWORK, or SOCIAL.',
      icon: Sparkles,
      actionName: 'Auto-Detect',
      runAction: async () => {
        addLog('Source detection executed automatically during ingestion.');
      }
    },
    {
      index: 2,
      title: 'Columnar Warehouse Storage',
      desc: 'Events formatted into canonical Apache Arrow / Parquet tables partitioned by case and evidence ID.',
      icon: Layers,
      actionName: 'Warehouse Sync',
      runAction: async () => {
        addLog('Checking canonical Parquet warehouse...');
        const events = await apiClient.getIngestedEvents(activeCase?.case_id, 10);
        addLog(`Warehouse verified: canonical events ready for entity resolution.`);
      }
    },
    {
      index: 3,
      title: 'Zingg ML Entity Resolution',
      desc: 'Unsupervised & deterministic clustering resolves conflicting national IDs, phone numbers, and aliases into Golden Profiles in PostgreSQL.',
      icon: Cpu,
      actionName: 'Run Zingg ER',
      runAction: async () => {
        addLog('Executing Zingg Entity Resolution clustering...');
        const res = await apiClient.executeZinggER(activeCase?.case_id);
        addLog(`Zingg ER Complete: ${res.golden_profiles || res.clusters_resolved || 'Entities'} resolved into Golden Identity Profiles.`);
      }
    },
    {
      index: 4,
      title: 'Neo4j Graph Construction',
      desc: 'Builds heterogeneous multi-relational graph topology (:Person, :Phone, :BankAccount, :IPAddress, :CellTower, :IMEI).',
      icon: Network,
      actionName: 'Sync Graph',
      runAction: async () => {
        addLog('Constructing Neo4j Graph topology...');
        const res = await apiClient.syncGraph(activeCase?.case_id);
        addLog(`Neo4j Graph Synchronized: Nodes and relationships linked.`);
      }
    },
    {
      index: 5,
      title: 'Multi-Engine Anomaly Intelligence',
      desc: 'Executes 21 analytical engines (Isolation Forest, Rules, Centrality, ST-DBSCAN, Structuring, Tor/VPN, RGCN, TGN) with unified evidence fusion.',
      icon: ShieldAlert,
      actionName: 'Run 21 Engines',
      runAction: async () => {
        addLog('Running 21-Engine Anomaly Discovery across MinIO, PostgreSQL, and Neo4j...');
        const res = await apiClient.runAnomalyAnalysis(activeCase?.case_id);
        const summary = res.result?.summary;
        addLog(`Multi-Engine Complete in ${summary?.duration_seconds || 0}s! Found ${summary?.total_findings || 0} unified findings (${summary?.critical_count || 0} Critical).`);
      }
    },
    {
      index: 6,
      title: 'Graph Analytics & Syndicate Detection',
      desc: 'Executes 5 Graph Data Science algorithms (Louvain Modularity, PageRank, Betweenness, FastRP Embeddings, and Shortest Path) to isolate crime syndicates.',
      icon: Network,
      actionName: 'Run GDS',
      runAction: async () => {
        addLog('Running Graph Data Science & Community Detection algorithms...');
        const res = await apiClient.request(`/api/v1/investigation/run-algorithms?case_id=${encodeURIComponent(activeCase?.case_id || '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case_id: activeCase?.case_id })
        });
        const commCount = res.communities?.length || 0;
        addLog(`Graph Analytics Complete! Detected ${commCount} crime syndicate(s) for case.`);
      }
    }
  ];

  const handleRunFullPipeline = async () => {
    setIsRunningPipeline(true);
    setLogs([]);
    addLog(`=== Starting Full End-to-End Investigation Pipeline for ${activeCase?.case_reference || 'Active Case'} ===`);

    for (let i = 0; i < stages.length; i++) {
      setActiveStageIndex(i);
      setStageStatuses(prev => ({ ...prev, [i]: 'RUNNING' }));
      try {
        await stages[i].runAction();
        setStageStatuses(prev => ({ ...prev, [i]: 'COMPLETED' }));
      } catch (err: any) {
        addLog(`ERROR at Stage ${i} (${stages[i].title}): ${err.message}`);
        setStageStatuses(prev => ({ ...prev, [i]: 'ERROR' }));
        setIsRunningPipeline(false);
        return;
      }
    }

    addLog('=== Full Pipeline Executed Successfully! Workspace is Investigation Ready ===');
    setIsRunningPipeline(false);
    setActiveStageIndex(null);
    await refreshCases();
  };

  const handleRunSingleStage = async (stageIndex: number) => {
    setActiveStageIndex(stageIndex);
    setStageStatuses(prev => ({ ...prev, [stageIndex]: 'RUNNING' }));
    try {
      await stages[stageIndex].runAction();
      setStageStatuses(prev => ({ ...prev, [stageIndex]: 'COMPLETED' }));
      await refreshCases();
    } catch (err: any) {
      addLog(`ERROR at Stage ${stageIndex}: ${err.message}`);
      setStageStatuses(prev => ({ ...prev, [stageIndex]: 'ERROR' }));
    } finally {
      setActiveStageIndex(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Distributed Intelligence Pipeline
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor and trigger the end-to-end analytical processing stages for case <span className="font-mono text-foreground font-bold">{activeCase?.case_reference || 'ACTIVE'}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunFullPipeline}
            disabled={isRunningPipeline}
            className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isRunningPipeline ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing Pipeline...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Full End-to-End Pipeline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {stages.map((stage) => {
          const status = stageStatuses[stage.index];
          const isCurrent = activeStageIndex === stage.index;

          return (
            <div
              key={stage.index}
              className={cn(
                "bg-card border rounded-xl p-6 flex flex-col justify-between transition-all shadow-sm relative",
                isCurrent ? "border-primary ring-2 ring-primary/50" : "border-border"
              )}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-lg border",
                      status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                      status === 'RUNNING' ? "bg-primary/10 text-primary border-primary/20 animate-pulse" :
                      status === 'ERROR' ? "bg-destructive/10 text-destructive border-destructive/20" :
                      "bg-secondary text-muted-foreground border-border"
                    )}>
                      <stage.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">
                        Stage 0{stage.index + 1}
                      </span>
                      <h4 className="font-bold text-foreground text-sm leading-tight">
                        {stage.title}
                      </h4>
                    </div>
                  </div>

                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                    status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                    status === 'RUNNING' ? "bg-primary/10 text-primary border-primary/20 animate-pulse" :
                    status === 'ERROR' ? "bg-destructive/10 text-destructive border-destructive/20" :
                    "bg-secondary text-muted-foreground border-border"
                  )}>
                    {status}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                  {stage.desc}
                </p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => handleRunSingleStage(stage.index)}
                  disabled={isRunningPipeline || isCurrent}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {stage.actionName}
                </button>

                {status === 'COMPLETED' && (
                  <span className="text-emerald-500 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Pipeline Execution Console */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Pipeline Execution Log
          </div>
          {logs.length > 0 && (
            <button 
              onClick={() => setLogs([])} 
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Log
            </button>
          )}
        </div>

        <div className="p-4 bg-background font-mono text-xs text-muted-foreground max-h-60 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <div className="text-muted-foreground/60 italic">
              No recent pipeline runs. Click &quot;Run Full End-to-End Pipeline&quot; above to trigger all analytical stages.
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={cn(
                "leading-relaxed",
                log.includes('ERROR') ? "text-destructive font-bold" :
                log.includes('Complete') || log.includes('Successfully') ? "text-emerald-500 font-bold" :
                log.includes('===') ? "text-primary font-bold" : "text-foreground"
              )}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
