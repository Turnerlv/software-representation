"use client";

import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  Node, Edge, BackgroundVariant, MarkerType,
  useStore, ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Anti-Spaghetti Layout v5 ────────────────────────────────────────────────
//
// v4 → v5 Changes:
//   1. Dedicated MIDDLEWARE lane (between HTTP and Controller).
//   2. External package column ELIMINATED — all EXTERNAL_PACKAGE nodes become badges.
//   3. Utility muting threshold raised from ≥3 to ≥5.
//   4. inferLane() fixes: interfaces/→type, models/→type, middlewares/→middleware.
//   5. Progressive Disclosure: click-to-focus opacity engine.
//   6. Badge upgrade: domain-accent left-rail border, capped at 3 + "+N more" overflow.

const DROPPED_ENTITY_TYPES = new Set([
  'MODULE', 'CJS_EXPORT', 'NETWORK_LISTEN', 'HTTP_RESPONSE',
]);
const DROPPED_PATH_PATTERNS = [/^e2e\//, /^jest\.(config|preset)/, /\/seed\.ts$/];

const DARK = {
  canvas:      '#0d1117',
  surface:     '#161b22',
  surfaceHigh: '#21262d',
  border:      '#30363d',
  text:        '#e6edf3',
  textMuted:   '#7d8590',
  textDim:     '#484f58',
};

const DOMAIN_PALETTE = [
  { tint: 'rgba(88,166,255,0.08)',   accent: '#58a6ff' },
  { tint: 'rgba(63,185,80,0.08)',    accent: '#3fb950' },
  { tint: 'rgba(163,113,247,0.08)', accent: '#a371f7' },
  { tint: 'rgba(255,166,87,0.08)',   accent: '#ffa657' },
  { tint: 'rgba(210,168,255,0.08)', accent: '#d2a8ff' },
  { tint: 'rgba(240,136,62,0.08)',   accent: '#f0883e' },
  { tint: 'rgba(247,120,186,0.08)', accent: '#f778ba' },
  { tint: 'rgba(86,211,212,0.08)',   accent: '#56d3d4' },
  { tint: 'rgba(255,214,110,0.08)', accent: '#ffd66e' },
  { tint: 'rgba(147,197,114,0.08)', accent: '#93c572' },
];

function domainPaletteIndex(domain: string): number {
  let h = 5381;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h) ^ domain.charCodeAt(i);
    h = h >>> 0;
  }
  return h % DOMAIN_PALETTE.length;
}

const CORE_COLOR = { tint: 'rgba(139,148,158,0.04)', accent: '#8b949e' };

function getFilePath(evidence: any): string {
  if (!evidence) return '';
  if (Array.isArray(evidence)) return evidence[0]?.filePath ?? '';
  return evidence.filePath ?? '';
}

function inferDynamicDomain(node: any): string {
  const fp = getFilePath(node.evidence);
  if (!fp) return 'core';
  if (/^src\/loaders\//.test(fp))          return 'loaders';
  if (/^src\/models\//.test(fp))           return 'models';
  if (/^src\/services\//.test(fp))         return 'services';
  if (/^src\/jobs\//.test(fp))             return 'jobs';
  if (/^src\/decorators\//.test(fp))       return 'decorators';
  if (/^src\/interfaces\//.test(fp))       return 'interfaces';
  if (/^src\/subscribers\//.test(fp))      return 'subscribers';
  if (/^src\/api\/middlewares\//.test(fp)) return 'middlewares';
  if (/^src\/api\/routes\//.test(fp)) {
    const seg = fp.replace('src/api/routes/', '').split('/')[0].replace(/\.ts$/, '');
    return seg || 'routes';
  }
  if (/^src\/(app|config|index)\.ts$/.test(fp)) return 'config';
  const clean = fp.replace(
    /^(src\/app\/routes\/|src\/app\/api\/|src\/app\/|src\/|packages\/|apps\/)/, ''
  );
  const parts = clean.split('/');
  if (parts.length > 1) return parts[0].toLowerCase();
  return 'core';
}

// ─── Lane Configuration ───────────────────────────────────────────────────────
// Consistent 100px gap between right-edge of lane N and left-edge of lane N+1:
//   http:       x=0,    w=260  → right=260
//   middleware: x=360,  w=200  → right=560
//   controller: x=660,  w=220  → right=880
//   service:    x=980,  w=220  → right=1200
//   db:         x=1300, w=240  → right=1540
//   type:       x=1640, w=180

const NODE_SIZES = {
  http:       { w: 260, h: 46 },
  middleware: { w: 200, h: 42 },
  controller: { w: 220, h: 42 },
  service:    { w: 220, h: 42 },
  db:         { w: 240, h: 38 },
  type:       { w: 180, h: 34 },
};

const LANE_X: Record<string, number> = {
  http:       0,
  middleware: 360,
  controller: 660,
  service:    980,
  db:         1300,
  type:       1640,
};

const LANE_ORDER = ['http', 'middleware', 'controller', 'service', 'db', 'type'];
const LANE_HEADER_H = 44;

const LANE_DEFS = [
  { key: 'http',       label: 'HTTP Routes' },
  { key: 'middleware', label: 'Middleware'  },
  { key: 'controller', label: 'Controllers' },
  { key: 'service',    label: 'Services'    },
  { key: 'db',         label: 'DB Calls'    },
  { key: 'type',       label: 'Types'       },
];

// Header cell width = next LANE_X − current LANE_X (last lane gets fixed remainder)
const LANE_HEADER_WIDTHS: Record<string, number> = {
  http:       360,
  middleware: 300,
  controller: 320,
  service:    320,
  db:         340,
  type:       280,
};

const UTILITY_IN_DEGREE_THRESHOLD = 5;
const MAX_BADGES = 3;

function inferLane(node: any): string {
  const { entityType, name } = node;
  if (entityType === 'HTTP_ENDPOINT')    return 'http';
  if (entityType === 'DB_QUERY')         return 'db';
  if (entityType === 'EXTERNAL_PACKAGE') return 'external'; // always utility → filtered
  if (entityType === 'EXPORTED_TYPE' || entityType === 'CLASS') return 'type';

  const fp = getFilePath(node.evidence);

  // Middleware: cross-cutting interceptors / guards / auth checks
  if (/\/middlewares?\//i.test(fp) || /\.middleware\.ts$/.test(fp)) return 'middleware';
  // Controllers / routers
  if (/\.(controller|router)\.ts$/.test(fp)) return 'controller';
  if (/\/routes\/[^/]+\.ts$/.test(fp))       return 'controller';
  // Services
  if (/\.service\.ts$/.test(fp))    return 'service';
  if (/^src\/services\//.test(fp))  return 'service';
  // Types: interfaces, DTOs, mappers, declarations
  if (/\/interfaces?\//i.test(fp))  return 'type';
  if (/\/models?\//i.test(fp) && !/prisma/i.test(fp)) return 'type';
  if (/\.(model|mapper|utils|dto)\.ts$/.test(fp)) return 'type';
  if (/\.d\.ts$/.test(fp))          return 'type';
  // DB
  if (/prisma/i.test(fp))           return 'db';
  // HTTP method name fallback
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(name)) return 'http';
  // Auth service by path
  if (/\/auth\.ts$/.test(fp))       return 'service';

  return 'controller';
}

function shortLabel(name: string): string {
  if (name.startsWith('File: '))           return name.replace('File: ', '').split('/').pop() ?? name;
  if (name.startsWith('Package: '))        return name.replace('Package: ', '');
  if (name.startsWith('Express Route: '))  return name.replace('Express Route: ', '');
  if (name.startsWith('DB Call: '))        return name.replace('DB Call: ', '').replace('prisma.', '');
  if (name.startsWith('Interface: '))      return name.replace('Interface: ', '');
  if (name.startsWith('Class: '))          return name.replace('Class: ', '');
  return name;
}

function buildNodeStyle(
  lane: string,
  { tint, accent }: { tint: string; accent: string }
): React.CSSProperties {
  const sz = NODE_SIZES[lane as keyof typeof NODE_SIZES] ?? NODE_SIZES.controller;
  const base: React.CSSProperties = {
    width: sz.w, height: sz.h,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12.5px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: DARK.text,
    background: DARK.surface,
    border: `1px solid ${DARK.border}44`,
    borderRadius: '6px',
    padding: '0 12px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
    transition: 'opacity 180ms ease, filter 180ms ease, box-shadow 140ms ease',
  };

  // ── HTTP ── pill · monospace · domain accent glow
  if (lane === 'http') {
    return {
      ...base,
      borderRadius: '99px',
      background: tint,
      border: `1.5px solid ${accent}88`,
      color: accent,
      fontFamily: 'ui-monospace, monospace',
      fontWeight: 700,
      fontSize: '12px',
      letterSpacing: '0.04em',
      boxShadow: `0 0 0 1px ${accent}18, inset 0 0 20px ${accent}14`,
      textShadow: `0 0 12px ${accent}66`,
    };
  }

  // ── Middleware ── left-rail interceptor · italic · translucent domain tint
  if (lane === 'middleware') {
    return {
      ...base,
      background: tint,
      border: `1px solid ${accent}30`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: '4px',
      color: DARK.text,
      fontWeight: 500,
      fontSize: '12px',
      fontStyle: 'italic',
      letterSpacing: '0.02em',
      boxShadow: `inset 0 0 14px ${accent}0a, 0 0 0 1px ${accent}0f`,
    };
  }

  // ── DB ── left-rail gradient · monospace
  if (lane === 'db') {
    return {
      ...base,
      background: `linear-gradient(90deg, ${tint} 0%, ${DARK.surface} 100%)`,
      border: 'none',
      borderLeft: `3px solid ${accent}`,
      borderRadius: '4px',
      color: DARK.text,
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11.5px',
      letterSpacing: '0.02em',
    };
  }

  // ── Types ── elevated surface · muted domain color · small-caps feel
  if (lane === 'type') {
    return {
      ...base,
      background: DARK.surfaceHigh,
      border: `1px solid ${accent}44`,
      color: `${accent}cc`,
      fontSize: '11.5px',
      letterSpacing: '0.06em',
      fontWeight: 500,
    };
  }

  // ── Controller / Service ── glass panel · domain tint · top accent rail
  if (lane === 'controller' || lane === 'service') {
    return {
      ...base,
      background: tint,
      border: `1px solid ${accent}28`,
      borderTop: `2px solid ${accent}`,
      borderRadius: '5px',
      color: DARK.text,
      fontWeight: 500,
      fontSize: '12.5px',
      boxShadow: `inset 0 1px 0 ${accent}18`,
    };
  }

  return base;
}

// ─── Lane Header ──────────────────────────────────────────────────────────────


// ─── Stats Banner ─────────────────────────────────────────────────────────────


function SyncedGuides({ domainColors }: { domainColors: Map<string, { tint: string; accent: string }> }) {
  const transform = useStore(s => s.transform);
  const [tx, ty, tzoom] = transform;

  // Find a representative color for each lane to use as background
  const getLaneColor = (lane: string) => {
    if (lane === 'http') return DOMAIN_PALETTE[0].accent; // Blue
    if (lane === 'middleware') return DOMAIN_PALETTE[1].accent; // Green
    if (lane === 'controller') return DOMAIN_PALETTE[2].accent; // Purple
    if (lane === 'service') return DOMAIN_PALETTE[3].accent; // Orange
    if (lane === 'db') return DOMAIN_PALETTE[7].accent; // Cyan
    if (lane === 'type') return DOMAIN_PALETTE[4].accent; // Lavender
    return DARK.border;
  };

  return (
    <>
      {/* Background strips (behind nodes, fixed horizontally, scroll with canvas) */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
        pointerEvents: 'none', zIndex: -1, overflow: 'hidden'
      }}>
        {LANE_DEFS.map(({ key }) => {
          const laneX = LANE_X[key];
          const laneW = LANE_HEADER_WIDTHS[key];
          const color = getLaneColor(key);
          const screenX = tx + laneX * tzoom;
          const screenW = laneW * tzoom;
          return (
            <div key={key} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: screenX, width: screenW,
              borderLeft: `1px dashed ${color}33`,
              background: `linear-gradient(180deg, ${color}08 0%, ${color}02 100%)`
            }} />
          );
        })}
      </div>

      {/* Floating Headers (above nodes, fixed to top) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: LANE_HEADER_H,
        background: `${DARK.canvas}e0`, backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${DARK.border}`, pointerEvents: 'none',
        zIndex: 10, overflow: 'hidden'
      }}>
        {LANE_DEFS.map(({ key, label }) => {
          const laneX = LANE_X[key];
          const laneW = LANE_HEADER_WIDTHS[key];
          const screenX = tx + laneX * tzoom;
          const screenW = laneW * tzoom;
          return (
            <div key={key} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: screenX, width: screenW,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderLeft: `1px solid ${DARK.border}44`,
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: DARK.textMuted
            }}>
              {label}
            </div>
          );
        })}
      </div>
    </>
  );
}

function StatsBanner({ visible, edges, domains }: {
  visible: number;
  edges: number;
  domains: { name: string; color: string }[];
}) {
  return (
    <div style={{
      position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
    }}>
      {domains.length > 0 && (
        <div style={{
          display: 'flex', gap: 12, padding: '8px 16px', borderRadius: '8px',
          background: DARK.surfaceHigh, border: `1px solid ${DARK.border}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {domains.map(d => (
            <div key={d.name} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '11px', color: DARK.text, fontWeight: 500,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
              {d.name}
            </div>
          ))}
        </div>
      )}
      <div style={{
        display: 'flex', gap: 1, overflow: 'hidden', borderRadius: '8px',
        border: `1px solid ${DARK.border}`, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          background: DARK.surfaceHigh, padding: '4px 12px', fontSize: '11px',
          color: DARK.textMuted, display: 'flex', gap: 5,
          borderRight: `1px solid ${DARK.border}`,
        }}>
          <span style={{ color: DARK.text, fontWeight: 600 }}>{visible}</span> nodes
        </div>
        <div style={{
          background: DARK.surfaceHigh, padding: '4px 12px',
          fontSize: '11px', color: DARK.textMuted, display: 'flex', gap: 5,
        }}>
          <span style={{ color: DARK.text, fontWeight: 600 }}>{edges}</span> edges
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function GraphVisualizerInner({
  initialNodes,
  initialEdges,
}: {
  initialNodes: any[];
  initialEdges: any[];
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodeTypes = useMemo(() => ({
    pipeline: ({ data }: any) => (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 4px',
        }}>
          {data.label}
        </div>
        {data.badges && data.badges.length > 0 && (
          <div style={{
            position: 'absolute', top: -14, right: -10,
            display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end',
            zIndex: 10,
          }}>
            {(data.badges as string[]).slice(0, MAX_BADGES).map((b: string) => (
              <div key={b} title={b} style={{
                fontSize: '9.5px',
                background: DARK.surfaceHigh,
                border: `1px solid ${(data.accentColor ?? DARK.border)}33`,
                borderLeft: `2px solid ${(data.accentColor ?? DARK.border)}77`,
                padding: '1px 7px', borderRadius: '3px',
                color: DARK.textMuted, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap', fontWeight: 600, letterSpacing: '0.02em',
                maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                ✦ {b}
              </div>
            ))}
            {data.badges.length > MAX_BADGES && (
              <div
                title={(data.badges as string[]).slice(MAX_BADGES).join(', ')}
                style={{
                  fontSize: '9px', background: DARK.surfaceHigh,
                  border: `1px solid ${DARK.border}`, padding: '1px 6px',
                  borderRadius: '3px', color: DARK.textDim, fontWeight: 600,
                }}
              >
                +{data.badges.length - MAX_BADGES} more
              </div>
            )}
          </div>
        )}
      </div>
    ),
  }), []);

  const { nodes: rfNodes, edges: rfEdges, stats } = useMemo(() => {
    // 1. Filter dropped types / path patterns
    const filteredNodes = initialNodes.filter(n => {
      if (DROPPED_ENTITY_TYPES.has(n.entityType)) return false;
      const fp = getFilePath(n.evidence);
      if (DROPPED_PATH_PATTERNS.some(re => re.test(fp))) return false;
      return true;
    });
    const filteredIds = new Set(filteredNodes.map(n => n.id));

    // 2. Deduplicate external packages by name
    const pkgCanonical = new Map<string, string>();
    const idRemap      = new Map<string, string>();
    for (const n of filteredNodes) {
      if (n.entityType !== 'EXTERNAL_PACKAGE') continue;
      const pkg = n.name.replace('Package: ', '');
      if (pkgCanonical.has(pkg)) idRemap.set(n.id, pkgCanonical.get(pkg)!);
      else pkgCanonical.set(pkg, n.id);
    }
    const deduped = filteredNodes.filter(n => !idRemap.has(n.id));

    // 3. Compute in/out degree
    const inDeg  = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const e of initialEdges) {
      if (!e.targetId) continue;
      const src = idRemap.get(e.sourceId) ?? e.sourceId;
      const tgt = idRemap.get(e.targetId) ?? e.targetId;
      if (!filteredIds.has(src) || !filteredIds.has(tgt) || src === tgt) continue;
      outDeg.set(src, (outDeg.get(src) || 0) + 1);
      inDeg.set(tgt,  (inDeg.get(tgt)  || 0) + 1);
    }

    // 4. Mark utility nodes → badge-only, never rendered as graph nodes
    const isUtility = new Set<string>();
    for (const n of deduped) {
      if (n.entityType === 'EXTERNAL_PACKAGE') {
        isUtility.add(n.id); // Q3: all external packages become metadata badges
      } else if (
        (inDeg.get(n.id) || 0) >= UTILITY_IN_DEGREE_THRESHOLD &&
        (outDeg.get(n.id) || 0) <= 2 &&
        n.entityType !== 'DB_QUERY' &&
        n.entityType !== 'HTTP_ENDPOINT'
      ) {
        isUtility.add(n.id);
      }
    }

    // 5. Domain coloring (hash-stable)
    const domainColors = new Map<string, { tint: string; accent: string }>();
    const nodeDomain   = new Map<string, string>();
    for (const n of deduped) {
      const d = inferDynamicDomain(n);
      nodeDomain.set(n.id, d);
      if (!domainColors.has(d)) {
        domainColors.set(d, d === 'core' ? CORE_COLOR : DOMAIN_PALETTE[domainPaletteIndex(d)]);
      }
    }
    if (!domainColors.has('core')) domainColors.set('core', CORE_COLOR);

    const domainList = Array.from(domainColors.entries())
      .map(([name, color]) => ({ name, color: color.accent }))
      .sort((a, b) => a.name === 'core' ? -1 : b.name === 'core' ? 1 : a.name.localeCompare(b.name));

    // 6. Build badge registry + valid explicit edges
    const nodeBadges = new Map<string, string[]>();
    const pairCount  = new Map<string, number>();
    const validEdges: { source: string; target: string; id: string; isLexical?: boolean }[] = [];

    for (const e of initialEdges) {
      if (!e.targetId) continue;
      const src = idRemap.get(e.sourceId) ?? e.sourceId;
      const tgt = idRemap.get(e.targetId) ?? e.targetId;
      if (!filteredIds.has(src) || !filteredIds.has(tgt) || src === tgt) continue;

      if (isUtility.has(tgt)) {
        const tgtNode = deduped.find(x => x.id === tgt);
        if (tgtNode) {
          const arr   = nodeBadges.get(src) || [];
          const label = shortLabel(tgtNode.name);
          if (!arr.includes(label)) arr.push(label);
          nodeBadges.set(src, arr);
        }
        continue;
      }
      if (isUtility.has(src)) continue; // suppress outgoing edges from utility nodes

      const key = `${src}→${tgt}`;
      if (pairCount.has(key)) { pairCount.set(key, pairCount.get(key)! + 1); continue; }
      pairCount.set(key, 1);
      validEdges.push({ id: `e-${src}-${tgt}`, source: src, target: tgt });
    }

    // 7. Synthesize lexical (containment) edges
    for (const n of deduped) {
      if (!n.parentBoundaryId || !filteredIds.has(n.parentBoundaryId)) continue;
      const lane = inferLane(n);
      if (lane === 'http') {
        validEdges.push({
          id: `lex-${n.id}-${n.parentBoundaryId}`,
          source: n.id, target: n.parentBoundaryId, isLexical: true,
        });
      } else if (lane === 'db') {
        validEdges.push({
          id: `lex-${n.parentBoundaryId}-${n.id}`,
          source: n.parentBoundaryId, target: n.id, isLexical: true,
        });
      }
    }

    // 8. Tight-packed bipartite column layout
    const rfNodes: Node[] = [];
    const NODE_GAP   = 20;
    const DOMAIN_GAP = 80; // visual separation between domain groups within a lane

    for (const lane of LANE_ORDER) {
      const laneNodes = deduped.filter(n => inferLane(n) === lane && !isUtility.has(n.id));
      if (!laneNodes.length) continue;

      laneNodes.sort((a, b) => {
        const da = nodeDomain.get(a.id)!;
        const db = nodeDomain.get(b.id)!;
        if (da < db) return -1;
        if (da > db) return 1;
        return a.name.localeCompare(b.name);
      });

      const nodeH = NODE_SIZES[lane as keyof typeof NODE_SIZES]?.h ?? 42;

      let totalHeight = 0;
      let prevDomain  = '';
      for (const n of laneNodes) {
        const d = nodeDomain.get(n.id)!;
        if (prevDomain && d !== prevDomain) totalHeight += DOMAIN_GAP;
        totalHeight += nodeH + NODE_GAP;
        prevDomain = d;
      }
      totalHeight -= NODE_GAP;

      let startY = -totalHeight / 2;
      prevDomain = '';

      for (const n of laneNodes) {
        const d     = nodeDomain.get(n.id)!;
        const color = domainColors.get(d) || CORE_COLOR;

        if (prevDomain && d !== prevDomain) startY += DOMAIN_GAP;
        prevDomain = d;

        rfNodes.push({
          id:       n.id,
          type:     'pipeline',
          position: { x: LANE_X[lane], y: startY },
          style:    buildNodeStyle(lane, color),
          data: {
            label:       shortLabel(n.name),
            badges:      nodeBadges.get(n.id) || [],
            lane,
            domain:      d,
            accentColor: color.accent,
          },
        });

        startY += nodeH + NODE_GAP;
      }
    }

    // 9. Build React Flow edges
    const rfEdges: Edge[] = [];
    for (const e of validEdges) {
      const count     = pairCount.get(`${e.source}→${e.target}`) ?? 1;
      const srcDomain = nodeDomain.get(e.source);
      const tgtDomain = nodeDomain.get(e.target);
      const isCross   = srcDomain !== tgtDomain;

      const color = e.isLexical
        ? (domainColors.get(srcDomain!)?.accent ?? DARK.textMuted)
        : isCross
          ? DARK.textDim
          : (domainColors.get(srcDomain!)?.accent ?? DARK.textMuted);

      const strokeWidth = e.isLexical ? 2.5 : isCross ? 1 : Math.min(1.5 + count * 0.4, 3.5);
      const opacity     = e.isLexical ? 0.9 : isCross ? 0.4 : 0.75;
      const strokeDash  = isCross && !e.isLexical ? '5 4' : undefined;

      rfEdges.push({
        id:     e.id,
        source: e.source,
        target: e.target,
        type:   'smoothstep',
        // @ts-ignore
        pathOptions: { borderRadius: 24 },
        label:        count > 1 ? `×${count}` : undefined,
        labelStyle:   count > 1 ? { fontSize: 9, fill: DARK.textMuted, fontWeight: 700 } : undefined,
        labelBgStyle: count > 1 ? { fill: DARK.surface, fillOpacity: 0.95, rx: 4 } : undefined,
        markerEnd: {
          type:   MarkerType.ArrowClosed,
          width:  isCross && !e.isLexical ? 6 : 8,
          height: isCross && !e.isLexical ? 6 : 8,
          color,
        },
        style: {
          stroke:      color,
          strokeWidth,
          opacity,
          ...(strokeDash ? { strokeDasharray: strokeDash } : {}),
        },
        zIndex: isCross ? 0 : 1,
      });
    }

    return {
      nodes: rfNodes,
      edges: rfEdges,
      stats: { visible: rfNodes.length, edges: rfEdges.length, domains: domainList },
    };
  }, [initialNodes, initialEdges]);

  // ── Progressive Disclosure ──────────────────────────────────────────────────
  //
  // focusedSet = { selectedNodeId }
  //            ∪ { direct downstream neighbors (outgoing edges) }
  //            ∪ { direct upstream neighbors (incoming edges) }

  const focusedSet = useMemo<Set<string> | null>(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    for (const e of rfEdges) {
      if (e.source === selectedNodeId) set.add(e.target as string);
      if (e.target === selectedNodeId) set.add(e.source as string);
    }
    return set;
  }, [selectedNodeId, rfEdges]);

  const displayNodes = useMemo<Node[]>(() => {
    if (!focusedSet) return rfNodes;
    return rfNodes.map(n => {
      const isFocused  = focusedSet.has(n.id);
      const isSelected = n.id === selectedNodeId;
      const accent     = (n.data as any).accentColor as string;
      return {
        ...n,
        style: {
          ...n.style,
          opacity: isFocused ? 1 : 0.12,
          filter:  isFocused ? undefined : 'grayscale(0.9)',
          ...(isSelected && {
            // 2px solid accent ring + diffuse glow
            boxShadow: `0 0 0 2px ${accent}, 0 0 28px ${accent}44`,
          }),
        },
      };
    });
  }, [rfNodes, focusedSet, selectedNodeId]);

  const displayEdges = useMemo<Edge[]>(() => {
    if (!focusedSet) return rfEdges;
    return rfEdges.map(e => {
      // Edge is "active" only when BOTH endpoints are in the focused set
      const active      = focusedSet.has(e.source as string) && focusedSet.has(e.target as string);
      const baseOpacity = (e.style?.opacity as number) ?? 1;
      return {
        ...e,
        style: {
          ...e.style,
          opacity:     active ? baseOpacity : 0.04,
          strokeWidth: active
            ? ((e.style?.strokeWidth as number ?? 1) + 0.5)
            : (e.style?.strokeWidth as number ?? 1),
        },
      };
    });
  }, [rfEdges, focusedSet]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Dump layout snapshot for MCP chomp_get_rendered_layout
  useEffect(() => {
    fetch('/api/dump-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: rfNodes, edges: rfEdges }),
    }).catch(console.error);
  }, [rfNodes, rfEdges]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: DARK.canvas,
      position: 'relative',
    }}>
      {/* LaneHeader replaced by SyncedGuides */}
      <SyncedGuides domainColors={new Map()} />
      <ReactFlow
        nodeTypes={nodeTypes}
        nodes={displayNodes}
        edges={displayEdges}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.05}
        maxZoom={3}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag={true}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        attributionPosition="bottom-right"
        style={{ paddingTop: LANE_HEADER_H }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={DARK.border} />
        <Controls
          style={{
            background: DARK.surfaceHigh,
            border: `1px solid ${DARK.border}`,
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        />
        <MiniMap
          zoomable pannable
          nodeColor={n => (n.data as any)?.accentColor ?? DARK.textDim}
          maskColor="rgba(13,17,23,0.75)"
          style={{
            background: DARK.surfaceHigh,
            border: `1px solid ${DARK.border}`,
            borderRadius: '8px',
            bottom: 52,
          }}
        />
      </ReactFlow>
      <StatsBanner {...stats} />
    </div>
  );
}


export default function GraphVisualizer(props: any) {
  return (
    <ReactFlowProvider>
      <GraphVisualizerInner {...props} />
    </ReactFlowProvider>
  );
}
