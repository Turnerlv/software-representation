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

/**
 * A single extracted structural unit — the fundamental record of the Chomp representation graph.
 *
 * IDs are deterministic SHA-256 hashes of (type + filePath + name), making them stable
 * across re-runs of the same repository. Two runs of the same repo produce identical IDs.
 */
export interface StructuralEntity {
  /** Stable, content-based 12-char hex ID. Derived from SHA-256(type:filePath:name). */
  id: string;
  /** Human-readable name with a type prefix (e.g. "Class: UserService", "Import: ./types"). */
  name: string;
  /** The ontology primitive this entity belongs to. */
  type: EntityType;
  /** Line-level source evidence for this entity's existence. */
  evidence: EvidenceRecord | EvidenceRecord[];
  
  // Graph edge fields (populated primarily for RELATIONSHIP)
  /** ID of the source entity (e.g. the enclosing boundary). */
  sourceId?: string;
  /** ID of the target entity (e.g. the canonical canonical module path). */
  targetId?: string;
  
  // Inference classification
  /** Whether the relationship is deterministically known or probabilistically inferred. */
  status?: 'DETERMINISTIC' | 'INFERRED';
  /** Confidence level for inferred relationships. */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Data Evolution
  /** Extensible key-value store for high-fidelity details (e.g., HTTP paths, parameter types). */
  metadata?: Record<string, any>;
}

/**
 * The complete structural representation of a single analyzed repository.
 * Produced by analyzeTarget() and persisted to SQLite via saveRepresentationGraph().
 */
export interface RepresentationGraph {
  /** The version of the extractor (@chomp/core) that generated this graph. */
  version: string;
  /** ISO-8601 timestamp of when this graph was generated. */
  analyzedAt: string;
  /** The Git commit SHA of the analyzed repository, if known. */
  commitSha?: string;
  /** Extracted BOUNDARY entities (classes, modules, namespaces, CJS exports). */
  boundaries: StructuralEntity[];
  /** Extracted CONTRACT entities (interfaces, type aliases, exported functions, Express routes, event listeners). */
  contracts: StructuralEntity[];
  /** Extracted RELATIONSHIP entities (imports, requires, router mounts, inheritance, inferred method calls). */
  relationships: StructuralEntity[];
  /** Extracted OPEN_CONNECTOR entities (allowlisted HTTP client calls, DB/ORM queries, message brokers). */
  openConnectors: StructuralEntity[];
}
