'use client';
import React from 'react';
import { Phone, Building2, MapPin, ExternalLink, ShieldCheck, Plus, Check, Info } from 'lucide-react';
import { CCTVSource } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface Props {
  sources: CCTVSource[];
  onAddToCase: (source: CCTVSource) => void;
  onSelectSource: (source: CCTVSource) => void;
}

export const ContactsDirectory: React.FC<Props> = ({
  sources,
  onAddToCase,
  onSelectSource
}) => {
  const contactableSources = sources.filter(s => s.phone || s.website);

  return (
    <div className="space-y-4">
      {/* Notice Banner */}
      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-blue-200">Official Police Dispatch Directory</div>
          <p className="text-[11px] text-blue-300/80 leading-relaxed">
            Only legitimate public business and government facility contact numbers are displayed here for urgent officer field inquiries and footage preservation notices.
          </p>
        </div>
      </div>

      {/* Directory Table / Grid */}
      {contactableSources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {contactableSources.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSource(s)}
              className="p-4 rounded-xl border border-border bg-card/80 hover:bg-card transition-all cursor-pointer space-y-3 group shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                    {s.category.replace(/_/g, ' ')}
                  </span>
                  <h4 className="text-sm font-bold text-foreground mt-1 group-hover:text-primary transition-colors line-clamp-1">
                    {s.name}
                  </h4>
                </div>

                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <MapPin className="w-3 h-3 text-primary/70" />
                  {Math.round(s.distance_meters)}m
                </span>
              </div>

              {s.address && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {s.address}
                </p>
              )}

              <div className="pt-2 border-t border-border/50 space-y-1.5">
                {s.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Telephone:</span>
                    <a
                      href={`tel:${s.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      <Phone className="w-3 h-3" />
                      {s.phone}
                    </a>
                  </div>
                )}

                {s.website && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Website:</span>
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline flex items-center gap-1 truncate max-w-[150px]"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{s.website.replace(/^https?:\/\//, '')}</span>
                    </a>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Status: <strong className="text-foreground">{s.status.replace(/_/g, ' ')}</strong>
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCase(s);
                  }}
                  className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
                    s.is_added_to_case
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {s.is_added_to_case ? (
                    <>
                      <Check className="w-3 h-3" />
                      In Case
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      Add to Case
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl space-y-2">
          <Phone className="w-8 h-8 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-bold text-foreground">No direct contact numbers available</h4>
          <p className="text-xs text-muted-foreground">
            Contact information for government facilities and nearby private establishments could not be matched.
          </p>
        </div>
      )}
    </div>
  );
};
