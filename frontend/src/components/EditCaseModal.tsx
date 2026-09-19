'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit3, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { Case } from '../services/apiClient';

interface EditCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCase?: Case | null;
}

export default function EditCaseModal({ isOpen, onClose, targetCase }: EditCaseModalProps) {
  const { activeCase, updateCase } = useCase();
  const c = targetCase || activeCase;

  const [title, setTitle] = useState('');
  const [caseReference, setCaseReference] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (c) {
      setTitle(c.title || '');
      setCaseReference(c.case_reference || c.case_id || '');
      setDescription(c.description || '');
      setStatus(c.status || 'ACTIVE');
      setError(null);
    }
  }, [c, isOpen]);

  if (!isOpen || !c) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Case title is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await updateCase(c.case_id, {
        title: title.trim(),
        case_reference: caseReference.trim() || undefined,
        description: description.trim() || undefined,
        status: status.trim().toUpperCase() || 'ACTIVE',
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update case');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-2 text-foreground font-semibold text-lg">
            <Edit3 className="w-5 h-5 text-primary" />
            <span>Edit Investigation Dossier</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Case Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Operation Shadow Syndicate"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Case Reference
              </label>
              <input
                type="text"
                placeholder="e.g. INV-2026-0142"
                value={caseReference}
                onChange={e => setCaseReference(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Operational Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ACTIVE">ACTIVE (Open Investigation)</option>
                <option value="SUSPENDED">SUSPENDED (Interim Hold)</option>
                <option value="CLOSED">CLOSED (Court Adjudicated)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Case Context & Lead Investigator Notes
            </label>
            <textarea
              rows={4}
              placeholder="Case summary, targeted threat profile, jurisdictional nexus, and initial evidence context..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground font-mono">
              ID: {c.case_id}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground font-medium rounded-lg hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
