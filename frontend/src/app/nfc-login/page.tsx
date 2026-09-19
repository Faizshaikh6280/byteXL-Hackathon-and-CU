'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ShieldCheck, Smartphone, Lock, AlertCircle, CheckCircle2, 
  Loader2, RefreshCw, KeyRound, ArrowRight, ShieldAlert, Sparkles, User, Radio, Scan
} from 'lucide-react';
import { apiClient, UserProfile } from '../../services/apiClient';

interface DevCard {
  role: string;
  email: string;
  badge: string;
  officer_name: string;
  card_uid: string;
  token: string;
  default_pin: string;
  unit: string;
}

const SEEDED_TEST_CARDS: DevCard[] = [
  {
    role: 'SUPERINTENDENT',
    email: 'sp.rao@cyber.gov.in',
    badge: 'EMP-SP-001',
    officer_name: 'Superintendent of Police (SP)',
    card_uid: 'NFC-SP-001',
    token: 'nfc_c_sp_rao_2026_operational_key_77a1',
    default_pin: '1234',
    unit: 'Special Operations Wing'
  },
  {
    role: 'IPS_OFFICER',
    email: 'ips.sen@cyber.gov.in',
    badge: 'EMP-IPS-002',
    officer_name: 'IPS Lead Investigator',
    card_uid: 'NFC-IPS-002',
    token: 'nfc_c_ips_sen_2026_operational_key_88b2',
    default_pin: '2345',
    unit: 'Financial Cybercrime Unit'
  },
  {
    role: 'INSPECTOR',
    email: 'insp.rathore@cyber.gov.in',
    badge: 'EMP-INSP-003',
    officer_name: 'Police Inspector',
    card_uid: 'NFC-INSP-003',
    token: 'nfc_c_insp_rathore_2026_operational_key_99c3',
    default_pin: '3456',
    unit: 'Special Operations Wing'
  },
  {
    role: 'SUB_INSPECTOR',
    email: 'si.sharma@cyber.gov.in',
    badge: 'EMP-SI-004',
    officer_name: 'Sub-Inspector (SI)',
    card_uid: 'NFC-SI-004',
    token: 'nfc_c_si_sharma_2026_operational_key_11d4',
    default_pin: '4567',
    unit: 'Special Operations Wing'
  },
  {
    role: 'ANALYST',
    email: 'analyst.mehta@cyber.gov.in',
    badge: 'EMP-ANL-005',
    officer_name: 'Cybercrime Analyst',
    card_uid: 'NFC-ANL-005',
    token: 'nfc_c_analyst_mehta_2026_operational_key_22e5',
    default_pin: '5678',
    unit: 'Financial Cybercrime Unit'
  },
  {
    role: 'AUDITOR',
    email: 'auditor.verma@cyber.gov.in',
    badge: 'EMP-AUD-006',
    officer_name: 'Compliance Auditor',
    card_uid: 'NFC-AUD-006',
    token: 'nfc_c_auditor_verma_2026_operational_key_33f6',
    default_pin: '6789',
    unit: 'CCID-HQ'
  }
];

function NFCLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusState, setStatusState] = useState<'IDLE' | 'INITIATING' | 'AWAITING_PIN' | 'VERIFYING_PIN' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ user: UserProfile; target_case_id: string | null } | null>(null);
  const [isWebNfcSupported, setIsWebNfcSupported] = useState<boolean>(false);
  const [isNfcScanning, setIsNfcScanning] = useState<boolean>(false);
  const [manualTokenInput, setManualTokenInput] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  // 1. Process NFC URL token from query parameter
  useEffect(() => {
    const rawToken = searchParams.get('t');
    if (rawToken && statusState === 'IDLE') {
      handleInitiateToken(rawToken);
    }
  }, [searchParams]);

  // 2. Setup Web NFC Reader for Direct In-Browser Tap
  useEffect(() => {
    const hasNfc = typeof window !== 'undefined' && 'NDEFReader' in window;
    setIsWebNfcSupported(hasNfc);

    if (hasNfc && (statusState === 'IDLE' || statusState === 'ERROR')) {
      startWebNfcReader();
    }

    return () => {
      cleanupNfcReader();
    };
  }, [statusState]);

  const cleanupNfcReader = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }
    setIsNfcScanning(false);
  };

  const startWebNfcReader = async () => {
    if (typeof window === 'undefined' || !('NDEFReader' in window)) return;
    cleanupNfcReader();

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal: abortController.signal });
      setIsNfcScanning(true);

      ndef.onreading = (event: any) => {
        let extractedToken: string | null = null;
        if (event.message && event.message.records) {
          for (const r of event.message.records) {
            let text = '';
            if (r.data) {
              const decoder = new TextDecoder(r.encoding || 'utf-8', { fatal: false });
              text = decoder.decode(r.data).trim();
            }
            if (!text) continue;
            // Case A: Full URL with ?t= or &t=
            if (text.includes('t=')) {
              const match = text.match(/[?&]t=([^&\s]+)/) || text.match(/t=([^&\s]+)/);
              if (match && match[1]) {
                extractedToken = match[1];
                break;
              }
            }
            // Case B: Raw token string starting with nfc_c_
            if (text.startsWith('nfc_c_')) {
              extractedToken = text;
              break;
            }
          }
        }
        if (extractedToken) {
          handleInitiateToken(extractedToken);
        }
      };

      ndef.onreadingerror = () => {
        setErrorMsg('Error reading physical NFC card. Please hold card flat against the device antenna.');
      };
    } catch (err: any) {
      console.warn('[Web NFC Login] Reader initialization info:', err);
      setIsNfcScanning(false);
    }
  };

  const handleInitiateToken = async (token: string) => {
    setStatusState('INITIATING');
    setErrorMsg(null);
    cleanupNfcReader();

    // Scrub token from address bar immediately to prevent history/referer leakage
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
      const resp = await apiClient.initiateNfcAuth(token);
      if (resp.status === 'AWAITING_PIN' && resp.transaction_id) {
        setTransactionId(resp.transaction_id);
        setStatusState('AWAITING_PIN');
        setPinDigits(['', '', '', '']);
        setTimeout(() => pinInputRefs[0].current?.focus(), 100);
      } else {
        throw new Error(resp.message || 'Unexpected response from authentication gateway.');
      }
    } catch (err: any) {
      setStatusState('ERROR');
      setErrorMsg(err.message || 'Unable to validate NFC credential. Card may be inactive or expired.');
    }
  };

  // 2. Handle PIN typing
  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);

    // Auto-advance
    if (digit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }

    // Auto-submit if all 4 entered
    if (digit && index === 3 && newDigits.every(d => d.length === 1)) {
      submitPin(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // 3. Submit PIN to Backend
  const submitPin = async (pinString: string) => {
    if (!transactionId || pinString.length !== 4) return;
    setStatusState('VERIFYING_PIN');
    setErrorMsg(null);

    try {
      const resp = await apiClient.verifyNfcPin(transactionId, pinString);
      if (resp.status === 'AUTHENTICATED') {
        setStatusState('SUCCESS');
        setSuccessData({
          user: resp.user,
          target_case_id: resp.target_case_id
        });

        // Redirect after brief visual confirmation
        setTimeout(() => {
          if (resp.target_case_id) {
            router.push(`/?case_id=${encodeURIComponent(resp.target_case_id)}`);
          } else {
            router.push('/');
          }
        }, 1200);
      } else {
        throw new Error(resp.message || 'Authentication failed.');
      }
    } catch (err: any) {
      setStatusState('AWAITING_PIN');
      setPinDigits(['', '', '', '']);
      setErrorMsg(err.message || 'Incorrect PIN entered.');
      setTimeout(() => pinInputRefs[0].current?.focus(), 100);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center py-6 px-3 sm:px-4 relative overflow-y-auto">
      {/* Background Cyber Grid Accent */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative w-full max-w-md bg-card/90 border border-border/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in duration-300 my-auto">
        
        {/* Glowing Top Border */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-primary to-indigo-500" />

        <div className="p-4 sm:p-6 md:p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
              <div className="p-3.5 bg-primary/10 border border-primary/30 rounded-2xl text-primary shadow-lg shadow-primary/10">
                <Smartphone className="w-8 h-8" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary" />
              </span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-foreground font-mono">
              TRACE INTELLIGENCE
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mt-1">
              Contactless NFC Smartcard Gateway
            </p>
          </div>

          {/* Legal Compliance Notice */}
          <div className="mb-6 p-2.5 bg-secondary/50 border border-border/60 rounded-lg flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>Authorized law enforcement personnel only. Session logged.</span>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-xs text-destructive animate-in shake duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STATE 1: Initiating / Validating NFC Tag */}
          {statusState === 'INITIATING' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Reading Encrypted Card Token...</p>
              <p className="text-xs text-muted-foreground">Verifying card registration with Police HQ registry.</p>
            </div>
          )}

          {/* STATE 2: Awaiting 4-Digit PIN */}
          {(statusState === 'AWAITING_PIN' || statusState === 'VERIFYING_PIN') && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Factor 1 (NFC Card) Verified
                </div>
                <h3 className="text-sm font-semibold text-foreground">Enter Your 4-Digit Security PIN</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Factor 2 knowledge challenge</p>
              </div>

              {/* 4 Digit Input Boxes */}
              <div className="flex justify-center gap-2 sm:gap-3">
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={pinInputRefs[idx]}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={statusState === 'VERIFYING_PIN'}
                    className="w-11 sm:w-13 h-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-bold bg-secondary/60 border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl outline-none text-foreground transition-all"
                  />
                ))}
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => submitPin(pinDigits.join(''))}
                disabled={statusState === 'VERIFYING_PIN' || pinDigits.some(d => !d)}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {statusState === 'VERIFYING_PIN' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying Security PIN...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Authenticate & Open Platform
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStatusState('IDLE');
                    setTransactionId(null);
                    setPinDigits(['', '', '', '']);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel and tap another card
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: Success Confirmation */}
          {statusState === 'SUCCESS' && successData && (
            <div className="py-6 text-center space-y-3 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Authentication Successful</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Officer {successData.user.full_name} ({successData.user.employee_id})
                </p>
              </div>
              <div className="p-3 bg-secondary/50 rounded-lg border border-border text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                <span>
                  Launching active dossier: <strong className="text-foreground">{successData.target_case_id || 'Overview'}</strong>
                </span>
              </div>
            </div>
          )}

          {/* STATE 4: Idle / Awaiting Physical NFC Tap */}
          {(statusState === 'IDLE' || statusState === 'ERROR') && (
            <div className="space-y-6">
              <div className="p-4 bg-secondary/30 border border-border/70 rounded-xl text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Smartphone className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Tap Physical Police Card</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Hold your NFC-enabled department card against the back of your Android phone or USB contactless reader.
                  </p>
                </div>

                {isWebNfcSupported ? (
                  isNfcScanning ? (
                    <div className="flex items-center justify-center gap-2 p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold animate-pulse">
                      <Radio className="w-4 h-4" />
                      <span>Web NFC Antenna Active — Tap Card Now</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startWebNfcReader}
                      className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5" /> Activate Device NFC Receiver
                    </button>
                  )
                ) : (
                  <div className="text-[11px] text-muted-foreground/80 bg-secondary/40 p-2 rounded-lg border border-border/50">
                    Desktop browser: Tap card with your NFC phone to launch URL, or use manual verification below.
                  </div>
                )}

                {/* Manual Card Token / URL Verification Input */}
                <div className="pt-2 border-t border-border/50">
                  <div className="text-[10px] text-muted-foreground text-left mb-1 font-semibold uppercase tracking-wider">
                    Direct Card Payload Verification:
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste card URL or token (e.g. nfc_c_...)"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      className="flex-1 bg-background border border-border text-foreground px-2.5 py-1.5 text-xs rounded-lg font-mono outline-none focus:border-primary placeholder:text-muted-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (manualTokenInput.trim()) {
                          handleInitiateToken(manualTokenInput.trim());
                        }
                      }}
                      disabled={!manualTokenInput.trim()}
                      className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors cursor-pointer flex-shrink-0"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              </div>

              {/* Dev Testing Sandbox (One-Click Tap Simulation) */}
              <div className="pt-4 border-t border-border/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Simulate Physical Tap (Dev Sandbox)
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 font-mono">1-Click Test</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SEEDED_TEST_CARDS.map((card) => (
                    <button
                      key={card.card_uid}
                      type="button"
                      onClick={() => handleInitiateToken(card.token)}
                      className="text-left p-2.5 bg-secondary/40 hover:bg-secondary border border-border/60 hover:border-primary/50 rounded-lg transition-all text-xs group"
                    >
                      <div className="font-semibold text-foreground truncate group-hover:text-primary transition-colors flex items-center justify-between">
                        <span>{card.officer_name}</span>
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {card.badge} • PIN: <span className="text-primary font-bold">{card.default_pin}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Return to password login
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function NFCLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <NFCLoginContent />
    </Suspense>
  );
}
