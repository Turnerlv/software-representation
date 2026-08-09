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

export type CoverageStatus =
  | 'DISCOVERED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'OUT_OF_SCOPE';

export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExtractorCoverageEntry {
  id: string;
  patternName: string;
  framework: string;
  status: CoverageStatus;
  impactLevel: ImpactLevel;
  evidenceRepo: string;
  evidenceFile: string;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  fixLocation: string | null;
  fixPatternSummary: string | null;
  testFixturePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogExtractionGapInput {
  id?: string;
  patternName?: string;
  pattern_name?: string;
  framework?: string;
  status?: CoverageStatus;
  impactLevel?: ImpactLevel;
  impact_level?: ImpactLevel;
  evidenceRepo?: string;
  evidence_repo?: string;
  evidenceFile?: string;
  evidence_file?: string;
  evidenceLine?: number | null;
  evidence_line?: number | null;
  evidenceSnippet?: string | null;
  evidence_snippet?: string | null;
  fixLocation?: string | null;
  fix_location?: string | null;
  fixPatternSummary?: string | null;
  fix_pattern_summary?: string | null;
  testFixturePath?: string | null;
  test_fixture_path?: string | null;
}

export interface FixDetailsInput {
  fixLocation?: string;
  fix_location?: string;
  fixPatternSummary?: string;
  fix_pattern_summary?: string;
  testFixturePath?: string;
  test_fixture_path?: string;
}

export interface LedgerSummary {
  totalPatterns: number;
  resolvedCount: number;
  resolvedPercentage: number;
  byStatus: Record<CoverageStatus, number>;
  byFramework: Record<string, number>;
  byImpactLevel: Record<ImpactLevel, number>;
}