import { create } from 'zustand';

export type TimelineMode = 'subject' | 'network' | 'cross_domain' | 'map_sync' | 'storyline';
export type TimelineZoom = 'month' | 'day' | 'hour' | 'minute';
export type TimelineContextTab = 'event' | 'map' | 'intelligence';

export interface TimelineState {
  // Mode & Zoom
  activeMode: TimelineMode;
  zoomLevel: TimelineZoom;
  setActiveMode: (mode: TimelineMode) => void;
  setZoomLevel: (zoom: TimelineZoom) => void;

  // Selection
  selectedEventId: string | null;
  hoveredEventId: string | null;
  selectedCorrelationId: string | null;
  setSelectedEventId: (id: string | null) => void;
  setHoveredEventId: (id: string | null) => void;
  setSelectedCorrelationId: (id: string | null) => void;

  // Filter State
  selectedEntityIds: string[];
  selectedDomains: string[];
  selectedRiskLevels: string[];
  onlyAnomalies: boolean;
  searchQuery: string;
  setSelectedEntityIds: (ids: string[]) => void;
  toggleEntityId: (id: string) => void;
  setSelectedDomains: (domains: string[]) => void;
  toggleDomain: (domain: string) => void;
  setSelectedRiskLevels: (risks: string[]) => void;
  toggleRiskLevel: (risk: string) => void;
  setOnlyAnomalies: (val: boolean) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;

  // Compare Mode State
  compareEntities: string[];
  setCompareEntities: (entities: string[]) => void;
  toggleCompareEntity: (entity: string) => void;

  // Playback State (100% backward compatible with existing GeospatialMap)
  currentTime: number;
  timeRange: [number, number];
  isPlaying: boolean;
  playbackSpeed: number; // 1, 2, 5, 10
  setTimeRange: (range: [number, number]) => void;
  setCurrentTime: (time: number) => void;
  togglePlay: () => void;
  setPlaybackSpeed: (speed: number) => void;
  stepForward: (stepMs?: number) => void;
  stepBackward: (stepMs?: number) => void;

  // Context Workstation Panel & Modals
  activeContextTab: TimelineContextTab;
  setActiveContextTab: (tab: TimelineContextTab) => void;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: (open: boolean) => void;

  contextEventId: string | null;
  contextWindowMinutes: number;
  isContextModalOpen: boolean;
  isExportModalOpen: boolean;
  isFilterOpen: boolean;
  setContextEventId: (id: string | null, windowMinutes?: number) => void;
  closeContextModal: () => void;
  setIsExportModalOpen: (open: boolean) => void;
  setIsFilterOpen: (open: boolean) => void;
}

const DEFAULT_DOMAINS = ['TELECOM', 'FINANCIAL', 'SOCIAL', 'LOCATION', 'NETWORK', 'GENERAL', 'KYC', 'ANALYTICAL'];

export const useTimelineStore = create<TimelineState>((set, get) => ({
  // Mode & Zoom
  activeMode: 'cross_domain',
  zoomLevel: 'month',
  setActiveMode: (mode) => set({ activeMode: mode }),
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  // Selection
  selectedEventId: null,
  hoveredEventId: null,
  selectedCorrelationId: null,
  setSelectedEventId: (id) => set({ 
    selectedEventId: id,
    // Automatically open right panel when an event is selected
    ...(id ? { isRightPanelOpen: true, activeContextTab: 'event' } : {})
  }),
  setHoveredEventId: (id) => set({ hoveredEventId: id }),
  setSelectedCorrelationId: (id) => set({ selectedCorrelationId: id }),

  // Filters
  selectedEntityIds: [],
  selectedDomains: DEFAULT_DOMAINS,
  selectedRiskLevels: [],
  onlyAnomalies: false,
  searchQuery: '',
  setSelectedEntityIds: (ids) => set({ selectedEntityIds: ids }),
  toggleEntityId: (id) => set((state) => {
    const exists = state.selectedEntityIds.includes(id);
    return {
      selectedEntityIds: exists
        ? state.selectedEntityIds.filter(e => e !== id)
        : [...state.selectedEntityIds, id]
    };
  }),
  setSelectedDomains: (domains) => set({ selectedDomains: domains }),
  toggleDomain: (domain) => set((state) => {
    const exists = state.selectedDomains.includes(domain);
    return {
      selectedDomains: exists
        ? state.selectedDomains.filter(d => d !== domain)
        : [...state.selectedDomains, domain]
    };
  }),
  setSelectedRiskLevels: (risks) => set({ selectedRiskLevels: risks }),
  toggleRiskLevel: (risk) => set((state) => {
    const exists = state.selectedRiskLevels.includes(risk);
    return {
      selectedRiskLevels: exists
        ? state.selectedRiskLevels.filter(r => r !== risk)
        : [...state.selectedRiskLevels, risk]
    };
  }),
  setOnlyAnomalies: (val) => set({ onlyAnomalies: val }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  resetFilters: () => set({
    selectedEntityIds: [],
    selectedDomains: DEFAULT_DOMAINS,
    selectedRiskLevels: [],
    onlyAnomalies: false,
    searchQuery: ''
  }),

  // Compare Mode
  compareEntities: [],
  setCompareEntities: (entities) => set({ compareEntities: entities }),
  toggleCompareEntity: (entity) => set((state) => {
    const exists = state.compareEntities.includes(entity);
    return {
      compareEntities: exists
        ? state.compareEntities.filter(e => e !== entity)
        : [...state.compareEntities, entity]
    };
  }),

  // Playback
  currentTime: 0,
  timeRange: [0, 100],
  isPlaying: false,
  playbackSpeed: 1,
  setTimeRange: (range) => set({ timeRange: range, currentTime: range[0] }),
  setCurrentTime: (time) => set({ currentTime: time }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  stepForward: (stepMs) => {
    const state = get();
    const delta = stepMs || Math.max(60000, (state.timeRange[1] - state.timeRange[0]) / 100);
    const next = Math.min(state.timeRange[1], state.currentTime + delta);
    set({ currentTime: next });
  },
  stepBackward: (stepMs) => {
    const state = get();
    const delta = stepMs || Math.max(60000, (state.timeRange[1] - state.timeRange[0]) / 100);
    const next = Math.max(state.timeRange[0], state.currentTime - delta);
    set({ currentTime: next });
  },

  // Context Workstation Panel & Modals
  activeContextTab: 'event',
  setActiveContextTab: (tab) => set({ activeContextTab: tab }),
  isRightPanelOpen: true,
  setIsRightPanelOpen: (open) => set({ isRightPanelOpen: open }),

  contextEventId: null,
  contextWindowMinutes: 15,
  isContextModalOpen: false,
  isExportModalOpen: false,
  isFilterOpen: false,
  setContextEventId: (id, windowMinutes = 15) => set({
    contextEventId: id,
    contextWindowMinutes: windowMinutes,
    isContextModalOpen: id !== null
  }),
  closeContextModal: () => set({ isContextModalOpen: false, contextEventId: null }),
  setIsExportModalOpen: (open) => set({ isExportModalOpen: open }),
  setIsFilterOpen: (open) => set({ isFilterOpen: open })
}));
