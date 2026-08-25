"use client";

import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const nodeWidth = 280;
const nodeHeight = 60;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 200 });

  const nodeIds = new Set(nodes.map(n => n.id));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    // If it has a parent, tell Dagre to group them
    if (node.parentId && nodeIds.has(node.parentId)) {
      dagreGraph.setParent(node.id, node.parentId);
    }
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // React Flow expects child nodes to have positions *relative* to their parent.
    // Dagre returns absolute positions. If a node has a parent, we let React Flow 
    // handle the relative positioning by just stacking them dynamically.
    if (node.parentId) {
      return node; 
    }

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function GraphVisualizer({ initialNodes, initialEdges }: { initialNodes: any[], initialEdges: any[] }) {
  
  const { nodes, edges } = useMemo(() => {
    
    // 1. Map Nodes and setup Hierarchy
    const rfNodes: Node[] = initialNodes.map(n => {
      const isBoundary = n.type === 'BOUNDARY';
      const isContract = n.type === 'CONTRACT';
      
      let bgColor = isBoundary ? '#f8fafc' : isContract ? '#dbeafe' : '#fee2e2';
      let borderColor = isBoundary ? '#cbd5e1' : isContract ? '#60a5fa' : '#f87171';

      // If it's a Boundary (File/Module), make it a "group" node
      const isGroup = isBoundary && initialNodes.some(child => child.parentBoundaryId === n.id);

      return {
        id: n.id,
        type: isGroup ? 'group' : 'default',
        data: { label: n.name },
        parentId: n.parentBoundaryId || undefined,
        extent: n.parentBoundaryId ? 'parent' : undefined, // Keep children inside parents
        position: { x: 10, y: 30 }, // Default relative position for children
        style: isGroup ? {
          width: 300,
          height: 200, // Fixed height for groups for now
          backgroundColor: 'rgba(248, 250, 252, 0.5)',
          border: '2px dashed #cbd5e1',
          zIndex: -1
        } : { 
          background: bgColor,
          border: `2px solid ${borderColor}`,
          borderRadius: '8px',
          padding: '10px',
          fontSize: '10px',
          fontWeight: 'bold',
          width: nodeWidth,
          zIndex: 10
        }
      };
    });

    // 2. Map Edges (CRITICAL: Filter out edges with no target!)
    const validEdges = initialEdges.filter(e => e.sourceId && e.targetId);
    
    const rfEdges: Edge[] = validEdges.map(e => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      label: e.entityType,
      animated: e.type === 'RELATIONSHIP' && e.entityType === 'CALL',
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    }));

    // 3. Layout
    return getLayoutedElements(rfNodes, rfEdges);
  }, [initialNodes, initialEdges]);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f1f5f9' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right">
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap zoomable pannable nodeColor={(n) => n.style?.background as string} />
      </ReactFlow>
    </div>
  );
}