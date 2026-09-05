import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createSQLiteStorage } from "@chomp/db";
import path from "node:path";
import fs from "node:fs";

export function registerMcpCommand(program: Command) {
  program
    .command("mcp")
    .description("Start the Chomp MCP server (stdio transport for AI agents)")
    .action(async () => {
      const cwd = process.cwd();
      const dbPath = path.join(cwd, ".chomp", "graph.db");

      const server = new McpServer({
        name: "chomp-mcp",
        version: "1.0.0"
      });

      async function getLocalRepoId(storage: any) {
        const repos = await storage.listRepositories();
        if (!repos || repos.length === 0) {
          throw new Error("No repository found in local database. Run chomp_analyze first.");
        }
        return repos[0].id;
      }

      // 1. Tool: chomp_analyze
      server.registerTool(
        "chomp_analyze",
        {
          description: "Runs the Chomp extraction engine on the current directory and saves it to .chomp/graph.db. Run this FIRST if the database does not exist."
        },
        async () => {
          try {
            const { analyzeTarget } = await import("@chomp/core");
            const graph = analyzeTarget(cwd);

            if (!fs.existsSync(path.dirname(dbPath))) {
              fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            }
            const storage = createSQLiteStorage(dbPath);

            const repoName = path.basename(cwd);
            const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

            await storage.saveRepresentationGraph({ id: repoId, name: repoName, path: cwd }, graph);
            return {
              content: [{ type: "text", text: `Successfully analyzed and saved ${graph.nodes.length} nodes and ${graph.edges.length} edges.` }]
            };
          } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          }
        }
      );

      // 2. Tool: chomp_get_nodes
      const getNodesSchema = {
        type: z.string().optional().describe("Filter by type: BOUNDARY, CONTRACT, or OPEN_CONNECTOR"),
        parent_boundary_id: z.string().optional().describe("Filter by lexical parent (e.g., find all contracts inside a specific file ID)")
      };

      server.registerTool<any, typeof getNodesSchema>(
        "chomp_get_nodes",
        {
          description: "Retrieves structural nodes (Boundaries, Contracts, Open Connectors) for the current repository. Use this to find files, APIs, or DB queries.",
          inputSchema: getNodesSchema
        },
        async ({ type, parent_boundary_id }) => {
          try {
            if (!fs.existsSync(dbPath)) throw new Error("Database not found. Run chomp_analyze first.");
            const storage = createSQLiteStorage(dbPath);
            const repoId = await getLocalRepoId(storage);
            const graph = await storage.getRepresentationGraph(repoId);
            if (!graph) throw new Error("Graph not found in database.");

            let nodes = graph.nodes;
            nodes = nodes.filter(n => n.entityType !== 'FILE' && n.entityType !== 'MODULE' && n.entityType !== 'NODE_BUILTIN');
            if (type) nodes = nodes.filter(n => n.type === type);
            if (parent_boundary_id) nodes = nodes.filter(n => n.parentBoundaryId === parent_boundary_id);

            return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          }
        }
      );

      // 3. Tool: chomp_get_edges
      const getEdgesSchema = {
        source_id: z.string().optional().describe("Find what this node depends on (Fan-Out)"),
        target_id: z.string().optional().describe("Find who depends on this node (Fan-In)")
      };

      server.registerTool<any, typeof getEdgesSchema>(
        "chomp_get_edges",
        {
          description: "Traverses the interaction graph. Finds all relationships (calls, imports) originating from or targeting a specific node.",
          inputSchema: getEdgesSchema
        },
        async ({ source_id, target_id }) => {
          try {
            if (!fs.existsSync(dbPath)) throw new Error("Database not found. Run chomp_analyze first.");
            const storage = createSQLiteStorage(dbPath);
            const repoId = await getLocalRepoId(storage);
            const graph = await storage.getRepresentationGraph(repoId);
            if (!graph) throw new Error("Graph not found in database.");

            let edges = graph.edges;
            if (source_id) edges = edges.filter(e => e.sourceId === source_id);
            if (target_id) edges = edges.filter(e => e.targetId === target_id);

            return { content: [{ type: "text", text: JSON.stringify(edges, null, 2) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          }
        }
      );

      // 4. Tool: chomp_save_grid_layout
      const saveGridLayoutSchema = {
        nodes: z.array(z.object({
          id: z.string(),
          role: z.enum(["INGRESS", "CORE", "EGRESS", "TOP_TRAY", "BOTTOM_TRAY"]),
          depth: z.number().describe("X-axis topological depth (0 for INGRESS)"),
          lane: z.number().describe("Y-axis row index"),
          label_primary: z.string().describe("Semantic action, e.g., 'Authenticate User'"),
          label_secondary: z.string().describe("Source/AST reference, e.g., 'AuthService.SignIn'")
        })),
        edges: z.array(z.object({
          source: z.string(),
          target: z.string(),
          is_inferred: z.boolean(),
          reason: z.string().optional()
        }))
      };

      server.registerTool<any, typeof saveGridLayoutSchema>(
        "chomp_save_grid_layout",
        {
          description: "Saves an AI-generated grid layout schema to a local JSON file.",
          inputSchema: saveGridLayoutSchema
        },
        async ({ nodes, edges }) => {
          try {
            if (!fs.existsSync(dbPath)) throw new Error("Database not found. Run chomp_analyze first.");
            const storage = createSQLiteStorage(dbPath);
            const repoId = await getLocalRepoId(storage);
            const graph = await storage.getRepresentationGraph(repoId);
            if (!graph) throw new Error("Graph not found in database.");

            const validIds = new Set(graph.nodes.map(n => n.id));
            const invalidIds = nodes.map((n: any) => n.id).filter((id: string) => !validIds.has(id));
            if (invalidIds.length > 0) {
              throw new Error(`Invalid layout. The following node IDs do not exist in the database: [${invalidIds.join(', ')}]. You must only use exact IDs returned by chomp_get_nodes.`);
            }

            const layoutPath = path.join(path.dirname(dbPath), "grid_layout.json");
            fs.writeFileSync(layoutPath, JSON.stringify({ nodes, edges }, null, 2));
            return { content: [{ type: "text", text: `Successfully saved grid layout to ${layoutPath}` }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          }
        }
      );



      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("Chomp MCP Server running on stdio");
    });
}
