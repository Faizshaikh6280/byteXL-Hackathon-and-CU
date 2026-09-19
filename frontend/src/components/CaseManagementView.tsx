'use client';

import React, { useState } from 'react';
import { 
  FolderOpen, Plus, Calendar, User, Users, CheckCircle, ShieldCheck, 
  ArrowRight, FileSpreadsheet, AlertTriangle, Database, Trash2, Loader2, History, X
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import CreateCaseModal from './CreateCaseModal';
import CaseMembersModal from './CaseMembersModal';
import CaseActivityTimeline from './CaseActivityTimeline';
import { cn } from '../utils/cn';

interface CaseManagementViewProps {
  onSelectCaseTab?: (tabId: string) => void;
}

export default function CaseManagementView({ onSelectCaseTab }: CaseManagementViewProps) {
  const { cases, activeCase, setActiveCaseId, isLoading, refreshCases, deleteCase, deleteAllCases } = useCase();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [membersModalCase, setMembersModalCase] = useState<{ id: string; title: string } | null>(null);
  const [timelineModalCase, setTimelineModalCase] = useState<{ id: string; ref?: string; title: string } | null>(null);

  const handleDeleteCase = async (e: React.MouseEvent, caseId: string, caseTitle: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete case "${caseTitle}"? All associated evidence, golden profiles, and graph data will be purged.`)) {
      return;
    }
    setDeletingId(caseId);
    try {
      await deleteCase(caseId);
    } catch (err: any) {
      alert(`Failed to delete case: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you sure you want to delete ALL cases? This will completely wipe all evidence, entities, graph nodes, and anomalies for a completely fresh start.')) {
      return;
    }
    setIsDeletingAll(true);
    try {
      await deleteAllCases();
    } catch (err: any) {
      alert(`Failed to delete all cases: ${err.message}`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background p-3 sm:p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8 border-b border-border pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-primary" />
            Case Dossiers & Management
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Registered investigative operations, attached evidence files, and active workspaces
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {cases.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={isDeletingAll}
              className="px-3 py-2 bg-destructive/10 text-destructive border border-destructive/20 text-xs sm:text-sm font-medium rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-2 disabled:opacity-50"
              title="Delete all cases and start with a clean slate"
            >
              {isDeletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete All Cases
            </button>
          )}
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 sm:px-4 py-2 bg-primary text-primary-foreground text-xs sm:text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Case Dossier
          </button>
        </div>
      </div>

      {isLoading && cases.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">Loading active cases from backend...</div>
      ) : cases.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-border rounded-xl text-center space-y-4 max-w-md mx-auto my-12">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">No Investigation Cases Found</h3>
          <p className="text-sm text-muted-foreground">
            Create your first formal case dossier to begin uploading raw evidence files and discovering intelligence.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Case
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {cases.map((c) => {
            const isActive = activeCase?.case_id === c.case_id;
            return (
              <div
                key={c.case_id}
                onClick={() => setActiveCaseId(c.case_id)}
                className={cn(
                  "bg-card border rounded-xl p-4 sm:p-6 flex flex-col justify-between transition-all cursor-pointer shadow-sm relative group",
                  isActive 
                    ? "border-primary ring-1 ring-primary shadow-primary/10" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20">
                      {c.case_reference}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                        c.status === 'ACTIVE' 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                          : "bg-secondary text-muted-foreground border-border"
                      )}>
                        {c.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMembersModalCase({ id: c.case_id, title: c.title });
                        }}
                        className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Manage Assigned Personnel"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimelineModalCase({ id: c.case_id, ref: c.case_reference, title: c.title });
                        }}
                        className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Inspect Case Platform Activity Trail"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCase(e, c.case_id, c.title)}
                        disabled={deletingId === c.case_id}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="Delete Case Dossier"
                      >
                        {deletingId === c.case_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {c.title}
                  </h3>

                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {c.description || 'No detailed investigative context provided for this operation.'}
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-border text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {c.created_by}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-foreground">
                      {isActive ? (
                        <span className="text-primary font-bold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Current Workspace
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Click to Activate</span>
                      )}
                    </span>
                    {onSelectCaseTab && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCaseId(c.case_id);
                          onSelectCaseTab('data-sources');
                        }}
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        Evidence <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateCaseModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      {membersModalCase && (
        <CaseMembersModal
          isOpen={!!membersModalCase}
          onClose={() => setMembersModalCase(null)}
          caseId={membersModalCase.id}
          caseTitle={membersModalCase.title}
        />
      )}

      {timelineModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setTimelineModalCase(null)}>
          <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CaseActivityTimeline
              caseId={timelineModalCase.id}
              caseReference={timelineModalCase.ref}
              caseTitle={timelineModalCase.title}
            />
          </div>
        </div>
      )}
    </div>
  );
}
