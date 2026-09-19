'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  History, ShieldCheck, CheckCircle2, ShieldAlert, 
  FileSpreadsheet, Download, RefreshCw, Cpu, Award, 
  Eye, FileText, User, Filter, Loader2, ArrowRight
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface CaseActivityTimelineProps {
  caseId: string;
  caseReference?: string;
  caseTitle?: string;
}

export default function CaseActivityTimeline({ caseId, caseReference, caseTitle }: CaseActivityTimelineProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const fetchActivities = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await apiClient.getCaseActivityTimeline(caseId, actionFilter || undefined);
      setActivities(res.activities || []);
      setTotal(res.total_records || 0);
    } catch (err) {
      console.warn('Could not fetch case activity timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId, actionFilter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const getActivityIcon = (action: string) => {
    if (action.includes('EVIDENCE_UPLOAD') || action.includes('EVIDENCE_CREATED')) return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    if (action.includes('DOWNLOAD') || action.includes('EXPORT')) return <Download className="w-4 h-4 text-cyan-400" />;
    if (action.includes('ENTITY')) return <Cpu className="w-4 h-4 text-purple-400" />;
    if (action.includes('FINDING_APPROVED')) return <Award className="w-4 h-4 text-amber-400" />;
    if (action.includes('VIEW')) return <Eye className="w-4 h-4 text-indigo-400" />;
    if (action.includes('DENIED')) return <ShieldAlert className="w-4 h-4 text-destructive" />;
    return <History className="w-4 h-4 text-primary" />;
  };

  const getActionLabel = (activity: any) => {
    const act = activity.action;
    if (act === 'EVIDENCE_UPLOADED' || act === 'EVIDENCE_CREATED') {
      return `Raw evidence uploaded: ${activity.details?.filename || activity.resource_id || ''}`;
    }
    if (act === 'EVIDENCE_DOWNLOADED') {
      return `Forensic raw evidence downloaded: ${activity.details?.filename || activity.resource_id || ''}`;
    }
    if (act === 'EVIDENCE_EXPORTED') {
      return `Evidence dossier exported: ${activity.details?.filename || activity.resource_id || ''}`;
    }
    if (act === 'ENTITY_RESOLVED' || act === 'ENTITY_RESOLUTION_EXECUTED') {
      return `Entity resolution executed across case evidence`;
    }
    if (act === 'ENTITY_MERGED') {
      return `Golden entity clusters merged into ${activity.resource_id}`;
    }
    if (act === 'ENTITY_SPLIT') {
      return `Golden entity cluster split (${activity.resource_id})`;
    }
    if (act === 'FINDING_APPROVED') {
      return `Investigative finding approved: "${activity.details?.title || activity.resource_id}"`;
    }
    if (act === 'FINDING_CREATED') {
      return `New finding recorded: "${activity.details?.title || ''}"`;
    }
    if (act === 'REPORT_EXPORTED') {
      return `Certified dossier package exported`;
    }
    if (act === 'CASE_VIEWED') {
      return `Case dossier opened for inspection`;
    }
    if (act === 'ACCESS_DENIED') {
      return `Unauthorized access attempt blocked (${activity.reason || 'Case isolation enforced'})`;
    }
    return activity.action;
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-2xl overflow-hidden p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground font-mono">
              CASE ACTIVITY & AUDIT TRAIL
            </h3>
            {caseReference && (
              <span className="text-xs font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                {caseReference}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Statutory trail of investigator operations on this case. (Distinct from real-world evidence event timeline)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-secondary text-xs rounded-lg px-2.5 py-1.5 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Case Activities</option>
            <option value="EVIDENCE_UPLOADED">Evidence Uploaded</option>
            <option value="EVIDENCE_DOWNLOADED">Evidence Downloaded</option>
            <option value="EVIDENCE_EXPORTED">Evidence Exported</option>
            <option value="ENTITY_RESOLVED">Entity Resolution</option>
            <option value="ENTITY_MERGED">Entity Merged</option>
            <option value="FINDING_APPROVED">Finding Approved</option>
            <option value="REPORT_EXPORTED">Report Exported</option>
            <option value="ACCESS_DENIED">Access Denials</option>
          </select>

          <button
            onClick={fetchActivities}
            disabled={loading}
            className="p-1.5 bg-secondary text-muted-foreground hover:text-foreground rounded-lg border border-border transition-colors"
            title="Refresh Activity"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Activity Timeline Stream */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 font-mono text-xs">
        {loading && activities.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
            Loading case activity audit trail...
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No platform activity recorded yet for this case dossier.
          </div>
        ) : (
          <div className="relative border-l border-border/80 ml-3 pl-5 space-y-6">
            {activities.map((act, idx) => (
              <div key={idx} className="relative group">
                {/* Node icon */}
                <div className="absolute -left-[29px] top-0 p-1.5 rounded-full bg-card border border-border shadow-sm group-hover:border-primary transition-colors">
                  {getActivityIcon(act.action)}
                </div>

                <div className="bg-secondary/30 hover:bg-secondary/50 border border-border rounded-xl p-3.5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-foreground text-xs font-sans">
                      {getActionLabel(act)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {' '}&bull;{' '}
                      {new Date(act.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-primary" />
                      <span className="text-foreground">{act.actor}</span>
                      {act.role && <span className="text-[10px] opacity-75">({act.role})</span>}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${
                        act.result === 'SUCCESS' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}>
                        {act.result}
                      </span>
                    </div>

                    {act.ip_address && (
                      <span className="text-[10px] text-muted-foreground">
                        IP: {act.ip_address}
                      </span>
                    )}

                    <span className="text-[10px] text-muted-foreground ml-auto">
                      ID: {act.audit_id}
                    </span>
                  </div>

                  {act.reason && (
                    <div className="mt-2 text-[10px] text-amber-400/90 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                      Reason: {act.reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border pt-3 mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Recorded {activities.length} platform operations on this dossier</span>
        <span className="text-[10px] flex items-center gap-1 text-emerald-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5" /> Immutable Audit Store
        </span>
      </div>
    </div>
  );
}
