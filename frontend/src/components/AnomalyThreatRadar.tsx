import React, { useState } from 'react';
import { 
  AlertTriangle, X, ShieldAlert, ArrowRight, Activity, Globe, CreditCard, ChevronRight
} from 'lucide-react';
import { cn } from '../utils/cn';

export default function AnomalyThreatRadar() {
  const [selectedAnomaly, setSelectedAnomaly] = useState<string | null>('1');

  const anomalies = [
    {
      id: '1',
      risk: 'CRITICAL',
      type: 'Unusual Fund Transfer Pattern',
      entity: 'Account XXXX4821',
      time: '2 hours ago',
      desc: '₹4,80,000 transferred across 7 accounts within 18 minutes.',
      icon: CreditCard,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20'
    },
    {
      id: '2',
      risk: 'HIGH',
      type: 'Burner Phone Cluster',
      entity: '+91 98765 43210',
      time: '5 hours ago',
      desc: 'Device IMEIs switched 4 times on this number in 24 hours.',
      icon: Activity,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20'
    },
    {
      id: '3',
      risk: 'MEDIUM',
      type: 'Impossible Travel',
      entity: 'IP 103.X.X.X',
      time: '12 hours ago',
      desc: 'Login from Delhi and Mumbai within 45 minutes.',
      icon: Globe,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20'
    }
  ];

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Anomalies & Alerts</h2>
          <p className="text-sm text-muted-foreground mt-1">AI-driven threat detection and behavior analysis</p>
        </div>
      </div>

      {/* Segmented Top Summary */}
      <div className="flex bg-secondary p-1 rounded-lg w-fit mb-6 border border-border">
        {[
          { label: 'Critical', count: 7, color: 'text-red-500' },
          { label: 'High', count: 18, color: 'text-orange-500' },
          { label: 'Medium', count: 42, color: 'text-amber-500' },
          { label: 'Low', count: 61, color: 'text-blue-500' }
        ].map((stat) => (
          <button key={stat.label} className="flex items-center gap-2 px-4 py-1.5 rounded-md hover:bg-background transition-colors text-sm font-medium">
            <span className={cn("font-bold", stat.color)}>{stat.count}</span>
            <span className="text-foreground">{stat.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex gap-6 min-h-[500px]">
        {/* Alerts List */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2">
          {anomalies.map((anomaly) => (
            <div 
              key={anomaly.id}
              onClick={() => setSelectedAnomaly(anomaly.id)}
              className={cn(
                "bg-card rounded-xl p-5 cursor-pointer transition-all border shadow-sm flex items-start gap-4",
                selectedAnomaly === anomaly.id ? "ring-2 ring-primary border-transparent" : "border-border hover:border-primary/50"
              )}
            >
              <div className={cn("p-2 rounded-lg mt-1", anomaly.bg, anomaly.color)}>
                <anomaly.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="text-base font-semibold text-foreground">{anomaly.type}</h4>
                  <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border", anomaly.color, anomaly.bg, anomaly.border)}>
                    {anomaly.risk}
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground mb-2">{anomaly.entity} • {anomaly.time}</p>
                <p className="text-sm text-foreground">{anomaly.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Explainable AI Panel (Slide-in) */}
        {selectedAnomaly && (
          <div className="w-1/2 bg-card border border-border shadow-md rounded-xl p-6 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" /> Explainable AI Analysis
              </h3>
              <button onClick={() => setSelectedAnomaly(null)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 flex-1">
              <div className="bg-secondary/50 rounded-lg p-4 border border-border">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Observed Behavior</h4>
                <p className="text-foreground font-medium">Account transferred funds to 7 unique accounts within 18 minutes.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/50 rounded-lg p-4 border border-border">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Baseline</h4>
                  <p className="text-foreground">Typical behavior:<br/>1–2 transfers/day.</p>
                </div>
                <div className="bg-destructive/5 rounded-lg p-4 border border-destructive/20">
                  <h4 className="text-xs font-bold text-destructive uppercase tracking-wider mb-2">Deviation</h4>
                  <p className="text-destructive font-bold text-xl">4.7× above normal</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Correlated Signals</h4>
                <div className="space-y-2">
                  {['New beneficiary accounts detected', 'Unusual login location (Delhi)', 'Associated burner phone activity'].map((signal, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-sm text-foreground">{signal}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-border mt-6">
              <button className="flex-1 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm">
                Investigate
              </button>
              <button className="flex-1 py-2 bg-secondary text-foreground font-medium rounded-md border border-border hover:bg-secondary/80 transition-colors">
                View in Graph
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
