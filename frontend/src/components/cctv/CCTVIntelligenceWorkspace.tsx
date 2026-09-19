'use client';
import React, { useState, useEffect } from 'react';
import { 
  Camera, Navigation, Phone, FileText, Plus, 
  Sparkles, CheckCircle2, AlertTriangle, Building2, 
  RotateCcw, Download, ShieldCheck, Layers, HelpCircle 
} from 'lucide-react';
import { 
  apiClient, CCTVSource, RouteHypothesis, 
  CCTVIncidentLocation, CCTVIntelligenceResponse 
} from '../../services/apiClient';
import { CrimeScenePanel } from './CrimeScenePanel';
import { CCTVMap } from './CCTVMap';
import { CCTVSourceList } from './CCTVSourceList';
import { RouteList } from './RouteList';
import { ContactsDirectory } from './ContactsDirectory';
import { VerificationDialog } from './VerificationDialog';
import { AddManualCCTVModal } from './AddManualCCTVModal';
import { cn } from '../../utils/cn';

interface Props {
  activeCase: any;
}

export const CCTVIntelligenceWorkspace: React.FC<Props> = ({ activeCase }) => {
  const caseId = activeCase?.case_id || 'CASE-DEFAULT';

  // State
  const [location, setLocation] = useState<CCTVIncidentLocation>({
    address: 'Sub-City Centre, Sector 34, Chandigarh',
    sector: 'Sector 34',
    landmark: 'Sub-City Centre Commercial Plaza',
    latitude: 30.7225,
    longitude: 76.7682,
    incident_date: '2026-09-06',
    incident_time: '21:20',
    location_source: activeCase?.title ? `Case: ${activeCase.title}` : 'Operational Baseline'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<CCTVSource[]>([]);
  const [routes, setRoutes] = useState<RouteHypothesis[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [polygons, setPolygons] = useState<any[]>([]);

  // Selection
  const [selectedRoute, setSelectedRoute] = useState<RouteHypothesis | null>(null);
  const [selectedSource, setSelectedSource] = useState<CCTVSource | null>(null);
  const [activeTab, setActiveTab] = useState<'SOURCES' | 'ROUTES' | 'CONTACTS' | 'SUMMARY'>('SOURCES');

  // Modals
  const [verifySourceModal, setVerifySourceModal] = useState<CCTVSource | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Initial Load: Context & Automatic Analysis
  useEffect(() => {
    if (!caseId) return;
    setIsLoading(true);
    apiClient.getCCTVContext(caseId)
      .then((ctx) => {
        if (ctx) setLocation(ctx);
        return apiClient.analyzeCCTV(caseId, {
          latitude: ctx.latitude || 30.7225,
          longitude: ctx.longitude || 76.7682,
          sector: ctx.sector || 'Sector 34',
          incident_time: ctx.incident_time || '21:20',
          incident_date: ctx.incident_date || '2026-09-06'
        });
      })
      .then((res: CCTVIntelligenceResponse) => {
        if (res) {
          setSources(res.sources || []);
          setRoutes(res.routes || []);
          setSummary(res.summary || null);
          setPolygons(res.deployment_polygons || []);
          if (res.routes?.length > 0) {
            setSelectedRoute(res.routes[0]);
          }
        }
      })
      .catch((err) => {
        console.warn('CCTV context/analysis failed on load:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [caseId]);

  // Run or Re-run Analysis
  const handleRunAnalysis = (customLoc?: CCTVIncidentLocation) => {
    const loc = customLoc || location;
    setIsLoading(true);
    apiClient.analyzeCCTV(caseId, {
      latitude: loc.latitude,
      longitude: loc.longitude,
      address: loc.address,
      sector: loc.sector,
      landmark: loc.landmark,
      incident_date: loc.incident_date,
      incident_time: loc.incident_time
    })
      .then((res: CCTVIntelligenceResponse) => {
        if (res) {
          setSources(res.sources || []);
          setRoutes(res.routes || []);
          setSummary(res.summary || null);
          setPolygons(res.deployment_polygons || []);
          if (res.routes?.length > 0) {
            setSelectedRoute(res.routes[0]);
          }
          showToast(`Analysis complete: ${res.summary.total_sources} CCTV opportunities & ${res.summary.possible_routes} routes identified.`);
        }
      })
      .catch((err) => {
        console.error('CCTV Analysis error:', err);
        showToast('Error executing CCTV analysis. Check backend connectivity.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // Add Source to Case
  const handleAddToCase = (source: CCTVSource) => {
    apiClient.addCCTVSourceToCase(caseId, source.id, { item_type: 'SOURCE' })
      .then(() => {
        setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_added_to_case: true } : s));
        showToast(`'${source.name}' linked to investigation dossier.`);
      })
      .catch((err) => console.error('Add to case failed:', err));
  };

  // Confirm Verification
  const handleConfirmVerification = (sourceId: string, status: string, reason: string, cameraCount?: number) => {
    apiClient.verifyCCTVSource(caseId, sourceId, {
      new_status: status,
      reason,
      camera_count_confirmed: cameraCount
    })
      .then(() => {
        setSources(prev => prev.map(s => s.id === sourceId ? {
          ...s,
          type: 'INVESTIGATOR_VERIFIED',
          status: 'INVESTIGATOR_VERIFIED',
          is_verified: true,
          why_relevant: `✓ Verified on site by officer (${reason || 'Confirmed'})\n` + s.why_relevant
        } : s));
        showToast(`CCTV source marked as ${status.replace(/_/g, ' ')}.`);
      })
      .catch((err) => console.error('Verification failed:', err));
  };

  // Manual Add Submission
  const handleManualAddSubmit = (payload: any) => {
    apiClient.addManualCCTVSource(caseId, payload)
      .then((res: any) => {
        const newSrc: CCTVSource = {
          id: res.source_id,
          name: payload.name,
          type: 'INVESTIGATOR_VERIFIED',
          category: payload.category,
          status: 'INVESTIGATOR_VERIFIED',
          address: payload.address,
          latitude: payload.latitude,
          longitude: payload.longitude,
          distance_meters: 100,
          phone: payload.phone,
          why_relevant: `✓ Manually observed & recorded by investigator\n✓ Notes: ${payload.notes || 'Recorded on ground'}`,
          source_provenance: 'Officer Manual Entry',
          is_verified: true,
          is_added_to_case: true
        };
        setSources(prev => [newSrc, ...prev]);
        setSelectedSource(newSrc);
        showToast(`'${payload.name}' recorded as verified source.`);
      })
      .catch((err) => console.error('Manual source add failed:', err));
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-y-auto">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed top-16 right-8 z-50 p-3 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-2xl animate-in slide-in-from-top duration-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Main Top Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-panel/60 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              CCTV Location &amp; Route Intelligence
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              Chandigarh Jurisdiction
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Investigative decision-support to identify surveillance opportunities around the crime scene and along possible routes.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-border text-foreground hover:bg-secondary hover:border-border/80 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Add CCTV Source</span>
          </button>

          <button
            type="button"
            onClick={() => handleRunAnalysis()}
            disabled={isLoading}
            className="text-xs font-bold px-3 sm:px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <RotateCcw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span>{isLoading ? 'Analyzing...' : 'Re-Run Intelligence'}</span>
          </button>
        </div>
      </div>

      {/* Content Container */}
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 flex-1">
        
        {/* ── THREE-ZONE LAYOUT (Incident Panel | Interactive Map | Quick Summary) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 min-h-[380px] lg:min-h-[500px]">
          
          {/* ZONE 1: INCIDENT CRIME SCENE (3 cols) */}
          <div className="lg:col-span-3 flex flex-col justify-between">
            <CrimeScenePanel
              location={location}
              isLoading={isLoading}
              onAnalyze={(custom) => handleRunAnalysis(custom)}
              onLocationChange={(newLoc) => {
                setLocation(newLoc);
                handleRunAnalysis(newLoc);
              }}
            />
          </div>

          {/* ZONE 2: PRIMARY INTERACTIVE MAP (6 cols) */}
          <div className="lg:col-span-6 h-[340px] sm:h-[480px] lg:h-auto min-h-[320px] sm:min-h-[480px]">
            <CCTVMap
              location={location}
              sources={sources}
              selectedRoute={selectedRoute}
              selectedSource={selectedSource}
              onSelectSource={(s) => {
                setSelectedSource(s);
                setActiveTab('SOURCES');
              }}
              onMapClickCoords={(lat, lng) => {
                // Allows investigator to drop pin
                setLocation(prev => ({
                  ...prev,
                  latitude: lat,
                  longitude: lng,
                  location_source: 'Map Pin Drop'
                }));
              }}
              deploymentPolygons={polygons}
            />
          </div>

          {/* ZONE 3: QUICK SUMMARY METRICS & SMART RECOMMENDATION (3 cols) */}
          <div className="lg:col-span-3 flex flex-col justify-between space-y-4">
            <div className="bg-card/90 backdrop-blur-md border border-border rounded-2xl p-5 shadow-lg space-y-4 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/60 pb-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Surveillance Summary</span>
                </div>

                <div className="space-y-3">
                  {/* Total Sources */}
                  <div className="p-3 rounded-xl bg-secondary/50 border border-border/50 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold text-muted-foreground uppercase">CCTV Sources Found</div>
                      <div className="text-2xl font-black text-foreground tracking-tight">
                        {summary?.total_sources || sources.length}
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <Camera className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Govt vs Private Counts */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="text-[10px] font-bold uppercase text-blue-400">Government</div>
                      <div className="text-lg font-black text-blue-300">
                        {summary?.government_sources || sources.filter(s => s.type.includes('GOVERNMENT')).length}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="text-[10px] font-bold uppercase text-amber-400">Private/Potential</div>
                      <div className="text-lg font-black text-amber-300">
                        {summary?.private_sources || sources.filter(s => s.type === 'POTENTIAL_PRIVATE').length}
                      </div>
                    </div>
                  </div>

                  {/* Routes & Gaps */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <div className="text-[10px] font-bold uppercase text-purple-400">Possible Routes</div>
                      <div className="text-lg font-black text-purple-300">
                        {summary?.possible_routes || routes.length}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="text-[10px] font-bold uppercase text-red-400">Coverage Gaps</div>
                      <div className="text-lg font-black text-red-300">
                        {summary?.coverage_gaps || routes.reduce((acc, r) => acc + r.coverage_gaps_count, 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Smart Recommendation Banner */}
              {summary?.recommended_starting_point && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/30 text-xs text-foreground/90 space-y-1">
                  <div className="font-bold text-amber-400 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    Recommended Route
                  </div>
                  <p className="text-[11px] text-foreground font-medium leading-snug">
                    {summary.recommended_starting_point}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BOTTOM TABS & WORKSPACE PANELS ── */}
        <div className="bg-card/90 backdrop-blur-md border border-border rounded-2xl p-4 sm:p-6 shadow-lg space-y-4 sm:space-y-5">
          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-border pb-3 gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide touch-scroll w-full sm:w-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('SOURCES')}
                className={cn(
                  "text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0",
                  activeTab === 'SOURCES'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Camera className="w-4 h-4" />
                <span>CCTV Sources ({sources.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ROUTES')}
                className={cn(
                  "text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0",
                  activeTab === 'ROUTES'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Navigation className="w-4 h-4" />
                <span>Possible Routes ({routes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('CONTACTS')}
                className={cn(
                  "text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0",
                  activeTab === 'CONTACTS'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Phone className="w-4 h-4" />
                <span>Contacts</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SUMMARY')}
                className={cn(
                  "text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0",
                  activeTab === 'SUMMARY'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <FileText className="w-4 h-4" />
                <span>Summary</span>
              </button>
            </div>

            <div className="text-xs text-muted-foreground font-medium hidden lg:block whitespace-nowrap">
              Case: <span className="text-foreground font-bold">{activeCase?.case_reference || 'CASE-ACTIVE'}</span>
            </div>
          </div>

          {/* Tab 1: CCTV Sources */}
          {activeTab === 'SOURCES' && (
            <CCTVSourceList
              sources={sources}
              selectedSource={selectedSource}
              onSelectSource={(s) => setSelectedSource(s)}
              onVerifySource={(s) => setVerifySourceModal(s)}
              onAddToCase={(s) => handleAddToCase(s)}
            />
          )}

          {/* Tab 2: Possible Routes */}
          {activeTab === 'ROUTES' && (
            <RouteList
              routes={routes}
              selectedRoute={selectedRoute}
              onSelectRoute={(r) => setSelectedRoute(r)}
              recommendedStartingPoint={summary?.recommended_starting_point}
            />
          )}

          {/* Tab 3: Contacts Directory */}
          {activeTab === 'CONTACTS' && (
            <ContactsDirectory
              sources={sources}
              onAddToCase={(s) => handleAddToCase(s)}
              onSelectSource={(s) => {
                setSelectedSource(s);
                setActiveTab('SOURCES');
              }}
            />
          )}

          {/* Tab 4: Investigation Summary */}
          {activeTab === 'SUMMARY' && (
            <div className="p-6 rounded-xl bg-secondary/40 border border-border/60 text-xs space-y-4 max-w-3xl">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  CCTV Intelligence Incident Dossier
                </h4>
                <span className="font-mono text-muted-foreground">{location.incident_date}</span>
              </div>

              <div className="space-y-2 leading-relaxed text-foreground/90">
                <p>
                  <strong>Crime Scene:</strong> {location.address} ({location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}) at <strong>{location.incident_time} hrs</strong>.
                </p>
                <p>
                  A total of <strong>{sources.length} surveillance opportunities</strong> were identified in the Chandigarh jurisdiction within the search perimeter:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>{summary?.government_sources || 0} Government sources</strong> (Chandigarh ICCC intersections and Municipal Corporation tender deployment areas).</li>
                  <li><strong>{summary?.private_sources || 0} Potential commercial sources</strong> (petrol pumps, banks, malls, hotels, hospitals with road-facing frontage).</li>
                  <li><strong>{summary?.verified_sources || 0} Investigator-verified sources</strong> independently confirmed on the ground.</li>
                </ul>
                <p>
                  The road network analysis generated <strong>{routes.length} candidate route hypotheses</strong> (approach &amp; departure corridors).
                  <strong> {summary?.coverage_gaps || 0} coverage gaps</strong> were flagged along candidate corridors exceeding 350m without surveillance.
                </p>
              </div>

              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground italic">
                  Forensic Neutrality: Route hypotheses and commercial listings represent investigative decision support and do not constitute automated guilt or suspect tracking.
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Print Dossier
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal */}
      <VerificationDialog
        source={verifySourceModal}
        isOpen={!!verifySourceModal}
        onClose={() => setVerifySourceModal(null)}
        onConfirm={handleConfirmVerification}
      />

      {/* Manual CCTV Add Modal */}
      <AddManualCCTVModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        defaultLat={location.latitude}
        defaultLng={location.longitude}
        onSubmit={handleManualAddSubmit}
      />
    </div>
  );
};
