'use client';

import React, { useState } from 'react';
import { UserPlus, X, Mail, BadgeAlert, Building2, Shield, Loader2, CheckCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface InviteOfficerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roles: Array<{ name: string; display_name: string }>;
  units: Array<{ id: string; name: string }>;
}

export default function InviteOfficerModal({ isOpen, onClose, onSuccess, roles, units }: InviteOfficerModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('INSPECTOR');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ invite_link?: string; token?: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.inviteUser({
        employee_id: employeeId.trim().toUpperCase(),
        full_name: fullName.trim(),
        official_email: email.trim().toLowerCase(),
        role_name: roleName,
        unit_id: unitId || undefined,
        phone_number: phone.trim() || undefined
      });
      setInviteResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch officer invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="h-1 bg-gradient-to-r from-primary to-indigo-500" />

        <div className="p-4 sm:p-6 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Commission Officer</h3>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
              {error}
            </div>
          )}

          {inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Officer commissioned! Official invitation token generated.</span>
              </div>

              <div className="p-3 bg-secondary/50 border border-border rounded-lg text-xs font-mono break-all text-foreground">
                <span className="text-muted-foreground block text-[10px] mb-1 uppercase">Invitation Activation Link</span>
                {inviteResult.invite_link || `${window.location.origin}/invite?token=${inviteResult.token}`}
              </div>

              <button
                onClick={() => {
                  setInviteResult(null);
                  onClose();
                }}
                className="w-full py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Employee Badge ID *
                </label>
                <input
                  type="text"
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. EMP-INSP-012"
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Officer Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Inspector Rajesh Kumar"
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Official Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. rajesh.kumar@cyber.gov.in"
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Assigned Rank *
                  </label>
                  <select
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {roles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Operational Unit
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">-- Central Unit --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-secondary rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Dispatch Commission
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
