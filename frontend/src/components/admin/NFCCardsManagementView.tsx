'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Smartphone, Plus, RefreshCw, ShieldAlert, CheckCircle2, 
  XCircle, AlertCircle, Copy, Check, Lock, Loader2, KeyRound
} from 'lucide-react';
import { apiClient, NFCCardRecord, UserProfile } from '../../services/apiClient';

interface Props {
  users: UserProfile[];
  onRefreshUsers?: () => void;
}

export default function NFCCardsManagementView({ users, onRefreshUsers }: Props) {
  const [cards, setCards] = useState<NFCCardRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  
  // Issue card form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPin, setNewPin] = useState('1234');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedResult, setIssuedResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Replace card modal state
  const [replaceCardId, setReplaceCardId] = useState<string | null>(null);
  const [replacePin, setReplacePin] = useState('5678');
  const [replaceLoading, setReplaceLoading] = useState(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.listNfcCards();
      setCards(data || []);
    } catch (err: any) {
      console.warn('Could not load NFC cards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleActivate = async (cardId: string) => {
    try {
      await apiClient.activateNfcCard(cardId);
      await loadCards();
    } catch (err: any) {
      alert(`Activation failed: ${err.message}`);
    }
  };

  const handleSuspend = async (cardId: string) => {
    if (!window.confirm('Suspend this officer NFC smartcard? Authentication taps will be blocked.')) return;
    try {
      await apiClient.suspendNfcCard(cardId);
      await loadCards();
    } catch (err: any) {
      alert(`Suspension failed: ${err.message}`);
    }
  };

  const handleRevoke = async (cardId: string) => {
    if (!window.confirm('Permanently revoke this NFC smartcard? This action is irreversible.')) return;
    try {
      await apiClient.revokeNfcCard(cardId);
      await loadCards();
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || newPin.length !== 4) {
      setIssueError('Please select an officer and provide a 4-digit PIN.');
      return;
    }
    setIssueLoading(true);
    setIssueError(null);

    try {
      const res = await apiClient.issueNfcCard(selectedUserId, newPin);
      setIssuedResult(res);
      await loadCards();
      if (onRefreshUsers) onRefreshUsers();
    } catch (err: any) {
      setIssueError(err.message || 'Card provisioning failed.');
    } finally {
      setIssueLoading(false);
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceCardId || replacePin.length !== 4) return;
    setReplaceLoading(true);

    try {
      const res = await apiClient.replaceNfcCard(replaceCardId, replacePin);
      setReplaceCardId(null);
      setIssuedResult(res);
      await loadCards();
    } catch (err: any) {
      alert(`Replacement failed: ${err.message}`);
    } finally {
      setReplaceLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Physical NFC Smartcard Registry
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cryptographic token lifecycle, physical card provisioning, NDEF URLs, and 4-digit PIN governance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadCards()}
            disabled={loading}
            className="p-2 bg-secondary text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors cursor-pointer"
            title="Refresh Card Registry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setIsIssueModalOpen(true);
              setIssuedResult(null);
              setIssueError(null);
              setSelectedUserId(users[0]?.id || '');
              setNewPin('1234');
            }}
            className="px-3.5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Provision New Smartcard
          </button>
        </div>
      </div>

      {/* Cards Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left text-xs min-w-[780px]">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Card Identifier</th>
                <th className="px-4 py-3">Commissioned Officer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Security & Lock</th>
                <th className="px-4 py-3">Issued Date</th>
                <th className="px-4 py-3">Last Authenticated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && cards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading NFC Card Registry...
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    No physical NFC cards registered. Click "Provision New Smartcard" to issue one.
                  </td>
                </tr>
              ) : (
                cards.map((card) => (
                  <tr key={card.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-primary" />
                        <span>{card.card_uid}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{card.officer_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {card.employee_id} • {card.officer_unit || 'CCID-HQ'}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        card.status === 'ACTIVE' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : card.status === 'SUSPENDED'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-destructive/10 text-destructive border border-destructive/20'
                      }`}>
                        {card.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {card.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {card.is_locked ? (
                        <span className="text-destructive font-semibold flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Locked (Brute Force)
                        </span>
                      ) : card.failed_attempt_count > 0 ? (
                        <span className="text-amber-400 font-medium">
                          {card.failed_attempt_count} failed attempt(s)
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono">Clean (0 errors)</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {card.issued_at ? new Date(card.issued_at).toLocaleDateString() : 'N/A'}
                    </td>

                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {card.last_used_at ? new Date(card.last_used_at).toLocaleString() : 'Never'}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {card.status === 'SUSPENDED' && (
                          <button
                            onClick={() => handleActivate(card.id)}
                            className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] font-medium transition-colors"
                          >
                            Activate
                          </button>
                        )}

                        {card.status === 'ACTIVE' && (
                          <>
                            <button
                              onClick={() => handleSuspend(card.id)}
                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[11px] font-medium transition-colors"
                            >
                              Suspend
                            </button>
                            <button
                              onClick={() => handleRevoke(card.id)}
                              className="px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded text-[11px] font-medium transition-colors"
                            >
                              Revoke
                            </button>
                            <button
                              onClick={() => {
                                setReplaceCardId(card.id);
                                setReplacePin('5678');
                              }}
                              className="px-2 py-1 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded text-[11px] font-medium transition-colors"
                            >
                              Replace
                            </button>
                          </>
                        )}

                        {card.status === 'REVOKED' && (
                          <button
                            onClick={() => {
                              setSelectedUserId(card.user_id);
                              setIsIssueModalOpen(true);
                              setIssuedResult(null);
                            }}
                            className="px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded text-[11px] font-medium transition-colors"
                          >
                            Re-issue
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Issue NFC Card */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Provision Physical NFC Smartcard</h3>
              </div>
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground p-1"
              >
                ✕
              </button>
            </div>

            {issuedResult ? (
              <div className="space-y-4 py-2">
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block">Smartcard Successfully Provisioned!</strong>
                    <span>Write the NDEF URL below to the officer's physical NFC card tag.</span>
                  </div>
                </div>

                <div className="p-3 bg-secondary/50 border border-border rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    NDEF NFC URL Payload (One-Time Display)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={issuedResult.ndef_url}
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground"
                    />
                    <button
                      onClick={() => copyToClipboard(issuedResult.ndef_url)}
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-secondary/30 rounded-xl border border-border/70 text-xs text-muted-foreground space-y-1">
                  <div><strong>Assigned Officer:</strong> {issuedResult.officer_name} ({issuedResult.employee_id})</div>
                  <div><strong>Masked Card UID:</strong> <span className="font-mono text-foreground font-bold">{issuedResult.card_uid}</span></div>
                  <div><strong>Default 4-Digit PIN:</strong> <span className="font-mono text-primary font-bold">{newPin}</span></div>
                </div>

                <button
                  onClick={() => setIsIssueModalOpen(false)}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleIssueSubmit} className="space-y-4">
                {issueError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{issueError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Select Commissioned Officer
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    required
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.employee_id}) • {u.role_display || u.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Set 4-Digit Security PIN (Factor 2)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="e.g. 1234"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-center tracking-widest text-foreground outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    Must be exactly 4 numeric digits. Hashed with bcrypt (work factor 12).
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsIssueModalOpen(false)}
                    className="px-3 py-2 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={issueLoading || newPin.length !== 4}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {issueLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Generate NDEF Payload
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* MODAL: Replace NFC Card */}
      {replaceCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              Replace Officer Smartcard
            </h3>
            <p className="text-xs text-muted-foreground">
              The existing card will be permanently revoked. A new cryptographic token and NDEF URL will be issued.
            </p>

            <form onSubmit={handleReplaceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  New 4-Digit Security PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={replacePin}
                  onChange={(e) => setReplacePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-center tracking-widest text-foreground outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setReplaceCardId(null)}
                  className="px-3 py-1.5 bg-secondary text-foreground text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replaceLoading || replacePin.length !== 4}
                  className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90"
                >
                  {replaceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Replacement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
