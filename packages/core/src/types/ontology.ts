// packages/core/src/types/ontology.ts
// Core ontology types for the Chomp Software Representation Engine.
// These four primitives are the ONLY valid structural types — no additions without ontology review.

/**
 * The four structural primitives of the Chomp ontology.
 * Every extracted entity must map to exactly one of these types.
 *
 * - BOUNDARY:        A structural scope (class, module, namespace, service file)
 * - CONTRACT:        An explicit interface for inter-unit communication (interface, type alias, exported fn, API route)
 * - RELATIONSHIP:    A known structural dependency between units (import, inheritance, router mount)
 * - OPEN_CONNECTOR:  A known exit point beyond the current evidence boundary (HTTP client, DB client, message broker)
 */
export type EntityType = 'BOUNDARY' | 'CONTRACT' | 'RELATIONSHIP' | 'OPEN_CONNECTOR';

/**
 * Source-level proof that a structural entity exists.
 * Every StructuralEntity must carry an EvidenceRecord — Chomp never asserts structure without evidence.
 *
 * Per the Principle of Incomplete Truth: lineNumber and snippet are optional.
 * Their absence is an honest "unknown", not a fabricated certainty.
 */
export interface EvidenceRecord {
  /** Relative path to the source file containing the entity. */
  filePath: string;
  /** 1-indexed line number where the entity was found. Optional — unknown is a valid state. */
  lineNumber?: number;
  /** Up to 80-character snippet of the source text at the extraction point. */
  snippet?: string;
  /** Categorical role for multiple evidence records (e.g. inferred method calls) */
  evidenceRole?: 'syntax-call' | 'import-match' | 'target-signature';
}

export interface StructuralNode {
  id: string;
  name: string;
  type: 'BOUNDARY' | 'CONTRACT' | 'OPEN_CONNECTOR';
  entityType: string;
  scope?: 'USER' | 'TEST' | 'MOCK' | 'CONFIG' | 'EXAMPLE' | 'BENCHMARK';
  evidence: EvidenceRecord | EvidenceRecord[];
  parentBoundaryId?: string; // Lexical containment (e.g., File -> Contract)
  metadata?: Record<string, any>;
}

export interface StructuralEdge {
  id: string;
  name: string;
  type: 'RELATIONSHIP';
  entityType: string;
  scope?: 'USER' | 'TEST' | 'MOCK' | 'CONFIG' | 'EXAMPLE' | 'BENCHMARK';
  evidence: EvidenceRecord | EvidenceRecord[];
  sourceId: string; // Where the call originates
  targetId?: string; // What is being called/imported
  status?: 'DETERMINISTIC' | 'INFERRED';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  metadata?: Record<string, any>;
}

export interface RepresentationGraph {
  extractorVersion: string;
  analyzedAt: string;
  commitSha?: string;
  nodes: StructuralNode[];
  edges: StructuralEdge[];
}

export interface StructuralEntity {
  id: string;
  name: string;
  type: EntityType;
  entityType: string;
  scope?: 'USER' | 'TEST' | 'MOCK' | 'CONFIG' | 'EXAMPLE' | 'BENCHMARK';
  evidence: EvidenceRecord | EvidenceRecord[];
  parentBoundaryId?: string;
  sourceId?: string;
  targetId?: string;
  status?: 'DETERMINISTIC' | 'INFERRED';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  metadata?: Record<string, any>;
}

