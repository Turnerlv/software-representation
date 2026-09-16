export const CELL_WIDTH = 280;
export const CELL_HEIGHT = 120;
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

export function calculateTransitLayout(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutResult {
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

  // 2. Group nodes by Domain
  const domainGroups = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    let key = n.domain ?? 'Default';
    if (n.role === 'TOP_TRAY') key = '__TOP_TRAY__';
    if (n.role === 'BOTTOM_TRAY') key = '__BOTTOM_TRAY__';
    if (!domainGroups.has(key)) domainGroups.set(key, []);
    domainGroups.get(key)!.push(n);
  }

  const sortedDomains = Array.from(domainGroups.keys()).sort((a, b) => {
    if (a === '__TOP_TRAY__') return -1;
    if (b === '__TOP_TRAY__') return 1;
    if (a === '__BOTTOM_TRAY__') return 1;
    if (b === '__BOTTOM_TRAY__') return -1;
    return a.localeCompare(b);
  });

  // 3. Barycenter Layout (Center of Gravity)
  let currentDomainStartY = 0;
  const positionedNodes: (LayoutNode & { x: number; y: number })[] = [];

  for (const domain of sortedDomains) {
    const domainNodes = domainGroups.get(domain)!;
    
    // Group by Depth
    const depthGroups = new Map<number, LayoutNode[]>();
    let maxDepth = 0;
    for (const n of domainNodes) {
      const d = n._depth!;
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(n);
      if (d > maxDepth) maxDepth = d;
    }

    const rowAssignments = new Map<string, number>(); // node.id -> exact row integer
    let maxRowInDomain = 0;

    for (let d = 0; d <= maxDepth; d++) {
      const siblings = depthGroups.get(d) || [];
      if (siblings.length === 0) continue;

      const barycenters = new Map<string, number>();

      for (const n of siblings) {
        // Find DATA_FLOW parents from ANY depth strictly less than d
        const parents = edges.filter(
          e => e.target === n.id && e.edge_type === 'DATA_FLOW' && (calculatedDepth.get(e.source) ?? 0) < d
        );

        if (parents.length > 0) {
          let sum = 0;
          let count = 0;
          for (const p of parents) {
            const pRow = rowAssignments.get(p.source);
            if (pRow !== undefined) {
              sum += pRow;
              count++;
            }
          }
          if (count > 0) {
            barycenters.set(n.id, sum / count);
          } else {
            barycenters.set(n.id, maxRowInDomain + 0.1); // Fallback below existing
          }
        } else {
          barycenters.set(n.id, maxRowInDomain + 0.1);
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
        
        if (targetRow > maxRowInDomain) {
          maxRowInDomain = targetRow;
        }
      }
    }

    // Assign final coordinates for this domain
    for (const n of domainNodes) {
      const d = n._depth!;
      const r = rowAssignments.get(n.id) ?? 0;
      
      const x = d * CELL_WIDTH;
      const y = currentDomainStartY + (r * CELL_HEIGHT);
      
      positionedNodes.push({
        ...n,
        x,
        y
      });
    }

    // Advance Y space for the next domain
    // Add an extra 50px gap between domains
    currentDomainStartY += (maxRowInDomain + 1) * CELL_HEIGHT + 50;
  }

  return {
    nodes: positionedNodes,
    edges
  };
}
