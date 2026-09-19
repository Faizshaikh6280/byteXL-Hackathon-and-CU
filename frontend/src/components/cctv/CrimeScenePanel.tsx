'use client';
import React, { useState } from 'react';
import { 
  MapPin, Calendar, Clock, Search, Check, 
  RotateCcw, Sparkles, Navigation, Edit3, Crosshair 
} from 'lucide-react';
import { CCTVIncidentLocation } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface Props {
  location: CCTVIncidentLocation;
  isLoading: boolean;
  onAnalyze: (customLoc?: CCTVIncidentLocation) => void;
  onLocationChange: (newLoc: CCTVIncidentLocation) => void;
}

const PRESET_LOCATIONS = [
  { name: 'Sector 34 Sub-City Centre', sector: 'Sector 34', lat: 30.7225, lng: 76.7682, addr: 'Sub-City Centre, Sector 34, Chandigarh' },
  { name: 'Sector 35 Hotel Corridor (JW Marriott)', sector: 'Sector 35', lat: 30.7270, lng: 76.7600, addr: 'Sector 35, Chandigarh' },
  { name: 'Sector 43 District Courts & ISBT', sector: 'Sector 43', lat: 30.7180, lng: 76.7520, addr: 'ISBT & District Courts, Sector 43, Chandigarh' },
  { name: 'Manimajra (Old Ropar Road / Fun Republic)', sector: 'Manimajra', lat: 30.7240, lng: 76.8450, addr: 'Old Ropar Road, Manimajra, Chandigarh' },
  { name: 'Hallo Majra Transit Chowk', sector: 'Hallomajra', lat: 30.6900, lng: 76.8120, addr: 'Hallo Majra Chowk, Airport Road, Chandigarh' },
  { name: 'Sector 17 City Centre & Plaza', sector: 'Sector 17', lat: 30.7410, lng: 76.7850, addr: 'Sector 17 Plaza, Chandigarh' },
  { name: 'Elante Mall Industrial Area Phase 1', sector: 'Industrial Area Phase 1', lat: 30.7055, lng: 76.8015, addr: 'Industrial Area Phase 1, Chandigarh' },
  { name: 'Tribune Chowk Major Rotary', sector: 'Tribune Chowk', lat: 30.7020, lng: 76.7920, addr: 'Tribune Chowk, Chandigarh' }
];

export const CrimeScenePanel: React.FC<Props> = ({
  location,
  isLoading,
  onAnalyze,
  onLocationChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState(location.address || 'Sector 34, Chandigarh');
  const [sector, setSector] = useState(location.sector || 'Sector 34');
  const [landmark, setLandmark] = useState(location.landmark || 'Sub-City Centre');
  const [lat, setLat] = useState(location.latitude.toString());
  const [lng, setLng] = useState(location.longitude.toString());
  const [date, setDate] = useState(location.incident_date || '2026-09-06');
  const [time, setTime] = useState(location.incident_time || '21:20');

  const handleApplyChange = () => {
    const parsedLat = parseFloat(lat) || 30.7225;
    const parsedLng = parseFloat(lng) || 76.7682;
    const updated: CCTVIncidentLocation = {
      address,
      sector,
      landmark,
      latitude: parsedLat,
      longitude: parsedLng,
      incident_date: date,
      incident_time: time,
      location_source: 'Investigator Specified'
    };
    onLocationChange(updated);
    setIsEditing(false);
  };

  const handleSelectPreset = (preset: typeof PRESET_LOCATIONS[0]) => {
    setAddress(preset.addr);
    setSector(preset.sector);
    setLandmark(preset.name);
    setLat(preset.lat.toString());
    setLng(preset.lng.toString());
  };

  return (
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-2xl p-5 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <MapPin className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Incident Location</h3>
            <p className="text-[11px] text-muted-foreground">{location.location_source || 'Case Context'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
        >
          <Edit3 className="w-3 h-3 text-primary" />
          {isEditing ? 'Cancel' : 'Change'}
        </button>
      </div>

      {/* Main Incident Display */}
      {!isEditing ? (
        <div className="space-y-3.5">
          <div className="p-3 rounded-xl bg-secondary/50 border border-border/50 space-y-2">
            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Crime Scene</div>
              <div className="text-sm font-bold text-foreground leading-tight mt-0.5">{location.address || 'Sector 34, Chandigarh'}</div>
              {location.landmark && (
                <div className="text-xs text-primary font-medium mt-0.5">{location.landmark}</div>
              )}
            </div>

            <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-foreground font-medium">{location.incident_date || 'Today'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-foreground font-medium">{location.incident_time || '21:20'} hrs</span>
              </div>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground pt-1 flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-red-400" />
              <span>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>Incident coordinates verified for Chandigarh jurisdiction analysis.</span>
          </div>
        </div>
      ) : (
        /* Edit Mode Form */
        <div className="space-y-3.5 animate-in fade-in duration-200">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Quick Select Sector / Landmark</label>
            <select
              onChange={(e) => {
                const p = PRESET_LOCATIONS.find(x => x.name === e.target.value);
                if (p) handleSelectPreset(p);
              }}
              className="w-full text-xs bg-secondary border border-border rounded-lg p-2 text-foreground font-medium outline-none focus:border-primary"
            >
              <option value="">Choose preset hotspot...</option>
              {PRESET_LOCATIONS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Crime Scene Address / Name</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Sub-City Centre, Sector 34"
              className="w-full text-xs bg-secondary border border-border rounded-lg p-2 text-foreground font-medium outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Sector</label>
              <input
                type="text"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Sector 34"
                className="w-full text-xs bg-secondary border border-border rounded-lg p-2 text-foreground font-medium outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Incident Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-xs bg-secondary border border-border rounded-lg p-2 text-foreground font-medium outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full text-xs bg-secondary border border-border rounded-lg p-2 font-mono text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full text-xs bg-secondary border border-border rounded-lg p-2 font-mono text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleApplyChange}
              className="flex-1 text-xs font-bold py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Location
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onAnalyze()}
          className={cn(
            "w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 shadow-md flex items-center justify-center gap-2",
            isLoading
              ? "bg-primary/60 text-primary-foreground cursor-not-allowed"
              : "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-primary/20 hover:shadow-lg active:scale-[0.99]"
          )}
        >
          {isLoading ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Analyzing CCTV & Routes...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Find CCTV & Possible Routes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
