import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Users, Smartphone, Building, Laptop, Globe, Search, Filter, 
  Layers, Settings, Download, ZoomIn, ZoomOut, Maximize,
  ChevronRight, X, AlertTriangle, Phone, FileText, Share2,
  MapPin, AtSign, Mail, ArrowRight, Clock, Network, 
  UserRound, Landmark, WalletCards, ArrowLeftRight, MessagesSquare, Building2,
  RefreshCcw, Activity, Cpu, Fingerprint, RadioTower, Monitor,
  Tag, RefreshCw, Play, Sparkles, PlusCircle
} from 'lucide-react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import fcose from 'cytoscape-fcose';
import { useTheme } from 'next-themes';
import { cn } from '../utils/cn';
import { useCase } from '../context/CaseContext';
import { apiClient } from '../services/apiClient';
import AddConnectedNodeModal from './AddConnectedNodeModal';

// Register layouts safely
try {
  cytoscape.use(dagre);
  cytoscape.use(cola);
  cytoscape.use(fcose);
} catch {
  // Ignored if already registered
}

// Map types to icons/colors
export const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any, color: string, iconStr: string }> = {
    Person: { icon: UserRound, color: '#ef4444', iconStr: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>' },
    Phone: { icon: Phone, color: '#0ea5e9', iconStr: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' },
    Bank: { icon: Landmark, color: '#10b981', iconStr: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2l8 5H4z"/>' },
    BankAccount: { icon: WalletCards, color: '#10b981', iconStr: '<rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 10h18"/><path d="M7 15h.01"/><path d="M11 15h2"/>' },
    Transaction: { icon: ArrowLeftRight, color: '#f59e0b', iconStr: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>' },
    Device: { icon: Monitor, color: '#f59e0b', iconStr: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>' },
    IMEI: { icon: Smartphone, color: '#8b5cf6', iconStr: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>' },
    SIMCard: { icon: Smartphone, color: '#38bdf8', iconStr: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M9 7h6v6H9z"/><path d="M12 17h.01"/>' },
    ATM: { icon: Landmark, color: '#14b8a6', iconStr: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2l8 5H4z"/>' },
    CellTower: { icon: RadioTower, color: '#f97316', iconStr: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>' },
    IPAddress: { icon: Globe, color: '#6366f1', iconStr: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>' },
    Location: { icon: MapPin, color: '#d946ef', iconStr: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>' },
    SocialAccount: { icon: MessagesSquare, color: '#ec4899', iconStr: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>' },
    Email: { icon: Mail, color: '#8b5cf6', iconStr: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>' },
    Organization: { icon: Building2, color: '#64748b', iconStr: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>' },
    Anomaly: { icon: AlertTriangle, color: '#dc2626', iconStr: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
  };
  return configs[type] || { icon: Layers, color: '#94a3b8', iconStr: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>' };
};

// SVG Icon generator for cytoscape background - Use base64 to ensure broad browser compatibility and no XML parsing issues
export const getSvgDataUri = (type: string) => {
  const config = getTypeConfig(type);
  // Padded viewBox to absolutely guarantee that thick strokes never clip at the SVG edge boundary
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-2 -2 28 28" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${config.iconStr}</svg>`;
  return 'data:image/svg+xml;base64,' + (typeof window !== 'undefined' ? btoa(svg) : ''); 
};

// Drawer Component
const Drawer = ({ isOpen, onClose, title, children, width = 'w-96' }: any) => (
  <div className={cn(
    "absolute top-0 right-0 bottom-0 bg-background border-l border-border shadow-2xl z-20 transition-transform duration-300 ease-in-out flex flex-col",
    width, isOpen ? "translate-x-0" : "translate-x-full"
  )}>
    <div className="flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-10">
      <h3 className="font-semibold text-foreground flex items-center gap-2">{title}</h3>
      <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-0 bg-background">
      {children}
    </div>
  </div>
);

export interface GraphTopologyViewerProps {
  focusEntityId?: string | null;
  focusEntityIds?: string[] | null;
  focusCommunityId?: number | string | null;
  onClearFocus?: () => void;
}

export default function GraphTopologyViewer({ 
  focusEntityId,
  focusEntityIds,
  focusCommunityId,
  onClearFocus
}: GraphTopologyViewerProps) {
  const { activeCase } = useCase();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Wait until mounted to prevent hydration mismatch
  useEffect(() => setMounted(true), []);
  
  const isDark = mounted && resolvedTheme === 'dark';
  
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [activeFocusId, setActiveFocusId] = useState<string | null>(focusEntityId || null);
  const [graphData, setGraphData] = useState<{nodes: any[], edges: any[]}>({nodes: [], edges: []});
  const [loading, setLoading] = useState(true);
  const [layoutName, setLayoutName] = useState('fcose');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  
  // Filters including IMEI, CellTower, SIMCard, ATM, and Anomaly
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    Person: true, Phone: true, BankAccount: true, Device: true, IMEI: true, SIMCard: true, CellTower: true, IPAddress: true, Location: true, SocialAccount: true, Transaction: true, Organization: true, Bank: true, ATM: true, Email: true, Anomaly: true
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);
  const pendingFocusRef = useRef<{ targetId?: string | null, targetIds?: string[] | null, communityId?: any } | null>(null);

  // Computed colors based on theme
  const canvasBg = isDark ? '#020617' : '#f8fafc'; // slightly darker canvas for better contrast in dark mode
  const edgeColor = isDark ? '#475569' : '#cbd5e1';

  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddRelationModalOpen, setIsAddRelationModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleRelationCreated = async (createdNode: any, createdRel: any, pipelineResult?: any) => {
    const profileCount = pipelineResult?.entity_resolution?.golden_profiles ?? 'Updated';
    const anomalyCount = pipelineResult?.anomaly_detection?.total_findings ?? 'Updated';
    setActionFeedback(`Connected entity created! Pipeline re-run: ${profileCount} Golden Profiles, ${anomalyCount} Anomalies.`);
    setTimeout(() => setActionFeedback(null), 8000);

    apiClient.invalidateCache();
    await fetchData();

    if (createdNode) {
      setTimeout(() => {
        if (cyRef.current) {
          const cy = cyRef.current;
          const targetNode = cy.nodes().filter((n: any) => {
            return n.id() === String(createdNode.id) || 
                   n.data('label') === createdNode.label ||
                   n.data('id') === String(createdNode.id);
          });
          if (targetNode.length > 0) {
            cy.elements().removeClass('highlighted dimmed');
            targetNode.addClass('highlighted');
            setSelectedNode(targetNode[0].data());
            setActiveDrawer('node');
            cy.animate({
              center: { eles: targetNode },
              zoom: 1.4,
              duration: 600
            });
          }
        }
      }, 400);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getGraphTopology(activeCase?.case_id);
      setGraphData(data || { nodes: [], edges: [] });
    } catch (err) {
      console.error("Graph fetch error", err);
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncGraph = async () => {
    setIsSyncing(true);
    try {
      await apiClient.syncGraph(activeCase?.case_id);
      await fetchData();
    } catch (err) {
      console.error("Sync graph error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeCase?.case_id]);

  // Compute stats for Network Summary and Filters
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    if(graphData.nodes) {
      graphData.nodes.forEach(n => {
        counts[n.type] = (counts[n.type] || 0) + 1;
      });
    }
    return {
      total: graphData.nodes?.length || 0,
      counts
    };
  }, [graphData]);

  // Stylesheet generator based on theme
  const getGraphStyle = (dark: boolean, showLabels: boolean = false) => {
    const txtColor = dark ? '#f1f5f9' : '#0f172a';
    const lineCol = dark ? '#475569' : '#cbd5e1';
    const hlColor = dark ? '#818cf8' : '#4f46e5';
    const bgCol = dark ? '#020617' : '#f8fafc';

    return [
      {
        selector: 'node',
        style: {
          'shape': 'ellipse',
          'width': (ele: any) => {
            const pr = Number(ele.data('pagerank') || 0);
            if (pr >= 0.3) return 64;
            if (pr >= 0.2 || ele.data('type') === 'Person') return 52;
            return 44;
          },
          'height': (ele: any) => {
            const pr = Number(ele.data('pagerank') || 0);
            if (pr >= 0.3) return 64;
            if (pr >= 0.2 || ele.data('type') === 'Person') return 52;
            return 44;
          },
          'background-color': 'data(color)',
          'border-width': (ele: any) => {
            if (ele.data('hasAnomaly') || Number(ele.data('anomalyCount') || 0) > 0) return 4;
            const bw = Number(ele.data('betweenness') || 0);
            const pr = Number(ele.data('pagerank') || 0);
            if (bw >= 1.0 || pr >= 0.3) return 3.5;
            return 2;
          },
          'border-color': (ele: any) => {
            if (ele.data('hasAnomaly') || Number(ele.data('anomalyCount') || 0) > 0) return '#ef4444'; // Red alert border for anomalies
            const bw = Number(ele.data('betweenness') || 0);
            const pr = Number(ele.data('pagerank') || 0);
            if (pr >= 0.3) return '#ef4444'; // Red kingpin ring
            if (bw >= 1.0) return '#f59e0b'; // Gold broker border accent
            return ele.data('color');
          },
          'border-opacity': 0.95,
          'label': (ele: any) => {
            const lbl = ele.data('label') || '';
            const count = Number(ele.data('anomalyCount') || 0);
            if (ele.data('hasAnomaly') || count > 0) {
              return `⚠️ ${lbl}`;
            }
            return lbl;
          },
          'color': txtColor,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 7,
          'font-size': '11px',
          'font-weight': '600',
          'text-wrap': 'wrap',
          'text-max-width': '110px',
          'background-image': (ele: any) => getSvgDataUri(ele.data('type')),
          'background-width': '16px',
          'background-height': '16px',
          'background-fit': 'contain',
          'background-position-x': '50%',
          'background-position-y': '50%',
          'shadow-blur': (ele: any) => {
            if (ele.data('hasAnomaly') || Number(ele.data('anomalyCount') || 0) > 0) return 22;
            const pr = Number(ele.data('pagerank') || 0);
            return pr >= 0.3 ? 20 : 8;
          },
          'shadow-color': (ele: any) => {
            if (ele.data('hasAnomaly') || Number(ele.data('anomalyCount') || 0) > 0) return '#ef4444';
            const bw = Number(ele.data('betweenness') || 0);
            const pr = Number(ele.data('pagerank') || 0);
            if (pr >= 0.3) return '#ef4444';
            if (bw >= 1.0) return '#f59e0b';
            return ele.data('color');
          },
          'shadow-opacity': (ele: any) => {
            if (ele.data('hasAnomaly') || Number(ele.data('anomalyCount') || 0) > 0) return 0.7;
            return 0.35;
          },
          'transition-property': 'background-color, border-color, shadow-color',
          'transition-duration': 0.3
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': lineCol,
          'target-arrow-color': lineCol,
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': showLabels ? 'data(label)' : '',
          'font-size': '9px',
          'font-weight': '600',
          'color': txtColor,
          'text-background-color': bgCol,
          'text-background-opacity': showLabels ? 0.92 : 0,
          'text-background-padding': '2px',
          'text-background-shape': 'roundrectangle',
          'text-border-color': lineCol,
          'text-border-width': showLabels ? 1 : 0,
          'text-border-opacity': 0.4,
          'edge-text-rotation': 'autorotate',
          'transition-property': 'line-color, target-arrow-color, color, text-background-color, text-border-color',
          'transition-duration': 0.3
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-color': hlColor,
          'border-width': 4,
          'width': 60,
          'height': 60,
          'shadow-blur': 25,
          'shadow-color': hlColor,
          'shadow-opacity': 0.8,
          'opacity': 1,
          'z-index': 9999
        }
      },
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.12,
          'label': '' // hide labels of dimmed nodes for clarity
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': hlColor,
          'target-arrow-color': hlColor,
          'width': 3.5,
          'label': 'data(label)',
          'opacity': 1,
          'text-background-opacity': 0.95,
          'text-background-padding': '4px',
          'text-border-width': 1,
          'z-index': 999
        }
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.08
        }
      }
    ];
  };

  // Immediate theme & label synchronization without destroying the graph
  useEffect(() => {
    if (cyRef.current && mounted) {
      cyRef.current.style(getGraphStyle(isDark, showEdgeLabels));
    }
  }, [isDark, showEdgeLabels, mounted]);

  // Main graph initialization and filtering logic
  useEffect(() => {
    if (!mounted || !containerRef.current || loading || !graphData.nodes) return;

    // Filter nodes and edges based on active filters and search
    const filteredNodes = graphData.nodes.filter(n => {
      const passesFilter = activeFilters[n.type] !== false;
      const passesSearch = searchQuery === '' || 
        (n.label?.toLowerCase() || n.id.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        Object.values(n.properties || {}).some(v => String(v).toLowerCase().includes(searchQuery.toLowerCase()));
      return passesFilter && passesSearch;
    });
    
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const nodeLabelMap = new Map(filteredNodes.map(n => [n.id, n.label || n.properties?.id || n.id]));
    const filteredEdges = (graphData.edges || []).filter(e => {
      if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) return false;
      if (e.source === e.target) return false;
      if (e.relationship === 'RESOLVED_TO' || e.relationship === 'OWNS_PHONE') return false;
      const sLbl = nodeLabelMap.get(e.source);
      const tLbl = nodeLabelMap.get(e.target);
      if (sLbl && tLbl && sLbl === tLbl) return false;
      return true;
    });

    const elements: any[] = [];
    filteredNodes.forEach((n: any) => {
      const pr = Number(n.properties?.pagerank || 0);
      const bw = Number(n.properties?.betweenness || 0);
      const hasAnomaly = Boolean(n.hasAnomaly || n.properties?.hasAnomaly);
      const anomalyCount = Number(n.anomalyCount || n.properties?.anomalyCount || (hasAnomaly ? 1 : 0));
      const highestSeverity = n.highestAnomalySeverity || n.properties?.highestAnomalySeverity || null;
      const anomalies = n.anomalies || n.properties?.anomalies || [];
      elements.push({
        data: { 
          id: n.id, 
          label: n.label || n.properties?.id || n.id, 
          type: n.type, 
          properties: n.properties,
          risk: n.properties?.risk_level || (pr >= 0.3 ? 'HIGH' : 'LOW'),
          color: getTypeConfig(n.type).color,
          pagerank: pr,
          betweenness: bw,
          hasAnomaly,
          anomalyCount,
          highestAnomalySeverity: highestSeverity,
          anomalies
        }
      });
    });

    filteredEdges.forEach((e: any) => {
      const props = e.properties || {};
      let edgeLabel = e.relationship || '';
      
      // Enhance relationship label if amount or duration is present
      if (props.amount !== undefined && props.amount !== null && props.amount !== '') {
        const amt = Number(props.amount);
        const formattedAmt = !isNaN(amt)
          ? (amt >= 100000 ? `₹${(amt / 100000).toFixed(1)}L` : `₹${amt.toLocaleString()}`)
          : `₹${props.amount}`;
        edgeLabel = `${e.relationship} (${formattedAmt})`;
      } else if (props.duration !== undefined && props.duration !== null) {
        edgeLabel = `${e.relationship} (${props.duration}s)`;
      } else if (props.call_duration !== undefined && props.call_duration !== null) {
        edgeLabel = `${e.relationship} (${props.call_duration}s)`;
      }

      elements.push({
        data: { 
          id: e.id, 
          source: e.source, 
          target: e.target, 
          label: edgeLabel,
          relationship: e.relationship,
          properties: props 
        }
      });
    });

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const getLayoutConfig = (name: string) => {
      switch (name) {
        case 'fcose':
          return {
            name: 'fcose',
            quality: 'proof',
            randomize: true,
            animate: true,
            animationDuration: 900,
            fit: true,
            padding: 100,
            nodeDimensionsIncludeLabels: true,
            uniformNodeDimensions: false,
            packComponents: true,
            samplingType: true,
            sampleSize: 35,
            nodeRepulsion: (node: any) => {
              const pr = Number(node.data('pagerank') || 0);
              return pr >= 0.3 ? 260000 : 180000;
            },
            idealEdgeLength: () => 320,
            edgeElasticity: 0.45,
            nestingFactor: 0.1,
            gravity: 0.04,
            gravityRange: 1.5,
            gravityCompound: 1.0,
            gravityRangeCompound: 1.5,
            numIter: 2500,
            tile: true,
            tilingPaddingVertical: 100,
            tilingPaddingHorizontal: 100,
            componentSpacing: 280
          };
        case 'cola':
          return {
            name: 'cola',
            animate: true,
            refresh: 1,
            maxSimulationTime: 3000,
            ungrabifyWhileSimulating: false,
            fit: true,
            padding: 90,
            nodeSpacing: () => 75,
            edgeLength: 200,
            convergenceThreshold: 0.01
          };
        case 'dagre':
          return {
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 100,
            rankSep: 140,
            padding: 90,
            fit: true
          };
        case 'concentric':
          return {
            name: 'concentric',
            fit: true,
            padding: 90,
            minNodeSpacing: 80,
            concentric: (node: any) => Number(node.data('pagerank') || 0) * 10
          };
        case 'breadthfirst':
          return {
            name: 'breadthfirst',
            fit: true,
            directed: true,
            padding: 90,
            spacingFactor: 1.75
          };
        default:
          return {
            name: name,
            fit: true,
            padding: 90,
            animate: true,
            animationDuration: 600
          };
      }
    };

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: getGraphStyle(isDark, showEdgeLabels) as any,
      layout: getLayoutConfig(layoutName)
    });

    cyRef.current.on('layoutstop', () => {
      try {
        const pending = pendingFocusRef.current;
        if (pending && (pending.targetId || (pending.targetIds && pending.targetIds.length > 0) || (pending.communityId !== null && pending.communityId !== undefined))) {
          setTimeout(() => {
            applyFocusToGraph(pending.targetId || null, pending.targetIds || null, pending.communityId);
            pendingFocusRef.current = null;
          }, 100);
        } else if (!focusEntityId && (!focusEntityIds || focusEntityIds.length === 0) && (focusCommunityId === null || focusCommunityId === undefined)) {
          cyRef.current?.fit(undefined, 80);
        }
      } catch (err) {
        // Safe recovery
      }
    });

    cyRef.current.on('tap', 'node', (evt: any) => {
      const node = evt.target;
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      const neighborhood = node.union(connectedNodes).union(connectedEdges);
      
      cyRef.current.elements().removeClass('highlighted dimmed');
      cyRef.current.elements().not(neighborhood).addClass('dimmed');
      
      node.addClass('highlighted');
      connectedNodes.addClass('highlighted');
      connectedEdges.addClass('highlighted');
      
      setSelectedNode(node.data());
      setSelectedEdge(null);
      setActiveDrawer('node');
      
      cyRef.current.animate({
        fit: { eles: neighborhood, padding: 90 },
        duration: 500,
        easing: 'ease-out'
      });
    });

    cyRef.current.on('tap', 'edge', (evt: any) => {
      const edge = evt.target;
      const connectedNodes = edge.connectedNodes();
      
      cyRef.current.elements().removeClass('highlighted dimmed');
      cyRef.current.elements().not(edge).not(connectedNodes).addClass('dimmed');
      
      edge.addClass('highlighted');
      connectedNodes.addClass('highlighted');
      
      setSelectedEdge(edge.data());
      setSelectedNode(null);
      setActiveDrawer('edge');
    });

    cyRef.current.on('tap', (evt: any) => {
      if (evt.target === cyRef.current) {
        cyRef.current.elements().removeClass('highlighted dimmed');
        setSelectedNode(null);
        setSelectedEdge(null);
        setActiveDrawer(null);
        setActiveFocusId(null);
        pendingFocusRef.current = null;
      }
    });

  }, [graphData, layoutName, activeFilters, searchQuery]); // Removed isDark to prevent destroy/recreate on theme switch

  const nodeMatches = useCallback((d: any, targetStr: string, targetClean: string) => {
    if (!d) return false;
    const checkVal = (val: any): boolean => {
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) {
        return val.some(item => checkVal(item));
      }
      const s = String(val).toLowerCase().trim();
      if (!s) return false;
      if (s === targetStr) return true;
      if (targetStr.length >= 3 && (s.includes(targetStr) || targetStr.includes(s))) return true;
      const sClean = s.replace(/[^a-z0-9]/g, '');
      if (targetClean.length >= 3 && (sClean.includes(targetClean) || targetClean.includes(sClean))) return true;
      return false;
    };

    const props = d.properties || {};
    return (
      checkVal(d.id) ||
      checkVal(d.label) ||
      checkVal(props.name) ||
      checkVal(props.primary_name) ||
      checkVal(props.golden_id) ||
      checkVal(props.z_cluster_id) ||
      checkVal(props.number) ||
      checkVal(props.phone) ||
      checkVal(props.phones) ||
      checkVal(props.aliases) ||
      checkVal(props.emails) ||
      checkVal(props.account_number) ||
      checkVal(props.account) ||
      checkVal(props.holder) ||
      checkVal(props.handle) ||
      checkVal(props.imei_number) ||
      checkVal(props.tower_id) ||
      checkVal(props.address) ||
      checkVal(props.national_ids)
    );
  }, []);

  const applyFocusToGraph = useCallback((targetId: string | null, targetIds: string[] | null, communityId: any) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // 1. Focus by Community ID
    if (communityId !== null && communityId !== undefined) {
      const commStr = String(communityId).trim();

      // 1.1 "all" community (Entire Case Graph Panorama)
      if (commStr.toLowerCase() === 'all') {
        setActiveFocusId('Entire Case Graph');
        cy.elements().removeClass('dimmed').addClass('highlighted');
        cy.animate({
          fit: { padding: 80 },
          duration: 800,
          easing: 'ease-in-out'
        });
        return;
      }

      // 1.2 Specific community ID
      setActiveFocusId(`Syndicate #${commStr}`);
      let commNodes = cy.nodes().filter((n: any) => {
        const props = n.data('properties') || {};
        return String(props.communityId) === commStr;
      });

      // Fallback: If no nodes match props.communityId === commStr, match via targetIds/member_ids
      if (commNodes.length === 0 && targetIds && targetIds.length > 0) {
        const idSet = new Set(targetIds.map(i => String(i).toLowerCase().trim()));
        commNodes = cy.nodes().filter((n: any) => {
          const d = n.data();
          return Array.from(idSet).some(id => {
            const tStr = id.toLowerCase().trim();
            const tClean = tStr.replace(/[^a-z0-9]/g, '');
            return nodeMatches(d, tStr, tClean);
          });
        });
      }

      if (commNodes.length > 0) {
        // Find all connected edges and connected neighbor nodes (1-hop connected nodes)
        const connectedEdges = commNodes.connectedEdges();
        const connectedNeighbors = connectedEdges.connectedNodes();
        const neighborhood = commNodes.union(connectedNeighbors).union(connectedEdges);

        cy.elements().removeClass('highlighted dimmed');
        // Dim everything outside the neighborhood
        cy.elements().not(neighborhood).addClass('dimmed');

        // Highlight syndicate nodes, connected neighbor nodes, and connecting edges
        commNodes.addClass('highlighted');
        connectedNeighbors.addClass('highlighted');
        connectedEdges.addClass('highlighted');

        cy.animate({
          fit: { eles: neighborhood, padding: 80 },
          duration: 800,
          easing: 'ease-in-out'
        });
        return;
      }
    }

    // 2. Focus by Multiple Entity IDs
    if (targetIds && targetIds.length > 0) {
      const idSet = new Set(targetIds.map(i => String(i).toLowerCase().trim()));
      setActiveFocusId(`${targetIds.length} Entities`);

      const matchedNodes = cy.nodes().filter((n: any) => {
        const d = n.data();
        return Array.from(idSet).some(id => {
          const tStr = id.toLowerCase().trim();
          const tClean = tStr.replace(/[^a-z0-9]/g, '');
          return nodeMatches(d, tStr, tClean);
        });
      });

      if (matchedNodes.length > 0) {
        const connectedEdges = matchedNodes.connectedEdges();
        const connectedNeighbors = connectedEdges.connectedNodes();
        const neighborhood = matchedNodes.union(connectedNeighbors).union(connectedEdges);

        cy.elements().removeClass('highlighted dimmed');
        cy.elements().not(neighborhood).addClass('dimmed');

        matchedNodes.addClass('highlighted');
        connectedNeighbors.addClass('highlighted');
        connectedEdges.addClass('highlighted');

        cy.animate({
          fit: { eles: neighborhood, padding: 80 },
          duration: 800,
          easing: 'ease-in-out'
        });
        return;
      }
    }

    // 3. Focus by Single Entity ID (Pivot to Graph Visualizer)
    if (targetId) {
      setActiveFocusId(targetId);
      let node = cy.getElementById(targetId);
      if (!node || node.length === 0) {
        const targetStr = String(targetId).toLowerCase().trim();
        const targetClean = targetStr.replace(/[^a-z0-9]/g, '');
        node = cy.nodes().filter((n: any) => nodeMatches(n.data(), targetStr, targetClean));
      }

      if (node && node.length > 0) {
        const targetNode = node[0];
        const connectedEdges = targetNode.connectedEdges();
        const connectedNodes = connectedEdges.connectedNodes();
        const neighborhood = targetNode.union(connectedNodes).union(connectedEdges);

        cy.elements().removeClass('highlighted dimmed');
        cy.elements().not(neighborhood).addClass('dimmed');

        targetNode.addClass('highlighted');
        connectedNodes.addClass('highlighted');
        connectedEdges.addClass('highlighted');

        cy.animate({
          fit: { eles: neighborhood, padding: 85 },
          duration: 800,
          easing: 'ease-in-out'
        });

        setSelectedNode(targetNode.data());
        setSelectedEdge(null);
        setActiveDrawer('node');
        return;
      }
    }

    // Fallback: If no target nodes matched, un-dim all and fit canvas
    cy.elements().removeClass('dimmed');
    cy.animate({
      fit: { padding: 80 },
      duration: 600,
      easing: 'ease-in-out'
    });
  }, [nodeMatches]);

  useEffect(() => {
    const hasFocus = Boolean(
      focusEntityId || 
      (focusEntityIds && focusEntityIds.length > 0) || 
      (focusCommunityId !== null && focusCommunityId !== undefined)
    );

    if (hasFocus) {
      // Ensure all node type filters are active and search is cleared so connected notes are visible
      setActiveFilters({
        Person: true, Phone: true, BankAccount: true, Device: true, IMEI: true, SIMCard: true,
        CellTower: true, IPAddress: true, Location: true, SocialAccount: true, 
        Transaction: true, Organization: true, Bank: true, ATM: true, Email: true, Anomaly: true
      });
      setSearchQuery('');

      pendingFocusRef.current = {
        targetId: focusEntityId || null,
        targetIds: focusEntityIds || null,
        communityId: focusCommunityId !== undefined ? focusCommunityId : null
      };

      if (cyRef.current) {
        setTimeout(() => {
          if (cyRef.current) {
            applyFocusToGraph(focusEntityId || null, focusEntityIds || null, focusCommunityId);
          }
        }, 150);
      }
    }
  }, [focusEntityId, focusEntityIds, focusCommunityId, graphData, applyFocusToGraph]);

  const toggleDrawer = (drawer: string) => {
    setActiveDrawer(activeDrawer === drawer ? null : drawer);
  };

  const handleFilterToggle = (type: string) => {
    setActiveFilters(prev => ({...prev, [type]: !prev[type]}));
  };

  return (
    <div className="absolute inset-0 flex bg-background overflow-hidden font-sans">
      {/* Canvas Wrapper - Theme Sync */}
      <div className="flex-1 relative w-full h-full transition-colors duration-300" style={{ backgroundColor: canvasBg }}>
        
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-xl">
              <Network className="w-8 h-8 text-primary animate-pulse" />
              <p className="text-sm font-medium text-foreground">Loading investigation network...</p>
            </div>
          </div>
        )}

        {/* Empty Graph State */}
        {!loading && (!graphData.nodes || graphData.nodes.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="flex flex-col items-center gap-4 bg-card/90 backdrop-blur-md p-8 rounded-2xl border border-border shadow-2xl max-w-md text-center pointer-events-auto">
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                <Network className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">No Graph Topology Yet</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Upload evidence files in the Evidence Intake vault, or click below to synthesize and build the cross-entity graph from ingested canonical events.
                </p>
              </div>
              <button
                onClick={handleSyncGraph}
                disabled={isSyncing}
                className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 mt-2"
              >
                <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                {isSyncing ? "Constructing Graph..." : "Rebuild / Sync Graph Now"}
              </button>
            </div>
          </div>
        )}

        {/* Subgraph Focus Floating Banner */}
        {activeFocusId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-card/90 backdrop-blur-md border border-primary/40 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span className="font-bold text-foreground">Subgraph Focus:</span>
              <span className="font-mono text-primary font-bold">{activeFocusId}</span>
            </div>
            <button
              onClick={() => {
                setActiveFocusId(null);
                onClearFocus?.();
                pendingFocusRef.current = null;
                if (cyRef.current) {
                  cyRef.current.elements().removeClass('highlighted dimmed');
                  cyRef.current.animate({ fit: { padding: 50 }, duration: 500 });
                }
              }}
              className="text-[11px] font-bold bg-secondary hover:bg-secondary/80 text-foreground px-2.5 py-1 rounded-md border border-border flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Reset View
            </button>
          </div>
        )}

        {/* Floating Top Toolbar */}
        <div className="absolute top-4 left-4 flex items-center gap-1 p-1.5 bg-card/80 backdrop-blur-md border border-border rounded-xl shadow-lg z-10 transition-all">
          <div className="relative flex items-center border-r border-border pr-2">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3" />
            <input 
              type="text" 
              placeholder="Search entities, IMEI..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-foreground pl-9 pr-3 py-1.5 w-48 focus:w-64 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <button 
            onClick={() => toggleDrawer('filters')}
            className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ml-1", 
              activeDrawer === 'filters' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Filter className="w-4 h-4" /> Filters
          </button>
          
          <button 
            onClick={() => toggleDrawer('layout')}
            className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2", 
              activeDrawer === 'layout' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Layers className="w-4 h-4" /> Layout
          </button>

          <button 
            onClick={() => setShowEdgeLabels(prev => !prev)}
            className={cn("px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2", 
              showEdgeLabels ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
            title="Toggle Edge Relationship Labels"
          >
            <Tag className="w-4 h-4" /> Edge Labels
          </button>

          <button 
            onClick={handleSyncGraph}
            disabled={isSyncing}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors flex items-center gap-1.5 ml-1 disabled:opacity-50"
            title="Rebuild & Synchronize Graph with Neo4j and Canonical Events"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync Graph"}
          </button>

          <button 
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-2 border-l border-border ml-1 pl-3 disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCcw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Floating Legend / Summary */}
        <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-md border border-border rounded-xl shadow-lg p-4 z-10 hidden md:block w-64">
          <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Network className="w-3.5 h-3.5" /> Network Summary
            </h4>
            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{stats.total} total</span>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(stats.counts).sort((a,b) => b[1] - a[1]).map(([type, count]) => {
              const config = getTypeConfig(type);
              const Icon = config.icon;
              return (
                <div key={type} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                    <span className="text-muted-foreground">{type}</span>
                  </div>
                  <span className="font-semibold text-foreground">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Floating Bottom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
          <div className="flex bg-card/80 backdrop-blur-md border border-border rounded-xl shadow-lg overflow-hidden">
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border-r border-border">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)} className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border-r border-border">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => cyRef.current?.fit()} className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-xs font-bold px-4">
              FIT
            </button>
          </div>
        </div>

        {/* Floating Quick Action Pill for Selected Node */}
        {selectedNode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-md border border-primary/30 rounded-full shadow-2xl px-4 py-1.5 z-10 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground font-medium">Selected:</span>
              <span className="text-xs font-bold text-foreground truncate max-w-[160px]" title={selectedNode.label}>
                {selectedNode.label}
              </span>
            </div>
            <button
              onClick={() => setIsAddRelationModalOpen(true)}
              className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Relation</span>
            </button>
          </div>
        )}

        {/* Floating Feedback Notification */}
        {actionFeedback && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-card/95 border border-emerald-500/40 text-emerald-400 backdrop-blur-md rounded-xl shadow-2xl px-5 py-2.5 z-20 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top duration-300 max-w-lg">
            <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="truncate">{actionFeedback}</span>
            <button onClick={() => setActionFeedback(null)} className="ml-2 hover:opacity-75 text-emerald-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Cytoscape Container */}
        <div ref={containerRef} className="absolute inset-0 z-0" />
      </div>

      {/* Filter Drawer */}
      <Drawer isOpen={activeDrawer === 'filters'} onClose={() => setActiveDrawer(null)} title={<><Filter className="w-4 h-4"/> Entity Filters</>} width="w-80">
        <div className="p-5 space-y-6">
          <div>
            <div className="space-y-2">
              {Object.keys(activeFilters).map(type => {
                const count = stats.counts[type] || 0;
                if (count === 0 && !activeFilters[type]) return null; // hide completely unused filters if off
                const config = getTypeConfig(type);
                const Icon = config.icon;
                return (
                  <label key={type} className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border",
                    activeFilters[type] ? "bg-primary/5 border-primary/20" : "hover:bg-secondary border-transparent opacity-60"
                  )}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={activeFilters[type]} 
                        onChange={() => handleFilterToggle(type)}
                        className="rounded border-border text-primary focus:ring-primary focus:ring-offset-background" 
                      />
                      <Icon className="w-4 h-4" style={{ color: config.color }} />
                      <span className="text-sm font-medium text-foreground">{type}</span>
                    </div>
                    <span className="text-xs font-semibold bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{count}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="pt-4 border-t border-border">
            <button onClick={() => {
              const allOn: Record<string, boolean> = {};
              Object.keys(activeFilters).forEach(k => allOn[k] = true);
              setActiveFilters(allOn);
            }} className="w-full py-2 bg-secondary text-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors border border-border">
              Select All
            </button>
          </div>
        </div>
      </Drawer>

      {/* Layout Drawer */}
      <Drawer isOpen={activeDrawer === 'layout'} onClose={() => setActiveDrawer(null)} title={<><Layers className="w-4 h-4"/> Graph Layout</>} width="w-80">
        <div className="p-5 space-y-3">
          {[
            { id: 'fcose', name: 'Force Directed', desc: 'Prioritizes extreme spacing and natural clusters.' },
            { id: 'dagre', name: 'Hierarchical', desc: 'Arranges relationships directionally top-to-bottom.' },
            { id: 'cola', name: 'Physics (Cola)', desc: 'Constraint-based layout preventing overlaps.' },
            { id: 'concentric', name: 'Concentric', desc: 'Circular rings grouping dense connections.' },
            { id: 'breadthfirst', name: 'Tree', desc: 'Branching tree from central roots.' }
          ].map(layout => (
            <button 
              key={layout.id}
              onClick={() => { setLayoutName(layout.id); setActiveDrawer(null); }}
              className={cn(
                "w-full text-left p-4 rounded-xl border transition-all duration-200",
                layoutName === layout.id 
                  ? "bg-primary/10 border-primary shadow-sm" 
                  : "bg-card border-border hover:border-primary/50 hover:bg-secondary/50"
              )}
            >
              <div className={cn("text-sm font-bold mb-1", layoutName === layout.id ? "text-primary" : "text-foreground")}>{layout.name}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{layout.desc}</div>
            </button>
          ))}
        </div>
      </Drawer>

      {/* Node Details Drawer */}
      <Drawer isOpen={activeDrawer === 'node'} onClose={() => {setActiveDrawer(null); setSelectedNode(null);}} title={<><FileText className="w-4 h-4"/> Entity Profile</>} width="w-96">
        {selectedNode ? (
          <div className="flex flex-col h-full">
            <div className="p-6 bg-card border-b border-border shadow-sm z-10 relative">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg" style={{ backgroundColor: getTypeConfig(selectedNode.type).color }}>
                  {React.createElement(getTypeConfig(selectedNode.type).icon, { className: "w-7 h-7 text-white" })}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h2 className="text-xl font-bold text-foreground leading-tight truncate" title={selectedNode.label}>{selectedNode.label}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[10px] font-bold bg-secondary px-2.5 py-0.5 rounded-full text-muted-foreground uppercase tracking-wider border border-border">
                      {selectedNode.type}
                    </span>
                    {selectedNode.risk === 'HIGH' && (
                      <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2.5 py-0.5 rounded-full border border-destructive/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> HIGH RISK
                      </span>
                    )}
                    {(selectedNode.hasAnomaly || Number(selectedNode.anomalyCount || 0) > 0) && (
                      <span className="text-[10px] font-bold bg-destructive/15 text-destructive px-2.5 py-0.5 rounded-full border border-destructive/30 flex items-center gap-1.5 shadow-sm">
                        <AlertTriangle className="w-3 h-3 text-destructive animate-pulse" /> {Number(selectedNode.anomalyCount || 1)} ANOMALIES
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Algorithmic Intelligence Card */}
              {(selectedNode.properties?.pagerank !== undefined || selectedNode.properties?.betweenness !== undefined || selectedNode.properties?.communityId !== undefined) && (
                <div className="bg-primary/5 rounded-xl border border-primary/20 p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5" /> Graph Intelligence Metrics
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-card p-2 rounded-lg border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase block font-bold">PageRank</span>
                      <span className="text-sm font-black text-red-500 font-mono">
                        {Number(selectedNode.properties?.pagerank || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase block font-bold">Betweenness</span>
                      <span className="text-sm font-black text-amber-500 font-mono">
                        {Number(selectedNode.properties?.betweenness || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase block font-bold">Community</span>
                      <span className="text-sm font-black text-indigo-500 font-mono">
                        #{selectedNode.properties?.communityId ?? selectedNode.properties?.community ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Anomaly Intelligence Card */}
              {(selectedNode.hasAnomaly || Number(selectedNode.anomalyCount || 0) > 0) && (
                <div className="bg-destructive/10 rounded-xl border border-destructive/30 p-4 space-y-3 shadow-md animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" /> Investigative Anomalies Detected
                    </h4>
                    <span className="text-[10px] font-black bg-destructive text-destructive-foreground px-2.5 py-0.5 rounded-full uppercase">
                      {selectedNode.highestAnomalySeverity || 'HIGH'}
                    </span>
                  </div>
                  <div className="text-xs text-foreground/90 font-medium">
                    This entity triggered <strong className="text-destructive font-bold">{selectedNode.anomalyCount || 1}</strong> forensic behavioral or topological {Number(selectedNode.anomalyCount) === 1 ? 'anomaly' : 'anomalies'}.
                  </div>
                  {Array.isArray(selectedNode.anomalies) && selectedNode.anomalies.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {selectedNode.anomalies.map((anom: any, idx: number) => (
                        <div key={idx} className="bg-card/85 border border-destructive/20 rounded-lg p-2.5 text-xs shadow-sm">
                          <div className="flex items-center justify-between font-bold text-foreground">
                            <span>{anom.title || anom.pattern || 'Suspicious Pattern'}</span>
                            <span className="text-[10px] font-mono text-destructive uppercase font-extrabold">{anom.severity}</span>
                          </div>
                          {anom.what_happened && (
                            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{anom.what_happened}</p>
                          )}
                          {anom.anomaly_score !== undefined && (
                            <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1 font-mono">
                              <span>Score:</span>
                              <span className="font-bold text-destructive">{(Number(anom.anomaly_score) * 100).toFixed(0)}%</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Entity Metadata
                </h4>
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                  {Object.entries(selectedNode.properties || {}).map(([k, v]: any, idx) => (
                    <div key={k} className={cn("flex flex-col p-3.5 text-sm hover:bg-secondary/40 transition-colors", idx !== 0 && "border-t border-border")}>
                      <span className="text-xs text-muted-foreground capitalize mb-1">{k.replace(/_/g, ' ')}</span>
                      <span className="text-foreground font-semibold break-all">{String(v)}</span>
                    </div>
                  ))}
                  {Object.keys(selectedNode.properties || {}).length === 0 && (
                    <div className="p-6 text-sm text-muted-foreground text-center">No metadata available</div>
                  )}
                </div>
              </div>
              
              <div className="pt-2 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</h4>
                <button
                  onClick={() => setIsAddRelationModalOpen(true)}
                  className="w-full py-2.5 px-3 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <PlusCircle className="w-4 h-4" /> Add Connected Node & Relation
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button className="py-2.5 px-3 bg-secondary text-foreground text-sm font-semibold rounded-lg hover:bg-secondary/80 transition-colors border border-border flex items-center justify-center gap-2 shadow-sm">
                    <Clock className="w-4 h-4" /> Timeline
                  </button>
                  <button className="py-2.5 px-3 bg-secondary text-foreground text-sm font-semibold rounded-lg hover:bg-secondary/80 transition-colors border border-border flex items-center justify-center gap-2 shadow-sm">
                    <Share2 className="w-4 h-4" /> Network
                  </button>
                  <button className="col-span-2 py-2.5 px-3 bg-secondary text-foreground border border-border text-sm font-semibold rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <AlertTriangle className="w-4 h-4" /> Add to Investigation Case
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-muted-foreground text-center flex flex-col items-center mt-20">
            <Network className="w-10 h-10 mb-4 opacity-20" />
            Select an entity in the graph to view its detailed profile.
          </div>
        )}
      </Drawer>

      {/* Edge Details Drawer */}
      <Drawer isOpen={activeDrawer === 'edge'} onClose={() => {setActiveDrawer(null); setSelectedEdge(null);}} title={<><Share2 className="w-4 h-4"/> Relationship Profile</>} width="w-96">
        {selectedEdge ? (
          <div className="flex flex-col h-full">
            <div className="p-6 bg-card border-b border-border shadow-sm relative z-10">
              <div className="flex items-center justify-between mb-5">
                 <h2 className="text-xl font-black text-foreground uppercase tracking-wider">{selectedEdge.label}</h2>
                 <span className="text-[10px] font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">RELATIONSHIP</span>
              </div>
              <div className="flex items-center justify-between bg-secondary/30 p-4 rounded-xl border border-border shadow-inner">
                <div className="text-center w-[42%] overflow-hidden">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Source Node</div>
                  <div className="text-sm font-bold text-foreground truncate" title={selectedEdge.source}>{selectedEdge.source}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
                <div className="text-center w-[42%] overflow-hidden">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Target Node</div>
                  <div className="text-sm font-bold text-foreground truncate" title={selectedEdge.target}>{selectedEdge.target}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Evidence & Context
                </h4>
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                  {Object.entries(selectedEdge.properties || {}).length > 0 ? (
                    Object.entries(selectedEdge.properties).map(([k, v]: any, idx) => (
                      <div key={k} className={cn("flex flex-col p-3.5 text-sm hover:bg-secondary/40 transition-colors", idx !== 0 && "border-t border-border")}>
                        <span className="text-xs text-muted-foreground capitalize mb-1">{k.replace(/_/g, ' ')}</span>
                        <span className="text-foreground font-semibold break-words">{String(v)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-sm text-muted-foreground text-center">No metadata logged for this relationship.</div>
                  )}
                </div>
              </div>
              
              <div className="pt-2 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</h4>
                <button className="w-full py-3 px-3 bg-secondary text-foreground text-sm font-semibold rounded-lg hover:bg-secondary/80 transition-colors border border-border flex items-center justify-center gap-2 shadow-sm">
                  <FileText className="w-4 h-4" /> View Raw Source Record
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-muted-foreground text-center flex flex-col items-center mt-20">
            <Share2 className="w-10 h-10 mb-4 opacity-20" />
            Select a relationship arrow to view its evidence details.
          </div>
        )}
      </Drawer>

      {/* Add Connected Node & Relation Modal */}
      <AddConnectedNodeModal
        isOpen={isAddRelationModalOpen}
        onClose={() => setIsAddRelationModalOpen(false)}
        sourceNode={selectedNode}
        caseId={activeCase?.case_id || 'default'}
        onSuccess={handleRelationCreated}
      />

    </div>
  );
}

export { GraphTopologyViewer };
