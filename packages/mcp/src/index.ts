import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createSQLiteStorage } from "@chomp/db";
import { basename, resolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

export async function runMcpServer(targetPath: string = process.cwd()) {
  const server = new McpServer({
    name: "chomp-mcp-server",
    version: "0.1.0",
  });

  const stat = statSync(targetPath);
  const isDir = stat.isDirectory();
  let repoPath = isDir ? targetPath : dirname(targetPath);
  try {
    repoPath = execSync("git rev-parse --show-toplevel", { cwd: targetPath, encoding: "utf8" }).trim();
  } catch (e) {
    // Fallback to targetPath
  }
  const repoName = basename(repoPath);
  const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const dbPath = resolve(repoPath, ".chomp", "graph.db");

  server.tool(
    "chomp_get_nodes",
    "Retrieves structural nodes (Boundaries, Contracts, Open Connectors) for the current repository from the Chomp SQLite graph database.",
    {
      type: z.string().optional().describe("Optional filter by node type (e.g., BOUNDARY, CONTRACT, OPEN_CONNECTOR)"),
      parent_boundary_id: z.string().optional().describe("Optional filter by parent boundary ID (usually a file ID)")
    },
    async (args) => {
      if (!existsSync(dbPath)) {
        throw new Error(`Chomp database not found at ${dbPath}. Please ask the user to run 'chomp analyze .' in the repository root first.`);
      }

      const storage = createSQLiteStorage(dbPath);
      const graph = await storage.getRepresentationGraph(repoId);
      await storage.close();

      if (!graph) {
        throw new Error(`Graph data for repository '${repoId}' not found in the database. Please run 'chomp analyze .' first.`);
      }

      let filteredNodes = graph.nodes;
      if (args.type) {
        filteredNodes = filteredNodes.filter((n: any) => n.type === args.type);
      }
      if (args.parent_boundary_id) {
        filteredNodes = filteredNodes.filter((n: any) => n.parentBoundaryId === args.parent_boundary_id);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(filteredNodes, null, 2) }]
      };
    }
  );

  server.tool(
    "chomp_get_edges",
    "Traverses the interaction graph to find relationships (calls, imports) between entities.",
    {
      source_id: z.string().optional().describe("Optional filter by the source node ID"),
      target_id: z.string().optional().describe("Optional filter by the target node ID")
    },
    async (args) => {
      if (!existsSync(dbPath)) {
        throw new Error(`Chomp database not found at ${dbPath}. Please ask the user to run 'chomp analyze .' in the repository root first.`);
      }

      const storage = createSQLiteStorage(dbPath);
      const graph = await storage.getRepresentationGraph(repoId);
      await storage.close();

      if (!graph) {
        throw new Error(`Graph data for repository '${repoId}' not found in the database. Please run 'chomp analyze .' first.`);
      }

      let filteredEdges = graph.edges;
      if (args.source_id) {
        filteredEdges = filteredEdges.filter((e: any) => e.sourceId === args.source_id);
      }
      if (args.target_id) {
        filteredEdges = filteredEdges.filter((e: any) => e.targetId === args.target_id);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(filteredEdges, null, 2) }]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
