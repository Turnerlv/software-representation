/**
 * @module @chomp/core
 *
 * Public API surface for the Chomp Software Representation Engine core package.
 *
 * Provides structural ontology types (`StructuralEntity`, `EvidenceRecord`, `RepresentationGraph`),
 * Provides structural ontology types (`EvidenceRecord`, `RepresentationGraph`),
 * coverage ledger types, and AST extraction tools (`analyzeTarget`, `collectFiles`).
 *
 * Note: Internal TypeScript compiler API (`typescript`) imports are encapsulated inside the extractor package
 * and intentionally NOT re-exported here.
 */

export * from './types/index.js';
export * from './extractor/index.js';
