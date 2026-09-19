'use client';
import React, { useState } from 'react';
import { ShieldCheck, X, Check, AlertTriangle, FileText, Camera } from 'lucide-react';
import { CCTVSource } from '../../services/apiClient';

interface Props {
  source: CCTVSource | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sourceId: string, status: string, reason: string, cameraCount?: number) => void;
}

export const VerificationDialog: React.FC<Props> = ({
  source,
  isOpen,
  onClose,
  onConfirm
}) => {
  const [status, setStatus] = useState('INVESTIGATOR_VERIFIED');
  const [cameraCount, setCameraCount] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !source) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    onConfirm(source.id, status, reason, cameraCount);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Verify CCTV Source</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[260px]">{source.name}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Info Pill */}
        <div className="p-3 rounded-xl bg-secondary/50 border border-border/50 text-xs space-y-1">
          <div className="font-semibold text-foreground">{source.name}</div>
          <div className="text-muted-foreground">{source.address || 'Chandigarh'}</div>
          <div className="text-primary font-medium">{Math.round(source.distance_meters)}m from crime scene</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Verification Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary"
            >
              <option value="INVESTIGATOR_VERIFIED">✓ Verified CCTV Present (Investigator Confirmed)</option>
              <option value="CONFIRMED">✓ Confirmed Active Surveillance</option>
              <option value="ABSENT">✕ No CCTV Present on Site</option>
              <option value="REJECTED">✕ Irrelevant / Obstructed View</option>
            </select>
          </div>

          {status !== 'ABSENT' && (
            <div>
              <label className="font-semibold text-muted-foreground block mb-1">Confirmed Camera Units</label>
              <input
                type="number"
                min="1"
                max="50"
                value={cameraCount}
                onChange={(e) => setCameraCount(parseInt(e.target.value) || 1)}
                className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary font-mono"
              />
            </div>
          )}

          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Investigator Verification Notes</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical visit by Sub-Inspector; confirmed 2 cameras facing the north road entry with 30-day retention."
              className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save Verification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
