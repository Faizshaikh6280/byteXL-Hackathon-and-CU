'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, Download, Search, Filter, RefreshCw, 
  Calendar, CheckCircle2, AlertTriangle, ShieldAlert, X, Eye, Loader2,
  Key, Lock, Database, ArrowUpDown, FileText, Check, Copy, UserCheck, Shield
} from 'lucide-react';
import { apiClient, AuditLogEntry, AuditStats, AuditVerifyResult } from '../services/apiClient';

export default function AuditTrailLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Statistics
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Integrity Verification
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionCategory, setActionCategory] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [caseFilter, setCaseFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Detail Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await apiClient.getAuditStats();
      setStats(data);
    } catch (err) {
      console.warn('Could not fetch audit statistics:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit, offset };
      if (actionCategory) params.action = actionCategory;
      if (resultFilter) params.result = resultFilter;
      if (caseFilter) params.case_id = caseFilter;

      const data = await apiClient.getAuditLogs(params);

      // Client-side text search filter if searchQuery provided
      let list = data.logs || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(l => 
          (l.actor && l.actor.toLowerCase().includes(q)) ||
          (l.action && l.action.toLowerCase().includes(q)) ||
          (l.case_id && l.case_id.toLowerCase().includes(q)) ||
          (l.audit_id && l.audit_id.toLowerCase().includes(q)) ||
          (l.reason && l.reason.toLowerCase().includes(q))
        );
      }

      setLogs(list);
      setTotal(data.total || 0);
    } catch (err) {
      console.warn('Could not fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [actionCategory, resultFilter, caseFilter, searchQuery, limit, offset]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const result = await apiClient.verifyAuditChain(5000);
      setVerifyResult(result);
      setIsVerifyModalOpen(true);
    } catch (err: any) {
      alert(`Cryptographic chain verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const blob = await apiClient.exportAuditLogs('csv');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TRACE_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getActionBadgeColor = (action: string, result: string) => {
    if (result === 'DENIED' || result === 'FAILED') return 'bg-destructive/15 text-destructive border-destructive/30';
    if (action.includes('LOGIN') || action.includes('MFA') || action.includes('NFC_AUTH')) return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    if (action.includes('EVIDENCE')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (action.includes('CASE')) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    if (action.includes('ENTITY')) return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    if (action.includes('FINDING') || action.includes('REPORT')) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    return 'bg-secondary text-foreground border-border';
  };

  return (
    <div className="flex flex-col h-full bg-background p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-hidden relative">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-border pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 font-mono">
            <ShieldCheck className="w-6 h-6 text-primary flex-shrink-0" />
            <span>STATUTORY AUDIT TRAIL &amp; ACTIVITY LOGS</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Tamper-evident, cryptographically chained forensic ledger tracking evidence custody, data access, and investigator operations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary rounded-lg border border-border transition-colors"
            title="Refresh Audit Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-lg border border-border transition-colors flex items-center gap-2"
            title="Verify cryptographic SHA-256 hash continuity"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5 text-primary" />}
            <span>Verify Chain</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="px-3.5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Export Certified Ledger</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <div className="bg-card border border-border p-3 rounded-xl shadow-sm">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Audited</span>
            <span className="text-xl font-bold text-foreground font-mono">{stats.total_events}</span>
          </div>

          <div className="bg-card border border-destructive/20 p-3 rounded-xl shadow-sm bg-destructive/5">
            <span className="text-[10px] uppercase font-bold text-destructive tracking-wider block">Denied Actions</span>
            <span className="text-xl font-bold text-destructive font-mono">{stats.denied_actions}</span>
          </div>

          <div className="bg-card border border-border p-3 rounded-xl shadow-sm">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">Evidence Exports</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{stats.evidence_exports}</span>
          </div>

          <div className="bg-card border border-border p-3 rounded-xl shadow-sm">
            <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block">Evidence Downloads</span>
            <span className="text-xl font-bold text-cyan-400 font-mono">{stats.evidence_downloads}</span>
          </div>

          <div className="bg-card border border-border p-3 rounded-xl shadow-sm">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">Findings Approved</span>
            <span className="text-xl font-bold text-amber-400 font-mono">{stats.finding_approvals}</span>
          </div>

          <div className="bg-card border border-border p-3 rounded-xl shadow-sm">
            <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">Admin & IAM</span>
            <span className="text-xl font-bold text-indigo-400 font-mono">{stats.admin_changes}</span>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="p-3 bg-card border border-border rounded-xl mb-4 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actor, action, case, audit ID, or reason..."
              className="w-full bg-secondary/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <select
              value={actionCategory}
              onChange={(e) => setActionCategory(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Action Types</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
              <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
              <option value="MFA_SUCCESS">MFA_SUCCESS</option>
              <option value="CASE_VIEWED">CASE_VIEWED</option>
              <option value="CASE_CREATED">CASE_CREATED</option>
              <option value="EVIDENCE_VIEWED">EVIDENCE_VIEWED</option>
              <option value="EVIDENCE_UPLOADED">EVIDENCE_UPLOADED</option>
              <option value="EVIDENCE_DOWNLOADED">EVIDENCE_DOWNLOADED</option>
              <option value="EVIDENCE_EXPORTED">EVIDENCE_EXPORTED</option>
              <option value="ENTITY_MERGED">ENTITY_MERGED</option>
              <option value="ENTITY_SPLIT">ENTITY_SPLIT</option>
              <option value="FINDING_APPROVED">FINDING_APPROVED</option>
              <option value="REPORT_EXPORTED">REPORT_EXPORTED</option>
              <option value="ACCESS_DENIED">ACCESS_DENIED</option>
              <option value="POLICY_DENIED">POLICY_DENIED</option>
              <option value="AUDIT_EXPORTED">AUDIT_EXPORTED</option>
            </select>
          </div>

          <div>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Verification Results</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="DENIED">DENIED (Security Policy)</option>
              <option value="FAILED">FAILED (Authentication)</option>
            </select>
          </div>

          <div>
            <input
              type="text"
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              placeholder="Filter by Case..."
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-auto touch-scroll flex-1">
          <table className="w-full text-left border-collapse font-sans text-xs min-w-[680px]">
            <thead className="bg-secondary/60 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-mono sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="p-3">Audit ID & Timestamp</th>
                <th className="p-3">Actor & Type</th>
                <th className="p-3">Action</th>
                <th className="p-3">Target Scope</th>
                <th className="p-3">Outcome</th>
                <th className="p-3">Client IP & Route</th>
                <th className="p-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-foreground font-mono">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs font-sans">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Querying tamper-evident ledger...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs font-sans">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                  >
                    <td className="p-3">
                      <div className="font-bold text-foreground text-[11px]">{log.audit_event_id || log.audit_id}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="text-foreground font-semibold truncate max-w-[160px]">{log.actor}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span>{log.role || 'System'}</span>
                        {log.actor_type && (
                          <span className="text-[9px] px-1 py-0.2 bg-secondary rounded border border-border">
                            {log.actor_type === 'HUMAN_USER' ? 'Officer' : 'Service'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${getActionBadgeColor(log.action, log.result)}`}>
                        {log.action}
                      </span>
                    </td>

                    <td className="p-3 text-muted-foreground truncate max-w-[140px]">
                      {log.case_id ? (
                        <span className="font-bold text-foreground/90">{log.case_id}</span>
                      ) : (
                        log.resource_type || '—'
                      )}
                    </td>

                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                        log.result === 'SUCCESS' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}>
                        {log.result === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {log.result}
                      </span>
                    </td>

                    <td className="p-3 text-muted-foreground text-[11px]">
                      <div>{log.ip_address || '127.0.0.1'}</div>
                      {log.endpoint && <div className="text-[10px] text-muted-foreground/80 truncate max-w-[120px]">{log.endpoint}</div>}
                    </td>

                    <td className="p-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {logs.length} of {total} total audited events</span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-2.5 py-1 bg-secondary rounded border border-border disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-2.5 py-1 bg-secondary rounded border border-border disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Forensic Detail Drawer / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-4 sm:p-6 max-h-[92vh] sm:max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-foreground font-mono truncate">
                  Forensic Record {selectedLog.audit_event_id || selectedLog.audit_id}
                </h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 bg-secondary/30 p-3 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Timestamp (UTC)</span>
                  <span className="text-foreground">{selectedLog.timestamp}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Action</span>
                  <span className="text-primary font-bold">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Actor</span>
                  <span className="text-foreground">{selectedLog.actor}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({selectedLog.actor_type || 'Officer'})</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Result & Decision</span>
                  <span className={selectedLog.result === 'SUCCESS' ? 'text-emerald-400 font-bold' : 'text-destructive font-bold'}>
                    {selectedLog.result} ({selectedLog.decision || 'ALLOWED'})
                  </span>
                </div>

                {selectedLog.case_id && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Case Dossier</span>
                    <span className="text-foreground font-bold">{selectedLog.case_id}</span>
                  </div>
                )}

                {selectedLog.role && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Officer Role</span>
                    <span className="text-foreground">{selectedLog.role}</span>
                  </div>
                )}

                {selectedLog.ip_address && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Client IP & Endpoint</span>
                    <span className="text-foreground">{selectedLog.ip_address} {selectedLog.endpoint ? `(${selectedLog.endpoint})` : ''}</span>
                  </div>
                )}

                {selectedLog.reason && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase block">Policy Reason</span>
                    <span className="text-amber-400">{selectedLog.reason}</span>
                  </div>
                )}

                {selectedLog.request_id && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Request ID</span>
                    <span className="text-muted-foreground break-all">{selectedLog.request_id}</span>
                  </div>
                )}

                {selectedLog.correlation_id && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Correlation ID</span>
                    <span className="text-muted-foreground break-all">{selectedLog.correlation_id}</span>
                  </div>
                )}
              </div>

              {/* Cryptographic Hash Chain Verification */}
              <div className="bg-secondary/40 p-3 rounded-lg border border-border space-y-1.5">
                <span className="text-[10px] text-muted-foreground uppercase block font-bold">Cryptographic Chain of Custody</span>
                <div className="text-[10px] text-muted-foreground break-all">
                  <span className="text-foreground font-semibold">Event SHA-256: </span>
                  {selectedLog.event_hash || 'Legacy unhashed record'}
                </div>
                {selectedLog.previous_event_hash && (
                  <div className="text-[10px] text-muted-foreground break-all">
                    <span className="text-foreground font-semibold">Predecessor Hash: </span>
                    {selectedLog.previous_event_hash}
                  </div>
                )}
              </div>

              {/* Sanitized JSON Metadata */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase block">Sanitized Event Metadata (JSON)</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog.details || {}, null, 2))}
                    className="text-[10px] text-primary flex items-center gap-1 hover:underline"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedId ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="p-3 bg-secondary/50 rounded-lg border border-border overflow-x-auto text-[11px] text-foreground max-h-48">
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chain Verification Result Modal */}
      {isVerifyModalOpen && verifyResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsVerifyModalOpen(false)}>
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-foreground font-mono">Chain Integrity Verification</h3>
              </div>
              <button onClick={() => setIsVerifyModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                verifyResult.status === 'VALID' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}>
                {verifyResult.status === 'VALID' ? (
                  <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                ) : (
                  <ShieldAlert className="w-6 h-6 flex-shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {verifyResult.status === 'VALID' ? 'CRYPTOGRAPHIC INTEGRITY INTACT' : 'INTEGRITY ANOMALY DETECTED'}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-90">
                    {verifyResult.status === 'VALID'
                      ? 'All sequential SHA-256 payload hashes and predecessor links are mathematically verified and authentic.'
                      : 'One or more records failed cryptographic hash validation. Potential data alteration detected.'}
                  </div>
                </div>
              </div>

              <div className="bg-secondary/30 p-3 rounded-lg border border-border space-y-1">
                <div><span className="text-muted-foreground">Records Evaluated: </span><span className="font-bold text-foreground">{verifyResult.records_checked}</span></div>
                {verifyResult.latest_hash && (
                  <div className="text-[10px] break-all"><span className="text-muted-foreground">Latest Chain Hash: </span>{verifyResult.latest_hash}</div>
                )}
              </div>

              {verifyResult.anomalies.length > 0 && (
                <div className="space-y-2">
                  <span className="text-destructive font-bold block">Detected Chain Anomalies:</span>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {verifyResult.anomalies.map((a, i) => (
                      <div key={i} className="p-2 bg-destructive/15 rounded border border-destructive/30 text-destructive text-[11px]">
                        [{a.type}] Record {a.audit_event_id}: {a.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setIsVerifyModalOpen(false)}
                className="w-full py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Close Verification Summary
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
