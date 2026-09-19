'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ShieldCheck, Lock, Mail, Key, AlertCircle, Loader2, 
  ChevronRight, ArrowLeft, Eye, EyeOff, ShieldAlert, Sparkles,
  UserCheck, Building2, CheckCircle2, BadgeCheck
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') || '';

  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [inviteData, setInviteData] = useState<{
    valid: boolean;
    official_email: string;
    employee_id: string;
    full_name: string;
    role_name: string;
    role_display: string;
    unit_name: string;
    expires_at: string;
  } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Password complexity helpers
  const hasMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSpecial;
  const passwordsMatch = password && password === confirmPassword;

  // Auto-verify token on mount if provided in URL
  useEffect(() => {
    if (initialToken.trim()) {
      handleVerifyToken(initialToken.trim());
    }
  }, [initialToken]);

  const handleVerifyToken = async (tok: string) => {
    if (!tok.trim()) return;
    setError(null);
    setVerifying(true);
    try {
      const res = await apiClient.verifyInvite(tok.trim());
      if (res && res.valid) {
        setInviteData(res);
      }
    } catch (err: any) {
      setError(err.message || 'The invitation link is invalid, expired, or has already been used.');
      setInviteData(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleAcceptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid) {
      setError('Password must meet all law-enforcement complexity requirements (12+ characters, upper, lower, number, special).');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.acceptInvite({
        token: token.trim(),
        password
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to activate credentials. The invitation may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-6 px-3 sm:px-6 md:px-8 bg-background relative overflow-y-auto">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 z-10 my-auto">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-cyan-500 to-indigo-500" />

        <div className="p-4 sm:p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5 sm:mb-6">
            <div className="p-2 sm:p-2.5 bg-primary/10 border border-primary/30 rounded-xl text-primary shrink-0">
              <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-mono">
                OFFICER COMMISSIONING
              </h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                Official Law Enforcement Onboarding
              </p>
            </div>
          </div>

          {/* Success State */}
          {success ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Credentials Established</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Your officer account has been commissioned and activated. Redirecting to investigation workspace...
                </p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="py-2.5 px-6 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-all inline-flex items-center gap-2"
              >
                Enter Platform Now <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2.5 text-xs text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Step 1: Token Input (If not verified yet) */}
              {!inviteData ? (
                <div className="space-y-4">
                  <div className="p-3 bg-secondary/40 border border-border/80 rounded-xl text-xs text-muted-foreground">
                    Enter the 32-character single-use commissioning token provided by your departmental administrator.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Invitation Token *
                    </label>
                    <input
                      type="text"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="e.g. 32-character token string"
                      className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={verifying || !token.trim()}
                    onClick={() => handleVerifyToken(token)}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Verifying Token...
                      </>
                    ) : (
                      <>
                        Validate Invitation <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <a href="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Official Sign In
                    </a>
                  </div>
                </div>
              ) : (
                /* Step 2: Establish Password for Verified Officer */
                <form onSubmit={handleAcceptSubmit} className="space-y-4">
                  {/* Verified Officer Preview Card */}
                  <div className="p-3.5 bg-secondary/60 border border-border rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-foreground">{inviteData.full_name}</span>
                      </div>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                        {inviteData.employee_id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                      <div>
                        <span className="block text-[10px] uppercase text-muted-foreground/70">Commissioned Role</span>
                        <span className="font-semibold text-foreground">{inviteData.role_display}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-muted-foreground/70">Operational Unit</span>
                        <span className="font-semibold text-foreground truncate block">{inviteData.unit_name}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Create Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 12 characters..."
                        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Confirm Password *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password..."
                      className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="p-3 bg-secondary/30 border border-border/60 rounded-xl text-[10px] space-y-1">
                    <div className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Law-Enforcement Password Requirements:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1">
                      <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> 12+ Characters ({password.length}/12)
                      </div>
                      <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Uppercase Letter
                      </div>
                      <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Lowercase Letter
                      </div>
                      <div className={`flex items-center gap-1.5 ${hasDigit ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Numeric Digit
                      </div>
                      <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Special Symbol (!@#$...)
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                        <CheckCircle2 className="w-3 h-3" /> Passwords Match
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid || !passwordsMatch}
                    className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Activating Credentials...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" /> Activate Account & Enter Platform
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setInviteData(null)}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Use different invitation token
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
