'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, Lock, Mail, Key, AlertCircle, Loader2, 
  ChevronRight, ArrowLeft, RefreshCw, Eye, EyeOff, ShieldAlert, Sparkles, Smartphone,
  UserPlus, LogIn, User, CheckCircle2, Ticket, Clock
} from 'lucide-react';
import { useAuth, SEEDED_DEV_ACCOUNTS } from '../../context/AuthContext';

export default function LoginModal() {
  const { login, register, verifyMfa, isLoginModalOpen, setIsLoginModalOpen, switchDevRole, isAuthenticated, user } = useAuth();
  
  // Tab mode: 'login' or 'register'
  const [activeMode, setActiveMode] = useState<'login' | 'register'>('login');

  // Pending statutory approval registration state
  const [pendingRegistration, setPendingRegistration] = useState<{
    employee_id: string;
    full_name: string;
    official_email: string;
    message: string;
    role_display?: string;
  } | null>(null);

  // Login form state
  const [identifier, setIdentifier] = useState('admin@cyber.gov.in');
  const [password, setPassword] = useState('Admin#Cyber2026!Secure');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Registration form state
  const [regEmpId, setRegEmpId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('INSPECTOR');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // MFA Challenge state
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isBackupMode, setIsBackupMode] = useState(false);

  if (!isLoginModalOpen && isAuthenticated) return null;

  // Password complexity helpers for registration
  const hasMinLength = regPassword.length >= 12;
  const hasUppercase = /[A-Z]/.test(regPassword);
  const hasLowercase = /[a-z]/.test(regPassword);
  const hasDigit = /[0-9]/.test(regPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(regPassword);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSpecial;
  const passwordsMatch = regPassword && regPassword === regConfirmPassword;

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(identifier, password);
      if (res.mfa_required && res.challenge_token) {
        setMfaChallengeToken(res.challenge_token);
        setTotpCode('');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid) {
      setError('Password must meet all law-enforcement security complexity requirements (12+ characters, uppercase, lowercase, number, special).');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        employee_id: regEmpId.trim().toUpperCase(),
        full_name: regFullName.trim(),
        official_email: regEmail.trim().toLowerCase(),
        password: regPassword,
        role_name: regRole,
      });
      if (res && res.status === 'PENDING_APPROVAL') {
        setPendingRegistration({
          employee_id: regEmpId.trim().toUpperCase(),
          full_name: regFullName.trim(),
          official_email: regEmail.trim().toLowerCase(),
          message: res.message || 'Officer registration submitted successfully. Your account is pending statutory approval.',
          role_display: (res as any).role_display || regRole
        });
        setRegPassword('');
        setRegConfirmPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your details or contact an administrator.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setLoading(true);

    try {
      await verifyMfa(mfaChallengeToken, totpCode, isBackupMode);
      setMfaChallengeToken(null);
      setTotpCode('');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please check your authenticator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-card/95 border border-border/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col">
        
        {/* Obsidian Glowing Top Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-cyan-500 to-indigo-500" />

        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-xl text-primary">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground font-mono">
                  TRACE INTELLIGENCE
                </h2>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                  Law Enforcement Access Gateway
                </p>
              </div>
            </div>

            {isAuthenticated && (
              <button
                onClick={() => setIsLoginModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground bg-secondary px-2.5 py-1 rounded-md border border-border"
              >
                Close
              </button>
            )}
          </div>

          {/* Mode Switcher Tabs: Sign In vs. Register New Officer */}
          {!mfaChallengeToken && !pendingRegistration && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-secondary/60 rounded-xl border border-border/80 mb-5">
              <button
                type="button"
                onClick={() => { setActiveMode('login'); setError(null); }}
                className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  activeMode === 'login'
                    ? 'bg-background text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" /> Official Sign In
              </button>
              <button
                type="button"
                onClick={() => { setActiveMode('register'); setError(null); }}
                className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  activeMode === 'register'
                    ? 'bg-background text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" /> Register Officer
              </button>
            </div>
          )}

          {/* Security Alert Banner */}
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 text-xs text-amber-400">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <span>
              Restricted system. Access logged under statutory chain-of-custody. Unauthorized access is subject to criminal prosecution.
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2.5 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Pending Statutory Approval Screen */}
          {pendingRegistration ? (
            <div className="space-y-4 text-center py-2 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 shadow-inner">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              </div>
              
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Officer Registration Awaiting Statutory Commission
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Your credentials have been securely registered. However, access is strictly governed and requires administrative commission before login.
                </p>
              </div>

              <div className="bg-secondary/50 border border-border/80 rounded-xl p-3.5 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">OFFICER:</span>
                  <span className="font-semibold text-foreground">{pendingRegistration.full_name}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">BADGE ID:</span>
                  <span className="font-semibold text-primary">{pendingRegistration.employee_id}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">OFFICIAL EMAIL:</span>
                  <span className="text-foreground">{pendingRegistration.official_email}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">REQUESTED ROLE:</span>
                  <span className="text-primary font-semibold">{pendingRegistration.role_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">STATUS:</span>
                  <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">PENDING_APPROVAL</span>
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 text-left">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-amber-400">
                  <Clock className="w-3.5 h-3.5" /> Next Steps:
                </div>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  A statutory commission request has been routed to the <strong>System Administrator</strong> and the <strong>Superintendent of Police (SP)</strong>. Once either executive approves your request, you will be able to log in immediately with your password.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const savedEmail = pendingRegistration.official_email;
                  setPendingRegistration(null);
                  setActiveMode('login');
                  setIdentifier(savedEmail);
                }}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <LogIn className="w-4 h-4" /> Return to Official Sign In
              </button>
            </div>
          ) : mfaChallengeToken ? (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary flex items-center gap-2">
                <Key className="w-4 h-4 flex-shrink-0" />
                <span>Two-Factor Authentication required for this personnel rank.</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isBackupMode ? '10-Character Emergency Backup Code' : '6-Digit TOTP Authenticator Code'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBackupMode(!isBackupMode);
                      setTotpCode('');
                    }}
                    className="text-[11px] text-primary hover:underline font-mono"
                  >
                    {isBackupMode ? 'Use Authenticator App' : 'Use Backup Recovery Code'}
                  </button>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                  placeholder={isBackupMode ? 'XXXXX-XXXXX' : '123456'}
                  maxLength={isBackupMode ? 15 : 6}
                  className="w-full text-center tracking-widest font-mono text-xl bg-secondary/50 border border-border rounded-lg py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMfaChallengeToken(null)}
                  className="py-2.5 px-3 bg-secondary text-foreground text-xs font-medium rounded-lg hover:bg-secondary/80 border border-border flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  type="submit"
                  disabled={loading || totpCode.trim().length === 0}
                  className="flex-1 py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Enter Platform'}
                </button>
              </div>
            </form>
          ) : activeMode === 'login' ? (
            /* Mode: Official Password Login */
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Official Email or Employee Badge ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. admin@cyber.gov.in or EMP-ADMIN-001"
                    className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-10 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying Credentials...
                  </>
                ) : (
                  <>
                    Authenticate Session <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <a
                  href="/invite"
                  className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <Ticket className="w-3 h-3" /> Have an Invitation Token? Activate Account
                </a>
              </div>

              <div className="relative my-3 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/80" /></div>
                <span className="relative bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Or Contactless</span>
              </div>

              <a
                href="/nfc-login"
                className="w-full py-2.5 px-4 bg-secondary/80 hover:bg-secondary border border-border text-foreground font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 group shadow-sm"
              >
                <Smartphone className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span>Tap Police NFC Card (4-Digit PIN)</span>
              </a>
            </form>
          ) : (
            /* Mode: Register New Officer */
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Employee Badge ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={regEmpId}
                    onChange={(e) => setRegEmpId(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP-INSP-010"
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Assigned Rank / Role *
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="INSPECTOR">Police Inspector</option>
                    <option value="SUB_INSPECTOR">Sub-Inspector (SI)</option>
                    <option value="ANALYST">Forensic Intelligence Analyst</option>
                    <option value="AUDITOR">Compliance Auditor</option>
                    <option value="IPS_OFFICER">IPS Lead Investigator</option>
                    <option value="SUPERINTENDENT">Superintendent of Police (SP)</option>
                    <option value="SYSTEM_ADMIN">System Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                  Full Name (with Designation) *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Inspector Rajesh Kumar"
                    className="w-full bg-secondary/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                  Official Police Email *
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. rajesh.kumar@cyber.gov.in"
                    className="w-full bg-secondary/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min. 12 characters..."
                      className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter password..."
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Live Password Complexity Meter */}
              <div className="p-2.5 bg-secondary/30 border border-border/60 rounded-lg text-[10px] space-y-1">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Password Requirements:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5">
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                    <CheckCircle2 className="w-3 h-3" /> Min 12 Characters ({regPassword.length}/12)
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
                    <CheckCircle2 className="w-3 h-3" /> Special Character (!@#$...)
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                    <CheckCircle2 className="w-3 h-3" /> Passwords Match
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !isPasswordValid || !passwordsMatch}
                className="w-full mt-2 py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting Registration...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Submit Registration for Statutory Approval
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Role Switcher for Development & Demonstration */}
          <div className="mt-6 pt-5 border-t border-border/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Test Officer Accounts (1-Click Login)
              </span>
              <span className="text-[10px] text-muted-foreground/70 font-mono">Sandbox Demo</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
              {Object.entries(SEEDED_DEV_ACCOUNTS).map(([key, acc]) => {
                const isActive = user?.role === acc.role;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setIdentifier(acc.email);
                      setPassword(acc.defaultPass);
                      setActiveMode('login');
                      switchDevRole(key);
                    }}
                    className={`text-left p-2 rounded-lg border text-xs transition-all ${
                      isActive 
                        ? 'bg-primary/15 border-primary/50 text-primary font-semibold' 
                        : 'bg-secondary/40 border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="font-semibold truncate text-[11px]">{acc.display_name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{acc.badge}</div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
