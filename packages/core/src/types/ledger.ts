// packages/core/src/types/ledger.ts
// Types for the Extractor Coverage Ledger system tracking parser gap identification and resolution.

/**
 * Status lifecycle stage for an AST extraction gap entry in the coverage ledger.
 *
 * - DISCOVERED: Gap identified during analysis harness run.
 * - IN_PROGRESS: Active visitor/adapter work being built for the pattern.
 * - RESOLVED: Extractor fix committed and verified with test fixture.
 * - OUT_OF_SCOPE: Pattern intentionally excluded from MVP extraction targets.
 */
export type CoverageStatus =
  | 'DISCOVERED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'OUT_OF_SCOPE';

/**
 * Severity level measuring how frequently an unhandled AST pattern occurs across target codebases.
 *
 * - HIGH: Core structural pattern (e.g. Express route, ES import, class boundary).
 * - MEDIUM: Common framework utility pattern (e.g. event emitter, route params).
 * - LOW: Edge-case syntax construct or rare framework convention.
 */
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Represents a single persisted row in the extractor coverage ledger table.
 */
export interface ExtractorCoverageEntry {
  /** Unique ID for the ledger record (UUID or slug). */
  id: string;
  /** Descriptive name of the unhandled AST pattern (e.g. "Express Route Handler"). */
  patternName: string;
  /** Framework or library associated with the pattern (e.g. "express", "nestjs", "typescript"). */
  framework: string;
  /** Current resolution status of this extraction gap. */
  status: CoverageStatus;
  /** Evaluated impact level of the gap. */
  impactLevel: ImpactLevel;
  /** Name of the repository where the gap was discovered. */
  evidenceRepo: string;
  /** Relative file path within evidenceRepo where the unhandled pattern exists. */
  evidenceFile: string;
  /** 1-indexed line number of the pattern in evidenceFile, or null if file-level. */
  evidenceLine: number | null;
  /** Code snippet illustrating the unhandled AST node, or null. */
  evidenceSnippet: string | null;
  /** Path to the visitor or adapter file implementing the fix (e.g. "src/extractor/adapters/expressAdapter.ts"). */
  fixLocation: string | null;
  /** Brief summary of how the parser visitor handles the AST pattern. */
  fixPatternSummary: string | null;
  
  // Oracle Discovery Fields
  /** Whether this is a GAP (missing entity) or EVOLUTION (metadata addition). */
  discoveryType?: 'GAP' | 'EVOLUTION';
  /** Suggested metadata or schema addition by the Oracle. */
  suggestedEvolution?: string | null;
  /** Oracle's architectural justification for this discovery. */
  rationale?: string | null;
  
  /** Relative path to the committed test fixture exercising the fix. */
  testFixturePath: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 update timestamp. */
  updatedAt: string;
}

/**
 * Input payload for logging a new extraction gap entry into the coverage ledger.
 * Accepts camelCase or snake_case property aliases for DB driver compatibility.
 */
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
  
  discoveryType?: 'GAP' | 'EVOLUTION';
  discovery_type?: 'GAP' | 'EVOLUTION';
  suggestedEvolution?: string | null;
  suggested_evolution?: string | null;
  rationale?: string | null;

  testFixturePath?: string | null;
  test_fixture_path?: string | null;
}

/**
 * Input payload for updating resolution details when marking a ledger entry as RESOLVED.
 * Accepts camelCase or snake_case property aliases.
 */
export interface FixDetailsInput {
  /** Path to the visitor/adapter file where the fix was implemented. */
  fixLocation?: string;
  fix_location?: string;
  /** Summary of how the AST node pattern is handled. */
  fixPatternSummary?: string;
  fix_pattern_summary?: string;
  /** Path to the test fixture file proving the fix. */
  testFixturePath?: string;
  test_fixture_path?: string;
}

/**
 * Aggregated summary metrics returned when auditing the coverage ledger.
 */
export interface LedgerSummary {
  /** Total number of tracked patterns in the coverage ledger. */
  totalPatterns: number;
  /** Total number of patterns marked RESOLVED. */
  resolvedCount: number;
  /** Percentage of patterns resolved (0-100). */
  resolvedPercentage: number;
  /** Breakdown of pattern counts by CoverageStatus. */
  byStatus: Record<CoverageStatus, number>;
  /** Breakdown of pattern counts by framework name. */
  byFramework: Record<string, number>;
  /** Breakdown of pattern counts by ImpactLevel. */
  byImpactLevel: Record<ImpactLevel, number>;
}
