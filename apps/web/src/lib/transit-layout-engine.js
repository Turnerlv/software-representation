"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.NODE_HEIGHT = exports.NODE_WIDTH = exports.CELL_HEIGHT = exports.CELL_WIDTH = void 0;
exports.calculateTransitLayout = calculateTransitLayout;
exports.CELL_WIDTH = 340;
exports.CELL_HEIGHT = 150;
exports.NODE_WIDTH = 240;
exports.NODE_HEIGHT = 80;
function calculateTransitLayout(nodes, edges) {
    var _a, _b, _c, _d, _e, _f, _g;
    // 1. Calculate Bellman-Ford depth using ONLY DATA_FLOW edges.
    var calculatedDepth = new Map();
    for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
        var n = nodes_1[_i];
        calculatedDepth.set(n.id, n.role === 'INGRESS' ? 0 : -1);
    }
    var numNodes = nodes.length;
    for (var i = 0; i < numNodes; i++) {
        var changed = false;
        for (var _h = 0, edges_1 = edges; _h < edges_1.length; _h++) {
            var e = edges_1[_h];
            if (e.edge_type === 'INTERFACE' || e.edge_type === 'CONFIG')
                continue;
            var uDepth = (_a = calculatedDepth.get(e.source)) !== null && _a !== void 0 ? _a : -1;
            var vDepth = (_b = calculatedDepth.get(e.target)) !== null && _b !== void 0 ? _b : -1;
            if (uDepth !== -1) {
                var candidate = uDepth + 1;
                if (candidate > vDepth) {
                    calculatedDepth.set(e.target, candidate);
                    changed = true;
                }
            }
        }
        if (!changed)
            break;
    }
    for (var _j = 0, nodes_2 = nodes; _j < nodes_2.length; _j++) {
        var n = nodes_2[_j];
        if (((_c = calculatedDepth.get(n.id)) !== null && _c !== void 0 ? _c : -1) === -1) {
            calculatedDepth.set(n.id, 0);
        }
        n._depth = (_d = calculatedDepth.get(n.id)) !== null && _d !== void 0 ? _d : 0;
    }
    // 1.5 Inject Dummy Nodes for long edges (Sugiyama segmentation)
    var layoutNodes = __spreadArray([], nodes, true);
    var layoutEdges = [];
    var _loop_1 = function (e) {
        var u = nodes.find(function (n) { return n.id === e.source; });
        var v = nodes.find(function (n) { return n.id === e.target; });
        if (!u || !v) {
            layoutEdges.push(e);
            return "continue";
        }
        var dU = u._depth;
        var dV = v._depth;
        if (Math.abs(dU - dV) > 1) {
            var step = dU < dV ? 1 : -1;
            var prevId = e.source;
            for (var d = dU + step; d !== dV; d += step) {
                var dummyId = "__dummy_".concat(e.source, "_").concat(e.target, "_").concat(d);
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
        }
        else {
            layoutEdges.push(e);
        }
    };
    for (var _k = 0, edges_2 = edges; _k < edges_2.length; _k++) {
        var e = edges_2[_k];
        _loop_1(e);
    }
    // 2. Barycenter Layout (Center of Gravity) - Global Pass
    var depthGroups = new Map();
    var maxDepth = 0;
    for (var _l = 0, layoutNodes_1 = layoutNodes; _l < layoutNodes_1.length; _l++) {
        var n = layoutNodes_1[_l];
        var d = n._depth;
        if (!depthGroups.has(d))
            depthGroups.set(d, []);
        depthGroups.get(d).push(n);
        if (d > maxDepth)
            maxDepth = d;
    }
    var rowAssignments = new Map();
    for (var _m = 0, layoutNodes_2 = layoutNodes; _m < layoutNodes_2.length; _m++) {
        var n = layoutNodes_2[_m];
        rowAssignments.set(n.id, 0);
    }
    var maxGlobalRow = 0;
    var _loop_2 = function (pass) {
        var isForward = pass % 2 !== 0; // Pass 1 and 3 are forward
        maxGlobalRow = 0;
        var startD = isForward ? 0 : maxDepth;
        var endD = isForward ? maxDepth : 0;
        var step = isForward ? 1 : -1;
        var _loop_3 = function (d) {
            var siblings = depthGroups.get(d) || [];
            if (siblings.length === 0)
                return "continue";
            var barycenters = new Map();
            var _loop_4 = function (n) {
                var connectedEdges = layoutEdges.filter(function (e) {
                    var _a, _b, _c, _d;
                    if (isForward) {
                        return e.target === n.id && ((_b = (_a = layoutNodes.find(function (ln) { return ln.id === e.source; })) === null || _a === void 0 ? void 0 : _a._depth) !== null && _b !== void 0 ? _b : 0) < d;
                    }
                    else {
                        return e.source === n.id && ((_d = (_c = layoutNodes.find(function (ln) { return ln.id === e.target; })) === null || _c === void 0 ? void 0 : _c._depth) !== null && _d !== void 0 ? _d : 0) > d;
                    }
                });
                if (connectedEdges.length > 0) {
                    var sum = 0;
                    var count = 0;
                    for (var _r = 0, connectedEdges_1 = connectedEdges; _r < connectedEdges_1.length; _r++) {
                        var e = connectedEdges_1[_r];
                        var neighborId = isForward ? e.source : e.target;
                        var neighborRow = rowAssignments.get(neighborId);
                        if (neighborRow !== undefined) {
                            sum += neighborRow;
                            count++;
                        }
                    }
                    if (count > 0) {
                        barycenters.set(n.id, sum / count);
                    }
                    else {
                        barycenters.set(n.id, maxGlobalRow + 0.1);
                    }
                }
                else {
                    // Keep current assignment if no neighbors in this direction
                    barycenters.set(n.id, (_e = rowAssignments.get(n.id)) !== null && _e !== void 0 ? _e : (maxGlobalRow + 0.1));
                }
            };
            for (var _p = 0, siblings_1 = siblings; _p < siblings_1.length; _p++) {
                var n = siblings_1[_p];
                _loop_4(n);
            }
            // Sort siblings by their ideal barycenter
            siblings.sort(function (a, b) { var _a, _b; return ((_a = barycenters.get(a.id)) !== null && _a !== void 0 ? _a : 0) - ((_b = barycenters.get(b.id)) !== null && _b !== void 0 ? _b : 0); });
            var takenRows = new Set();
            for (var _q = 0, siblings_2 = siblings; _q < siblings_2.length; _q++) {
                var n = siblings_2[_q];
                var targetRow = Math.round((_f = barycenters.get(n.id)) !== null && _f !== void 0 ? _f : 0);
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
        };
        for (var d = startD; d !== endD + step; d += step) {
            _loop_3(d);
        }
    };
    for (var pass = 1; pass <= 3; pass++) {
        _loop_2(pass);
    }
    var positionedNodes = [];
    // Assign final coordinates (skipping DUMMY nodes so they just leave empty grid spaces)
    for (var _o = 0, layoutNodes_3 = layoutNodes; _o < layoutNodes_3.length; _o++) {
        var n = layoutNodes_3[_o];
        if (n.role === 'DUMMY')
            continue;
        var d = n._depth;
        var r = (_g = rowAssignments.get(n.id)) !== null && _g !== void 0 ? _g : 0;
        // Check if it's a tray node
        var isTopTray = n.role === 'TOP_TRAY';
        var isBottomTray = n.role === 'BOTTOM_TRAY';
        var x = d * exports.CELL_WIDTH;
        var y = r * exports.CELL_HEIGHT;
        if (isTopTray)
            y = -exports.CELL_HEIGHT;
        if (isBottomTray)
            y = (maxGlobalRow + 2) * exports.CELL_HEIGHT;
        positionedNodes.push(__assign(__assign({}, n), { x: x, y: y }));
    }
    return {
        nodes: positionedNodes,
        edges: edges
    };
}
