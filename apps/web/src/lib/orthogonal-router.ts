export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export function routeOrthogonal(
  source: Point,
  target: Point,
  rects: Rect[],
  paddingX: number = 50,
  paddingY: number = 35,
  sourcePosition: string = 'right',
  targetPosition: string = 'left'
): Point[] {
  // 1. Gather all unique X and Y coordinates
  const xs = new Set<number>([source.x, target.x]);
  const ys = new Set<number>([source.y, target.y]);

  for (const r of rects) {
    xs.add(r.x - paddingX);
    xs.add(r.x + r.width + paddingX);
    ys.add(r.y - paddingY);
    ys.add(r.y + r.height + paddingY);
    // Add centers for better routing options
    ys.add(r.y + r.height / 2);
  }

  // Add outer boundary channels to allow routing completely around the graph
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

  // Helper: check if line segment strictly intersects any rect
  const isBlocked = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (const r of rects) {
      if (
        maxX > r.x &&
        minX < r.x + r.width &&
        maxY > r.y &&
        minY < r.y + r.height
      ) {
        return true;
      }
    }
    return false;
  };

  type NodeState = {
    xi: number;
    yi: number;
    dir: number; // 0=horizontal, 1=vertical, -1=start
    cost: number;
    path: Point[];
  };

  const queue: NodeState[] = [
    { xi: start.xi, yi: start.yi, dir: -1, cost: 0, path: [source] },
  ];

  const visited = new Set<string>();

  while (queue.length > 0) {
    // A* heuristic
    queue.sort((a, b) => {
      const fA = a.cost + Math.abs(xArr[a.xi] - target.x) + Math.abs(yArr[a.yi] - target.y);
      const fB = b.cost + Math.abs(xArr[b.xi] - target.x) + Math.abs(yArr[b.yi] - target.y);
      return fA - fB;
    });

    const curr = queue.shift()!;

    if (curr.xi === goal.xi && curr.yi === goal.yi) {
      return curr.path;
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

      // Prevent 180-degree physical switchbacks
      if (curr.path.length >= 2) {
        const prevPt = curr.path[curr.path.length - 2];
        if (prevPt.x === nx && prevPt.y === ny) continue;
      }

      if (isBlocked(curX, curY, nx, ny)) continue;

      // Must exit source node in the correct direction
      if (curr.dir === -1) {
        if (sourcePosition === 'right' && d.dxi !== 1) continue;
        if (sourcePosition === 'left' && d.dxi !== -1) continue;
      }

      // Must enter target node from the correct direction
      if (nxi === goal.xi && nyi === goal.yi) {
        if (targetPosition === 'left' && d.dxi !== 1) continue;
        if (targetPosition === 'right' && d.dxi !== -1) continue;
      }

      const dist = Math.abs(nx - curX) + Math.abs(ny - curY);
      
      const turnPenalty = curr.dir !== -1 && curr.dir !== d.dir ? 500 : 0;
      
      // We no longer strictly penalize backward flow if the handles expect it
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

  // Fallback if blocked
  return [source, target];
}
