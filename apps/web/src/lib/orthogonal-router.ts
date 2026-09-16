export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export function routeOrthogonal(
  source: Point,
  target: Point,
  nodes: Rect[],
  padding: number = 20
): Point[] {
  const xs = new Set<number>();
  const ys = new Set<number>();

  xs.add(source.x);
  xs.add(target.x);
  ys.add(source.y);
  ys.add(target.y);

  for (const n of nodes) {
    xs.add(n.x - padding);
    xs.add(n.x + n.width + padding);
    ys.add(n.y - padding);
    ys.add(n.y + n.height + padding);
  }

  const xArr = Array.from(xs).sort((a, b) => a - b);
  const yArr = Array.from(ys).sort((a, b) => a - b);

  const xIdx = (x: number) => xArr.indexOf(x);
  const yIdx = (y: number) => yArr.indexOf(y);

  const cols = xArr.length;
  const rows = yArr.length;

  function isBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (const n of nodes) {
      if (
        maxX > n.x &&
        minX < n.x + n.width &&
        maxY > n.y &&
        minY < n.y + n.height
      ) {
        return true;
      }
    }
    return false;
  }

  const start = { xi: xIdx(source.x), yi: yIdx(source.y) };
  const goal = { xi: xIdx(target.x), yi: yIdx(target.y) };

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

      if (isBlocked(curX, curY, nx, ny)) continue;

      // Must exit source node going RIGHT
      if (curr.dir === -1 && d.dxi !== 1) {
        continue;
      }

      // Must enter target node from LEFT (meaning we move RIGHT into it)
      if (nxi === goal.xi && nyi === goal.yi && d.dxi !== 1) {
        continue;
      }

      const dist = Math.abs(nx - curX) + Math.abs(ny - curY);
      
      // Heavy penalty for turns to keep lines as straight as possible
      const turnPenalty = curr.dir !== -1 && curr.dir !== d.dir ? 500 : 0;

      // Slight penalty for moving backward against the flow to prefer forward progress
      const backwardPenalty = d.dxi === -1 ? 50 : 0;

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
