import { analyzeTarget } from './packages/core/src/extractor/index.ts';
import path from 'path';

const graph = analyzeTarget(path.resolve('./fixtures/cloned-repos/express'));
const connectivityTargetTypes = ['REQUIRE', 'IMPORT', 'MOUNTS', 'INHERITS', 'EMITS'];
const rels = graph.relationships.filter(r => r.entityType && connectivityTargetTypes.includes(r.entityType));
const unresolved = rels.filter(r => !r.targetId);

console.log(`Unresolved: ${unresolved.length} / ${rels.length}`);
const counts: Record<string, number> = {};
for (const r of unresolved) {
  counts[r.entityType + ' - ' + r.name] = (counts[r.entityType + ' - ' + r.name] || 0) + 1;
}
const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
console.log("Top unresolved:");
console.log(sorted.slice(0, 20).map(([k,v]) => `${k}: ${v}`).join('\n'));

