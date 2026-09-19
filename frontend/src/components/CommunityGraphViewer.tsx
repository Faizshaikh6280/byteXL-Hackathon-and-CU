'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Network, ZoomIn, ZoomOut, Maximize, ExternalLink, X, 
  RefreshCw
} from 'lucide-react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import fcose from 'cytoscape-fcose';
import { useTheme } from 'next-themes';
import { apiClient, GraphTopology } from '../services/apiClient';
import { getTypeConfig, getSvgDataUri } from './GraphTopologyViewer';
import { cn } from '../utils/cn';

// Safely register cytoscape layouts
try {
  cytoscape.use(dagre);
  cytoscape.use(cola);
  cytoscape.use(fcose);
} catch {
  // Ignored if already registered
}

interface CommunityGraphViewerProps {
  caseId: string;
  communityId: number | string | null;
  communityName?: string;
  onOpenInMainGraph?: () => void;
}

export default function CommunityGraphViewer({
  caseId,
  communityId,
  communityName,
  onOpenInMainGraph
}: CommunityGraphViewerProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphTopology>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);

  const canvasBg = isDark ? '#020617' : '#f8fafc';
  const edgeColor = isDark ? '#475569' : '#cbd5e1';

  // Fetch community graph topology
  const fetchCommunityGraph = async () => {
    if (!caseId || communityId === null || communityId === undefined) return;
    setLoading(true);
    setSelectedNode(null);
    try {
      const data = await apiClient.getGraphTopology(caseId, communityId);
      setGraphData(data || { nodes: [], edges: [] });
    } catch (err) {
      console.error('Error fetching community graph:', err);
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunityGraph();
  }, [caseId, communityId]);

  // Render Cytoscape Graph
  useEffect(() => {
    if (!containerRef.current || loading) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    if (!graphData.nodes || graphData.nodes.length === 0) {
      return;
    }

    const bgCol = isDark ? '#0f172a' : '#ffffff';
    const txtColor = isDark ? '#e2e8f0' : '#1e293b';
    const lineCol = isDark ? '#64748b' : '#94a3b8';
    const hlColor = '#6366f1';

    const elements: any[] = [];

    graphData.nodes.forEach((n: any) => {
      const pr = Number(n.properties?.pagerank || 0);
      const bw = Number(n.properties?.betweenness || 0);
      elements.push({
        data: {
          id: n.id,
          label: n.label || n.properties?.id || n.id,
          type: n.type,
          properties: n.properties,
          risk: n.properties?.risk_level || (pr >= 0.3 ? 'HIGH' : 'LOW'),
          color: getTypeConfig(n.type).color,
          pagerank: pr,
          betweenness: bw
        }
      });
    });

    graphData.edges.forEach((e: any) => {
      const props = e.properties || {};
      let edgeLabel = e.relationship || '';
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

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'width': (ele: any) => {
              const pr = Number(ele.data('pagerank') || 0);
              return pr >= 0.3 ? 54 : 44;
            },
            'height': (ele: any) => {
              const pr = Number(ele.data('pagerank') || 0);
              return pr >= 0.3 ? 54 : 44;
            },
            'background-color': bgCol,
            'border-width': 2.5,
            'border-color': (ele: any) => ele.data('color'),
            'border-opacity': 0.9,
            'label': 'data(label)',
            'color': txtColor,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'font-size': '10px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '95px',
            'background-image': (ele: any) => getSvgDataUri(ele.data('type')),
            'background-width': '16px',
            'background-height': '16px',
            'background-fit': 'contain',
            'background-position-x': '50%',
            'background-position-y': '50%',
            'shadow-blur': 12,
            'shadow-color': (ele: any) => ele.data('color'),
            'shadow-opacity': 0.3
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
            'label': 'data(label)',
            'font-size': '8px',
            'font-weight': 'bold',
            'color': txtColor,
            'text-background-color': bgCol,
            'text-background-opacity': 0.88,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'text-border-color': lineCol,
            'text-border-width': 1,
            'text-border-opacity': 0.3,
            'edge-text-rotation': 'autorotate'
          }
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': hlColor,
            'border-width': 4,
            'width': 58,
            'height': 58,
            'shadow-blur': 20,
            'shadow-color': hlColor,
            'shadow-opacity': 0.6
          } as any
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.25
          }
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': hlColor,
            'target-arrow-color': hlColor,
            'width': 2.5,
            'z-index': 999
          }
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.15
          }
        }
      ] as any,
      layout: {
        name: 'fcose',
        animate: true,
        animationDuration: 700,
        fit: true,
        padding: 50,
        nodeDimensionsIncludeLabels: true,
        uniformNodeDimensions: false,
        packComponents: true,
        nodeRepulsion: () => 180000,
        idealEdgeLength: () => 180,
        edgeElasticity: 0.45,
        gravity: 0.05,
        numIter: 1500
      } as any
    });

    // Node click handler
    cyRef.current.on('tap', 'node', (evt: any) => {
      const node = evt.target;
      const data = node.data();
      setSelectedNode(data);

      cyRef.current.elements().removeClass('highlighted dimmed');
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      
      cyRef.current.elements().not(node).not(connectedNodes).not(connectedEdges).addClass('dimmed');
      node.addClass('highlighted');
      connectedEdges.addClass('highlighted');
      connectedNodes.addClass('highlighted');
    });

    // Background tap
    cyRef.current.on('tap', (evt: any) => {
      if (evt.target === cyRef.current) {
        cyRef.current.elements().removeClass('highlighted dimmed');
        setSelectedNode(null);
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [graphData, isDark, loading]);

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.elements().removeClass('highlighted dimmed');
      cyRef.current.animate({ fit: { padding: 40 }, duration: 600 });
      setSelectedNode(null);
    }
  };

  if (!communityId && communityId !== 0) {
    return null;
  }

  const nodeCount = graphData.nodes?.length || 0;
  const edgeCount = graphData.edges?.length || 0;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg overflow-hidden flex flex-col transition-all">
      {/* Top Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <span>Syndicate Community Graph Topology</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {nodeCount} Nodes &bull; {edgeCount} Relationships
              </span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Interactive node topology for <span className="font-semibold text-foreground">{communityName || `Cluster #${communityId}`}</span>
            </p>
          </div>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFit}
            title="Fit to Screen"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fetchCommunityGraph}
            title="Reload Community Graph"
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-primary")} />
          </button>

          {onOpenInMainGraph && (
            <button
              onClick={onOpenInMainGraph}
              className="ml-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Show in Main Relationship Graph</span>
            </button>
          )}
        </div>
      </div>

      {/* Graph Visualizer Canvas */}
      <div className="relative w-full h-[360px]" style={{ backgroundColor: canvasBg }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-card rounded-xl border border-border shadow-lg">
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs font-semibold text-foreground">Loading community topology...</span>
            </div>
          </div>
        )}

        {!loading && nodeCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-2">
              <Network className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <h5 className="text-xs font-bold text-foreground">No Subgraph Nodes Available Yet</h5>
              <p className="text-[11px] text-muted-foreground">
                Run the Processing Pipeline or execute GDS community detection to generate this cluster's topology.
              </p>
            </div>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />

        {/* Selected Node Details Floating Panel */}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md bg-card/95 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 text-xs">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: selectedNode.color || '#6366f1' }}
                />
                <div>
                  <span className="font-black text-foreground text-xs block leading-tight">
                    {selectedNode.label || selectedNode.id}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    {selectedNode.type} &bull; ID: {selectedNode.id}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedNode(null);
                  if (cyRef.current) cyRef.current.elements().removeClass('highlighted dimmed');
                }}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px]">
              <div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">PageRank Centrality</span>
                <span className="font-bold text-foreground">
                  {selectedNode.pagerank !== undefined ? Number(selectedNode.pagerank).toFixed(3) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">Betweenness Score</span>
                <span className="font-bold text-foreground">
                  {selectedNode.betweenness !== undefined ? Number(selectedNode.betweenness).toFixed(2) : 'N/A'}
                </span>
              </div>
            </div>

            {selectedNode.properties?.number && (
              <div className="mt-1.5 text-[11px]">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">Phone Number</span>
                <span className="font-mono text-sky-500 font-semibold">{selectedNode.properties.number}</span>
              </div>
            )}
            {selectedNode.properties?.account_number && (
              <div className="mt-1.5 text-[11px]">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">Bank Account</span>
                <span className="font-mono text-emerald-500 font-semibold">{selectedNode.properties.account_number}</span>
              </div>
            )}
            {selectedNode.properties?.handle && (
              <div className="mt-1.5 text-[11px]">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">Social Handle</span>
                <span className="font-mono text-pink-500 font-semibold">{selectedNode.properties.handle}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
