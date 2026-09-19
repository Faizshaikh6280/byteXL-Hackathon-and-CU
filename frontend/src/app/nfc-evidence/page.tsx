'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Radio, Cpu, Shield, ShieldCheck, AlertTriangle, CheckCircle2, 
  XCircle, Loader2, ArrowRight, MapPin, Copy, Check, RefreshCw, 
  Sliders, FileText, Smartphone, ExternalLink, ChevronRight, HelpCircle
} from 'lucide-react';
import { 
  apiClient, 
  NFCAcquisitionDossier, 
  NFCFixtureCard,
  NFCAcquisitionPayload 
} from '../../services/apiClient';
import { cn } from '../../utils/cn';

function NFCEvidenceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL Query Parameters
  const queryCaseId = searchParams.get('case_id') || 'INV-2026-BLACK-CIRCUIT';
  const queryData = searchParams.get('data') || searchParams.get('text') || '';
  const queryUid = searchParams.get('uid') || searchParams.get('serial_number') || '04:8E:2A:4F:91:02:80';
  const queryName = searchParams.get('name') || '';
  const queryPhone = searchParams.get('phone') || '';
  const queryUrl = searchParams.get('url') || '';

  // Pipeline states
  const [pipelineState, setPipelineState] = useState<
    'IDLE' | 'READING' | 'HASHING' | 'STORED' | 'ANALYZING' | 'COMPLETE' | 'ERROR'
  >('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to acquire crime scene NFC evidence.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dossier, setDossier] = useState<NFCAcquisitionDossier | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Direct manual entry state
  const [customText, setCustomText] = useState<string>('Arjun Mehta\n+919810011223\nhttps://secure-vault.iron-lotus.in/node-04');
  const [customUid, setCustomUid] = useState<string>('04:8E:2A:4F:91:02:80');

  // Web NFC state
  const [isWebNfcSupported, setIsWebNfcSupported] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isSecure, setIsSecure] = useState<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Check Web NFC & Secure Context on mount
  useEffect(() => {
    const hasNfc = typeof window !== 'undefined' && 'NDEFReader' in window;
    const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
    setIsWebNfcSupported(hasNfc);
    setIsSecure(secure);

    // Auto-process URL parameters if passed from a physical NDEF card tap
    if (queryData || queryName || queryPhone || queryUrl) {
      let combinedRecords: any[] = [];
      if (queryName) combinedRecords.push({ record_type: 'text', data_text: queryName });
      if (queryPhone) combinedRecords.push({ record_type: 'text', data_text: queryPhone });
      if (queryUrl) combinedRecords.push({ record_type: 'url', data_text: queryUrl });
      if (queryData) combinedRecords.push({ record_type: 'text', data_text: queryData });

      executeAcquisition({
        serial_number: queryUid,
        card_uid: queryUid,
        records: combinedRecords
      });
      return;
    }

    if (hasNfc) {
      startWebNfcReader();
    }

    return () => {
      cleanupReader();
    };
  }, [searchParams]);

  const cleanupReader = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }
    setIsScanning(false);
  };

  const startWebNfcReader = async () => {
    if (typeof window === 'undefined' || !('NDEFReader' in window)) return;
    cleanupReader();

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal: abortController.signal });
      setIsScanning(true);

      ndef.onreading = (event: any) => {
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
              } catch {}
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

        executeAcquisition({
          serial_number: serialNumber,
          card_uid: serialNumber,
          records
        });
      };

      ndef.onreadingerror = () => {
        setErrorMessage('Failed to read card. Please hold card flat against device sensor.');
      };
    } catch (err: any) {
      console.warn('[Web NFC Evidence] Reader error:', err);
      setIsScanning(false);
    }
  };

  const executeAcquisition = async (rawPayload: any) => {
    cleanupReader();
    setErrorMessage(null);
    setPipelineState('READING');
    setStatusMessage('Reading physical NDEF sectors and serial number...');
    await new Promise(r => setTimeout(r, 200));

    setPipelineState('HASHING');
    setStatusMessage('Computing canonical SHA-256 integrity hash...');
    await new Promise(r => setTimeout(r, 200));

    setPipelineState('STORED');
    setStatusMessage('Encrypting raw evidence with AES-256-GCM in MinIO...');

    const payload: NFCAcquisitionPayload = {
      raw_payload: rawPayload,
      location_metadata: {
        latitude: 28.6139,
        longitude: 77.2090,
        location_name: 'Forensic Field Terminal',
        crime_scene_id: `CS-${queryCaseId.slice(-6)}`
      },
      hardware_metadata: {
        device_model: typeof navigator !== 'undefined' ? navigator.userAgent : 'Physical Forensic Terminal',
        scanner_type: isWebNfcSupported ? 'HARDWARE_WEB_NFC' : 'FIELD_DIRECT_INGEST',
        scan_protocol: 'ISO_14443_TYPE_A'
      },
      allow_duplicate: true
    };

    try {
      const result = await apiClient.submitNfcAcquisition(queryCaseId, payload);
      setPipelineState('ANALYZING');
      setStatusMessage('Executing Probabilistic Entity Resolution and cross-domain correlation...');

      const resultDossier = await apiClient.getNfcAcquisitionDossier(queryCaseId, result.acquisition_id);
      setDossier(resultDossier);
      setPipelineState('COMPLETE');
      setStatusMessage('Acquisition complete. Forensic integrity verified.');
    } catch (err: any) {
      setPipelineState('ERROR');
      const rawMsg = err.message || 'Evidence acquisition pipeline failed.';
      if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) {
        setErrorMessage('Network connection lost (Failed to fetch). Please verify your mobile device is connected to the same Wi-Fi network as the workstation.');
      } else {
        setErrorMessage(rawMsg);
      }
    }
  };

  const copySha256 = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center py-6 px-3 sm:px-4 relative overflow-y-auto">
      {/* Background Cyber Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in duration-300 my-auto">
        
        {/* Glowing Top Banner */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-primary to-indigo-500" />

        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 bg-cyan-500/10 text-cyan-500 rounded-xl border border-cyan-500/20 shrink-0">
              <Radio className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  {queryCaseId}
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground">• Forensic Acquisition</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-foreground">Physical NFC Evidence Ingestion</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/?case_id=${encodeURIComponent(queryCaseId)}`)}
            className="text-xs text-muted-foreground hover:text-foreground border border-border bg-secondary/50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
          >
            ← Case Workspace
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          
          {/* STATE: Active Ingestion Animation */}
          {(pipelineState === 'READING' || pipelineState === 'HASHING' || pipelineState === 'STORED' || pipelineState === 'ANALYZING') && (
            <div className="py-8 sm:py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 flex items-center justify-center animate-pulse shadow-lg shadow-cyan-500/10">
                <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                {pipelineState === 'READING' && 'Reading Physical Card Sectors...'}
                {pipelineState === 'HASHING' && 'Computing Deterministic SHA-256 Digest...'}
                {pipelineState === 'STORED' && 'Encrypting & Storing in MinIO (AES-256-GCM)...'}
                {pipelineState === 'ANALYZING' && 'Running Probabilistic Entity Resolution...'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md">{statusMessage}</p>

              {/* Step indicator */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-md pt-4">
                {[
                  { label: 'NDEF Read', state: 'READING' },
                  { label: 'SHA-256', state: 'HASHING' },
                  { label: 'MinIO Store', state: 'STORED' },
                  { label: 'Entity Match', state: 'ANALYZING' }
                ].map((s, idx) => {
                  const states = ['READING', 'HASHING', 'STORED', 'ANALYZING'];
                  const curIdx = states.indexOf(pipelineState);
                  const stepIdx = states.indexOf(s.state);
                  const isDone = curIdx > stepIdx;
                  const isCurrent = curIdx === stepIdx;

                  return (
                    <div 
                      key={s.label}
                      className={cn(
                        "p-2 rounded-lg border text-center text-xs font-mono",
                        isDone ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                        isCurrent ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold animate-pulse" :
                        "bg-secondary/30 border-border text-muted-foreground"
                      )}
                    >
                      <div>{idx + 1}. {s.label}</div>
                      <div className="text-[10px] mt-0.5">{isDone ? '✓ OK' : isCurrent ? 'Active' : 'Wait'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STATE: Completed Acquisition Dossier */}
          {pipelineState === 'COMPLETE' && dossier && (
            <div className="space-y-6 animate-in zoom-in-95 duration-200">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Forensic Evidence Ingested Successfully</h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      Acquisition ID: <strong className="text-foreground">{dossier.acquisition_id}</strong> • Evidence ID: <strong className="text-foreground">{dossier.evidence_id}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPipelineState('IDLE');
                    setDossier(null);
                  }}
                  className="px-3 py-1.5 bg-secondary text-foreground text-xs rounded-lg border border-border hover:bg-secondary/80 cursor-pointer"
                >
                  Scan Another Tag
                </button>
              </div>

              {/* SHA-256 Hash Card */}
              <div className="p-3.5 bg-secondary/40 border border-border rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Canonical SHA-256 Integrity Hash</span>
                  <button
                    onClick={() => copySha256(dossier.raw_sha256)}
                    className="flex items-center gap-1 text-primary hover:underline text-[11px] cursor-pointer"
                  >
                    {copiedHash ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedHash ? 'Copied' : 'Copy Hash'}
                  </button>
                </div>
                <div className="font-mono text-xs text-cyan-400 break-all bg-background/60 p-2 rounded border border-border/60">
                  {dossier.raw_sha256}
                </div>
              </div>

              {/* Entity Resolution Result */}
              <div className="p-4 bg-secondary/30 border border-border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Probabilistic Entity Resolution (ER)
                  </span>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase",
                    dossier.entity_resolution?.match_tier === 'MATCHED' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    dossier.entity_resolution?.match_tier === 'POSSIBLE_MATCH' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}>
                    Tier: {dossier.entity_resolution?.match_tier}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 bg-background/50 rounded-lg border border-border">
                    <span className="text-muted-foreground block text-[10px]">RESOLVED PROFILE</span>
                    <strong className="text-foreground text-sm font-semibold">
                      {dossier.entity_resolution?.matched_name || 'Provisional Identity'}
                    </strong>
                    <div className="text-[11px] font-mono text-primary mt-0.5">
                      {dossier.entity_resolution?.matched_cluster_id}
                    </div>
                  </div>

                  <div className="p-2.5 bg-background/50 rounded-lg border border-border">
                    <span className="text-muted-foreground block text-[10px]">MATCH CONFIDENCE</span>
                    <strong className="text-foreground text-sm font-semibold">
                      {Math.round((dossier.entity_resolution?.confidence || 0) * 100)}%
                    </strong>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {dossier.entity_resolution?.reasons?.[0] || 'Lineage anchored to physical card UID'}
                    </div>
                  </div>
                </div>

                {/* Extracted Identifiers */}
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-2">
                    Derived Card Identifiers ({dossier.derived_identifiers?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {dossier.derived_identifiers?.map((ident, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-secondary border border-border text-xs font-mono text-foreground flex items-center gap-1.5"
                      >
                        <span className="text-primary font-bold">{ident.field}:</span> {ident.value}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Investigative Advisory */}
                {dossier.investigator_assessment && (
                  <div className="p-3 bg-secondary/60 rounded-lg border border-border/80 text-xs text-muted-foreground space-y-1">
                    <strong className="text-foreground text-[11px] block">Neutral Investigative Advisory:</strong>
                    <p className="leading-relaxed">{dossier.investigator_assessment}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push(`/?case_id=${encodeURIComponent(queryCaseId)}`)}
                  className="px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  Open Case Dashboard & Graph <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STATE: Idle / Scanner Form */}
          {(pipelineState === 'IDLE' || pipelineState === 'ERROR') && (
            <div className="space-y-6">
              
              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive flex items-center gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Web NFC Hardware Status Banner */}
              <div className="p-4 bg-secondary/30 border border-border rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs",
                      isWebNfcSupported && isScanning ? "bg-emerald-500/20 text-emerald-400" :
                      isWebNfcSupported ? "bg-cyan-500/20 text-cyan-400" :
                      "bg-amber-500/20 text-amber-400"
                    )}>
                      <Radio className={cn("w-4 h-4", isScanning && "animate-pulse")} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        {isWebNfcSupported && isScanning ? "Web NFC Antenna Active — Tap Card Now" :
                         isWebNfcSupported ? "Web NFC Sensor Ready" :
                         !isSecure ? "Mobile HTTP Origin Detected (Insecure Context)" :
                         "Web NFC Sensor Not Detected"}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isWebNfcSupported && isScanning ? "Hold Card 2 against rear NFC antenna of your phone." :
                         !isSecure ? "Android Chrome requires HTTPS or Chrome Flag to enable physical Web NFC on local IPs." :
                         "Use direct payload entry or 1-Click test below to ingest evidence."}
                      </p>
                    </div>
                  </div>

                  {isWebNfcSupported && !isScanning && (
                    <button
                      type="button"
                      onClick={startWebNfcReader}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Radio className="w-3 h-3" /> Start Sensor
                    </button>
                  )}
                </div>

                {/* 10-Second Chrome Flag Guide if on HTTP */}
                {!isSecure && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" /> 10-Second Chrome Fix to Unlock Native Phone Tap:
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground space-y-1 bg-black/40 p-2.5 rounded-lg border border-border/60">
                      <div>1. Open new tab in Chrome: <span className="text-primary select-all font-semibold">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span></div>
                      <div>2. Set dropdown to: <strong className="text-emerald-400">Enabled</strong></div>
                      <div>3. In the text box, enter: <span className="text-cyan-400 select-all font-semibold">{typeof window !== 'undefined' ? window.location.origin : 'http://10.55.162.185:3000'}</span></div>
                      <div>4. Tap blue <strong className="text-emerald-400">Relaunch</strong> button at bottom.</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Card Payload Ingest Form */}
              <div className="p-4 bg-secondary/20 border border-border rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                    Direct Evidence Card Payload Ingestion
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-mono">Instant Acquisition</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                      Physical Card UID / Serial Number
                    </label>
                    <input
                      type="text"
                      value={customUid}
                      onChange={(e) => setCustomUid(e.target.value)}
                      placeholder="e.g. 04:8E:2A:4F:91:02:80"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                      Card Sectors / NDEF Text Payload
                    </label>
                    <textarea
                      rows={3}
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Enter raw text, vCard, phone, email, or URL..."
                      className="w-full bg-background border border-border rounded-lg p-3 text-xs font-mono text-foreground outline-none focus:border-primary"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      executeAcquisition({
                        serial_number: customUid,
                        card_uid: customUid,
                        records: [{ record_type: 'text', data_text: customText }]
                      });
                    }}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                    Acquire & Correlate Physical Card Evidence
                  </button>
                </div>
              </div>

              {/* One-Click Benchmark Cards */}
              <div className="pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Or Test Pre-Seeded Benchmark Scenarios (1-Click):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      executeAcquisition({
                        serial_number: '04:8E:2A:4F:91:02:80',
                        card_uid: '04:8E:2A:4F:91:02:80',
                        records: [
                          { record_type: 'text', data_text: 'Arjun Mehta\n+919810011223' },
                          { record_type: 'url', data_text: 'https://secure-vault.iron-lotus.in/node-04' }
                        ]
                      });
                    }}
                    className="p-3 bg-secondary/40 hover:bg-secondary border border-border/70 hover:border-primary/50 rounded-xl text-left transition-all text-xs group cursor-pointer"
                  >
                    <strong className="text-foreground block group-hover:text-primary transition-colors">
                      Iron Lotus Syndicate Keycard
                    </strong>
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                      Arjun Mehta • +919810011223 • Safehouse URL
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold mt-1 block">
                      ✓ Triggers MATCHED Tier + CDR & Bank Correlation
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      executeAcquisition({
                        serial_number: '04:4B:91:2E:77:33:80',
                        card_uid: '04:4B:91:2E:77:33:80',
                        records: [{
                          record_type: 'mime',
                          media_type: 'text/vcard',
                          data_text: 'BEGIN:VCARD\nVERSION:3.0\nFN:Sana Qureshi\nTEL;TYPE=CELL:+919810099881\nEMAIL:sana.q@crypto-exchange.in\nORG:Apex Financial Solutions\nEND:VCARD'
                        }]
                      });
                    }}
                    className="p-3 bg-secondary/40 hover:bg-secondary border border-border/70 hover:border-primary/50 rounded-xl text-left transition-all text-xs group cursor-pointer"
                  >
                    <strong className="text-foreground block group-hover:text-primary transition-colors">
                      Corporate vCard Contact Badge
                    </strong>
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                      Sana Qureshi • +919810099881 • Apex Financial
                    </span>
                    <span className="text-[10px] text-cyan-400 font-semibold mt-1 block">
                      ✓ Triggers vCard Directory Profile Parsing
                    </span>
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

export default function NFCEvidencePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <NFCEvidenceContent />
    </Suspense>
  );
}
