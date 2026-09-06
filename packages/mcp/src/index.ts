import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createSQLiteStorage } from "@chomp/db";
import { basename, resolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import type { StructuralNode, StructuralEdge } from "@chomp/core";

export async function runMcpServer(targetPath: string = process.cwd()) {
  const server = new Server(
    {
      name: "chomp-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Derive repoPath and repoId exactly like the CLI
  const stat = statSync(targetPath);
  const isDir = stat.isDirectory();
  let repoPath = isDir ? targetPath : dirname(targetPath);
  try {
    repoPath = execSync("git rev-parse --show-toplevel", { cwd: targetPath, encoding: "utf8" }).trim();
  } catch (e) {
    // Fallback to targetPath if not in git
  }
  const repoName = basename(repoPath);
  const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

  const dbPath = resolve(repoPath, ".chomp", "graph.db");

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "chomp_get_nodes",
          description: "Retrieves structural nodes (Boundaries, Contracts, Open Connectors) for the current repository from the Chomp SQLite graph database.",
          inputSchema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "Optional filter by node type (e.g., BOUNDARY, CONTRACT, OPEN_CONNECTOR)"
              },
              parent_boundary_id: {
                type: "string",
                description: "Optional filter by parent boundary ID (usually a file ID)"
              }
            }
          }
        },
        {
          name: "chomp_get_edges",
          description: "Traverses the interaction graph to find relationships (calls, imports) between entities.",
          inputSchema: {
            type: "object",
            properties: {
              source_id: {
                type: "string",
                description: "Optional filter by the source node ID"
              },
              target_id: {
                type: "string",
                description: "Optional filter by the target node ID"
              }
            }
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!existsSync(dbPath)) {
      throw new Error(`Chomp database not found at ${dbPath}. Please ask the user to run 'chomp analyze .' in the repository root first.`);
    }

    const storage = createSQLiteStorage(dbPath);
    const graph = await storage.getRepresentationGraph(repoId);
    await storage.close();

    if (!graph) {
      throw new Error(`Graph data for repository '${repoId}' not found in the database. Please run 'chomp analyze .' first.`);
    }

    const { name, arguments: args = {} } = request.params;

    if (name === "chomp_get_nodes") {
      let filteredNodes = graph.nodes;
      
      if (args.type && typeof args.type === 'string') {
        filteredNodes = filteredNodes.filter(n => n.type === args.type);
      }
      if (args.parent_boundary_id && typeof args.parent_boundary_id === 'string') {
        filteredNodes = filteredNodes.filter(n => n.parentBoundaryId === args.parent_boundary_id);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(filteredNodes, null, 2) }]
      };
    }

    if (name === "chomp_get_edges") {
      let filteredEdges = graph.edges;
      
      if (args.source_id && typeof args.source_id === 'string') {
        filteredEdges = filteredEdges.filter(e => e.sourceId === args.source_id);
      }
      if (args.target_id && typeof args.target_id === 'string') {
        filteredEdges = filteredEdges.filter(e => e.targetId === args.target_id);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(filteredEdges, null, 2) }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
