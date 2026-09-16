import fs from 'fs';
import { calculateTransitLayout } from './out-tsc/apps/web/src/lib/transit-layout-engine.js';
import { routeOrthogonal } from './out-tsc/apps/web/src/lib/orthogonal-router.js';

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

const dbNode = layoutResult.nodes.find(n => n.id === 'ca5265b958b2');
const coreNode = layoutResult.nodes.find(n => n.id === 'f120fca71314');

const sourceX = dbNode.x + offsetX + NODE_WIDTH;
const sourceY = dbNode.y + offsetY + NODE_HEIGHT / 2;

const targetX = coreNode.x + offsetX + NODE_WIDTH;
const targetY = coreNode.y + offsetY + NODE_HEIGHT / 2;

const points = routeOrthogonal(
  { x: sourceX, y: sourceY },
  { x: targetX, y: targetY },
  rects,
  50,
  35,
  'right',
  'right'
);

console.log("Points:", points);
