'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, Smartphone, Building, Globe, Search, ChevronRight, CheckCircle2, 
  Filter, Cpu, Loader2, RefreshCw, Network, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { apiClient, GoldenProfile } from '../services/apiClient';
import { cn } from '../utils/cn';
import { useCase } from '../context/CaseContext';

interface EntityResolutionMatrixProps {
  onViewOnGraph?: (entityId: string) => void;
  onNavigateToAnomalies?: () => void;
}

export default function EntityResolutionMatrix({ onViewOnGraph, onNavigateToAnomalies }: EntityResolutionMatrixProps) {
  const { activeCase } = useCase();
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<GoldenProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecutingER, setIsExecutingER] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getGoldenProfiles(activeCase?.case_id);
      setProfiles(data || []);
    } catch (err) {
      console.error('Failed to fetch golden profiles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [activeCase?.case_id]);

  const handleRunZingg = async () => {
    setIsExecutingER(true);
    setStatusMsg(`Running Zingg ER clustering across evidence for ${activeCase?.case_reference || activeCase?.title || 'active case'}...`);
    try {
      const res = await apiClient.executeZinggER(activeCase?.case_id);
      setStatusMsg(`Zingg ER finished: Resolved ${res.golden_profiles !== undefined ? res.golden_profiles : ''} Golden Identity Profiles.`);
      await fetchProfiles();
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg(`ER Error: ${err.message}`);
    } finally {
      setIsExecutingER(false);
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch = 
      p.primary_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.z_cluster_id?.toLowerCase().includes(search.toLowerCase()) ||
      p.known_aliases?.some(a => a.toLowerCase().includes(search.toLowerCase())) ||
      p.known_phones?.some(ph => ph.includes(search)) ||
      p.known_accounts?.some(acc => acc.includes(search));

    if (!matchesSearch) return false;

    if (activeFilter === 'Phones') return (p.known_phones?.length || 0) > 0;
    if (activeFilter === 'Accounts') return (p.known_accounts?.length || 0) > 0;
    if (activeFilter === 'Social') return (p.social_handles?.length || 0) > 0;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Zingg ML Entity Resolution Explorer
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cross-domain resolved identities, deduplicated clusters, and unified golden profiles from PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProfiles}
            disabled={isLoading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-lg hover:bg-secondary/80 transition-colors"
            title="Refresh Profiles"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={handleRunZingg}
            disabled={isExecutingER}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isExecutingER ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            Re-run Zingg ER
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl text-sm text-primary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-2 border-b border-border sm:border-none pb-2 sm:pb-0">
          {['All', 'Phones', 'Accounts', 'Social'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors",
                activeFilter === tab 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, cluster ID, phone, account, or alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-1.5 w-80 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Profiles Table */}
      <div className="flex-1 bg-card border border-border shadow-sm rounded-xl overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading resolved Golden Identity Profiles...</div>
        ) : filteredProfiles.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <h4 className="font-bold text-foreground">No Resolved Entities Found</h4>
            <p className="text-xs max-w-sm mx-auto">
              Run the Zingg Entity Resolution pipeline to cluster raw records into Golden Profiles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="px-6 py-3.5">Resolved Golden Entity</th>
                  <th className="px-6 py-3.5">Aliases</th>
                  <th className="px-6 py-3.5">Linked Phones</th>
                  <th className="px-6 py-3.5">Bank Accounts</th>
                  <th className="px-6 py-3.5">Social Handles</th>
                  <th className="px-6 py-3.5">Risk Score</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredProfiles.map((p) => {
                  const riskPercent = Math.round((p.risk_score || 0) * 100);
                  const isHighRisk = riskPercent >= 60;

                  return (
                    <tr key={p.z_cluster_id} className="hover:bg-secondary/40 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{p.primary_name || 'Unidentified Entity'}</div>
                            <div className="text-xs font-mono text-muted-foreground">{p.z_cluster_id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {p.known_aliases && p.known_aliases.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {p.known_aliases.map((alias, i) => (
                              <span key={i} className="text-[11px] bg-secondary px-2 py-0.5 rounded border border-border text-muted-foreground font-medium">
                                {alias}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {p.known_phones && p.known_phones.length > 0 ? (
                          <div className="space-y-0.5 font-mono text-xs">
                            {p.known_phones.map((phone, i) => (
                              <div key={i} className="text-foreground">{phone}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {p.known_accounts && p.known_accounts.length > 0 ? (
                          <div className="space-y-0.5 font-mono text-xs">
                            {p.known_accounts.map((acc, i) => (
                              <div key={i} className="text-emerald-500 font-medium">{acc}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {p.social_handles && p.social_handles.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {p.social_handles.map((sh, i) => {
                              const handleStr = typeof sh === 'string' ? sh : (sh?.handle || '');
                              const cleanHandle = handleStr.replace(/^@/, '');
                              if (!cleanHandle) return null;
                              return (
                                <span key={i} className="text-[11px] text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20 font-mono">
                                  @{cleanHandle}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            isHighRisk ? "bg-destructive animate-pulse" : "bg-emerald-500"
                          )} />
                          <span className={cn("font-bold text-xs", isHighRisk ? "text-destructive" : "text-foreground")}>
                            {riskPercent}%
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {onViewOnGraph && (
                            <button
                              onClick={() => onViewOnGraph(p.z_cluster_id)}
                              className="p-1.5 bg-secondary text-foreground hover:text-primary rounded-lg border border-border hover:border-primary/50 transition-colors"
                              title="View on Cytoscape Graph"
                            >
                              <Network className="w-4 h-4" />
                            </button>
                          )}
                          {onNavigateToAnomalies && (
                            <button
                              onClick={onNavigateToAnomalies}
                              className="p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg border border-destructive/30 transition-colors"
                              title="Inspect Anomalies"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
