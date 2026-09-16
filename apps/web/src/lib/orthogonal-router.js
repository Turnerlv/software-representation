"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeOrthogonal = routeOrthogonal;
function routeOrthogonal(source, target, rects, paddingX, paddingY, sourcePosition, targetPosition) {
    if (paddingX === void 0) { paddingX = 50; }
    if (paddingY === void 0) { paddingY = 35; }
    if (sourcePosition === void 0) { sourcePosition = 'right'; }
    if (targetPosition === void 0) { targetPosition = 'left'; }
    // 1. Gather all unique X and Y coordinates
    var xs = new Set([source.x, target.x]);
    var ys = new Set([source.y, target.y]);
    for (var _i = 0, rects_1 = rects; _i < rects_1.length; _i++) {
        var r = rects_1[_i];
        xs.add(r.x - paddingX);
        xs.add(r.x + r.width + paddingX);
        ys.add(r.y - paddingY);
        ys.add(r.y + r.height + paddingY);
        // Add centers for better routing options
        ys.add(r.y + r.height / 2);
    }
    var xArr = Array.from(xs).sort(function (a, b) { return a - b; });
    var yArr = Array.from(ys).sort(function (a, b) { return a - b; });
    var cols = xArr.length;
    var rows = yArr.length;
    var start = { xi: xArr.indexOf(source.x), yi: yArr.indexOf(source.y) };
    var goal = { xi: xArr.indexOf(target.x), yi: yArr.indexOf(target.y) };
    // Helper: check if line segment strictly intersects any rect
    var isBlocked = function (x1, y1, x2, y2) {
        var minX = Math.min(x1, x2);
        var maxX = Math.max(x1, x2);
        var minY = Math.min(y1, y2);
        var maxY = Math.max(y1, y2);
        for (var _i = 0, rects_2 = rects; _i < rects_2.length; _i++) {
            var r = rects_2[_i];
            if (maxX > r.x &&
                minX < r.x + r.width &&
                maxY > r.y &&
                minY < r.y + r.height) {
                return true;
            }
        }
        return false;
    };
    var queue = [
        { xi: start.xi, yi: start.yi, dir: -1, cost: 0, path: [source] },
    ];
    var visited = new Set();
    while (queue.length > 0) {
        // A* heuristic
        queue.sort(function (a, b) {
            var fA = a.cost + Math.abs(xArr[a.xi] - target.x) + Math.abs(yArr[a.yi] - target.y);
            var fB = b.cost + Math.abs(xArr[b.xi] - target.x) + Math.abs(yArr[b.yi] - target.y);
            return fA - fB;
        });
        var curr = queue.shift();
        if (curr.xi === goal.xi && curr.yi === goal.yi) {
            return curr.path;
        }
        var stateKey = "".concat(curr.xi, ",").concat(curr.yi, ",").concat(curr.dir);
        if (visited.has(stateKey))
            continue;
        visited.add(stateKey);
        var curX = xArr[curr.xi];
        var curY = yArr[curr.yi];
        var dirs = [
            { dxi: -1, dyi: 0, dir: 0 },
            { dxi: 1, dyi: 0, dir: 0 },
            { dxi: 0, dyi: -1, dir: 1 },
            { dxi: 0, dyi: 1, dir: 1 },
        ];
        for (var _a = 0, dirs_1 = dirs; _a < dirs_1.length; _a++) {
            var d = dirs_1[_a];
            var nxi = curr.xi + d.dxi;
            var nyi = curr.yi + d.dyi;
            if (nxi < 0 || nxi >= cols || nyi < 0 || nyi >= rows)
                continue;
            var nx = xArr[nxi];
            var ny = yArr[nyi];
            if (isBlocked(curX, curY, nx, ny))
                continue;
            // Must exit source node in the correct direction
            if (curr.dir === -1) {
                if (sourcePosition === 'right' && d.dxi !== 1)
                    continue;
                if (sourcePosition === 'left' && d.dxi !== -1)
                    continue;
            }
            // Must enter target node from the correct direction
            if (nxi === goal.xi && nyi === goal.yi) {
                if (targetPosition === 'left' && d.dxi !== 1)
                    continue;
                if (targetPosition === 'right' && d.dxi !== -1)
                    continue;
            }
            var dist = Math.abs(nx - curX) + Math.abs(ny - curY);
            var turnPenalty = curr.dir !== -1 && curr.dir !== d.dir ? 500 : 0;
            // We no longer strictly penalize backward flow if the handles expect it
            var backwardPenalty = 0;
            if (sourcePosition === 'right' && targetPosition === 'left' && d.dxi === -1) {
                backwardPenalty = 50;
            }
            queue.push({
                xi: nxi,
                yi: nyi,
                dir: d.dir,
                cost: curr.cost + dist + turnPenalty + backwardPenalty,
                path: __spreadArray(__spreadArray([], curr.path, true), [{ x: nx, y: ny }], false),
            });
        }
    }
    // Fallback if blocked
    return [source, target];
}
