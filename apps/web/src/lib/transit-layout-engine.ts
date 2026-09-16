export const CELL_WIDTH = 340;
export const CELL_HEIGHT = 150;
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 80;

export interface LayoutNode {
  id: string;
  domain?: string;
  role: string;
  label_primary: string;
  label_secondary?: string;
  // internal fields added by engine
  _depth?: number;
  _row?: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
  edge_type: 'DATA_FLOW' | 'INTERFACE' | 'CONFIG';
  is_inferred?: boolean;
}

export interface LayoutResult {
  nodes: (LayoutNode & { x: number; y: number })[];
  edges: LayoutEdge[];
}

export interface LayoutOptions {
  dynamicSizes?: Map<string, { width: number; height: number }>;
}

export function calculateTransitLayout(nodes: LayoutNode[], edges: LayoutEdge[], options?: LayoutOptions): LayoutResult {
  // 1. Calculate Bellman-Ford depth using ONLY DATA_FLOW edges.
  const calculatedDepth = new Map<string, number>();
  for (const n of nodes) {
    calculatedDepth.set(n.id, n.role === 'INGRESS' ? 0 : -1);
  }

  const numNodes = nodes.length;
  for (let i = 0; i < numNodes; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.edge_type === 'INTERFACE' || e.edge_type === 'CONFIG') continue;

      const uDepth = calculatedDepth.get(e.source) ?? -1;
      const vDepth = calculatedDepth.get(e.target) ?? -1;
      if (uDepth !== -1) {
        const candidate = uDepth + 1;
        if (candidate > vDepth) {
          calculatedDepth.set(e.target, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const n of nodes) {
    if ((calculatedDepth.get(n.id) ?? -1) === -1) {
      calculatedDepth.set(n.id, 0);
    }
    n._depth = calculatedDepth.get(n.id) ?? 0;
  }

  // 1.5 Inject Dummy Nodes for long edges (Sugiyama segmentation)
  const layoutNodes = [...nodes];
  const layoutEdges: LayoutEdge[] = [];

  for (const e of edges) {
    const u = nodes.find(n => n.id === e.source);
    const v = nodes.find(n => n.id === e.target);
    if (!u || !v) {
      layoutEdges.push(e);
      continue;
    }
    
    const dU = u._depth!;
    const dV = v._depth!;
    
    if (Math.abs(dU - dV) > 1) {
      const step = dU < dV ? 1 : -1;
      let prevId = e.source;
      
      for (let d = dU + step; d !== dV; d += step) {
        const dummyId = `__dummy_${e.source}_${e.target}_${d}`;
        layoutNodes.push({
          id: dummyId,
          role: 'DUMMY',
          label_primary: '',
          _depth: d
        });
        
        layoutEdges.push({
          source: prevId,
          target: dummyId,
          edge_type: e.edge_type
        });
        prevId = dummyId;
      }
      
      layoutEdges.push({
        source: prevId,
        target: e.target,
        edge_type: e.edge_type
      });
    } else {
      layoutEdges.push(e);
    }
  }

  // 2. Barycenter Layout (Center of Gravity) - Global Pass
  const depthGroups = new Map<number, LayoutNode[]>();
  let maxDepth = 0;
  for (const n of layoutNodes) {
    const d = n._depth!;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(n);
    if (d > maxDepth) maxDepth = d;
  }

  const rowAssignments = new Map<string, number>();
  for (const n of layoutNodes) rowAssignments.set(n.id, 0);

  let maxGlobalRow = 0;

  for (let pass = 1; pass <= 3; pass++) {
    const isForward = pass % 2 !== 0; // Pass 1 and 3 are forward
    maxGlobalRow = 0;
    
    const startD = isForward ? 0 : maxDepth;
    const endD = isForward ? maxDepth : 0;
    const step = isForward ? 1 : -1;

    for (let d = startD; d !== endD + step; d += step) {
      const siblings = depthGroups.get(d) || [];
      if (siblings.length === 0) continue;

      const barycenters = new Map<string, number>();

      for (const n of siblings) {
        const connectedEdges = layoutEdges.filter(e => {
          if (isForward) {
            return e.target === n.id && (layoutNodes.find(ln => ln.id === e.source)?._depth ?? 0) < d;
          } else {
            return e.source === n.id && (layoutNodes.find(ln => ln.id === e.target)?._depth ?? 0) > d;
          }
        });

        if (connectedEdges.length > 0) {
          let sum = 0;
          let count = 0;
          for (const e of connectedEdges) {
            const neighborId = isForward ? e.source : e.target;
            const neighborRow = rowAssignments.get(neighborId);
            if (neighborRow !== undefined) {
              sum += neighborRow;
              count++;
            }
          }
          if (count > 0) {
            barycenters.set(n.id, sum / count);
          } else {
            barycenters.set(n.id, maxGlobalRow + 0.1);
          }
        } else {
          // Keep current assignment if no neighbors in this direction
          barycenters.set(n.id, rowAssignments.get(n.id) ?? (maxGlobalRow + 0.1));
        }
      }

      // Sort siblings by their ideal barycenter
      siblings.sort((a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0));

      const takenRows = new Set<number>();
      for (const n of siblings) {
        let targetRow = Math.round(barycenters.get(n.id) ?? 0);
        // Collision resolution: push down until we find an empty row in this depth
        while (takenRows.has(targetRow)) {
          targetRow++;
        }
        takenRows.add(targetRow);
        rowAssignments.set(n.id, targetRow);
        
        if (targetRow > maxGlobalRow) {
          maxGlobalRow = targetRow;
        }
      }
    }
  }

  const positionedNodes: (LayoutNode & { x: number; y: number; width?: number; height?: number })[] = [];
  
  // First pass: compute maximum widths and heights for each row and column
  const colWidths = new Map<number, number>();
  const rowHeights = new Map<number, number>();

  for (const n of layoutNodes) {
    if (n.role === 'DUMMY') continue;
    const d = n._depth!;
    const r = rowAssignments.get(n.id) ?? 0;
    
    let w = CELL_WIDTH;
    let h = CELL_HEIGHT;
    
    if (options?.dynamicSizes?.has(n.id)) {
      const size = options.dynamicSizes.get(n.id)!;
      // Add 100px padding between dynamic L1 boxes
      w = Math.max(w, size.width + 100);
      h = Math.max(h, size.height + 100);
    }
    
    colWidths.set(d, Math.max(colWidths.get(d) ?? CELL_WIDTH, w));
    rowHeights.set(r, Math.max(rowHeights.get(r) ?? CELL_HEIGHT, h));
  }

  // Calculate cumulative physical offsets for the dynamic grid
  const colOffsets = new Map<number, number>();
  let currentX = 0;
  for (let d = 0; d <= maxDepth; d++) {
    colOffsets.set(d, currentX);
    currentX += colWidths.get(d) ?? CELL_WIDTH;
  }

  const rowOffsets = new Map<number, number>();
  let currentY = 0;
  for (let r = 0; r <= maxGlobalRow; r++) {
    rowOffsets.set(r, currentY);
    currentY += rowHeights.get(r) ?? CELL_HEIGHT;
  }

  // Assign final coordinates (skipping DUMMY nodes so they just leave empty grid spaces)
  for (const n of layoutNodes) {
    if (n.role === 'DUMMY') continue;
    const d = n._depth!;
    const r = rowAssignments.get(n.id) ?? 0;
    
    const isTopTray = n.role === 'TOP_TRAY';
    const isBottomTray = n.role === 'BOTTOM_TRAY';
    
    const x = colOffsets.get(d) ?? (d * CELL_WIDTH);
    let y = rowOffsets.get(r) ?? (r * CELL_HEIGHT);
    
    if (isTopTray) y = -CELL_HEIGHT;
    if (isBottomTray) y = currentY + CELL_HEIGHT;
    
    const nodeObj: any = { ...n, x, y };
    if (options?.dynamicSizes?.has(n.id)) {
      const size = options.dynamicSizes.get(n.id)!;
      nodeObj.width = size.width;
      nodeObj.height = size.height;
    }
    
    positionedNodes.push(nodeObj);
  }

  return {
    nodes: positionedNodes,
    edges
  };
}
