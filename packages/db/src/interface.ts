import type { RepresentationGraph } from '@chomp/core';

export interface RepositoryInfo {
  id: string;
  name: string;
  path: string;
  analyzedAt?: string;
  extractorVersion?: string;
  commitSha?: string;
  branchName?: string;
  projectId?: string;
}

export interface ScopeOptions {
  scopes?: Array<'USER' | 'TEST' | 'MOCK' | 'CONFIG' | 'EXAMPLE' | 'BENCHMARK'>;
}

export interface ChompStorage {
  saveRepresentationGraph(repo: RepositoryInfo, graph: RepresentationGraph): Promise<void>;
  getRepresentationGraph(repoId: string, options?: ScopeOptions): Promise<RepresentationGraph | null>;
  listRepositories(): Promise<RepositoryInfo[]>;
  deleteRepository(repoId: string): Promise<void>;
  close(): Promise<void>;
}
