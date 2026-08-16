import { readFileSync, writeFileSync } from "node:fs";

export interface EntityCounts {
  BOUNDARY: number;
  CONTRACT: number;
  RELATIONSHIP: number;
  OPEN_CONNECTOR: number;
}

export interface Session {
  session_id: string;
  branch: string;
  date: string;
  extractor_version: string;
  report_path: string;
  entity_counts: {
    before: EntityCounts;
    after: EntityCounts;
  };
  gaps_logged: number;
  gaps_resolved: number;
  status: "IN_PROGRESS" | "COMPLETE";
}

export interface SystemAudit {
  id: string;
  date: string;
  summary_path: string;
  changes: string[];
}

export interface AnalysisRecord {
  date: string;
  repo: string;
  report_path: string;
  extractor_version?: string;
  entity_counts?: {
    BOUNDARY: number;
    CONTRACT: number;
    RELATIONSHIP: number;
    OPEN_CONNECTOR: number;
  };
  key_findings?: string[];
}

export interface Registry {
  repos: Record<string, any>;
  sessions: Session[];
  system_audits?: SystemAudit[];
  analyses?: AnalysisRecord[];
  _schema?: any;
}

export function readRegistry(registryPath: string): Registry {
  const content = readFileSync(registryPath, "utf8");
  return JSON.parse(content) as Registry;
}

export function writeRegistry(registryPath: string, registry: Registry): void {
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
}
