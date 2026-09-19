'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, X, Trash2, Shield, Loader2, CheckCircle2 } from 'lucide-react';
import { apiClient, UserProfile } from '../services/apiClient';

interface CaseMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseTitle: string;
}

const CASE_ROLES = [
  { id: 'OWNER', label: 'Case Owner (Supervisory)' },
  { id: 'LEAD_INVESTIGATOR', label: 'Lead Investigator (IPS / Inspector)' },
  { id: 'INVESTIGATOR', label: 'Investigator (Inspector / SI)' },
  { id: 'ANALYST', label: 'Intelligence Analyst' },
  { id: 'AUDITOR', label: 'Case Auditor (Read-Only)' },
];

export default function CaseMembersModal({ isOpen, onClose, caseId, caseTitle }: CaseMembersModalProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCaseRole, setSelectedCaseRole] = useState('INVESTIGATOR');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const [membersResp, usersResp] = await Promise.all([
        apiClient.getCaseMembers(caseId),
        apiClient.getUsers()
      ]);
      setMembers(membersResp.members || []);
      setAllUsers(usersResp.users || []);
      if (usersResp.users && usersResp.users.length > 0) {
        setSelectedUserId(usersResp.users[0].id);
      }
    } catch (err) {
      console.warn('Could not load case members:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setActionLoading(true);
    setMessage(null);
    try {
      await apiClient.assignCaseMember(caseId, {
        user_id: selectedUserId,
        case_role: selectedCaseRole
      });
      setMessage('Officer assigned to case dossier successfully.');
      await loadData();
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm('Revoke this officer\'s access to this case dossier?')) return;
    try {
      await apiClient.removeCaseMember(caseId, userId);
      await loadData();
    } catch (err: any) {
      alert(`Could not remove officer: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="h-1 bg-gradient-to-r from-primary via-cyan-500 to-indigo-500" />

        <div className="p-4 sm:p-6 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Assigned Personnel</h3>
                <p className="text-xs text-muted-foreground font-mono truncate max-w-sm">
                  {caseId}: {caseTitle}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {message && (
            <div className="mb-4 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* Add Member Form */}
          <form onSubmit={handleAssign} className="p-3.5 bg-secondary/30 border border-border rounded-xl mb-4 space-y-3">
            <span className="text-xs font-bold text-foreground block">Assign Officer to Case Dossier</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.employee_id} - {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedCaseRole}
                  onChange={(e) => setSelectedCaseRole(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CASE_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading || !selectedUserId}
              className="w-full py-1.5 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Grant Case Access
            </button>
          </form>

          {/* Members List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Active Case Personnel ({members.length})
            </span>

            {loading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-primary" />
                Loading personnel...
              </div>
            ) : members.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground bg-secondary/20 rounded-lg border border-border">
                No individual officers explicitly assigned. Accessible only by supervisory ranks.
              </div>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="p-2.5 bg-secondary/40 border border-border rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-foreground">{m.full_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {m.employee_id} • {m.official_email}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-bold">
                      {m.case_role}
                    </span>
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Revoke access"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
