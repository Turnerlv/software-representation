const source = { x: 970, y: 675 };
const target = { x: 630, y: 375 }; // right handle of core

const rects = [
  { x: 390, y: 335, width: 240, height: 80 }, // core
  { x: 390, y: 485, width: 240, height: 80 }, // mcp
  { x: 730, y: 635, width: 240, height: 80 }  // db
];

const paddingX = 50;
const paddingY = 35;
const sourcePosition = 'right';
const targetPosition = 'right';

const xs = new Set([source.x, target.x]);
const ys = new Set([source.y, target.y]);

for (const r of rects) {
  xs.add(r.x - paddingX);
  xs.add(r.x + r.width + paddingX);
  ys.add(r.y - paddingY);
  ys.add(r.y + r.height + paddingY);
  ys.add(r.y + r.height / 2);
}

const currentXs = Array.from(xs);
const currentYs = Array.from(ys);
xs.add(Math.min(...currentXs) - paddingX);
xs.add(Math.max(...currentXs) + paddingX);
ys.add(Math.min(...currentYs) - paddingY);
ys.add(Math.max(...currentYs) + paddingY);

const xArr = Array.from(xs).sort((a, b) => a - b);
const yArr = Array.from(ys).sort((a, b) => a - b);

const cols = xArr.length;
const rows = yArr.length;

const start = { xi: xArr.indexOf(source.x), yi: yArr.indexOf(source.y) };
const goal = { xi: xArr.indexOf(target.x), yi: yArr.indexOf(target.y) };

const isBlocked = (x1, y1, x2, y2) => {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  for (const r of rects) {
    if (maxX > r.x && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height) {
      return true;
    }
  }
  return false;
};

const queue = [];
queue.push({ xi: start.xi, yi: start.yi, dir: -1, cost: 0, path: [source] });

const visited = new Set();
let result = [];

while (queue.length > 0) {
  queue.sort((a, b) => a.cost - b.cost);
  const curr = queue.shift();

  if (curr.xi === goal.xi && curr.yi === goal.yi) {
    result = curr.path;
    break;
  }

  const stateKey = `${curr.xi},${curr.yi},${curr.dir}`;
  if (visited.has(stateKey)) continue;
  visited.add(stateKey);

  const curX = xArr[curr.xi];
  const curY = yArr[curr.yi];

  const dirs = [
    { dxi: -1, dyi: 0, dir: 0 },
    { dxi: 1, dyi: 0, dir: 0 },
    { dxi: 0, dyi: -1, dir: 1 },
    { dxi: 0, dyi: 1, dir: 1 },
  ];

  for (const d of dirs) {
    const nxi = curr.xi + d.dxi;
    const nyi = curr.yi + d.dyi;

    if (nxi < 0 || nxi >= cols || nyi < 0 || nyi >= rows) continue;

    const nx = xArr[nxi];
    const ny = yArr[nyi];
    
    // PREVENT 180 DEGREE SWITCHBACKS
    if (curr.path.length >= 2) {
      const prevPt = curr.path[curr.path.length - 2];
      if (prevPt.x === nx && prevPt.y === ny) continue;
    }

    if (isBlocked(curX, curY, nx, ny)) continue;

    if (curr.dir === -1) {
      if (sourcePosition === 'right' && d.dxi !== 1) continue;
      if (sourcePosition === 'left' && d.dxi !== -1) continue;
    }

    if (nxi === goal.xi && nyi === goal.yi) {
      if (targetPosition === 'left' && d.dxi !== 1) continue;
      if (targetPosition === 'right' && d.dxi !== -1) continue;
    }

    const dist = Math.abs(nx - curX) + Math.abs(ny - curY);
    const turnPenalty = curr.dir !== -1 && curr.dir !== d.dir ? 500 : 0;
    
    let backwardPenalty = 0;
    if (sourcePosition === 'right' && targetPosition === 'left' && d.dxi === -1) {
      backwardPenalty = 50;
    }

    queue.push({
      xi: nxi,
      yi: nyi,
      dir: d.dir,
      cost: curr.cost + dist + turnPenalty + backwardPenalty,
      path: [...curr.path, { x: nx, y: ny }],
    });
  }
}

console.log("Path with 180-degree turn prevention:");
result.forEach(p => console.log(`(${p.x}, ${p.y})`));
