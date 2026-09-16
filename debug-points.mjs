import fs from 'fs';
import { calculateTransitLayout } from './apps/web/src/lib/transit-layout-engine.js';
import { routeOrthogonal } from './apps/web/src/lib/orthogonal-router.js';

const gridLayout = JSON.parse(fs.readFileSync('.chomp/grid_layout.json', 'utf8'));

const layoutResult = calculateTransitLayout(gridLayout.nodes, gridLayout.edges);

const CELL_WIDTH = 340;
const CELL_HEIGHT = 150;
const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;
const offsetX = (CELL_WIDTH - NODE_WIDTH) / 2;
const offsetY = (CELL_HEIGHT - NODE_HEIGHT) / 2;

const rects = layoutResult.nodes.map(n => ({
  x: n.x + offsetX,
  y: n.y + offsetY,
  width: NODE_WIDTH,
  height: NODE_HEIGHT
}));

const e = gridLayout.edges.find(e => e.source === 'ca5265b958b2' && e.target === 'f120fca71314');

const sourceNode = layoutResult.nodes.find(n => n.id === e.source);
const targetNode = layoutResult.nodes.find(n => n.id === e.target);

const sourceX = sourceNode.x + offsetX + NODE_WIDTH;
const sourceY = sourceNode.y + offsetY + NODE_HEIGHT / 2;

const targetX = targetNode.x + offsetX + NODE_WIDTH;
const targetY = targetNode.y + offsetY + NODE_HEIGHT / 2;

console.log(`Source: db at (${sourceX}, ${sourceY})`);
console.log(`Target: core at (${targetX}, ${targetY})`);

const points = routeOrthogonal(
  { x: sourceX, y: sourceY },
  { x: targetX, y: targetY },
  rects,
  50,
  35,
  'right',
  'right'
);

console.log("Path:");
points.forEach((p, i) => {
  console.log(`  ${i}: (${p.x}, ${p.y})`);
});
