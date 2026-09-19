'use client';

import React, { useState, useEffect } from 'react';
import { 
  User, ShieldCheck, Key, Lock, Laptop, CheckCircle2, 
  AlertCircle, Loader2, X, RefreshCw, Copy, Check, QrCode
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiClient, UserSession } from '../../services/apiClient';

export default function UserProfileModal() {
  const { user, permissions, isProfileModalOpen, setIsProfileModalOpen, logout, refreshUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions' | 'mfa'>('profile');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  // Change password form
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  // MFA Setup
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; provisioning_uri: string; backup_codes: string[] } | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isProfileModalOpen && activeTab === 'sessions') {
      loadSessions();
    }
  }, [isProfileModalOpen, activeTab]);

  if (!isProfileModalOpen || !user) return null;

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await apiClient.getActiveSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.warn('Could not load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.revokeSession(sessionId);
      await loadSessions();
    } catch (err: any) {
      alert(`Could not revoke session: ${err.message}`);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (newPass !== confirmPass) {
      setPassError('New passwords do not match.');
      return;
    }

    if (newPass.length < 12) {
      setPassError('Password must be at least 12 characters long.');
      return;
    }

    setPassLoading(true);
    try {
      await apiClient.changePassword({ current_password: currentPass, new_password: newPass });
      setPassSuccess('Password successfully updated. All other active sessions have been invalidated.');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      setPassError(err.message || 'Failed to update password.');
    } finally {
      setPassLoading(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setMfaLoading(true);
    setMfaError(null);
    try {
      const data = await apiClient.setupMfa();
      setMfaSetupData(data);
    } catch (err: any) {
      setMfaError(err.message || 'Could not initiate MFA setup.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleConfirmMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError(null);
    try {
      await apiClient.confirmMfa(mfaConfirmCode);
      setMfaSuccess('Two-Factor Authentication is now actively protecting your account.');
      setMfaSetupData(null);
      await refreshUser();
    } catch (err: any) {
      setMfaError(err.message || 'Failed to verify TOTP code. Please check your authenticator.');
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Personnel Security & Profile</h2>
              <p className="text-xs text-muted-foreground font-mono">{user.employee_id} • {user.official_email}</p>
            </div>
          </div>
          <button
            onClick={() => setIsProfileModalOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border px-4 sm:px-6 bg-secondary/10 overflow-x-auto scrollbar-hide touch-scroll">
          {[
            { id: 'profile', label: 'Officer Profile' },
            { id: 'security', label: 'Change Password' },
            { id: 'mfa', label: 'MFA Protection' },
            { id: 'sessions', label: 'Active Sessions' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-secondary/40 border border-border rounded-xl">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Officer Full Name
                  </span>
                  <span className="text-sm font-bold text-foreground">{user.full_name}</span>
                </div>
                <div className="p-3.5 bg-secondary/40 border border-border rounded-xl">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Official Employee ID
                  </span>
                  <span className="text-sm font-bold font-mono text-primary">{user.employee_id}</span>
                </div>
                <div className="p-3.5 bg-secondary/40 border border-border rounded-xl">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Assigned Rank / Role
                  </span>
                  <span className="inline-block text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                    {user.role_display || user.role}
                  </span>
                </div>
                <div className="p-3.5 bg-secondary/40 border border-border rounded-xl">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Operational Unit
                  </span>
                  <span className="text-sm font-semibold text-foreground">{user.unit || 'Central Headquarters'}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Granted Fine-Grained Permissions ({permissions.length})
                </h3>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-secondary/20 border border-border rounded-xl">
                  {permissions.map((p) => (
                    <span
                      key={p}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-card border border-border/80 text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  onClick={() => {
                    logout();
                    setIsProfileModalOpen(false);
                  }}
                  className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold rounded-lg hover:bg-destructive/20 transition-colors"
                >
                  Logout of Platform
                </button>
              </div>
            </div>
          )}

          {/* SECURITY / PASSWORD TAB */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <p className="text-xs text-muted-foreground">
                Passwords must meet law-enforcement security standards: minimum 12 characters, including uppercase, lowercase, numeric digits, and special symbols.
              </p>

              {passError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={passLoading}
                className="py-2.5 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {passLoading ? 'Updating Password...' : 'Change Password'}
              </button>
            </form>
          )}

          {/* MFA TAB */}
          {activeTab === 'mfa' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 border border-border rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Two-Factor Authentication (TOTP)</h4>
                  <p className="text-xs text-muted-foreground">
                    Enforces RFC 6238 time-based one-time passwords via Google Authenticator or hardware tokens.
                  </p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                  user.mfa_enabled 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {user.mfa_enabled ? 'Active & Enforced' : 'Not Configured'}
                </span>
              </div>

              {mfaSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{mfaSuccess}</span>
                </div>
              )}

              {mfaError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{mfaError}</span>
                </div>
              )}

              {!user.mfa_enabled && !mfaSetupData && (
                <button
                  onClick={handleStartMfaSetup}
                  disabled={mfaLoading}
                  className="py-2.5 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {mfaLoading ? 'Generating Secret...' : 'Enroll Two-Factor Authentication'}
                </button>
              )}

              {mfaSetupData && (
                <div className="p-4 bg-secondary/20 border border-border rounded-xl space-y-4">
                  <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Step 1: Link Authenticator App
                  </h5>
                  
                  <div className="p-3 bg-card border border-border rounded-lg text-xs font-mono break-all text-foreground flex items-center justify-between">
                    <span>Secret: {mfaSetupData.secret}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(mfaSetupData.secret);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="p-1 text-muted-foreground hover:text-primary"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <h5 className="text-xs font-bold text-foreground uppercase tracking-wider pt-2">
                    Step 2: Save Emergency Backup Recovery Codes
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-secondary/50 p-3 rounded-lg border border-border font-mono text-xs">
                    {mfaSetupData.backup_codes.map((code, i) => (
                      <div key={i} className="text-foreground">{code}</div>
                    ))}
                  </div>

                  <form onSubmit={handleConfirmMfa} className="space-y-3 pt-2">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">
                      Step 3: Enter 6-digit code to confirm setup
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={mfaConfirmCode}
                        onChange={(e) => setMfaConfirmCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="w-40 text-center tracking-widest font-mono text-base bg-secondary/50 border border-border rounded-lg py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="submit"
                        disabled={mfaLoading || mfaConfirmCode.length < 6}
                        className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        {mfaLoading ? 'Verifying...' : 'Activate MFA'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* SESSIONS TAB */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">
                  Authorized browser sessions associated with badge {user.employee_id}
                </span>
                <button
                  onClick={loadSessions}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Refresh Sessions"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {loadingSessions ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading active sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs bg-secondary/20 rounded-xl border border-border">
                  No active session records found.
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-3 bg-secondary/30 border border-border rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <Laptop className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground">
                            IP: {sess.ip_address || 'Internal Network'}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate max-w-xs">
                            {sess.user_agent || 'Standard Client'}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevokeSession(sess.session_id)}
                        className="px-2.5 py-1 bg-destructive/10 text-destructive border border-destructive/20 rounded text-[11px] font-semibold hover:bg-destructive/20 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
