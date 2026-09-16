const fs = require('fs');

const gridLayout = JSON.parse(fs.readFileSync('.chomp/grid_layout.json', 'utf8'));
const nodes = gridLayout.nodes;
const edges = gridLayout.edges;

const calculatedDepth = new Map();
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

const layoutNodes = [...nodes];
const layoutEdges = [];

for (const e of edges) {
  const u = nodes.find(n => n.id === e.source);
  const v = nodes.find(n => n.id === e.target);
  if (!u || !v) {
    layoutEdges.push(e);
    continue;
  }
  
  const dU = u._depth;
  const dV = v._depth;
  
  if (Math.abs(dU - dV) > 1) {
    const step = dU < dV ? 1 : -1;
    let prevId = e.source;
    
    for (let d = dU + step; d !== dV; d += step) {
      const dummyId = `__dummy_${e.source}_${e.target}_${d}`;
      layoutNodes.push({
        id: dummyId,
        role: 'DUMMY',
        label_primary: `DUMMY-${e.source}->${e.target}`,
        _depth: d
      });
      layoutEdges.push({ source: prevId, target: dummyId, edge_type: e.edge_type });
      prevId = dummyId;
    }
    layoutEdges.push({ source: prevId, target: e.target, edge_type: e.edge_type });
  } else {
    layoutEdges.push(e);
  }
}

const depthGroups = new Map();
let maxDepth = 0;
for (const n of layoutNodes) {
  const d = n._depth;
  if (!depthGroups.has(d)) depthGroups.set(d, []);
  depthGroups.get(d).push(n);
  if (d > maxDepth) maxDepth = d;
}

const rowAssignments = new Map();
for (const n of layoutNodes) rowAssignments.set(n.id, 0);
let maxGlobalRow = 0;

for (let pass = 1; pass <= 3; pass++) {
  const isForward = pass % 2 !== 0;
  maxGlobalRow = 0;
  
  const startD = isForward ? 0 : maxDepth;
  const endD = isForward ? maxDepth : 0;
  const step = isForward ? 1 : -1;

  for (let d = startD; d !== endD + step; d += step) {
    const siblings = depthGroups.get(d) || [];
    if (siblings.length === 0) continue;

    const barycenters = new Map();
    for (const n of siblings) {
      const connectedEdges = layoutEdges.filter(e => {
        if (isForward) {
          return e.target === n.id && (layoutNodes.find(ln => ln.id === e.source)?._depth ?? 0) < d;
        } else {
          return e.source === n.id && (layoutNodes.find(ln => ln.id === e.target)?._depth ?? 0) > d;
        }
      });

      if (connectedEdges.length > 0) {
        let sum = 0; let count = 0;
        for (const e of connectedEdges) {
          const neighborId = isForward ? e.source : e.target;
          const neighborRow = rowAssignments.get(neighborId);
          if (neighborRow !== undefined) {
            sum += neighborRow; count++;
          }
        }
        if (count > 0) barycenters.set(n.id, sum / count);
        else barycenters.set(n.id, maxGlobalRow + 0.1);
      } else {
        barycenters.set(n.id, rowAssignments.get(n.id) ?? (maxGlobalRow + 0.1));
      }
    }

    siblings.sort((a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0));

    const takenRows = new Set();
    for (const n of siblings) {
      let targetRow = Math.round(barycenters.get(n.id) ?? 0);
      while (takenRows.has(targetRow)) targetRow++;
      takenRows.add(targetRow);
      rowAssignments.set(n.id, targetRow);
      if (targetRow > maxGlobalRow) maxGlobalRow = targetRow;
    }
  }
}

console.log("=== Final Layout ===");
for (const n of layoutNodes) {
  console.log(`Node: ${n.label_primary.padEnd(30)} | Col: ${n._depth} | Row: ${rowAssignments.get(n.id)}`);
}
