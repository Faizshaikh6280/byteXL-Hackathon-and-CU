import React from 'react';
import { 
  Map as MapIcon, Layers, Play, MapPin, Smartphone, Globe, CreditCard
} from 'lucide-react';
import { cn } from '../utils/cn';

export default function GeoTimelineModule() {
  return (
    <div className="flex flex-col h-full absolute inset-0 bg-background">
      
      {/* Fake Map Background (theme aware) */}
      <div className="absolute inset-0 opacity-10 pointer-events-none dark:invert-0 invert" 
           style={{
             backgroundImage: 'radial-gradient(circle at 50% 50%, var(--primary) 0%, transparent 60%)',
             backgroundSize: '100% 100%'
           }} 
      />
      <div className="absolute inset-0 opacity-10 dark:opacity-5 pointer-events-none dark:invert-0 invert bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Earth_map_blank.svg/1000px-Earth_map_blank.svg.png')] bg-no-repeat bg-center bg-cover" />
      
      {/* Floating Controls Overlay */}
      <div className="absolute top-6 left-6 flex flex-col gap-4 z-10">
        <div className="bg-card border border-border shadow-md p-4 rounded-xl w-64">
          <h2 className="text-lg font-semibold text-foreground mb-1">Geospatial</h2>
          <p className="text-xs text-muted-foreground mb-4">Entity movement tracking</p>
          
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layers</h4>
            {[
              { label: 'Cell Towers', icon: MapPin, color: 'text-indigo-500' },
              { label: 'Devices', icon: Smartphone, color: 'text-emerald-500' },
              { label: 'IP Addresses', icon: Globe, color: 'text-blue-500' },
              { label: 'Transactions', icon: CreditCard, color: 'text-amber-500' }
            ].map((layer, i) => (
              <label key={i} className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary" />
                <layer.icon className={cn("w-4 h-4", layer.color)} />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{layer.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      
      {/* Right side floating controls */}
      <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
        <button className="p-2.5 text-muted-foreground hover:text-foreground bg-card border border-border shadow-sm rounded-md hover:bg-secondary transition-colors">
          <Layers className="w-5 h-5" />
        </button>
        <button className="p-2.5 text-muted-foreground hover:text-foreground bg-card border border-border shadow-sm rounded-md hover:bg-secondary transition-colors">
          <MapIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Mock Map Pins */}
      <div className="absolute top-1/3 left-1/3 w-4 h-4 rounded-full bg-blue-500 border-2 border-background shadow-lg animate-pulse" />
      <div className="absolute top-1/2 left-1/2 w-4 h-4 rounded-full bg-amber-500 border-2 border-background shadow-lg animate-pulse" />
      <div className="absolute top-1/3 left-1/2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-background shadow-lg animate-pulse" />
      
      {/* Path between pins */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <path d="M 33% 33% L 50% 33% L 50% 50%" fill="none" stroke="currentColor" className="text-primary/50" strokeWidth="2" strokeDasharray="5 5" />
      </svg>

      {/* Bottom Timeline slider */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-4">
        <div className="bg-card border border-border shadow-md rounded-xl p-4 flex items-center gap-6">
          <button className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0">
            <Play className="w-4 h-4 fill-current" />
          </button>
          
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono text-muted-foreground">
              <span>08:00 AM</span>
              <span className="text-primary font-bold">12:42 PM</span>
              <span>18:00 PM</span>
            </div>
            <div className="relative h-2 bg-secondary rounded-full w-full cursor-pointer group border border-border">
              <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-primary rounded-full" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-card rounded-full shadow-sm border-2 border-primary" />
            </div>
          </div>
          
          <div className="text-xs text-foreground font-medium bg-secondary px-3 py-1.5 rounded-md border border-border whitespace-nowrap">
            Travel: 42 km
          </div>
        </div>
      </div>
    </div>
  );
}
