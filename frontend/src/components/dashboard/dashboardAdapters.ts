import React from 'react';
import { 
  Smartphone, CreditCard, MessagesSquare, MapPin, Globe, 
  AlertTriangle, ShieldAlert, Sparkles, HelpCircle,
  Link2, RadioTower, Phone, ArrowUpRight, CheckCircle2,
  FileText, Activity, Users, UserCheck, Cpu, HardDrive
} from 'lucide-react';

export interface DomainStyle {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  hex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const DASHBOARD_DOMAIN_STYLES: Record<string, DomainStyle> = {
  TELECOM: {
    label: 'Telecom',
    icon: Phone,
    hex: '#6366f1', // indigo-500
    textClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/10',
    borderClass: 'border-indigo-500/25'
  },
  FINANCIAL: {
    label: 'Financial',
    icon: CreditCard,
    hex: '#10b981', // emerald-500
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/25'
  },
  LOCATION: {
    label: 'Location',
    icon: MapPin,
    hex: '#f59e0b', // amber-500
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/25'
  },
  SOCIAL: {
    label: 'Social',
    icon: MessagesSquare,
    hex: '#ec4899', // pink-500
    textClass: 'text-pink-400',
    bgClass: 'bg-pink-500/10',
    borderClass: 'border-pink-500/25'
  },
  NETWORK: {
    label: 'Network & IP',
    icon: Globe,
    hex: '#06b6d4', // cyan-500
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/25'
  },
  GENERAL: {
    label: 'Location / General',
    icon: RadioTower,
    hex: '#8b5cf6', // violet-500
    textClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
    borderClass: 'border-violet-500/25'
  },
  KYC: {
    label: 'Identity / KYC',
    icon: UserCheck,
    hex: '#14b8a6', // teal-500
    textClass: 'text-teal-400',
    bgClass: 'bg-teal-500/10',
    borderClass: 'border-teal-500/25'
  },
  ANALYTICAL: {
    label: 'Analytical',
    icon: AlertTriangle,
    hex: '#f43f5e', // rose-500
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/25'
  }
};

export const DEFAULT_DOMAIN_STYLE: DomainStyle = {
  label: 'Other',
  icon: Activity,
  hex: '#94a3b8', // slate-400
  textClass: 'text-slate-400',
  bgClass: 'bg-slate-500/10',
  borderClass: 'border-slate-500/25'
};

export function getDashboardDomainStyle(domain?: string): DomainStyle {
  if (!domain) return DEFAULT_DOMAIN_STYLE;
  const upper = domain.toUpperCase().trim();
  return DASHBOARD_DOMAIN_STYLES[upper] || DEFAULT_DOMAIN_STYLE;
}

export function formatINR(amount?: number | null): string {
  if (amount === undefined || amount === null) return '₹0';
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

export function formatRelativeTime(dateStr?: string | number): string {
  if (!dateStr) return 'recently';
  try {
    const timestamp = typeof dateStr === 'number' ? dateStr : new Date(dateStr).getTime();
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'recently';
  }
}

export function formatTimestamp(dateStr?: string | number): { time: string; date: string } {
  if (!dateStr) return { time: '--:--:--', date: '----' };
  try {
    const d = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
    const time = d.toISOString().slice(11, 19);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const date = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return { time, date };
  } catch {
    return { time: String(dateStr), date: '' };
  }
}

// Polar to cartesian calculation for SVG Donut slices
export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

export function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  percent: number;
  path: string;
}

export function computeDonutSegments(
  items: Array<{ key: string; label: string; value: number; color: string }>,
  centerX = 50,
  centerY = 50,
  radius = 36
): DonutSegment[] {
  const total = items.reduce((acc, it) => acc + (it.value > 0 ? it.value : 0), 0);
  if (total === 0) return [];

  let currentAngle = 0;
  return items.map(it => {
    const sliceAngle = (Math.max(0, it.value) / total) * 359.99;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    return {
      key: it.key,
      label: it.label,
      value: it.value,
      color: it.color,
      percent: Math.round((it.value / total) * 100),
      path: describeArc(centerX, centerY, radius, startAngle, endAngle)
    };
  });
}
