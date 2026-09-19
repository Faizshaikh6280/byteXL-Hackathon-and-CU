import React from 'react';
import { 
  Smartphone, CreditCard, MessagesSquare, MapPin, Globe, 
  AlertTriangle, ShieldCheck, ShieldAlert, Sparkles, HelpCircle,
  Link2, RadioTower, PhoneCall, ArrowUpRight, ArrowDownLeft,
  Cpu, FileCode, CheckCircle2
} from 'lucide-react';
import { TimelineCanonicalEvent } from '../../services/apiClient';

export interface DomainThemeConfig {
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
  ring: string;
}

export const DOMAIN_THEMES: Record<string, DomainThemeConfig> = {
  TELECOM: {
    label: 'Telecom (CDR / SMS)',
    shortLabel: 'Telecom',
    icon: Smartphone,
    color: 'text-indigo-400 dark:text-indigo-400',
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    border: 'border-indigo-500/30 dark:border-indigo-500/30',
    badgeBg: 'bg-indigo-500/15 dark:bg-indigo-500/20',
    badgeText: 'text-indigo-400 dark:text-indigo-300',
    glow: 'shadow-[0_0_8px_rgba(99,102,241,0.35)]',
    ring: 'ring-indigo-500'
  },
  FINANCIAL: {
    label: 'Banking & Financial',
    shortLabel: 'Financial',
    icon: CreditCard,
    color: 'text-emerald-400 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    border: 'border-emerald-500/30 dark:border-emerald-500/30',
    badgeBg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    badgeText: 'text-emerald-400 dark:text-emerald-300',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.35)]',
    ring: 'ring-emerald-500'
  },
  LOCATION: {
    label: 'Geospatial Telemetry',
    shortLabel: 'Location',
    icon: MapPin,
    color: 'text-amber-400 dark:text-amber-400',
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    border: 'border-amber-500/30 dark:border-amber-500/30',
    badgeBg: 'bg-amber-500/15 dark:bg-amber-500/20',
    badgeText: 'text-amber-400 dark:text-amber-300',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.35)]',
    ring: 'ring-amber-500'
  },
  SOCIAL: {
    label: 'Social & Messaging',
    shortLabel: 'Social',
    icon: MessagesSquare,
    color: 'text-pink-400 dark:text-pink-400',
    bg: 'bg-pink-500/10 dark:bg-pink-500/15',
    border: 'border-pink-500/30 dark:border-pink-500/30',
    badgeBg: 'bg-pink-500/15 dark:bg-pink-500/20',
    badgeText: 'text-pink-400 dark:text-pink-300',
    glow: 'shadow-[0_0_8px_rgba(236,72,153,0.35)]',
    ring: 'ring-pink-500'
  },
  NETWORK: {
    label: 'IPDR & Network Sessions',
    shortLabel: 'Network',
    icon: Globe,
    color: 'text-cyan-400 dark:text-cyan-400',
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
    border: 'border-cyan-500/30 dark:border-cyan-500/30',
    badgeBg: 'bg-cyan-500/15 dark:bg-cyan-500/20',
    badgeText: 'text-cyan-400 dark:text-cyan-300',
    glow: 'shadow-[0_0_8px_rgba(6,182,212,0.35)]',
    ring: 'ring-cyan-500'
  },
  GENERAL: {
    label: 'General Events',
    shortLabel: 'General',
    icon: RadioTower,
    color: 'text-violet-400 dark:text-violet-400',
    bg: 'bg-violet-500/10 dark:bg-violet-500/15',
    border: 'border-violet-500/30 dark:border-violet-500/30',
    badgeBg: 'bg-violet-500/15 dark:bg-violet-500/20',
    badgeText: 'text-violet-400 dark:text-violet-300',
    glow: 'shadow-[0_0_8px_rgba(139,92,246,0.35)]',
    ring: 'ring-violet-500'
  },
  KYC: {
    label: 'Identity & KYC',
    shortLabel: 'KYC',
    icon: CheckCircle2,
    color: 'text-teal-400 dark:text-teal-400',
    bg: 'bg-teal-500/10 dark:bg-teal-500/15',
    border: 'border-teal-500/30 dark:border-teal-500/30',
    badgeBg: 'bg-teal-500/15 dark:bg-teal-500/20',
    badgeText: 'text-teal-400 dark:text-teal-300',
    glow: 'shadow-[0_0_8px_rgba(20,184,166,0.35)]',
    ring: 'ring-teal-500'
  },
  ANALYTICAL: {
    label: 'Analytical Signals & Risk',
    shortLabel: 'Analytical',
    icon: AlertTriangle,
    color: 'text-rose-400 dark:text-rose-400',
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    border: 'border-rose-500/30 dark:border-rose-500/30',
    badgeBg: 'bg-rose-500/15 dark:bg-rose-500/20',
    badgeText: 'text-rose-400 dark:text-rose-300',
    glow: 'shadow-[0_0_8px_rgba(244,63,94,0.35)]',
    ring: 'ring-rose-500'
  }
};

export const DEFAULT_DOMAIN_THEME: DomainThemeConfig = {
  label: 'Investigation Event',
  shortLabel: 'Event',
  icon: ShieldCheck,
  color: 'text-slate-400',
  bg: 'bg-slate-500/10',
  border: 'border-slate-500/30',
  badgeBg: 'bg-slate-500/15',
  badgeText: 'text-slate-300',
  glow: 'shadow-[0_0_8px_rgba(148,163,184,0.3)]',
  ring: 'ring-slate-500'
};

export function getDomainTheme(domain?: string): DomainThemeConfig {
  if (!domain) return DEFAULT_DOMAIN_THEME;
  const upper = domain.toUpperCase().trim();
  return DOMAIN_THEMES[upper] || DEFAULT_DOMAIN_THEME;
}

export interface EpistemicDisplayConfig {
  label: string;
  badgeClass: string;
  borderClass: string;
  description: string;
}

export function getEpistemicConfig(status?: string): EpistemicDisplayConfig {
  const norm = (status || 'OBSERVED').toUpperCase().trim();
  switch (norm) {
    case 'OBSERVED':
      return {
        label: 'Observed Evidence',
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        borderClass: 'border-solid',
        description: 'Verifiable physical, telecommunication, or digital evidence record.'
      };
    case 'CORRELATED':
      return {
        label: 'Correlated Sequence',
        badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        borderClass: 'border-dashed',
        description: 'Multi-domain rule or temporal co-occurrence link.'
      };
    case 'DERIVED':
      return {
        label: 'Derived Intelligence',
        badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        borderClass: 'border-dotted',
        description: 'Inference produced by analytics or entity resolution.'
      };
    case 'HYPOTHESIS':
      return {
        label: 'Hypothetical Reconstruction',
        badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        borderClass: 'border-dashed',
        description: 'Investigative proposition pending further corroboration.'
      };
    default:
      return {
        label: 'Observed Event',
        badgeClass: 'bg-secondary text-muted-foreground border-border',
        borderClass: 'border-solid',
        description: 'Standard event record.'
      };
  }
}

export interface RiskDisplayConfig {
  label: string;
  badgeClass: string;
  isCriticalOrHigh: boolean;
}

export function getRiskConfig(risk?: string, score?: number): RiskDisplayConfig {
  const norm = (risk || 'NONE').toUpperCase().trim();
  if (norm === 'CRITICAL' || (score !== undefined && score >= 80)) {
    return {
      label: 'Critical Risk',
      badgeClass: 'bg-destructive/15 text-destructive border-destructive/30',
      isCriticalOrHigh: true
    };
  }
  if (norm === 'HIGH' || (score !== undefined && score >= 60)) {
    return {
      label: 'High Risk',
      badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      isCriticalOrHigh: true
    };
  }
  if (norm === 'MEDIUM' || (score !== undefined && score >= 35)) {
    return {
      label: 'Medium Risk',
      badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      isCriticalOrHigh: false
    };
  }
  if (norm === 'LOW' || (score !== undefined && score > 0)) {
    return {
      label: 'Low Risk',
      badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      isCriticalOrHigh: false
    };
  }
  return {
    label: 'Standard Baseline',
    badgeClass: 'bg-secondary text-muted-foreground border-border/60',
    isCriticalOrHigh: false
  };
}

export function formatEventDateTime(isoStr?: string, tzOffset?: string): { date: string; time: string; tz: string } {
  if (!isoStr) return { date: '--', time: '--', tz: 'UTC' };
  try {
    const d = new Date(isoStr);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 19);
    const tz = tzOffset && tzOffset !== 'UNKNOWN' ? tzOffset : 'UTC';
    return { date, time, tz };
  } catch {
    return { date: isoStr, time: '', tz: tzOffset || 'UTC' };
  }
}

export function formatINR(amount?: number | null): string {
  if (amount === undefined || amount === null) return '₹0.00';
  return '₹' + amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function isPrimaryEvent(ev: TimelineCanonicalEvent): boolean {
  if (ev.risk_level === 'CRITICAL') {
    return true;
  }
  if (ev.anomaly_score > 75) {
    return true;
  }
  if (ev.amount_inr && ev.amount_inr >= 100000) {
    return true;
  }
  if (ev.duration_seconds && ev.duration_seconds >= 600) {
    return true;
  }
  if (ev.correlation_ids && ev.correlation_ids.length >= 3) {
    return true;
  }
  return false;
}
