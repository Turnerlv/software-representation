import Database from 'better-sqlite3';
import { ChompStorage, RepositoryInfo, ScopeOptions } from '../../interface.js';
import { initDatabase } from './schema.js';
import { saveRepresentationGraph, getRepresentationGraph, listRepositories } from './graphRepository.js';
import type { RepresentationGraph } from '@chomp/core';

export class SQLiteStorage implements ChompStorage {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = initDatabase(dbPath);
  }

  async saveRepresentationGraph(repo: RepositoryInfo, graph: RepresentationGraph): Promise<void> {
    saveRepresentationGraph(this.db, repo, graph);
  }

  async getRepresentationGraph(repoId: string, options?: ScopeOptions): Promise<RepresentationGraph | null> {
    return getRepresentationGraph(this.db, repoId, options);
  }

  async listRepositories(): Promise<RepositoryInfo[]> {
    return listRepositories(this.db);
  }

  async deleteRepository(repoId: string): Promise<void> {
    this.db.prepare('DELETE FROM repositories WHERE id = ?').run(repoId);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function createSQLiteStorage(dbPath: string): ChompStorage {
  return new SQLiteStorage(dbPath);
}

export * from './schema.js';
export * from './graphRepository.js';
