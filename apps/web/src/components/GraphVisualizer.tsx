"use client";

import { useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  Node, Edge, BackgroundVariant, ReactFlowProvider,
  MarkerType, Handle, Position, useNodes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CELL_WIDTH = 280;
const CELL_HEIGHT = 120;

import { routeOrthogonal } from '../lib/orthogonal-router';
import { calculateTransitLayout } from '../lib/transit-layout-engine';

function TransitEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, id }: any) {
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
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    rects,
    20
  );

  let path = `M ${points[0].x},${points[0].y}`;
  const r = 15;
  
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
  
  return <path d={path} style={style} markerEnd={markerEnd} fill="none" />;
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

  return (
    <div style={{
      width: 240,
      height: 80,
      border: '2px solid #58a6ff',
      background: '#0d1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 10px',
      boxSizing: 'border-box',
      textAlign: 'center',
      overflow: 'hidden',
      borderRadius: '4px'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#58a6ff', width: 6, height: 6, border: 'none' }} />

      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: '#e6edf3',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%'
      }}>
        {primary}
      </div>

      {secondary && (
        <div style={{
          fontSize: '10px',
          fontWeight: 400,
          color: '#8b949e',
          marginTop: '4px',
          fontFamily: 'monospace',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          width: '100%'
        }}>
          {secondary}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#58a6ff', width: 6, height: 6, border: 'none' }} />
    </div>
  );
}

const nodeTypes = {
  wireframe: WireframeNode
};

function GraphVisualizerInner({ initialNodes = [], initialEdges = [], gridLayout }: { initialNodes: any[], initialEdges: any[], gridLayout: any }) {
  const [viewLevel, setViewLevel] = useState<'L1' | 'L2'>('L1');

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!gridLayout || !gridLayout.nodes || !gridLayout.edges) {
      return { rfNodes: [], rfEdges: [] };
    }

    // In the future, we will branch here based on viewLevel === 'L2'
    // For now, we always render L1 and lay the groundwork for L2 bounding boxes.
    const nodeDataMap = new Map(initialNodes.map(n => [n.id, n]));

    const NODE_WIDTH = 240;
    const NODE_HEIGHT = 80;
    const offsetX = (CELL_WIDTH - NODE_WIDTH) / 2;
    const offsetY = (CELL_HEIGHT - NODE_HEIGHT) / 2;

    const layoutResult = calculateTransitLayout(gridLayout.nodes, gridLayout.edges);
    
    const mappedNodes: Node[] = layoutResult.nodes.map(n => {
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

    const mappedEdges: Edge[] = gridLayout.edges
      .filter((e: any) => !trayNodeIds.has(e.source) && !trayNodeIds.has(e.target))
      .map((e: any, idx: number) => {
        const isInterface = e.edge_type === 'INTERFACE';
        const isConfig = e.edge_type === 'CONFIG';
        const isDotted = e.is_inferred === true;

        let strokeColor = '#8892b0';
        if (isInterface) strokeColor = '#238636';
        else if (isConfig) strokeColor = '#8957e5';
        else if (isDotted) strokeColor = '#f85149';

        const isDashed = isInterface || isConfig || isDotted;

        return {
          id: `e-${e.source}-${e.target}-${idx}`,
          source: e.source,
          target: e.target,
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

    return { rfNodes: mappedNodes, rfEdges: mappedEdges };
  }, [initialNodes, gridLayout, viewLevel]);

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
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Lines} gap={[CELL_WIDTH, CELL_HEIGHT]} size={1} color="#30363d" />
        <Controls />
        <MiniMap />
        
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
