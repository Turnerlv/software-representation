import fs from 'fs';

// Mock the layout engine logic to see exactly what it's doing
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

const depthGroups = new Map();
let maxDepth = 0;
for (const n of nodes) {
  const d = calculatedDepth.get(n.id) ?? 0;
  n._depth = d;
  if (!depthGroups.has(d)) depthGroups.set(d, []);
  depthGroups.get(d).push(n);
  if (d > maxDepth) maxDepth = d;
}

const rowAssignments = new Map(); 
let maxGlobalRow = 0;

for (let d = 0; d <= maxDepth; d++) {
  const siblings = depthGroups.get(d) || [];
  if (siblings.length === 0) continue;

  const barycenters = new Map();
  for (const n of siblings) {
    const parents = edges.filter(
      e => e.target === n.id && e.edge_type === 'DATA_FLOW' && (calculatedDepth.get(e.source) ?? 0) < d
    );
    if (parents.length > 0) {
      let sum = 0; let count = 0;
      for (const p of parents) {
        const pRow = rowAssignments.get(p.source);
        if (pRow !== undefined) {
          sum += pRow; count++;
        }
      }
      if (count > 0) {
        barycenters.set(n.id, sum / count);
      } else {
        barycenters.set(n.id, maxGlobalRow + 0.1);
      }
    } else {
      barycenters.set(n.id, maxGlobalRow + 0.1);
    }
  }

  siblings.sort((a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0));

  const takenRows = new Set();
  for (const n of siblings) {
    let targetRow = Math.round(barycenters.get(n.id) ?? 0);
    while (takenRows.has(targetRow)) {
      targetRow++;
    }
    takenRows.add(targetRow);
    rowAssignments.set(n.id, targetRow);
    if (targetRow > maxGlobalRow) maxGlobalRow = targetRow;
  }
}

console.log("=== Node Assignments ===");
for (const n of nodes) {
  console.log(`Node: ${n.label_primary.padEnd(10)} | Depth (Col): ${n._depth} | Row: ${rowAssignments.get(n.id)}`);
}
