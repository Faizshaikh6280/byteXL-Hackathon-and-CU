'use client';
import React, { useState } from 'react';
import { Camera, X, Check, MapPin, Building2, Phone, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultLat?: number;
  defaultLng?: number;
  onSubmit: (payload: {
    name: string;
    category: string;
    owner_type: string;
    address: string;
    latitude: number;
    longitude: number;
    phone?: string;
    notes?: string;
  }) => void;
}

export const AddManualCCTVModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultLat = 30.7225,
  defaultLng = 76.7682,
  onSubmit
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('COMMERCIAL');
  const [ownerType, setOwnerType] = useState('PRIVATE');
  const [address, setAddress] = useState('Sector 34, Chandigarh');
  const [lat, setLat] = useState(defaultLat.toString());
  const [lng, setLng] = useState(defaultLng.toString());
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      category,
      owner_type: ownerType,
      address,
      latitude: parseFloat(lat) || defaultLat,
      longitude: parseFloat(lng) || defaultLng,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Record CCTV Source Manually</h3>
              <p className="text-xs text-muted-foreground">Add camera observed during ground investigation or witness enquiry</p>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Camera / Establishment Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Verma Jewellers High-Angle Camera"
              className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="font-semibold text-muted-foreground block mb-1">Establishment Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary"
              >
                <option value="RETAIL">Retail / Shop</option>
                <option value="BANK">Bank / ATM</option>
                <option value="PETROL_PUMP">Petrol Pump</option>
                <option value="HOTEL">Hotel / Guest House</option>
                <option value="RESIDENTIAL">Residential Compound</option>
                <option value="COMMERCIAL">Commercial Building</option>
                <option value="HOSPITAL">Hospital / Clinic</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-muted-foreground block mb-1">Ownership Type</label>
              <select
                value={ownerType}
                onChange={(e) => setOwnerType(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary"
              >
                <option value="PRIVATE">Private Commercial</option>
                <option value="RESIDENTIAL">Private Resident</option>
                <option value="GOVERNMENT">Government / Municipal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Address / Location Landmark</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. SCO 24, Sector 34-C, Chandigarh"
              className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground font-medium outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="font-semibold text-muted-foreground block mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2.5 font-mono text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="font-semibold text-muted-foreground block mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg p-2.5 font-mono text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Contact Phone (Owner / Manager)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 XXXXX"
              className="w-full bg-secondary border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-primary font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-muted-foreground block mb-1">Investigator Observations</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Camera orientation, field of view towards main road, DVR backup period..."
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
              className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save to Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
