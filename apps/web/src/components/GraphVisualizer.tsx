"use client";

import { useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  Node, Edge, BackgroundVariant, ReactFlowProvider,
  MarkerType, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CELL_WIDTH = 280;
const CELL_HEIGHT = 120;


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

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!gridLayout || !gridLayout.nodes || !gridLayout.edges) {
      return { rfNodes: [], rfEdges: [] };
    }

    const nodeDataMap = new Map(initialNodes.map(n => [n.id, n]));

    const NODE_WIDTH = 240;
    const NODE_HEIGHT = 80;
    const offsetX = (CELL_WIDTH - NODE_WIDTH) / 2;
    const offsetY = (CELL_HEIGHT - NODE_HEIGHT) / 2;

    // 1. Calculate Dynamic Topological Depth
    const inDegree = new Map<string, number>();

    for (const n of gridLayout.nodes) {
      inDegree.set(n.id, 0);
    }
    for (const e of gridLayout.edges) {
      if (inDegree.has(e.target)) {
        inDegree.set(e.target, inDegree.get(e.target)! + 1);
      }
    }

    const calculatedDepth = new Map<string, number>();
    for (const n of gridLayout.nodes) {
      if (inDegree.get(n.id) === 0 || n.role === 'INGRESS') {
        calculatedDepth.set(n.id, 0);
      } else {
        calculatedDepth.set(n.id, -1);
      }
    }

    // Bellman-Ford longest path relaxation
    const numNodes = gridLayout.nodes.length;
    for (let i = 0; i < numNodes; i++) {
      let changed = false;
      for (const e of gridLayout.edges) {
        const u = e.source;
        const v = e.target;
        if (calculatedDepth.has(u) && calculatedDepth.has(v)) {
          if (calculatedDepth.get(u)! !== -1) {
            const newDepth = calculatedDepth.get(u)! + 1;
            if (newDepth > calculatedDepth.get(v)!) {
              calculatedDepth.set(v, newDepth);
              changed = true;
            }
          }
        }
      }
      if (!changed) break;
    }

    let currentMaxDepth = 0;
    for (const n of gridLayout.nodes) {
      if (calculatedDepth.get(n.id) === -1) {
        calculatedDepth.set(n.id, 0);
      }
      if (calculatedDepth.get(n.id)! > currentMaxDepth) {
        currentMaxDepth = calculatedDepth.get(n.id)!;
      }
    }

    const finalMaxDepth = currentMaxDepth + 1;
    for (const n of gridLayout.nodes) {
      if (n.role === 'EGRESS') {
        calculatedDepth.set(n.id, finalMaxDepth);
      }
    }

    const laneGroups = new Map<number, any[]>();
    for (const n of gridLayout.nodes) {
      let sortKey = n.lane || 0;
      if (n.role === 'TOP_TRAY') sortKey = -9999;
      if (n.role === 'BOTTOM_TRAY') sortKey = 9999;

      if (!laneGroups.has(sortKey)) {
        laneGroups.set(sortKey, []);
      }
      laneGroups.get(sortKey)!.push(n);
    }

    const sortedLanes = Array.from(laneGroups.entries()).sort((a, b) => a[0] - b[0]);

    let currentY = 0;
    const rfNodes: Node[] = [];

    for (const [sortKey, laneNodes] of sortedLanes) {
      const depthGroups = new Map<number, any[]>();
      for (const n of laneNodes) {
        const d = calculatedDepth.get(n.id) || 0;
        if (!depthGroups.has(d)) depthGroups.set(d, []);
        depthGroups.get(d)!.push(n);
      }

      let maxSiblings = 1;
      for (const siblings of depthGroups.values()) {
        if (siblings.length > maxSiblings) {
          maxSiblings = siblings.length;
        }
      }

      for (const [depth, siblings] of depthGroups.entries()) {
        siblings.forEach((n: any, siblingIndex: number) => {
          let x = depth * CELL_WIDTH;
          if (n.role === 'EGRESS') {
            x = finalMaxDepth * CELL_WIDTH;
          }

          let y = currentY + (siblingIndex * CELL_HEIGHT);

          const dbNode = nodeDataMap.get(n.id);
          const name = dbNode?.name || n.id;

          rfNodes.push({
            id: n.id,
            type: 'wireframe',
            position: { x: x + offsetX, y: y + offsetY },
            data: {
              label_primary: n.label_primary,
              label_secondary: n.label_secondary,
              name,
              role: n.role
            }
          });
        });
      }

      currentY += (maxSiblings * CELL_HEIGHT) + 50;
    }

    const trayNodeIds = new Set(
      gridLayout.nodes
        .filter((n: any) => n.role === 'TOP_TRAY' || n.role === 'BOTTOM_TRAY')
        .map((n: any) => n.id)
    );

    const rfEdges: Edge[] = gridLayout.edges
      .filter((e: any) => !trayNodeIds.has(e.source) && !trayNodeIds.has(e.target))
      .map((e: any, idx: number) => {
      const isDotted = e.is_inferred === true;
      const strokeColor = isDotted ? '#f85149' : '#8892b0';
      return {
        id: `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        type: 'step',
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
          ...(isDotted ? { strokeDasharray: '5 5' } : {})
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        }
      };
    });

    return { rfNodes, rfEdges };
  }, [initialNodes, gridLayout]);

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
        fitView
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Lines} gap={[CELL_WIDTH, CELL_HEIGHT]} size={1} color="#30363d" />
        <Controls />
        <MiniMap />
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
