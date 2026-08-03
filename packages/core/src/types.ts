// packages/core/src/types.ts

export type EntityType = 'BOUNDARY' | 'CONTRACT' | 'RELATIONSHIP' | 'OPEN_CONNECTOR';

export interface EvidenceRecord {
  filePath: string;
  lineNumber?: number;
  snippet?: string;
}

export interface StructuralEntity {
  id: string;
  name: string;
  type: EntityType;
  evidence: EvidenceRecord;
}

export interface RepresentationGraph {
  version: string;
  analyzedAt: string;
  boundaries: StructuralEntity[];
  contracts: StructuralEntity[];
  relationships: StructuralEntity[];
  openConnectors: StructuralEntity[];
}