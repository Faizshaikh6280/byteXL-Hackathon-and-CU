import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  UploadCloud, FileSpreadsheet, Smartphone, CreditCard, Globe, 
  CheckCircle2, AlertCircle, Clock, ShieldCheck, Hash, Play,
  Loader2, RefreshCw, FileText, ArrowRight, Radio, Database
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { apiClient, EvidenceItem } from '../services/apiClient';
import { cn } from '../utils/cn';
import NFCEvidenceScannerModal from './evidence/NFCEvidenceScannerModal';

interface DataIngestionVaultProps {
  onNavigateToPipeline?: () => void;
  onNavigateToGraph?: (entityId?: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToMap?: () => void;
  onNavigateToFindings?: (findingId?: string) => void;
}

export default function DataIngestionVault({ 
  onNavigateToPipeline,
  onNavigateToGraph,
  onNavigateToTimeline,
  onNavigateToMap,
  onNavigateToFindings
}: DataIngestionVaultProps) {
  const { activeCase, activeCaseDetail, refreshCases, refreshActiveCaseDetail } = useCase();
  const [isUploading, setIsUploading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [localEvidenceList, setLocalEvidenceList] = useState<EvidenceItem[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCaseEvidence = useCallback(async () => {
    if (!activeCase?.case_id) {
      setLocalEvidenceList([]);
      return;
    }
    setIsLoadingEvidence(true);
    try {
      const res = await apiClient.getCaseEvidence(activeCase.case_id);
      if (res && res.evidence) {
        setLocalEvidenceList(res.evidence);
      } else if (activeCaseDetail?.evidence) {
        setLocalEvidenceList(activeCaseDetail.evidence);
      }
    } catch (err) {
      if (activeCaseDetail?.evidence) {
        setLocalEvidenceList(activeCaseDetail.evidence);
      }
    } finally {
      setIsLoadingEvidence(false);
    }
  }, [activeCase?.case_id, activeCaseDetail?.evidence]);

  useEffect(() => {
    fetchCaseEvidence();
  }, [fetchCaseEvidence]);

  // Sync if activeCaseDetail updates from outside
  useEffect(() => {
    if (activeCaseDetail?.evidence && activeCaseDetail.evidence.length > 0) {
      setLocalEvidenceList(activeCaseDetail.evidence);
    }
  }, [activeCaseDetail]);

  const evidenceList: EvidenceItem[] = localEvidenceList.length > 0 
    ? localEvidenceList 
    : (activeCaseDetail?.evidence || []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeCase) return;

    setIsUploading(true);
    setError(null);
    setUploadStatus(`Uploading ${files.length} evidence file(s)...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Uploading & analyzing ${file.name} (${i + 1}/${files.length})...`);
        await apiClient.uploadEvidenceFile(activeCase.case_id, file);
      }
      setUploadStatus('Upload complete! Evidence encrypted and registered.');
      await fetchCaseEvidence();
      if (refreshActiveCaseDetail) await refreshActiveCaseDetail();
      await refreshCases();
      setTimeout(() => setUploadStatus(null), 4000);
    } catch (err: any) {
      console.error('Evidence upload failed:', err);
      setError(err.message || 'Failed to upload evidence files');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualRefresh = async () => {
    await fetchCaseEvidence();
    if (refreshActiveCaseDetail) await refreshActiveCaseDetail();
    await refreshCases();
  };

  const handleGoToPipeline = () => {
    if (onNavigateToPipeline) {
      onNavigateToPipeline();
    }
  };

  const getSourceIcon = (sourceType: string) => {
    const s = sourceType?.toUpperCase() || '';
    if (s.includes('NFC')) return Radio;
    if (s.includes('TELECOM') || s.includes('CDR')) return Smartphone;
    if (s.includes('BANK')) return CreditCard;
    if (s.includes('NETWORK') || s.includes('IPDR')) return Globe;
    if (s.includes('SOCIAL')) return FileText;
    return FileSpreadsheet;
  };

  const getSourceColor = (sourceType: string) => {
    const s = sourceType?.toUpperCase() || '';
    if (s.includes('NFC')) return 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20';
    if (s.includes('TELECOM') || s.includes('CDR')) return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
    if (s.includes('BANK')) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (s.includes('NETWORK') || s.includes('IPDR')) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (s.includes('SOCIAL')) return 'text-pink-500 bg-pink-500/10 border-pink-500/20';
    return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
  };

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-bold text-foreground">No Active Case Selected</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Please select or create an investigation case before uploading evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {activeCase.case_reference}
            </span>
            <span className="text-xs text-muted-foreground">• Active Dossier</span>
            <span className="text-xs font-semibold text-foreground px-2 py-0.5 rounded bg-secondary">
              {activeCase.title}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">Evidence Intake & Automatic Classification</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload unlabelled raw evidence or acquire physical NFC evidence. The backend computes SHA-256 hashes, encrypts with AES-256-GCM, and auto-detects domain schemas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsNfcModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center gap-2 shadow-sm"
          >
            <Radio className="w-4 h-4 animate-pulse text-cyan-200" />
            Scan NFC Evidence
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Upload Evidence Files
          </button>
          {evidenceList.length > 0 && onNavigateToPipeline && (
            <button
              onClick={handleGoToPipeline}
              className="px-4 py-2 bg-secondary text-foreground border border-border text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Play className="w-4 h-4 text-emerald-500" />
              Go to Processing Pipeline
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Upload/Status Messages */}
      {uploadStatus && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl text-sm text-primary flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>{uploadStatus}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Evidence Cards Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Case Dataset Evidence Files ({evidenceList.length})
            </h3>
            {evidenceList.length > 0 && (
              <span className="text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                Online & Ready
              </span>
            )}
          </div>
          <button 
            onClick={handleManualRefresh} 
            disabled={isLoadingEvidence}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/60 hover:bg-secondary border border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoadingEvidence && "animate-spin text-primary")} /> 
            {isLoadingEvidence ? "Loading..." : "Refresh Evidence"}
          </button>
        </div>

        {evidenceList.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-border bg-card/40 text-center mb-6">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">No evidence files uploaded for this case yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload telecom CDRs, banking transactions, IPDR logs, or social media datasets using the drop zone below.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {evidenceList.map((item) => {
              const Icon = getSourceIcon(item.source_type);
              const colorClass = getSourceColor(item.source_type);

              return (
                <div 
                  key={item.evidence_id} 
                  className="bg-card border border-border p-6 rounded-xl flex flex-col justify-between shadow-sm hover:border-primary/50 transition-colors group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2.5 rounded-lg border", colorClass)}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-foreground text-sm truncate max-w-[180px]" title={item.filename}>
                            {item.filename}
                          </h4>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {item.evidence_id.substring(0, 16)}...
                          </span>
                        </div>
                      </div>

                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                        item.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                        item.status === 'RUNNING' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      )}>
                        {item.status}
                      </span>
                    </div>

                    {/* Detected Source Badge */}
                    <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-1 mb-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Automatic Source Detection
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-foreground">
                          {item.source_type || 'UNKNOWN'}
                        </span>
                        {item.confidence > 0 && (
                          <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                            {(item.confidence * 100).toFixed(0)}% Confidence
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Records & Quality */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">Valid Records</div>
                        <div className="text-lg font-black text-foreground">{item.records?.toLocaleString() || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">Quality Score</div>
                        <div className="text-lg font-black text-primary">
                          {item.quality_score ? `${(item.quality_score * 100).toFixed(0)}%` : '100%'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hash Footer */}
                  <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1 truncate" title={item.sha256}>
                      <Hash className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      SHA: {item.sha256 ? `${item.sha256.substring(0, 12)}...` : 'N/A'}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-500 font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" /> AES-256
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drag and Drop Zone */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleFiles(e.dataTransfer.files);
        }}
        className="bg-secondary/20 rounded-xl p-10 flex flex-col items-center justify-center border-dashed border-2 border-border hover:border-primary/50 hover:bg-secondary/40 transition-all cursor-pointer group my-auto"
      >
        <div className="w-16 h-16 rounded-full bg-card border border-border shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <UploadCloud className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1">Drag & Drop Raw Evidence Files Here</h3>
        <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
          Upload any telecom CDR/IPDR logs, bank transaction CSVs, device logs, or social media activity. 
          No manual domain tagging needed — the backend will automatically classify each file.
        </p>
        <button 
          type="button"
          className="px-5 py-2.5 bg-card text-foreground text-sm font-semibold rounded-lg border border-border shadow-sm hover:bg-secondary transition-colors"
        >
          Browse Local Files
        </button>
      </div>

      {/* Forensic Crime Scene NFC Evidence Scanner Modal */}
      {isNfcModalOpen && (
        <NFCEvidenceScannerModal
          isOpen={isNfcModalOpen}
          onClose={() => setIsNfcModalOpen(false)}
          caseId={activeCase.case_id}
          caseReference={activeCase.case_reference}
          onAcquisitionComplete={async () => {
            await refreshCases();
          }}
          onNavigateToGraph={onNavigateToGraph}
          onNavigateToTimeline={onNavigateToTimeline}
          onNavigateToMap={onNavigateToMap}
          onNavigateToFindings={onNavigateToFindings}
        />
      )}
    </div>
  );
}
