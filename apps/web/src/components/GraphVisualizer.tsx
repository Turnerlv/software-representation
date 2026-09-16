"use client";

import { useMemo, useState, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  Node, Edge, BackgroundVariant, ReactFlowProvider,
  MarkerType, Handle, Position, useNodes,
  useNodesState, useEdgesState, useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CELL_WIDTH = 340;
const CELL_HEIGHT = 150;

import { routeOrthogonal } from '../lib/orthogonal-router';
import { calculateTransitLayout } from '../lib/transit-layout-engine';

function TransitEdge({ sourcePosition, targetPosition, sourceX, sourceY, targetX, targetY, style, markerEnd, id, selected }: any) {
  const rfNodes = useNodes();
  
  const rects = rfNodes
    .filter(n => n.type === 'wireframe')
    .map(n => ({
      x: n.position.x,
      y: n.position.y,
      width: (n.width as number) || 240,
      height: (n.height as number) || 80
    }));

  const points = routeOrthogonal(
    { x: Math.round(sourceX), y: Math.round(sourceY) },
    { x: Math.round(targetX), y: Math.round(targetY) },
    rects,
    50, // paddingX
    35, // paddingY
    sourcePosition,
    targetPosition
  );

  let path = `M ${points[0].x},${points[0].y}`;
  const r = 15; // corner radius
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    
    if (len1 === 0 || len2 === 0) continue;
    
    const dirX1 = (curr.x - prev.x) / len1;
    const dirY1 = (curr.y - prev.y) / len1;
    const dirX2 = (next.x - curr.x) / len2;
    const dirY2 = (next.y - curr.y) / len2;
    
    const startX = curr.x - dirX1 * Math.min(r, len1 / 2);
    const startY = curr.y - dirY1 * Math.min(r, len1 / 2);
    const endX = curr.x + dirX2 * Math.min(r, len2 / 2);
    const endY = curr.y + dirY2 * Math.min(r, len2 / 2);
    
    path += ` L ${startX},${startY} Q ${curr.x},${curr.y} ${endX},${endY}`;
  }
  
  const last = points[points.length - 1];
  path += ` L ${last.x},${last.y}`;
  
  const strokeColor = selected ? '#ffffff' : (style?.stroke || '#8892b0');
  const strokeWidth = selected ? 4 : (style?.strokeWidth || 2);
  const zIndex = selected ? 1000 : 0;

  return (
    <>
      {/* Invisible thicker path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      <path 
        id={id} 
        d={path} 
        style={{ ...style, stroke: strokeColor, strokeWidth, zIndex }} 
        markerEnd={markerEnd} 
        fill="none" 
      />
    </>
  );
}

const edgeTypes = {
  transit: TransitEdge
};


function GhostNode({ data }: any) {
  const primary = data.label_primary || data.name;
  const secondary = data.label_secondary;
  const status = data.diffStatus; // 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED'

  let borderColor = '#30363d';
  let bgColor = '#0d1117';
  let borderStyle = 'solid';
  let textColor = '#8b949e';

  if (status === 'ADDED') {
    borderColor = '#2ea043';
    bgColor = 'rgba(46, 160, 67, 0.1)';
    borderStyle = 'dashed';
    textColor = '#3fb950';
  } else if (status === 'REMOVED') {
    borderColor = '#f85149';
    bgColor = 'rgba(248, 81, 73, 0.1)';
    borderStyle = 'dotted';
    textColor = '#ff7b72';
  } else if (status === 'MODIFIED') {
    borderColor = '#d29922';
    bgColor = 'rgba(210, 153, 34, 0.1)';
    borderStyle = 'dashed';
    textColor = '#e3b341';
  } else if (status === 'UNCHANGED') {
    borderColor = '#58a6ff';
    textColor = '#e6edf3';
  }

  return (
    <div style={{
      width: 240,
      height: 80,
      border: `2px ${borderStyle} ${borderColor}`,
      background: bgColor,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 10px',
      boxSizing: 'border-box',
      textAlign: 'center',
      overflow: 'hidden',
      borderRadius: '4px',
      opacity: status === 'REMOVED' ? 0.6 : 1
    }}>
      <Handle type="target" position={Position.Left} style={{ background: borderColor, width: 6, height: 6, border: 'none' }} />

      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: textColor,
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%',
        textDecoration: status === 'REMOVED' ? 'line-through' : 'none'
      }}>
        {primary}
      </div>
      
      {secondary && (
        <div style={{
          fontSize: '11px',
          color: status === 'UNCHANGED' ? '#8b949e' : textColor,
          marginTop: '4px',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          width: '100%',
          opacity: 0.8
        }}>
          {secondary}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: borderColor, width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

function WireframeNode({ data }: any) {
  const primary = data.label_primary || data.name;
  const secondary = data.label_secondary;

  const isBackground = data.role === 'BACKGROUND';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: isBackground ? '1px dashed #484f58' : '2px solid #58a6ff',
      background: isBackground ? 'rgba(48, 54, 61, 0.3)' : '#0d1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: isBackground ? 'flex-start' : 'center',
      padding: isBackground ? '12px' : '0 10px',
      boxSizing: 'border-box',
      textAlign: 'center',
      overflow: 'hidden',
      borderRadius: '4px'
    }}>
      {!isBackground && (
        <>
          <Handle type="target" position={Position.Left} id="left-target" style={{ opacity: 0, width: 6, height: 6 }} />
          <Handle type="source" position={Position.Left} id="left-source" style={{ background: '#58a6ff', width: 6, height: 6, border: 'none' }} />
        </>
      )}

      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: isBackground ? '#8b949e' : '#e6edf3',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%',
        marginBottom: isBackground ? 'auto' : 0,
      }}>
        {primary}
      </div>
      
      {secondary && !isBackground && (
        <div style={{
          fontSize: '11px',
          color: '#8b949e',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          width: '100%',
          marginTop: '4px'
        }}>
          {secondary}
        </div>
      )}

      {!isBackground && (
        <>
          <Handle type="source" position={Position.Right} id="right-source" style={{ background: '#58a6ff', width: 6, height: 6, border: 'none' }} />
          <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0, width: 6, height: 6 }} />
        </>
      )}
    </div>
  );
}

const nodeTypes = {
  wireframe: WireframeNode
};

function GraphVisualizerInner({ initialNodes = [], initialEdges = [], gridLayout }: { initialNodes: any[], initialEdges: any[], gridLayout: any }) {
  const [viewLevel, setViewLevel] = useState<'L1' | 'L2'>('L1');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { mappedNodes, mappedEdges } = useMemo(() => {
    if (!gridLayout || !gridLayout.nodes || !gridLayout.edges) {
      return { mappedNodes: [], mappedEdges: [] };
    }

    const nodeDataMap = new Map(initialNodes.map(n => [n.id, n]));

    const NODE_WIDTH = 240;
    const NODE_HEIGHT = 80;
    const offsetX = (CELL_WIDTH - NODE_WIDTH) / 2;
    const offsetY = (CELL_HEIGHT - NODE_HEIGHT) / 2;

    let finalNodes: Node[] = [];
    let finalEdges: Edge[] = [];

    if (viewLevel === 'L1') {
      const layoutResult = calculateTransitLayout(gridLayout.nodes, gridLayout.edges);
      
      finalNodes = layoutResult.nodes.map((n: any) => {
        const dbNode = nodeDataMap.get(n.id);
        const name = dbNode?.name || n.id;
        return {
          id: n.id,
          type: 'wireframe',
          position: { x: n.x + offsetX, y: n.y + offsetY },
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label_primary: n.label_primary,
            label_secondary: n.label_secondary,
            name,
            role: n.role,
          }
        };
      });

      const trayNodeIds = new Set(
        layoutResult.nodes
          .filter((n: any) => n.role === 'TOP_TRAY' || n.role === 'BOTTOM_TRAY')
          .map((n: any) => n.id)
      );

      finalEdges = gridLayout.edges
        .filter((e: any) => !trayNodeIds.has(e.source) && !trayNodeIds.has(e.target))
        .map((e: any, idx: number) => {
          const isInterface = e.edge_type === 'INTERFACE';
          const isConfig = e.edge_type === 'CONFIG';
          const isDotted = e.is_inferred === true;

          let strokeColor = '#8892b0';
          if (isInterface) strokeColor = '#238636';
          else if (isConfig) strokeColor = '#8957e5';
          else if (isDotted) strokeColor = '#f85149';

          const sourceNode = finalNodes.find(n => n.id === e.source);
          const targetNode = finalNodes.find(n => n.id === e.target);
          
          let sourceHandle = 'right-source';
          let targetHandle = 'left-target';

          if (sourceNode && targetNode) {
            if (sourceNode.position.x > targetNode.position.x) {
              sourceHandle = 'right-source';
              targetHandle = 'right-target';
            } else if (sourceNode.position.x === targetNode.position.x) {
              sourceHandle = 'right-source';
              targetHandle = 'right-target';
            }
          }

          const isDashed = isInterface || isConfig || isDotted;

          return {
            id: `e-${e.source}-${e.target}-${idx}`,
            source: e.source,
            sourceHandle,
            target: e.target,
            targetHandle,
            type: 'transit',
            style: {
              stroke: strokeColor,
              strokeWidth: 2,
              ...(isDashed ? { strokeDasharray: '5 5' } : {})
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
            }
          };
        });
    } else {
      // L2 Layout - AI Curated
      const dynamicSizes = new Map<string, { width: number; height: number }>();
      const validL2Nodes = new Set<string>();

      // 1. Determine local sizes based on AI subgraphs
      for (const l1 of gridLayout.nodes) {
        if (l1.role === 'TOP_TRAY' || l1.role === 'BOTTOM_TRAY') continue;
        
        const subgraph = gridLayout.subgraphs?.[l1.id];
        if (!subgraph || !subgraph.nodes || subgraph.nodes.length === 0) continue;

        const localResult = calculateTransitLayout(subgraph.nodes, subgraph.edges);
        
        let maxLocalX = 0;
        let maxLocalY = 0;
        for (const ln of localResult.nodes) {
          maxLocalX = Math.max(maxLocalX, ln.x);
          maxLocalY = Math.max(maxLocalY, ln.y);
          validL2Nodes.add(ln.id);
        }
        
        dynamicSizes.set(l1.id, {
          width: maxLocalX + CELL_WIDTH,
          height: maxLocalY + CELL_HEIGHT
        });
      }

      // 2. Global L1 Layout using dynamic sizes
      const l1Result = calculateTransitLayout(gridLayout.nodes, gridLayout.edges, { dynamicSizes });

      // 3. Construct Absolute Nodes using Group plots
      for (const l1 of l1Result.nodes) {
        if (l1.role === 'TOP_TRAY' || l1.role === 'BOTTOM_TRAY') continue;
        
        const size = dynamicSizes.get(l1.id);
        const subgraph = gridLayout.subgraphs?.[l1.id];

        if (size && subgraph) {
          // Render L1 as a Group Plot background
          finalNodes.push({
            id: l1.id,
            type: 'group',
            position: { x: l1.x, y: l1.y },
            style: {
              width: size.width,
              height: size.height,
              background: 'rgba(35, 134, 54, 0.05)',
              border: '2px solid rgba(35, 134, 54, 0.4)',
              borderRadius: '8px',
              zIndex: -1,
            },
            data: { label: l1.label_primary }
          });
          
          // Add a custom label node for the group (since group nodes don't easily style their labels at the top)
          finalNodes.push({
            id: `${l1.id}-label`,
            type: 'default',
            position: { x: l1.x + 16, y: l1.y + 16 },
            style: {
              background: 'transparent',
              border: 'none',
              color: '#2ea043',
              fontSize: '18px',
              fontWeight: 'bold',
              boxShadow: 'none',
              zIndex: -1
            },
            data: { label: l1.label_primary }
          });

          // Render internal L2 nodes at absolute coordinates
          const localResult = calculateTransitLayout(subgraph.nodes, subgraph.edges);
          for (const ln of localResult.nodes) {
            finalNodes.push({
              id: ln.id,
              type: 'wireframe',
              position: { 
                x: l1.x + ln.x + offsetX, 
                y: l1.y + ln.y + offsetY 
              },
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
              data: {
                label_primary: ln.label_primary,
                label_secondary: ln.domain,
                name: ln.label_primary,
                role: ln.role,
              },
              style: { zIndex: 10 }
            });
          }
        } else {
          // Fallback if no L2 children
          finalNodes.push({
            id: l1.id,
            type: 'wireframe',
            position: { x: l1.x + offsetX, y: l1.y + offsetY },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: {
              label_primary: l1.label_primary,
              role: l1.role,
            }
          });
        }
      }

      // 4. Construct granular L2 edges (using AI-curated edges)
      for (const l1 of gridLayout.nodes) {
        const subgraph = gridLayout.subgraphs?.[l1.id];
        if (!subgraph) continue;

        for (const [idx, e] of subgraph.edges.entries()) {
          const isInterface = e.edge_type === 'INTERFACE';
          const isConfig = e.edge_type === 'CONFIG';
          const isDashed = isInterface || isConfig;

          let strokeColor = '#8892b0';
          if (isInterface) strokeColor = '#238636';
          else if (isConfig) strokeColor = '#8957e5';

          const sourceNode = finalNodes.find(n => n.id === e.source);
          const targetNode = finalNodes.find(n => n.id === e.target);
          
          let sourceHandle = 'right-source';
          let targetHandle = 'left-target';

          if (sourceNode && targetNode) {
            if (sourceNode.position.x > targetNode.position.x) {
              sourceHandle = 'right-source';
              targetHandle = 'right-target';
            } else if (sourceNode.position.x === targetNode.position.x) {
              sourceHandle = 'right-source';
              targetHandle = 'right-target';
            }
          }

          finalEdges.push({
            id: `e-l2-${l1.id}-${e.source}-${e.target}-${idx}`,
            source: e.source,
            sourceHandle,
            target: e.target,
            targetHandle,
            type: 'transit',
            style: {
              stroke: strokeColor,
              strokeWidth: 2,
              ...(isDashed ? { strokeDasharray: '5 5' } : {})
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
            }
          });
        }
      }
    }

    return { mappedNodes: finalNodes, mappedEdges: finalEdges };
  }, [initialNodes, initialEdges, gridLayout, viewLevel]);

  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(mappedNodes);
    setEdges(mappedEdges);
    
    // Smoothly animate the camera to frame the new layout when viewLevel changes
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 50);
  }, [mappedNodes, mappedEdges, setNodes, setEdges, fitView, viewLevel]);

  if (!gridLayout) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#c9d1d9' }}>
        <p style={{ fontFamily: 'sans-serif' }}>No grid_layout.json found. Please run the AI layout generator tool.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Lines} gap={[CELL_WIDTH, CELL_HEIGHT]} size={1} color="#30363d" />
        <Controls />
        <MiniMap 
          nodeColor={(n: any) => {
            if (n.type === 'group') return '#2ea043';
            if (n.data?.role === 'TOP_TRAY' || n.data?.role === 'BOTTOM_TRAY') return '#8957e5';
            return '#58a6ff';
          }}
          maskColor="rgba(13, 17, 23, 0.7)"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
        />
        
        <Panel position="top-right" style={{ background: '#161b22', padding: '8px', borderRadius: '6px', border: '1px solid #30363d', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewLevel('L1')}
            style={{ 
              background: viewLevel === 'L1' ? '#238636' : 'transparent', 
              color: viewLevel === 'L1' ? '#fff' : '#8b949e',
              border: viewLevel === 'L1' ? '1px solid #2ea043' : '1px solid #30363d',
              padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600
            }}
          >
            L1 (Packages)
          </button>
          <button
            onClick={() => setViewLevel('L2')}
            style={{ 
              background: viewLevel === 'L2' ? '#238636' : 'transparent', 
              color: viewLevel === 'L2' ? '#fff' : '#8b949e',
              border: viewLevel === 'L2' ? '1px solid #2ea043' : '1px solid #30363d',
              padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600
            }}
          >
            L2 (Internals)
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function GraphVisualizer(props: any) {
  return (
    <ReactFlowProvider>
      <GraphVisualizerInner {...props} />
    </ReactFlowProvider>
  );
}
