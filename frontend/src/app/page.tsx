'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Bell, HelpCircle, User, Activity, FolderOpen, Database, 
  Users, Share2, Clock, Map, AlertTriangle, FileText, Smartphone, 
  Globe, BarChart3, ShieldCheck, Settings, LogOut, ChevronRight,
  Sun, Moon, Menu, Command, X, Cpu, Plus, Layers, Crosshair, Camera,
  Shield, LogIn, Check, ChevronDown
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '../utils/cn';
import { CaseProvider, useCase } from '../context/CaseContext';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Modules
import OverviewDashboard from '../components/OverviewDashboard';
import CaseManagementView from '../components/CaseManagementView';
import DataIngestionVault from '../components/DataIngestionVault';
import ProcessingPipelineView from '../components/ProcessingPipelineView';
import EntityResolutionMatrix from '../components/EntityResolutionMatrix';
import GraphTopologyViewer from '../components/GraphTopologyViewer';
import TimelineFootprint from '../components/TimelineFootprint';
import GeospatialMap from '../components/GeospatialMap';
import { CCTVIntelligenceWorkspace } from '../components/cctv/CCTVIntelligenceWorkspace';
import AnomaliesTab from '../components/AnomaliesTab';
import AnomalyInvestigationDrawer from '../components/AnomalyInvestigationDrawer';
import CaseDossierExporter from '../components/CaseDossierExporter';
import AuditTrailLogs from '../components/AuditTrailLogs';
import { InvestigationDashboard } from '../components/InvestigationDashboard';
import CreateCaseModal from '../components/CreateCaseModal';
import LoginModal from '../components/auth/LoginModal';
import UserProfileModal from '../components/auth/UserProfileModal';
import UserManagementView from '../components/admin/UserManagementView';
import { AIForensicChatbot } from '../components/AIForensicChatbot';
import { OmniSearchModal } from '../components/OmniSearchModal';
import EditCaseModal from '../components/EditCaseModal';


interface NavItem {
  id: string;
  label: string;
  icon: any;
  permission?: string;
}

const navigation: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'agentic', label: 'Agentic Forensics', icon: Crosshair },
  { id: 'investigations', label: 'Case Dossiers', icon: FolderOpen, permission: 'case.read' },
  { id: 'data-sources', label: 'Evidence Intake', icon: Database, permission: 'evidence.view' },
  { id: 'pipeline', label: 'Processing Pipeline', icon: Cpu, permission: 'evidence.view' },
  { id: 'entity-explorer', label: 'Entity Explorer', icon: Users, permission: 'entity.view' },
  { id: 'relationship-graph', label: 'Relationship Graph', icon: Share2, permission: 'graph.view' },
  { id: 'timeline', label: 'Timeline', icon: Clock, permission: 'timeline.view' },
  { id: 'geospatial', label: 'Geospatial Map', icon: Map, permission: 'geospatial.view' },
  { id: 'cctv', label: 'CCTV Intelligence', icon: Camera, permission: 'cctv.view' },
  { id: 'anomalies', label: 'Anomalies & Radar', icon: AlertTriangle, permission: 'anomaly.view' },
  { id: 'reports', label: 'Reports & Export', icon: BarChart3, permission: 'report.view' },
  { id: 'audit', label: 'Audit Trail', icon: ShieldCheck, permission: 'audit.view' },
  { id: 'personnel', label: 'Personnel & IAM', icon: Shield, permission: 'user.view' },
];

function InvestigationWorkspace() {
  const { cases, activeCase, setActiveCaseId } = useCase();
  const { 
    user, 
    role, 
    permissions, 
    isAuthenticated, 
    can, 
    logout, 
    setIsProfileModalOpen, 
    setIsLoginModalOpen 
  } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarExpanded, setSidebarExpanded] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  
  const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null);
  const [focusAnomalyEntityId, setFocusAnomalyEntityId] = useState<string | null>(null);
  const [focusCommunityId, setFocusCommunityId] = useState<number | string | null>(null);
  const [focusEntityIds, setFocusEntityIds] = useState<string[] | null>(null);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isEditCaseOpen, setIsEditCaseOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<any>(null);

  const handlePivotToGraph = (entityId: string) => {
    setFocusAnomalyEntityId(entityId);
    setFocusEntityIds(null);
    setFocusCommunityId(null);
    setActiveTab('relationship-graph');
  };


  // Case Selector Dropdown State
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  const [caseSearchQuery, setCaseSearchQuery] = useState('');
  const caseDropdownRef = useRef<HTMLDivElement>(null);

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close case dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (caseDropdownRef.current && !caseDropdownRef.current.contains(e.target as Node)) {
        setIsCaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle case_id and tab redirect from URL params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const targetCase = params.get('case_id') || params.get('case');
      if (targetCase) {
        setActiveCaseId(targetCase);
      }
      const targetTab = params.get('tab');
      if (targetTab) {
        setActiveTab(targetTab);
      }
      if (targetCase) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [setActiveCaseId]);

  // Redirect if current tab becomes unauthorized on role switch
  useEffect(() => {
    if (!isAuthenticated) return;
    const currentNav = navigation.find(n => n.id === activeTab);
    if (currentNav && currentNav.permission && !can(currentNav.permission)) {
      setActiveTab('overview');
    }
  }, [role, permissions, activeTab, can, isAuthenticated]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!mounted) return null;

  const visibleNavItems = navigation.filter(item => !item.permission || can(item.permission));

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden relative">
      
      {/* Mobile Drawer Backdrop */}
      {isMobileNavOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* Mobile Navigation Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card/95 backdrop-blur-2xl border-r border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out md:hidden",
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <span className="text-foreground">TRACE</span>
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">V2</span>
          </div>
          <button 
            onClick={() => setIsMobileNavOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileNavOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                activeTab === item.id 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", activeTab === item.id ? "text-primary-foreground" : "text-muted-foreground")} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        {isAuthenticated && user && (
          <div className="p-3 border-t border-border bg-secondary/30">
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-secondary/50 border border-border">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-foreground truncate">{user.full_name}</span>
                <span className="text-[10px] text-muted-foreground font-mono truncate">{user.role_display || user.role}</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Desktop Collapsible Sidebar */}
      <aside 
        className={cn(
          "hidden md:flex flex-shrink-0 flex-col border-r border-border bg-panel backdrop-blur-xl z-30 transition-all duration-300 ease-in-out",
          isSidebarExpanded ? "w-64" : "w-16"
        )}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="h-14 flex items-center justify-center px-4 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight overflow-hidden whitespace-nowrap w-full">
            <ShieldCheck className="w-6 h-6 flex-shrink-0 text-primary" />
            <div className={cn("transition-opacity duration-300 font-bold tracking-tight text-foreground", isSidebarExpanded ? "opacity-100" : "opacity-0 w-0")}>
              TRACE <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">V2</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-hide hover:scrollbar-default">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={!isSidebarExpanded ? item.label : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === item.id 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", activeTab === item.id ? "text-primary-foreground" : "text-muted-foreground")} />
              <span className={cn("whitespace-nowrap transition-opacity duration-300", isSidebarExpanded ? "opacity-100" : "opacity-0 w-0 hidden")}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-background">
        
        {/* Top Header */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-2 sm:px-4 border-b border-border bg-background z-20">
          {/* Mobile Hamburger Toggle & Active Case Switcher */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none"
              title="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Modern Glassmorphic Active Case Switcher */}
            <div className="relative min-w-0" ref={caseDropdownRef}>
              <button
                onClick={() => setIsCaseDropdownOpen(!isCaseDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2.5 bg-secondary/80 hover:bg-secondary border border-border px-2 sm:px-3 py-1.5 rounded-xl transition-all shadow-sm text-left group max-w-[210px] xs:max-w-[260px] sm:max-w-none"
                title="Click to switch investigation case"
              >
                <div className="p-1 rounded-lg bg-primary/10 text-primary shrink-0">
                  <FolderOpen className="w-4 h-4 flex-shrink-0" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs font-bold text-foreground max-w-[90px] xs:max-w-[130px] sm:max-w-[240px] truncate">
                      {activeCase ? activeCase.title : "Select Case Dossier"}
                    </span>
                    {activeCase?.status && (
                      <span className="hidden xs:inline-block text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                        {activeCase.status}
                      </span>
                    )}
                  </div>
                  {activeCase && (
                    <span className="text-[10px] text-muted-foreground font-medium truncate hidden sm:block">
                      {activeCase.case_reference}
                    </span>
                  )}
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground ml-0.5 sm:ml-1 shrink-0 transition-transform duration-200", isCaseDropdownOpen && "rotate-180")} />
              </button>

              {isCaseDropdownOpen && (
                <div className="fixed sm:absolute left-2 sm:left-0 right-2 sm:right-auto top-16 sm:top-full mt-1 w-[calc(100vw-1rem)] sm:w-80 max-w-sm bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1.5 border-b border-border/80 mb-2 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter cases..."
                      value={caseSearchQuery}
                      onChange={(e) => setCaseSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                      autoFocus
                    />
                    {caseSearchQuery && (
                      <button onClick={() => setCaseSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {cases.filter(c => 
                    !caseSearchQuery || 
                    c.title.toLowerCase().includes(caseSearchQuery.toLowerCase()) || 
                    c.case_reference.toLowerCase().includes(caseSearchQuery.toLowerCase())
                  ).length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No matching cases found
                    </div>
                  ) : (
                    cases
                      .filter(c => 
                        !caseSearchQuery || 
                        c.title.toLowerCase().includes(caseSearchQuery.toLowerCase()) || 
                        c.case_reference.toLowerCase().includes(caseSearchQuery.toLowerCase())
                      )
                      .map(c => {
                        const isSelected = activeCase?.case_id === c.case_id;
                        return (
                          <button
                            key={c.case_id}
                            onClick={() => {
                              setActiveCaseId(c.case_id);
                              setIsCaseDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start justify-between gap-2",
                              isSelected
                                ? "bg-primary/10 border border-primary/30 text-primary font-semibold"
                                : "hover:bg-secondary text-foreground"
                            )}
                          >
                            <div className="truncate">
                              <div className="font-bold truncate">{c.title}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{c.case_reference}</div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                          </button>
                        );
                      })
                  )}
                </div>

                {can('case.create') && (
                  <div className="pt-2 mt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setIsCaseDropdownOpen(false);
                        setIsCreateModalOpen(true);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create New Case Dossier
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

          {/* Quick Search */}
          <div className="flex-1 max-w-md px-4 hidden lg:block">
            <button 
              onClick={() => setCmdOpen(true)}
              className="flex items-center w-full px-3 py-1.5 bg-secondary text-muted-foreground border border-border rounded-md hover:bg-secondary/80 transition-colors text-xs"
            >
              <Search className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
              <span className="truncate whitespace-nowrap">Search entities, phones, accounts, IPs...</span>
              <kbd className="ml-auto flex items-center gap-1 font-mono text-[10px] bg-background border border-border rounded px-1.5 py-0.5 flex-shrink-0">
                <Command className="w-3 h-3" /> K
              </kbd>
            </button>
          </div>

          {/* Right Header Controls & IAM Profile Badge */}
          <div className="flex items-center gap-2">
            {/* Authenticated Officer RBAC Role Badge (Strict RBAC - Read-Only) */}
            <div className="hidden lg:flex items-center gap-2 bg-secondary/80 border border-border px-3 py-1.5 rounded-lg shadow-sm">
              <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">ROLE:</span>
                <span className="font-semibold text-foreground">
                  {user?.role_display || user?.role || 'INVESTIGATOR'}
                </span>
                {user?.employee_id && (
                  <span className="text-muted-foreground text-[11px]">
                    ({user.employee_id})
                  </span>
                )}
              </div>
            </div>

            {/* Anomalies Bell */}
            <button 
              onClick={() => setActiveTab('anomalies')}
              className="relative p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
              title="Anomalies Radar"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 block h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background animate-pulse" />
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="w-px h-5 bg-border mx-1" />

            {/* Authenticated Officer Badge OR Login Trigger */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="flex items-center gap-2 px-2.5 py-1 bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors group text-left"
                  title="View Officer Profile, Sessions & Security"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary group-hover:border-primary transition-colors">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden xl:flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate max-w-[110px]">
                        {user.full_name}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.2 rounded border font-mono tracking-wider",
                        role === 'SYSTEM_ADMIN' ? "bg-red-500/15 text-red-400 border-red-500/30" :
                        role === 'SUPERINTENDENT' || role === 'IPS_OFFICER' ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                        role === 'INSPECTOR' || role === 'SUB_INSPECTOR' ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                        role === 'ANALYST' ? "bg-purple-500/15 text-purple-400 border-purple-500/30" :
                        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      )}>
                        {user.role_display || user.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {user.employee_id} • {user.unit || 'CCID-HQ'}
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => logout()}
                  className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                  title="Logout / Terminate Session"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Canvas */}
        <main className={cn(
          "flex-1 relative min-w-0",
          activeTab === 'geospatial' ? "overflow-hidden h-[calc(100vh-3.5rem)] flex flex-col" : "overflow-auto"
        )}>
          {activeTab === 'overview' && (
            <OverviewDashboard onNavigateTab={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'investigations' && (
            <CaseManagementView onSelectCaseTab={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'data-sources' && (
            <DataIngestionVault 
              onNavigateToPipeline={() => setActiveTab('pipeline')}
              onNavigateToGraph={(entityId) => {
                setFocusAnomalyEntityId(entityId || null);
                setActiveTab('relationship-graph');
              }}
              onNavigateToTimeline={() => setActiveTab('timeline')}
              onNavigateToMap={() => setActiveTab('geospatial')}
              onNavigateToFindings={() => setActiveTab('anomalies')}
            />
          )}

          {activeTab === 'pipeline' && (
            <ProcessingPipelineView onNavigateToTab={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'entity-explorer' && (
            <EntityResolutionMatrix 
              onViewOnGraph={(entityId) => {
                setFocusAnomalyEntityId(entityId);
                setActiveTab('relationship-graph');
              }}
              onNavigateToAnomalies={() => setActiveTab('anomalies')}
            />
          )}

          {activeTab === 'relationship-graph' && (
            <GraphTopologyViewer 
              focusEntityId={focusAnomalyEntityId} 
              focusEntityIds={focusEntityIds}
              focusCommunityId={focusCommunityId}
              onClearFocus={() => {
                setFocusAnomalyEntityId(null);
                setFocusEntityIds(null);
                setFocusCommunityId(null);
              }}
            />
          )}

          {activeTab === 'timeline' && (
            <TimelineFootprint 
              onNavigateToGraph={(entityId) => {
                setFocusAnomalyEntityId(entityId);
                setActiveTab('relationship-graph');
              }}
              onNavigateToMap={() => {
                setActiveTab('geospatial');
              }}
            />
          )}

          {activeTab === 'geospatial' && (
            <GeospatialMap 
              onViewOnGraph={(entityId) => {
                setFocusAnomalyEntityId(entityId);
                setActiveTab('relationship-graph');
              }}
            />
          )}

          {activeTab === 'cctv' && (
            <CCTVIntelligenceWorkspace activeCase={activeCase} />
          )}

          {activeTab === 'anomalies' && (
            <AnomaliesTab 
              onAnomalySelect={(anomaly) => setSelectedAnomaly(anomaly)} 
              onPivotToGraph={handlePivotToGraph}
            />
          )}

          {activeTab === 'reports' && (
            <CaseDossierExporter />
          )}

          {activeTab === 'audit' && (
            <AuditTrailLogs />
          )}

          {activeTab === 'personnel' && (
            <UserManagementView />
          )}

          {activeTab === 'agentic' && (
            <InvestigationDashboard 
              activeCaseId={activeCase?.case_id || ""} 
              onNavigateToGraph={(entityIds, communityId) => {
                setFocusEntityIds(entityIds || null);
                setFocusCommunityId(communityId !== undefined ? communityId : null);
                setFocusAnomalyEntityId(null);
                setActiveTab('relationship-graph');
              }}
            />
          )}
        </main>
      </div>

      {/* Deep Anomaly Investigation Drawer */}
      <AnomalyInvestigationDrawer 
        anomaly={selectedAnomaly} 
        onClose={() => setSelectedAnomaly(null)}
        onViewOnGraph={(entityId) => {
          setFocusAnomalyEntityId(entityId);
          setSelectedAnomaly(null);
          setActiveTab('relationship-graph');
        }}
        onViewInTimeline={(entityId) => {
          setSelectedAnomaly(null);
          setActiveTab('timeline');
        }}
        onViewOnMap={(entityId) => {
          setSelectedAnomaly(null);
          setActiveTab('geospatial');
        }}
      />

      {/* Create Case Modal */}
      <CreateCaseModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* Officer IAM Modals */}
      <LoginModal />
      <UserProfileModal />

      {/* Case Management Modals */}
      <EditCaseModal
        isOpen={isEditCaseOpen}
        onClose={() => {
          setIsEditCaseOpen(false);
          setEditingCase(null);
        }}
        targetCase={editingCase}
      />

      {/* TRACE Intelligent Omni-Bar & Search Modal */}
      <OmniSearchModal 
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        caseId={activeCase?.case_id}
        onPivotToGraph={handlePivotToGraph}
      />

      {/* AI Forensic Chatbot (Voice + Text + Qwen 2.5 on Local GPU) */}
      <AIForensicChatbot
        activeCaseId={activeCase?.case_id}
        onPivotToGraph={handlePivotToGraph}
        isOpen={isChatbotOpen}
        onOpenChange={setIsChatbotOpen}
      />
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <CaseProvider>
        <InvestigationWorkspace />
      </CaseProvider>
    </AuthProvider>
  );
}
