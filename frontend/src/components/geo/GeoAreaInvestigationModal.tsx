'use client';
import React, { useState } from 'react';
import { 
  X, Crosshair, MapPin, Users, Activity, Clock, Shield, Search, 
  Download, ArrowRight, CheckCircle2 
} from 'lucide-react';
import { AreaInvestigationResult, api } from '../../services/apiClient';

interface GeoAreaInvestigationModalProps {
  caseId: string;
  initialCenter?: [number, number];
  onClose: () => void;
  onFocusCoordinates?: (lat: number, lng: number) => void;
}

export const GeoAreaInvestigationModal: React.FC<GeoAreaInvestigationModalProps> = ({
  caseId,
  initialCenter = [30.7410, 76.7680], // Default Sector 17
  onClose,
  onFocusCoordinates,
}) => {
  const [lat, setLat] = useState<number>(initialCenter[0]);
  const [lng, setLng] = useState<number>(initialCenter[1]);
  const [radius, setRadius] = useState<number>(500); // 500 meters
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AreaInvestigationResult | null>(null);

  const executeScan = async () => {
    setLoading(true);
    try {
      const res = await api.postGeoAreaQuery({
        case_id: caseId,
        center_lat: lat,
        center_lng: lng,
        radius_meters: radius,
      });
      setResult(res);
      if (onFocusCoordinates) onFocusCoordinates(lat, lng);
    } catch (err) {
      console.error("Area investigation query failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-card border border-border/90 rounded-2xl w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/20 text-primary border border-primary/40">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                Geofence & Area Investigation ("Who Was Here?")
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Reconstruct all digital identities, communications, and movements within a spatial radius.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 bg-secondary/30 border-b border-border/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-muted-foreground font-semibold mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={e => setLat(parseFloat(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-md bg-secondary/70 border border-border text-foreground font-mono focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground font-semibold mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="0.0001"
              value={lng}
              onChange={e => setLng(parseFloat(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-md bg-secondary/70 border border-border text-foreground font-mono focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground font-semibold mb-1">
              Search Radius
            </label>
            <select
              value={radius}
              onChange={e => setRadius(parseInt(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-md bg-secondary/70 border border-border text-foreground focus:outline-none focus:border-primary"
            >
              <option value="100">100 Meters (Immediate Proximity)</option>
              <option value="250">250 Meters (Building Block)</option>
              <option value="500">500 Meters (Sector Core)</option>
              <option value="1000">1,000 Meters (1 km Area)</option>
              <option value="2500">2,500 Meters (District)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={executeScan}
              disabled={loading}
              className="w-full py-1.5 px-3 rounded-md bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-all shadow-md disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{loading ? 'Scanning...' : 'Execute Scan'}</span>
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {!result && !loading && (
            <div className="text-center py-16 text-muted-foreground space-y-2">
              <Crosshair className="w-10 h-10 mx-auto opacity-30 text-primary" />
              <p className="text-sm">Set target coordinates and radius to scan for digital footprints.</p>
              <p className="text-xs text-muted-foreground/80">
                Identifies telecom subscribers, ATM transactions, and device waypoints present in this zone.
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-16 space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground font-mono">Querying spatial index across all evidence domains...</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Summary Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60 flex items-center gap-3">
                  <Users className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Entities Detected
                    </span>
                    <span className="text-lg font-mono font-bold text-foreground">
                      {result.total_entities}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60 flex items-center gap-3">
                  <Activity className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Events in Radius
                    </span>
                    <span className="text-lg font-mono font-bold text-emerald-400">
                      {result.total_events}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Search Envelope
                    </span>
                    <span className="text-lg font-mono font-bold text-foreground">
                      {result.radius_meters}m
                    </span>
                  </div>
                </div>
              </div>

              {/* Entities Present Breakdown Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span>Subjects & Entities Present</span>
                </h4>

                <div className="border border-border/60 rounded-xl overflow-x-auto touch-scroll">
                  <table className="w-full text-left min-w-[560px]">
                    <thead className="bg-secondary/60 text-[10px] font-semibold uppercase text-muted-foreground border-b border-border/60">
                      <tr>
                        <th className="p-2.5">Subject / Entity</th>
                        <th className="p-2.5">Events Count</th>
                        <th className="p-2.5">First Observed</th>
                        <th className="p-2.5">Last Observed</th>
                        <th className="p-2.5">Domains</th>
                        <th className="p-2.5 text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-[11px]">
                      {result.entities_present.map(ent => (
                        <tr key={ent.entity_id} className="hover:bg-secondary/30 transition-colors">
                          <td className="p-2.5 font-semibold text-foreground">{ent.name}</td>
                          <td className="p-2.5 font-mono text-primary font-bold">{ent.event_count}</td>
                          <td className="p-2.5 font-mono text-muted-foreground">{ent.first_seen.replace('T', ' ').substring(0, 16)}</td>
                          <td className="p-2.5 font-mono text-muted-foreground">{ent.last_seen.replace('T', ' ').substring(0, 16)}</td>
                          <td className="p-2.5">
                            <div className="flex gap-1">
                              {ent.primary_domains.map(d => (
                                <span key={d} className="px-1.5 py-0.5 rounded bg-secondary text-[9px] font-mono">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold text-emerald-400">
                            {Math.round(ent.confidence * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-secondary/20 border-t border-border/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted-foreground">
            Geofence calculation based on Haversine great-circle geodesics.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
