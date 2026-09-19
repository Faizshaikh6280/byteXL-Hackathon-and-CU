'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Plus, Trash2, ArrowRight, ArrowLeft, ArrowLeftRight, 
  Share2, Shield, Smartphone, HardDrive, CreditCard, 
  Globe, Radio, User, AtSign, Cpu, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

export interface AddConnectedNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceNode: {
    id: string;
    label: string;
    type: string;
    properties?: Record<string, any>;
  } | null;
  caseId: string;
  onSuccess: (createdNode: any, createdRel: any, pipelineResult?: any) => void;
}

const NODE_TYPES = [
  { id: 'Phone', name: 'Phone Number', icon: Smartphone, color: '#0ea5e9', placeholder: '+919876543210' },
  { id: 'SIMCard', name: 'SIM Card (IMSI)', icon: Smartphone, color: '#38bdf8', placeholder: '404450123456789' },
  { id: 'Device', name: 'Device (IMEI / MAC)', icon: HardDrive, color: '#f59e0b', placeholder: '860123456789012' },
  { id: 'BankAccount', name: 'Bank Account', icon: CreditCard, color: '#10b981', placeholder: '98765432101' },
  { id: 'IPAddress', name: 'IP Address', icon: Globe, color: '#6366f1', placeholder: '182.74.12.5' },
  { id: 'CellTower', name: 'Cell Tower', icon: Radio, color: '#84cc16', placeholder: 'TOWER-404-DEL-01' },
  { id: 'Person', name: 'Person (Suspect/Entity)', icon: User, color: '#a855f7', placeholder: 'Vikram Malhotra' },
  { id: 'SocialAccount', name: 'Social Account', icon: AtSign, color: '#ec4899', placeholder: '@vikram_m' },
  { id: 'ATM', name: 'ATM Terminal', icon: CreditCard, color: '#14b8a6', placeholder: 'ATM-SBI-0091' },
  { id: 'Custom', name: 'Custom Node Type', icon: Cpu, color: '#64748b', placeholder: 'Identifier' }
];

const STANDARD_RELATIONSHIPS: Record<string, string[]> = {
  Phone: ['CALLS', 'SMS', 'USES_DEVICE', 'USES_SIM', 'CONNECTS_VIA_IP', 'LOCATED_AT', 'COMMUNICATED_WITH'],
  SIMCard: ['USES_SIM', 'ASSOCIATED_WITH'],
  Device: ['USES_DEVICE', 'CONNECTS_VIA_IP', 'LOCATED_AT', 'ASSOCIATED_WITH'],
  BankAccount: ['TRANSFERS_MONEY', 'OWNS_ACCOUNT'],
  IPAddress: ['CONNECTS_VIA_IP'],
  CellTower: ['LOCATED_AT'],
  Person: ['OWNS_PHONE', 'OWNS_ACCOUNT', 'USES_DEVICE', 'USES_SIM', 'USES_HANDLE', 'CONNECTS_VIA_IP', 'LOCATED_AT', 'CALLS', 'CO_OFFENDING', 'ASSOCIATED_WITH'],
  SocialAccount: ['USES_HANDLE', 'CONNECTS_VIA_IP', 'ASSOCIATED_WITH'],
  ATM: ['WITHDREW_CASH_AT', 'LOCATED_AT']
};

export default function AddConnectedNodeModal({
  isOpen,
  onClose,
  sourceNode,
  caseId,
  onSuccess
}: AddConnectedNodeModalProps) {
  const [targetType, setTargetType] = useState('Phone');
  const [customTargetType, setCustomTargetType] = useState('');
  const [targetValue, setTargetValue] = useState('');
  
  // Custom Node Attributes
  const [nodeAttrs, setNodeAttrs] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' }
  ]);

  // Standard Presets
  const [presetOperator, setPresetOperator] = useState('');
  const [presetKycName, setPresetKycName] = useState('');
  const [presetBankName, setPresetBankName] = useState('');
  const [presetIfsc, setPresetIfsc] = useState('');
  const [presetDeviceModel, setPresetDeviceModel] = useState('');
  const [presetLat, setPresetLat] = useState('');
  const [presetLng, setPresetLng] = useState('');

  // Relationship
  const [relType, setRelType] = useState('CALLS');
  const [customRelType, setCustomRelType] = useState('');
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | 'bidirectional'>('outgoing');

  // Relationship Attributes
  const [relTimestamp, setRelTimestamp] = useState(new Date().toISOString().slice(0, 19));
  const [relAmount, setRelAmount] = useState('');
  const [relDuration, setRelDuration] = useState('');
  const [relNotes, setRelNotes] = useState('');
  const [relAttrs, setRelAttrs] = useState<Array<{ key: string; value: string }>>([]);

  // Pipeline
  const [rerunPipeline, setRerunPipeline] = useState(true);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Suggested relationships based on current targetType & sourceNode
  const suggestedRels = useMemo(() => {
    const list = STANDARD_RELATIONSHIPS[targetType] || ['ASSOCIATED_WITH', 'CONNECTED_TO'];
    if (!list.includes(relType) && relType !== 'CUSTOM') {
      setRelType(list[0]);
    }
    return list;
  }, [targetType]);

  if (!isOpen || !sourceNode) return null;

  const currentTypeConfig = NODE_TYPES.find(t => t.id === targetType) || NODE_TYPES[0];

  const handleAddNodeAttr = () => setNodeAttrs([...nodeAttrs, { key: '', value: '' }]);
  const handleRemoveNodeAttr = (index: number) => setNodeAttrs(nodeAttrs.filter((_, i) => i !== index));
  const handleUpdateNodeAttr = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...nodeAttrs];
    updated[index][field] = val;
    setNodeAttrs(updated);
  };

  const handleAddRelAttr = () => setRelAttrs([...relAttrs, { key: '', value: '' }]);
  const handleRemoveRelAttr = (index: number) => setRelAttrs(relAttrs.filter((_, i) => i !== index));
  const handleUpdateRelAttr = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...relAttrs];
    updated[index][field] = val;
    setRelAttrs(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetValue.trim()) {
      setError('Please provide a primary identifier for the new node.');
      return;
    }

    const effectiveType = targetType === 'Custom' ? customTargetType.trim() : targetType;
    if (!effectiveType) {
      setError('Please specify the custom node type.');
      return;
    }

    const effectiveRel = relType === 'CUSTOM' ? customRelType.trim() : relType;
    if (!effectiveRel) {
      setError('Please specify the relationship type.');
      return;
    }

    // Compile Node Attributes
    const targetAttributes: Record<string, any> = {};
    if (presetOperator.trim()) targetAttributes.operator = presetOperator.trim();
    if (presetKycName.trim()) targetAttributes.kyc_name = presetKycName.trim();
    if (presetBankName.trim()) targetAttributes.bank_name = presetBankName.trim();
    if (presetIfsc.trim()) targetAttributes.ifsc = presetIfsc.trim();
    if (presetDeviceModel.trim()) targetAttributes.device_model = presetDeviceModel.trim();
    if (presetLat.trim()) targetAttributes.latitude = parseFloat(presetLat);
    if (presetLng.trim()) targetAttributes.longitude = parseFloat(presetLng);

    nodeAttrs.forEach(({ key, value }) => {
      if (key.trim()) targetAttributes[key.trim()] = value.trim();
    });

    // Compile Relationship Attributes
    const relationshipAttributes: Record<string, any> = {};
    if (relTimestamp.trim()) relationshipAttributes.timestamp = relTimestamp.trim();
    if (relAmount.trim()) relationshipAttributes.amount = parseFloat(relAmount);
    if (relDuration.trim()) relationshipAttributes.duration = parseInt(relDuration, 10);
    if (relNotes.trim()) relationshipAttributes.notes = relNotes.trim();

    relAttrs.forEach(({ key, value }) => {
      if (key.trim()) relationshipAttributes[key.trim()] = value.trim();
    });

    setIsSubmitting(true);
    setError(null);
    setSubmitStep('Persisting node and relationship to Neo4j graph...');

    try {
      if (rerunPipeline) {
        setSubmitStep('Re-running investigation pipeline (Zingg ER, Anomaly Engines, Timeline)...');
      }

      const res = await apiClient.addConnectedRelation({
        case_id: caseId,
        source_node_id: sourceNode.id,
        source_node_type: sourceNode.type,
        source_node_label: sourceNode.label,
        target_node_type: effectiveType,
        target_node_value: targetValue.trim(),
        target_node_attributes: targetAttributes,
        relationship_type: effectiveRel,
        direction,
        relationship_attributes: relationshipAttributes,
        rerun_pipeline: rerunPipeline
      });

      setSubmitStep('Complete! Updating graph visualization...');
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess(res.created_node, res.created_relationship, res.pipeline_result);
        onClose();
      }, 500);

    } catch (err: any) {
      console.error('Error creating connected relation:', err);
      setError(err.message || 'Failed to create node and relation.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Add Connected Entity & Relation</h3>
              <p className="text-xs text-muted-foreground">Link a new entity to the active investigation graph</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Interactive Topology Breadcrumb Preview */}
          <div className="p-4 rounded-xl bg-secondary/20 border border-border flex items-center justify-between gap-3 text-xs">
            {/* Source Node */}
            <div className="flex-1 p-2.5 rounded-lg bg-card border border-border flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block">{sourceNode.type}</span>
                <span className="text-xs font-semibold text-foreground truncate block" title={sourceNode.label}>{sourceNode.label}</span>
              </div>
            </div>

            {/* Link Preview Arrow */}
            <div className="flex flex-col items-center px-2 flex-shrink-0">
              <span className="text-[10px] font-mono font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 mb-1">
                {relType === 'CUSTOM' ? (customRelType || 'RELATION') : relType}
              </span>
              <div className="text-muted-foreground">
                {direction === 'outgoing' && <ArrowRight className="w-4 h-4" />}
                {direction === 'incoming' && <ArrowLeft className="w-4 h-4" />}
                {direction === 'bidirectional' && <ArrowLeftRight className="w-4 h-4" />}
              </div>
            </div>

            {/* Target Node */}
            <div className="flex-1 p-2.5 rounded-lg bg-card border border-border flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentTypeConfig.color }} />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block">
                  {targetType === 'Custom' ? (customTargetType || 'Custom') : targetType}
                </span>
                <span className="text-xs font-semibold text-foreground truncate block">
                  {targetValue || '(New Identifier)'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1: TARGET NODE DEFINITION */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" /> Step 1: Define New Connected Entity
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Node Type Dropdown */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Entity Type <span className="text-destructive">*</span>
                </label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {NODE_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Primary Value/Identifier Input */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Identifier / Value <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder={currentTypeConfig.placeholder}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  required
                />
              </div>
            </div>

            {targetType === 'Custom' && (
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Custom Node Label/Type <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={customTargetType}
                  onChange={(e) => setCustomTargetType(e.target.value)}
                  placeholder="e.g., Organization, CryptocurrencyWallet, Vehicle"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
            )}

            {/* Contextual Node Attributes */}
            <div className="p-3.5 rounded-xl bg-secondary/15 border border-border space-y-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Standard Entity Metadata (Optional)
              </span>

              {targetType === 'Phone' && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={presetOperator}
                    onChange={e => setPresetOperator(e.target.value)}
                    placeholder="Telecom Provider (e.g. Airtel, Jio)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                  <input
                    type="text"
                    value={presetKycName}
                    onChange={e => setPresetKycName(e.target.value)}
                    placeholder="KYC Registered Name"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              )}

              {targetType === 'BankAccount' && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={presetBankName}
                    onChange={e => setPresetBankName(e.target.value)}
                    placeholder="Bank Name (e.g. HDFC, ICICI)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                  <input
                    type="text"
                    value={presetIfsc}
                    onChange={e => setPresetIfsc(e.target.value)}
                    placeholder="IFSC Code (e.g. HDFC0001234)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                  />
                </div>
              )}

              {targetType === 'Device' && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={presetDeviceModel}
                    onChange={e => setPresetDeviceModel(e.target.value)}
                    placeholder="Manufacturer & Model (e.g. Apple iPhone 15)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                  <input
                    type="text"
                    value={presetOperator}
                    onChange={e => setPresetOperator(e.target.value)}
                    placeholder="OS Version (e.g. iOS 17.4)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              )}

              {targetType === 'CellTower' && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={presetLat}
                    onChange={e => setPresetLat(e.target.value)}
                    placeholder="Latitude (e.g. 28.6139)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                  />
                  <input
                    type="text"
                    value={presetLng}
                    onChange={e => setPresetLng(e.target.value)}
                    placeholder="Longitude (e.g. 77.2090)"
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                  />
                </div>
              )}

              {/* Dynamic Key-Value Pair Custom Attributes */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-semibold">Additional Custom Attributes</span>
                  <button
                    type="button"
                    onClick={handleAddNodeAttr}
                    className="text-xs text-primary hover:text-primary/80 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Attribute
                  </button>
                </div>
                {nodeAttrs.map((attr, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={attr.key}
                      onChange={e => handleUpdateNodeAttr(idx, 'key', e.target.value)}
                      placeholder="Attribute Key (e.g. status)"
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <input
                      type="text"
                      value={attr.value}
                      onChange={e => handleUpdateNodeAttr(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveNodeAttr(idx)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove attribute"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: RELATIONSHIP DEFINITION */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" /> Step 2: Define Relationship & Interaction
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Relationship Type */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Relationship Type <span className="text-destructive">*</span>
                </label>
                <select
                  value={relType}
                  onChange={(e) => setRelType(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono font-semibold"
                >
                  {suggestedRels.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="CUSTOM">Custom Relationship Type...</option>
                </select>
              </div>

              {/* Relationship Direction */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Direction
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-secondary/30 p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setDirection('outgoing')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors ${
                      direction === 'outgoing' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> Outgoing
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('incoming')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors ${
                      direction === 'incoming' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Incoming
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('bidirectional')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors ${
                      direction === 'bidirectional' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Both
                  </button>
                </div>
              </div>
            </div>

            {relType === 'CUSTOM' && (
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Custom Relationship Type Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={customRelType}
                  onChange={(e) => setCustomRelType(e.target.value)}
                  placeholder="e.g., COMMUNICATED_VIA_SIGNAL, CO_ACCUSED"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  required
                />
              </div>
            )}

            {/* Relationship Attributes Box */}
            <div className="p-3.5 rounded-xl bg-secondary/15 border border-border space-y-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Relationship Metadata
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Timestamp */}
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Timestamp</label>
                  <input
                    type="datetime-local"
                    value={relTimestamp}
                    onChange={e => setRelTimestamp(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Amount (₹ INR)</label>
                  <input
                    type="number"
                    value={relAmount}
                    onChange={e => setRelAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    value={relDuration}
                    onChange={e => setRelDuration(e.target.value)}
                    placeholder="e.g. 180"
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <input
                  type="text"
                  value={relNotes}
                  onChange={e => setRelNotes(e.target.value)}
                  placeholder="Investigative notes / transaction narration (e.g. Suspicious late-night communication)"
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                />
              </div>

              {/* Additional Rel Attributes */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-semibold">Custom Relationship Attributes</span>
                  <button
                    type="button"
                    onClick={handleAddRelAttr}
                    className="text-xs text-primary hover:text-primary/80 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Attribute
                  </button>
                </div>
                {relAttrs.map((attr, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={attr.key}
                      onChange={e => handleUpdateRelAttr(idx, 'key', e.target.value)}
                      placeholder="Key (e.g. confidence_score)"
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <input
                      type="text"
                      value={attr.value}
                      onChange={e => handleUpdateRelAttr(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRelAttr(idx)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 3: PIPELINE RE-EXECUTION TOGGLE */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Automated Pipeline Re-execution
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Immediately re-run Zingg Entity Resolution, Anomaly Detection & Timeline to evaluate new intelligence.
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={rerunPipeline}
                onChange={e => setRerunPipeline(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Execution Progress Banner */}
          {isSubmitting && (
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-3 text-primary text-sm animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              <div className="font-semibold">{submitStep}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !targetValue.trim()}
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Connected Entity</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
