/**
 * @module @chomp/core
 *
 * Public API surface for the Chomp Software Representation Engine core package.
 *
 * Provides structural ontology types (`StructuralEntity`, `EvidenceRecord`, `RepresentationGraph`),
 * SQLite database persistence (`initDatabase`, `saveRepresentationGraph`, `getRepresentationGraph`),
 * coverage ledger tracking (`logExtractionGap`, `resolveExtractionGap`), and AST extraction tools (`analyzeTarget`, `collectFiles`).
 *
 * Note: Internal TypeScript compiler API (`typescript`) imports are encapsulated inside the extractor package
 * and intentionally NOT re-exported here.
 */

export * from './types/index.js';
export * from './db/index.js';
export * from './extractor/index.js';
