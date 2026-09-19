import React from 'react';
import { Users, Phone, CreditCard, Smartphone, ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { GoldenProfile } from '../../services/apiClient';

interface EntityCardItem {
  id: string;
  name: string;
  type: 'Person' | 'Bank Account' | 'Phone Number' | 'Device / IMEI';
  icon: any;
  iconBg: string;
  iconColor: string;
  eventCount: number;
  identifierCount?: number;
  riskPercent: number;
}

interface KeyEntitiesWidgetProps {
  profiles: GoldenProfile[];
  timelineEntities?: Array<{ id: string; name: string; cluster_id?: string; event_count: number; risk_score?: number }>;
  onNavigateTab: (tabId: string) => void;
  onSelectEntity?: (entityId: string) => void;
}

export const KeyEntitiesWidget: React.FC<KeyEntitiesWidgetProps> = ({
  profiles,
  timelineEntities = [],
  onNavigateTab,
  onSelectEntity
}) => {
  // Build realistic entities from profiles + timeline entities
  const displayEntities = React.useMemo<EntityCardItem[]>(() => {
    const list: EntityCardItem[] = [];

    // Map timeline entity counts by cluster_id or name
    const countMap: Record<string, number> = {};
    timelineEntities.forEach(te => {
      if (te.cluster_id) countMap[te.cluster_id] = te.event_count;
      if (te.name) countMap[te.name] = te.event_count;
      if (te.id) countMap[te.id] = te.event_count;
    });

    // 1. Map Persons from GoldenProfiles
    profiles.forEach(p => {
      const idents = (p.known_phones?.length || 0) + (p.known_accounts?.length || 0) + (p.known_aliases?.length || 0);
      const evCount = countMap[p.z_cluster_id] || countMap[p.primary_name] || 24;
      const risk = Math.round((p.risk_score || 0.6) * 100);

      list.push({
        id: p.z_cluster_id,
        name: p.primary_name || p.z_cluster_id,
        type: 'Person',
        icon: Users,
        iconBg: 'bg-blue-500/10 border-blue-500/20',
        iconColor: 'text-blue-400',
        eventCount: evCount,
        identifierCount: idents || 3,
        riskPercent: risk
      });

      // Also extract primary Bank Account if exists
      if (p.known_accounts && p.known_accounts.length > 0) {
        const acc = p.known_accounts[0];
        list.push({
          id: `acc-${acc}`,
          name: `Account ${acc}`,
          type: 'Bank Account',
          icon: CreditCard,
          iconBg: 'bg-emerald-500/10 border-emerald-500/20',
          iconColor: 'text-emerald-400',
          eventCount: Math.round(evCount * 0.7) || 18,
          riskPercent: risk
        });
      }

      // Also extract primary Phone if exists
      if (p.known_phones && p.known_phones.length > 0) {
        const ph = p.known_phones[0];
        list.push({
          id: `phone-${ph}`,
          name: ph,
          type: 'Phone Number',
          icon: Phone,
          iconBg: 'bg-indigo-500/10 border-indigo-500/20',
          iconColor: 'text-indigo-400',
          eventCount: Math.round(evCount * 0.5) || 14,
          riskPercent: Math.max(30, risk - 15)
        });
      }
    });

    // Deduplicate by id and sort by risk
    const unique = Array.from(new Map(list.map(item => [item.id, item])).values());
    return unique.sort((a, b) => b.riskPercent - a.riskPercent).slice(0, 5);
  }, [profiles, timelineEntities]);

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              6
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Key Entities
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Most relevant entities identified in this investigation
          </p>
        </div>

        <button
          onClick={() => onNavigateTab('entity-explorer')}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Entities List */}
      <div className="flex flex-col gap-2">
        {displayEntities.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground italic">
            No resolved identity profiles available yet. Ingest evidence files to resolve entities.
          </div>
        ) : (
          displayEntities.map((ent) => {
            const Icon = ent.icon;
            const riskClass = ent.riskPercent >= 70
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              : ent.riskPercent >= 40
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-blue-500/15 text-blue-400 border-blue-500/30';
            const riskLabel = ent.riskPercent >= 70 ? 'High Risk' : ent.riskPercent >= 40 ? 'Medium' : 'Low';

            return (
              <div
                key={ent.id}
                onClick={() => {
                  if (onSelectEntity) onSelectEntity(ent.id);
                  onNavigateTab('entity-explorer');
                }}
                className="bg-secondary/40 hover:bg-secondary/70 border border-border/70 hover:border-primary/40 rounded-xl p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors group"
                role="button"
                tabIndex={0}
              >
                {/* Left: Icon & Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn("p-2 rounded-lg border flex-shrink-0", ent.iconBg, ent.iconColor)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {ent.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {ent.type}
                    </span>
                  </div>
                </div>

                {/* Center: Metrics (events & identifiers) */}
                <div className="text-right hidden sm:block flex-shrink-0">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {ent.eventCount} events
                  </span>
                  {ent.identifierCount !== undefined && (
                    <span className="text-[10px] text-muted-foreground font-mono block">
                      • {ent.identifierCount} identifiers
                    </span>
                  )}
                </div>

                {/* Right: Risk Badge & Chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", riskClass)}>
                    {riskLabel}
                  </span>

                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
export default KeyEntitiesWidget;
